import { BoardRow } from './types';

export interface RemoteState {
  id: number;
  pp: number[];
  pq: number[];
  cp: number[];
  cy: number;
  cm: number;
  sp: number;
  pk: number;
  hp: number;
  dd: number;
}

export interface PickupInfo {
  id: number;
  kind: 'repair' | 'duck' | 'turbo';
  x: number;
  y: number;
  z: number;
}

export interface Spawn {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface NetHandlers {
  onWelcome: (m: {
    id: number;
    nick: string;
    spawn: Spawn;
    players: { id: number; nick: string; hp: number; dead: boolean }[];
    pickups: PickupInfo[];
    board: BoardRow[];
  }) => void;
  onJoin: (p: { id: number; nick: string }) => void;
  onLeave: (id: number) => void;
  onSnap: (ps: RemoteState[]) => void;
  onShot: (m: { id: number; p: number[]; d: number[]; s: number; k: number }) => void;
  onDamage: (hp: number, by: number) => void;
  onHp: (hp: number) => void;
  onHitOk: (id: number) => void;
  onKill: (m: { killer: number; killerNick: string; victim: number; victimNick: string }) => void;
  onRespawn: (m: Spawn & { hp: number }) => void;
  onPickupAdd: (item: PickupInfo) => void;
  onPickupRemove: (id: number, by: number) => void;
  onBoard: (rows: BoardRow[]) => void;
  onClose: (reason: string | null, wasOnline: boolean) => void;
}

/** Тонкая обёртка над WebSocket: JSON-сообщения туда-сюда. */
export class NetClient {
  private ws: WebSocket | null = null;
  private online = false;
  private failReason: string | null = null;

  constructor(private h: NetHandlers) {}

  get isOnline(): boolean {
    return this.online && this.ws?.readyState === WebSocket.OPEN;
  }

  connect(nick: string): void {
    this.close();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    this.failReason = null;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', nick }));
    ws.onmessage = (ev) => {
      let m: any;
      try {
        m = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      switch (m.t) {
        case 'welcome':
          this.online = true;
          this.h.onWelcome(m);
          break;
        case 'full':
          this.failReason = 'Арена переполнена, попробуй чуть позже';
          break;
        case 'join':
          this.h.onJoin(m.p);
          break;
        case 'leave':
          this.h.onLeave(m.id);
          break;
        case 'snap':
          this.h.onSnap(m.ps);
          break;
        case 'shot':
          this.h.onShot(m);
          break;
        case 'dmg':
          this.h.onDamage(m.hp, m.by);
          break;
        case 'hp':
          this.h.onHp(m.hp);
          break;
        case 'hitok':
          this.h.onHitOk(m.id);
          break;
        case 'kill':
          this.h.onKill(m);
          break;
        case 'respawn':
          this.h.onRespawn(m);
          break;
        case 'pk+':
          this.h.onPickupAdd(m.item);
          break;
        case 'pk-':
          this.h.onPickupRemove(m.id, m.by);
          break;
        case 'board':
          this.h.onBoard(m.rows);
          break;
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      const was = this.online;
      this.online = false;
      this.ws = null;
      this.h.onClose(this.failReason, was);
    };
    ws.onerror = () => {
      if (!this.failReason && !this.online) this.failReason = 'Не удалось подключиться к серверу';
    };
  }

  send(msg: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    this.online = false;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      ws.close();
    }
  }
}
