// Мультиплеерный сервер «Аква-Ас»: раздаёт собранный клиент (dist) и держит одну общую арену по WebSocket /ws.
// Клиенты сами считают свою физику и шлют позицию; сервер хранит HP/счёт, проверяет попадания, спавнит бонусы.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 8080;

const MAX_PLAYERS = 16;
const MAX_HP = 100;
const RESPAWN_MS = 3000;
const SPAWN_PROTECT_MS = 2500;
const SNAP_MS = 66;
const MAX_PICKUPS = 6;
const PICKUP_EVERY_MS = 5000;
const MAX_DMG = 40;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: players.size }));
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.join(DIST, rel);
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(DIST, 'index.html');
  const ext = path.extname(file).toLowerCase();
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

/** @type {Map<number, any>} */
const players = new Map();
/** @type {Map<number, {id:number,kind:string,x:number,y:number,z:number}>} */
const pickups = new Map();
let nextId = 1;
let nextPickupId = 1;

const rnd = (a, b) => a + Math.random() * (b - a);
const num = (v, lim = 400) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
const r2 = (v) => Math.round(v * 100) / 100;
const vec = (a, n) => (Array.isArray(a) && a.length === n ? a.map((v) => r2(num(v))) : null);

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(msg, exceptId = 0) {
  const data = JSON.stringify(msg);
  for (const p of players.values()) {
    if (p.id !== exceptId && p.ws.readyState === 1) p.ws.send(data);
  }
}

function cleanNick(raw) {
  let s = String(raw ?? '')
    .replace(/[\u0000-\u001f<>&"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  if (!s) s = 'Пилот';
  const taken = new Set([...players.values()].map((p) => p.nick.toLowerCase()));
  if (!taken.has(s.toLowerCase())) return s;
  for (let i = 2; i < 100; i++) {
    const cand = `${s.slice(0, 13)}${i}`;
    if (!taken.has(cand.toLowerCase())) return cand;
  }
  return `${s.slice(0, 10)}${nextId}`;
}

function spawnPoint() {
  return { x: r2(rnd(-70, 70)), y: r2(rnd(10, 18)), z: r2(rnd(-50, 55)), yaw: r2(rnd(-Math.PI, Math.PI)) };
}

function publicPlayer(p) {
  return { id: p.id, nick: p.nick, hp: p.hp, dead: p.dead };
}

function board() {
  return [...players.values()]
    .map((p) => ({ id: p.id, nick: p.nick, score: p.score, kills: p.kills, deaths: p.deaths }))
    .sort((a, b) => b.score - a.score || b.kills - a.kills);
}

function spawnPickup() {
  if (pickups.size >= MAX_PICKUPS || players.size === 0) return;
  const roll = Math.random();
  const kind = roll < 0.4 ? 'duck' : roll < 0.75 ? 'repair' : 'turbo';
  const item = { id: nextPickupId++, kind, x: r2(rnd(-90, 90)), y: r2(rnd(2.5, 9)), z: r2(rnd(-70, 70)) };
  pickups.set(item.id, item);
  broadcast({ t: 'pk+', item });
}

function killPlayer(victim, killer) {
  victim.dead = true;
  victim.hp = 0;
  victim.deaths += 1;
  if (killer && killer.id !== victim.id) {
    killer.kills += 1;
    killer.score += 100;
  }
  broadcast({
    t: 'kill',
    killer: killer ? killer.id : 0,
    killerNick: killer ? killer.nick : '',
    victim: victim.id,
    victimNick: victim.nick,
  });
  setTimeout(() => {
    if (!players.has(victim.id)) return;
    victim.dead = false;
    victim.hp = MAX_HP;
    victim.protectUntil = Date.now() + SPAWN_PROTECT_MS;
    const sp = spawnPoint();
    send(victim.ws, { t: 'respawn', ...sp, hp: MAX_HP });
  }, RESPAWN_MS);
}

wss.on('connection', (ws) => {
  let me = null;
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    ws.isAlive = true;
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'join') {
      if (me) return;
      if (players.size >= MAX_PLAYERS) {
        send(ws, { t: 'full' });
        ws.close();
        return;
      }
      me = {
        id: nextId++,
        ws,
        nick: cleanNick(m.nick),
        hp: MAX_HP,
        dead: false,
        score: 0,
        kills: 0,
        deaths: 0,
        protectUntil: Date.now() + SPAWN_PROTECT_MS,
        hitTimes: [],
        frag: null,
      };
      players.set(me.id, me);
      const sp = spawnPoint();
      send(ws, {
        t: 'welcome',
        id: me.id,
        nick: me.nick,
        spawn: sp,
        players: [...players.values()].filter((p) => p.id !== me.id).map(publicPlayer),
        pickups: [...pickups.values()],
        board: board(),
      });
      broadcast({ t: 'join', p: publicPlayer(me) }, me.id);
      return;
    }
    if (!me) return;

    if (m.t === 'st') {
      // состояние самолёта и пилота: pp/pq — самолёт, cp/cy/cm — пилот, sp — скорость
      const pp = vec(m.pp, 3);
      const pq = vec(m.pq, 4);
      const cp = vec(m.cp, 3);
      if (!pp || !pq || !cp) return;
      me.frag = JSON.stringify({
        id: me.id,
        pp,
        pq,
        cp,
        cy: r2(num(m.cy, 20)),
        cm: m.cm === 1 || m.cm === 2 || m.cm === 3 ? m.cm : 0,
        sp: r2(num(m.sp, 100)),
        pk: m.pk ? 1 : 0,
        hp: me.hp,
        dd: me.dead ? 1 : 0,
      });
    } else if (m.t === 'shot') {
      if (me.dead) return;
      const p = vec(m.p, 3);
      const d = vec(m.d, 3);
      if (!p || !d) return;
      broadcast({ t: 'shot', id: me.id, p, d, s: r2(num(m.s, 120)), k: m.k === 1 ? 1 : 0 }, me.id);
    } else if (m.t === 'hit') {
      const victim = players.get(Number(m.id));
      if (!victim || victim.id === me.id || me.dead || victim.dead) return;
      const now = Date.now();
      if (victim.protectUntil > now) return;
      me.hitTimes = me.hitTimes.filter((t) => now - t < 1000);
      if (me.hitTimes.length >= 20) return;
      me.hitTimes.push(now);
      const dmg = Math.max(1, Math.min(MAX_DMG, num(m.dmg, MAX_DMG)));
      victim.hp = Math.max(0, victim.hp - dmg);
      send(victim.ws, { t: 'dmg', hp: victim.hp, by: me.id });
      send(me.ws, { t: 'hitok', id: victim.id });
      if (victim.hp <= 0) killPlayer(victim, me);
    } else if (m.t === 'pick') {
      const item = pickups.get(Number(m.id));
      if (!item || me.dead) return;
      pickups.delete(item.id);
      if (item.kind === 'repair') me.hp = Math.min(MAX_HP, me.hp + 40);
      else if (item.kind === 'duck') me.score += 50;
      broadcast({ t: 'pk-', id: item.id, by: me.id });
      send(ws, { t: 'hp', hp: me.hp });
    }
  });

  ws.on('close', () => {
    if (!me) return;
    players.delete(me.id);
    broadcast({ t: 'leave', id: me.id });
  });
  ws.on('error', () => {});
});

// снимок мира: каждому игроку — состояния всех остальных
setInterval(() => {
  if (players.size < 2) return;
  const list = [...players.values()];
  for (const p of list) {
    if (p.ws.readyState !== 1) continue;
    const frags = [];
    for (const o of list) if (o.id !== p.id && o.frag) frags.push(o.frag);
    if (frags.length) p.ws.send(`{"t":"snap","ps":[${frags.join(',')}]}`);
  }
}, SNAP_MS);

setInterval(() => {
  if (players.size) broadcast({ t: 'board', rows: board() });
}, 1000);

setInterval(spawnPickup, PICKUP_EVERY_MS);

// выкидываем «зависших» клиентов
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => console.log(`Аква-Ас: сервер на :${PORT}, dist=${DIST}`));
