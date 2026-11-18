import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SoundEngine } from './audio';
import {
  CharacterModelHandle,
  createCharacterModel,
  createPickupModel,
  createPlaneModel,
  ENEMY_PLANE_PALETTES,
  PlaneModelHandle,
  PLAYER_PLANE_PALETTE,
} from './models';
import {
  ARENA_HALF_D,
  ARENA_HALF_W,
  buildSpaEnvironment,
  getRoofCeilingAt,
  getWaterSurfaceY,
  isPointInWater,
  JACUZZIS,
  MAIN_POOL,
  SpaEnvironmentHandle,
} from './spaEnvironment';
import { createProceduralTextures, ProceduralTexturePack } from './textures';
import { NetClient, PickupInfo, RemoteState, Spawn } from './net';
import { BoardRow, ConnectionState, GamePhase, HudSnapshot, PickupKind, PlayerMode } from './types';

// Module-scope reusable math helpers (Zero GC in loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);
const _axisZ = new THREE.Vector3(0, 0, 1);
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

interface Projectile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fromPlayer: boolean;
  life: number;
  damage: number;
  active: boolean;
  /** Выстрел другого игрока: только рисуем, попадание считает стрелок. */
  remote: boolean;
}

interface RemotePlayer {
  id: number;
  nick: string;
  plane: PlaneModelHandle;
  char: CharacterModelHandle;
  label: THREE.Sprite;
  planePos: THREE.Vector3;
  planeQuat: THREE.Quaternion;
  charPos: THREE.Vector3;
  charYaw: number;
  charMode: number;
  speed: number;
  parked: boolean;
  hp: number;
  dead: boolean;
  seen: boolean;
  walk: number;
  prevCharPos: THREE.Vector3;
}

interface EnemyPlane {
  id: number;
  model: PlaneModelHandle;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  hp: number;
  maxHp: number;
  speed: number;
  patrolPhase: number;
  patrolCenter: THREE.Vector3;
  fireCooldown: number;
  telegraphTimer: number;
  hitFlash: number;
  alive: boolean;
}

interface EjectedNpc {
  group: THREE.Group;
  velY: number;
  life: number;
}

interface PickupItem {
  id: number;
  kind: PickupKind;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  bobPhase: number;
  active: boolean;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  startScale: number;
  active: boolean;
}

export class SpaFlightEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private textures!: ProceduralTexturePack;
  private env!: SpaEnvironmentHandle;
  private sound = new SoundEngine();

  private isSoftwareGl = false;
  private frameId = 0;
  private disposed = false;
  private lastTime = 0;
  private elapsed = 0;

  // Game state
  private phase: GamePhase = 'title';
  private mode: PlayerMode = 'plane';

  private playerHp = 100;
  private maxPlayerHp = 100;
  private planeHp = 100;
  private maxPlaneHp = 100;
  private planeAlive = true;
  private planeRespawnCooldown = 0;

  private score = 0;
  private bestScore = 0;
  private combo = 1;
  private comboTimer = 0;
  private kills = 0;
  private wave = 1;
  private waveBanner: string | null = null;
  private waveBannerTimer = 0;
  private nextWaveDelay = 0;

  // Feel timers
  private hitstopTimer = 0;
  private shakeStrength = 0;
  private hitMarkerTimer = 0;
  private damageFlashTimer = 0;
  private invulnTimer = 0;
  private turboRemaining = 0;
  private boostEnergy = 100;

  // Player Plane state
  private playerPlane!: PlaneModelHandle;
  private planePos = new THREE.Vector3(0, 6.5, 22);
  private planeVel = new THREE.Vector3(0, 0, -16);
  private planeYaw = 0;
  private planePitch = 0;
  private planeRoll = 0;
  private planeSpeed = 16;
  private planeParked = false;
  private loopTimer = 0;
  private readonly loopDuration = 1.15;
  private loopCooldown = 0;
  private sideRollTimer = 0;
  private readonly sideRollDuration = 0.55;
  private sideRollCooldown = 0;
  private sideRollDir: 1 | -1 = 1;
  private vaporTrailTimer = 0;
  private fireCooldown = 0;
  private splashCooldown = 0;

  // Player Character state
  private playerChar!: CharacterModelHandle;
  private charPos = new THREE.Vector3(0, 0, 22);
  private charVel = new THREE.Vector3();
  private charYaw = 0;
  private charGrounded = true;
  private walkCycle = 0;
  private charRecoil = 0;
  private squashY = 1;

  // Camera state
  private camPos = new THREE.Vector3(0, 9.5, 32);
  private camLook = new THREE.Vector3(0, 6.5, 10);
  private camYawOffset = 0;
  private camPitchOffset = 0.14;
  private isDraggingCamera = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Input state (held vs justPressed)
  private heldKeys = new Set<string>();
  private justPressed = new Set<string>();
  private mouseFireHeld = false;

  // Entities & Pools
  private enemies: EnemyPlane[] = [];
  private nextEnemyId = 1;
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private pickups: PickupItem[] = [];
  private ejectedNpcs: EjectedNpc[] = [];

  private hudSyncAccum = 0;
  private resizeObserver: ResizeObserver | null = null;

  // Multiplayer state
  private net: NetClient;
  private connection: ConnectionState = 'idle';
  private connectionError: string | null = null;
  private myId = 0;
  private nick = '';
  private deaths = 0;
  private dead = false;
  private board: BoardRow[] = [];
  private feed: { text: string; ttl: number }[] = [];
  private remotes = new Map<number, RemotePlayer>();
  private netSendAccum = 0;
  private shotQueue: { p: number[]; d: number[]; s: number; k: number }[] = [];

  constructor(container: HTMLElement, onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.net = new NetClient({
      onWelcome: (m) => this.handleWelcome(m),
      onJoin: (p) => this.addRemote(p.id, p.nick),
      onLeave: (id) => this.removeRemote(id),
      onSnap: (ps) => this.handleSnap(ps),
      onShot: (m) => this.handleRemoteShot(m),
      onDamage: (hp, by) => this.handleDamageFromServer(hp, by),
      onHp: (hp) => {
        this.planeHp = hp;
        this.playerHp = hp;
      },
      onHitOk: () => {
        this.hitMarkerTimer = 0.16;
        this.sound.playHit(false);
      },
      onKill: (m) => this.handleKill(m),
      onRespawn: (m) => this.respawnLocal(m),
      onPickupAdd: (item) => this.addPickupFromServer(item),
      onPickupRemove: (id, by) => this.removePickupFromServer(id, by),
      onBoard: (rows) => this.handleBoard(rows),
      onClose: (reason, wasOnline) => this.handleNetClose(reason, wasOnline),
    });

    try {
      const saved = localStorage.getItem('aqua_ace_best_score');
      if (saved) this.bestScore = parseInt(saved, 10) || 0;
    } catch {
      // ignore storage restrictions
    }

    this.initThree();
    this.initActorsAndPools();
    this.bindEvents();
    this.setupInitialTitleScene();

    this.lastTime = performance.now();
    this.tick();
  }

  private detectSoftwareGl(): boolean {
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return false;
    }
  }

  private initThree(): void {
    this.isSoftwareGl = this.detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b2d4e);
    this.scene.fog = new THREE.FogExp2(0x1b2d4e, 0.0022);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.1, 680);

    // Warm/cool 3-point + spa lighting rig (<= 3 shadow casters)
    const hemi = new THREE.HemisphereLight(0x88bcff, 0x9b6b43, 0.95);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffdfb0, 1.65);
    keyLight.position.set(45, 92, 36);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 250;
    keyLight.shadow.camera.left = -102;
    keyLight.shadow.camera.right = 102;
    keyLight.shadow.camera.top = 86;
    keyLight.shadow.camera.bottom = -86;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    // Cool rim light from panoramic twilight windows
    const rimLight = new THREE.DirectionalLight(0x6fb1ff, 0.65);
    rimLight.position.set(-80, 48, -70);
    this.scene.add(rimLight);

    // Vibrant underwater cyan pool light glow
    const poolGlow = new THREE.PointLight(0x1ec8ff, 55, 68, 1.4);
    poolGlow.position.set(0, 2.2, -15);
    this.scene.add(poolGlow);

    JACUZZIS.forEach((jac) => {
      const jacGlow = new THREE.PointLight(0x3b82f6, 22, 26, 1.5);
      jacGlow.position.set(jac.x, 1.5, jac.z);
      this.scene.add(jacGlow);
    });

    // Warm amber glow at Hammam portal
    const hammamLight = new THREE.PointLight(0xffb860, 28, 36, 1.5);
    hammamLight.position.set(60, 4.0, -40);
    this.scene.add(hammamLight);

    // Textures & Spa Complex
    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.env = buildSpaEnvironment(this.textures, this.isSoftwareGl);
    this.scene.add(this.env.group);
  }

  private initActorsAndPools(): void {
    // Player Floatplane
    this.playerPlane = createPlaneModel(PLAYER_PLANE_PALETTE, this.textures, true);
    this.scene.add(this.playerPlane.root);

    // Player Character (hidden until eject!)
    this.playerChar = createCharacterModel(this.textures, '#e65b48');
    this.playerChar.root.visible = false;
    this.scene.add(this.playerChar.root);

    // Projectile Pool (50 bolts)
    const boltGeo = new THREE.SphereGeometry(0.24, 8, 8);
    boltGeo.scale(0.85, 0.85, 2.2);
    for (let i = 0; i < 50; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const mesh = new THREE.Mesh(boltGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.projectiles.push({
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        fromPlayer: true,
        life: 0,
        damage: 25,
        active: false,
        remote: false,
      });
    }

    // Particle Pool (140 particles for splashes, smoke, confetti, muzzle sparks)
    const pGeo = new THREE.DodecahedronGeometry(0.22, 0);
    for (let i = 0; i < 140; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(pGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.6,
        gravity: 0,
        startScale: 1,
        active: false,
      });
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private setupInitialTitleScene(): void {
    this.planePos.set(0, 9.5, 28);
    this.planeYaw = 0.35;
    this.planePitch = 0;
    this.planeRoll = -0.14;
    this.playerPlane.root.position.copy(this.planePos);
    this.playerPlane.root.rotation.set(this.planePitch, this.planeYaw, this.planeRoll, 'YXZ');
    this.playerPlane.seatedPilot.visible = true;
    this.playerPlane.beaconRing.visible = false;
    this.playerChar.root.visible = false;

    this.spawnEnemiesForWave(1, true);
    this.emitHud();
  }

  // -------------------------------------------------------
  // PUBLIC CONTROLS FOR REACT SHELL
  // -------------------------------------------------------
  /** Вход в игру по нику: открываем WebSocket, после «welcome» начинается бой. */
  public startGame(nick: string): void {
    this.sound.unlock();
    this.nick = nick.trim().slice(0, 16);
    this.connection = 'connecting';
    this.connectionError = null;
    this.emitHud();
    this.net.connect(this.nick);
  }

  public leaveGame(): void {
    this.net.close();
    this.resetToTitle();
  }

  private resetToTitle(): void {
    this.clearRemotes();
    this.clearDynamicEntities();
    this.heldKeys.clear();
    this.mouseFireHeld = false;
    this.sound.updateEngine(false, 0, false);
    this.phase = 'title';
    this.connection = 'idle';
    this.dead = false;
    this.myId = 0;
    this.board = [];
    this.feed = [];
    this.mode = 'plane';
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
    this.playerChar.root.visible = false;
    this.playerPlane.root.visible = true;
    this.playerPlane.seatedPilot.visible = true;
    this.playerPlane.beaconRing.visible = false;
    this.setupInitialTitleScene();
  }

  private handleNetClose(reason: string | null, wasOnline: boolean): void {
    this.clearRemotes();
    if (this.phase === 'title') {
      this.connection = reason || !wasOnline ? 'error' : 'idle';
      this.connectionError = reason || (wasOnline ? null : 'Не удалось подключиться к серверу');
      this.emitHud();
      return;
    }
    this.resetToTitle();
    this.connection = 'error';
    this.connectionError = reason || 'Соединение с сервером потеряно';
    this.emitHud();
  }

  private handleWelcome(m: {
    id: number;
    nick: string;
    spawn: Spawn;
    players: { id: number; nick: string; hp: number; dead: boolean }[];
    pickups: PickupInfo[];
    board: BoardRow[];
  }): void {
    this.clearDynamicEntities();
    this.myId = m.id;
    this.nick = m.nick;
    this.connection = 'online';
    this.connectionError = null;
    this.board = m.board;
    this.feed = [];
    this.deaths = 0;
    this.dead = false;
    m.players.forEach((p) => this.addRemote(p.id, p.nick));
    m.pickups.forEach((p) => this.addPickupFromServer(p));

    this.phase = 'playing';
    this.mode = 'plane';
    this.playerHp = this.maxPlayerHp;
    this.planeHp = this.maxPlaneHp;
    this.planeAlive = true;
    this.planeRespawnCooldown = 0;

    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.kills = 0;
    this.wave = 1;
    this.boostEnergy = 100;
    this.turboRemaining = 0;
    this.invulnTimer = 1.5;

    this.planePos.set(m.spawn.x, m.spawn.y, m.spawn.z);
    this.planeYaw = m.spawn.yaw;
    this.planePitch = 0;
    this.planeRoll = 0;
    this.planeSpeed = 16;
    this.planeParked = false;
    this.loopTimer = 0;
    this.loopCooldown = 0;
    this.sideRollTimer = 0;
    this.sideRollCooldown = 0;
    this.vaporTrailTimer = 0;
    this.planeVel.set(0, 0, -16);

    this.playerPlane.root.visible = true;
    this.playerPlane.seatedPilot.visible = true;
    this.playerPlane.beaconRing.visible = false;
    this.playerChar.root.visible = false;

    this.camYawOffset = 0;
    this.camPitchOffset = 0.14;

    this.showWaveBanner('ДОБРО ПОЖАЛОВАТЬ В АРЕНУ, ' + this.nick.toUpperCase() + '!');
    this.emitHud();
  }

  // -------------------------------------------------------
  // MULTIPLAYER
  // -------------------------------------------------------
  private makeNameLabel(nick: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(15,24,42,0.78)';
      ctx.beginPath();
      ctx.roundRect(4, 8, 248, 48, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(253,230,138,0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(nick, 128, 33, 232);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(6.4, 1.6, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  private addRemote(id: number, nick: string): void {
    if (id === this.myId || this.remotes.has(id)) return;
    const palette = ENEMY_PLANE_PALETTES[id % ENEMY_PLANE_PALETTES.length];
    const plane = createPlaneModel(palette, this.textures, false);
    plane.root.visible = false;
    this.scene.add(plane.root);
    const char = createCharacterModel(this.textures, palette.hatRibbon);
    char.root.visible = false;
    this.scene.add(char.root);
    const label = this.makeNameLabel(nick);
    label.visible = false;
    this.scene.add(label);
    this.remotes.set(id, {
      id,
      nick,
      plane,
      char,
      label,
      planePos: new THREE.Vector3(),
      planeQuat: new THREE.Quaternion(),
      charPos: new THREE.Vector3(),
      charYaw: 0,
      charMode: 0,
      speed: 16,
      parked: false,
      hp: 100,
      dead: false,
      seen: false,
      walk: 0,
      prevCharPos: new THREE.Vector3(),
    });
    this.pushFeed(`${nick} вошёл в арену`);
  }

  private removeRemote(id: number): void {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.plane.root);
    this.scene.remove(r.char.root);
    this.scene.remove(r.label);
    (r.label.material.map as THREE.Texture | null)?.dispose();
    r.label.material.dispose();
    this.remotes.delete(id);
    this.pushFeed(`${r.nick} вышел`);
  }

  private clearRemotes(): void {
    for (const id of [...this.remotes.keys()]) {
      const r = this.remotes.get(id)!;
      this.scene.remove(r.plane.root);
      this.scene.remove(r.char.root);
      this.scene.remove(r.label);
      (r.label.material.map as THREE.Texture | null)?.dispose();
      r.label.material.dispose();
    }
    this.remotes.clear();
  }

  private pushFeed(text: string): void {
    this.feed.push({ text, ttl: 7 });
    if (this.feed.length > 5) this.feed.shift();
  }

  private handleSnap(ps: RemoteState[]): void {
    for (const s of ps) {
      const r = this.remotes.get(s.id);
      if (!r) continue;
      r.planePos.set(s.pp[0], s.pp[1], s.pp[2]);
      r.planeQuat.set(s.pq[0], s.pq[1], s.pq[2], s.pq[3]);
      r.charPos.set(s.cp[0], s.cp[1], s.cp[2]);
      r.charYaw = s.cy;
      r.charMode = s.cm;
      r.speed = s.sp;
      r.parked = s.pk === 1;
      r.hp = s.hp;
      r.dead = s.dd === 1;
      if (!r.seen) {
        r.seen = true;
        r.plane.root.position.copy(r.planePos);
        r.plane.root.quaternion.copy(r.planeQuat);
        r.char.root.position.copy(r.charPos);
        r.prevCharPos.copy(r.charPos);
      }
    }
  }

  private updateRemotes(dt: number): void {
    const a = 1 - Math.exp(-16 * dt);
    for (const r of this.remotes.values()) {
      if (!r.seen || r.dead) {
        r.plane.root.visible = false;
        r.char.root.visible = false;
        r.label.visible = false;
        continue;
      }
      r.plane.root.visible = true;
      r.plane.root.position.lerp(r.planePos, a);
      r.plane.root.quaternion.slerp(r.planeQuat, a);
      r.plane.propeller.rotation.z += dt * (r.parked || r.charMode !== 0 ? 2.5 : 14 + r.speed * 1.4);
      r.plane.seatedPilot.visible = r.charMode === 0;
      r.plane.beaconRing.visible = r.charMode !== 0;

      let labelBase = r.plane.root.position;
      let labelUp = 3.1;
      if (r.charMode !== 0) {
        r.char.root.visible = true;
        r.char.root.position.lerp(r.charPos, a);
        r.char.root.rotation.y = r.charYaw;
        r.char.parachuteGroup.visible = r.charMode === 1;
        const moved = r.char.root.position.distanceTo(r.prevCharPos);
        r.prevCharPos.copy(r.char.root.position);
        if (moved > 0.01 && r.charMode !== 1) {
          r.walk += moved * 1.6;
          const swing = Math.sin(r.walk) * 0.72;
          r.char.leftLegPivot.rotation.x = swing;
          r.char.rightLegPivot.rotation.x = -swing;
          r.char.leftArmPivot.rotation.x = -swing * 0.8;
        }
        labelBase = r.char.root.position;
        labelUp = 3.0;
      } else {
        r.char.root.visible = false;
      }
      r.label.visible = true;
      r.label.position.set(labelBase.x, labelBase.y + labelUp, labelBase.z);
    }
  }

  private sendNetState(dt: number): void {
    this.netSendAccum += dt;
    if (this.netSendAccum < 0.05) return;
    this.netSendAccum = 0;
    const q = this.playerPlane.root.quaternion;
    this.net.send({
      t: 'st',
      pp: [this.planePos.x, this.planePos.y, this.planePos.z],
      pq: [q.x, q.y, q.z, q.w],
      cp: [this.charPos.x, this.charPos.y, this.charPos.z],
      cy: this.charYaw,
      cm: this.mode === 'plane' ? 0 : this.mode === 'parachute' ? 1 : this.mode === 'foot' ? 2 : 3,
      sp: this.planeSpeed,
      pk: this.mode !== 'plane' || this.planeParked ? 1 : 0,
    });
  }

  private handleRemoteShot(m: { id: number; p: number[]; d: number[]; s: number; k: number }): void {
    _v1.set(m.p[0], m.p[1], m.p[2]);
    _v2.set(m.d[0], m.d[1], m.d[2]);
    this.spawnProjectile(_v1, _v2, m.s, false, 0, true);
  }

  private handleDamageFromServer(hp: number, _by: number): void {
    this.planeHp = hp;
    this.playerHp = hp;
    this.damageFlashTimer = 0.25;
    this.shakeStrength = Math.max(this.shakeStrength, 0.38);
    this.sound.playHit(true);
  }

  private handleKill(m: { killer: number; killerNick: string; victim: number; victimNick: string }): void {
    if (m.killer) this.pushFeed(`${m.killerNick} сбил ${m.victimNick}`);
    else this.pushFeed(`${m.victimNick} разбился`);

    if (m.victim === this.myId) {
      this.dead = true;
      this.deaths += 1;
      const pos = this.mode === 'plane' ? this.planePos : this.charPos;
      this.spawnBurst(pos, 24, [0xff6b4a, 0xffd54f, 0x38bdf8, 0xffffff], 13, 9, 1.25, 0.75);
      this.sound.playExplosion();
      this.sound.updateEngine(false, 0, false);
      this.hitstopTimer = 0.055;
      this.shakeStrength = Math.max(this.shakeStrength, 0.5);
      this.playerPlane.root.visible = false;
      this.playerChar.root.visible = false;
      this.heldKeys.clear();
      this.mouseFireHeld = false;
      this.planeHp = 0;
      this.playerHp = 0;
      this.showWaveBanner(m.killer ? `ТЕБЯ СБИЛ ${m.killerNick.toUpperCase()}` : 'ТЫ РАЗБИЛСЯ');
      this.waveBannerTimer = 3;
    } else {
      const r = this.remotes.get(m.victim);
      if (r && r.seen) {
        const pos = r.charMode === 0 ? r.plane.root.position : r.char.root.position;
        this.spawnBurst(pos, 22, [0xff6b4a, 0xffd54f, 0x38bdf8, 0xffffff, 0x6ec49c], 13, 9, 1.25, 0.75);
        this.sound.playExplosion();
        r.dead = true;
      }
      if (m.killer === this.myId) {
        this.showWaveBanner(`ТЫ СБИЛ ${m.victimNick.toUpperCase()}!`);
        this.hitstopTimer = 0.042;
      }
    }
  }

  private respawnLocal(m: Spawn & { hp: number }): void {
    this.dead = false;
    this.mode = 'plane';
    this.playerHp = m.hp;
    this.planeHp = m.hp;
    this.planeAlive = true;
    this.planeRespawnCooldown = 0;
    this.boostEnergy = 100;
    this.turboRemaining = 0;
    this.invulnTimer = 2.5;
    this.planePos.set(m.x, m.y, m.z);
    this.planeYaw = m.yaw;
    this.planePitch = 0;
    this.planeRoll = 0;
    this.planeSpeed = 16;
    this.planeParked = false;
    this.loopTimer = 0;
    this.loopCooldown = 0;
    this.sideRollTimer = 0;
    this.sideRollCooldown = 0;
    this.planeVel.set(-Math.sin(m.yaw) * 16, 0, -Math.cos(m.yaw) * 16);
    this.charPos.copy(this.planePos);
    this.playerPlane.root.visible = true;
    this.playerPlane.seatedPilot.visible = true;
    this.playerPlane.beaconRing.visible = false;
    this.playerChar.root.visible = false;
    this.playerChar.parachuteGroup.visible = false;
    this.camPos.copy(this.planePos).add(new THREE.Vector3(0, 3, 9));
    this.waveBanner = null;
    this.showWaveBanner('ВОЗРОЖДЕНИЕ!');
    this.emitHud();
  }

  private addPickupFromServer(item: PickupInfo): void {
    if (this.pickups.some((p) => p.id === item.id)) return;
    const mesh = createPickupModel(item.kind);
    mesh.position.set(item.x, item.y, item.z);
    this.scene.add(mesh);
    this.pickups.push({
      id: item.id,
      kind: item.kind,
      mesh,
      pos: new THREE.Vector3(item.x, item.y, item.z),
      bobPhase: Math.random() * Math.PI * 2,
      active: true,
    });
  }

  private removePickupFromServer(id: number, by: number): void {
    const p = this.pickups.find((x) => x.id === id);
    if (!p) return;
    if (p.active && by !== this.myId) {
      this.spawnBurst(p.mesh.position, 8, [0xffd54f, 0x34d399, 0x38bdf8], 6, 4, 0.8, 0.4);
    }
    this.scene.remove(p.mesh);
    this.pickups = this.pickups.filter((x) => x !== p);
  }

  private handleBoard(rows: BoardRow[]): void {
    this.board = rows;
    const me = rows.find((r) => r.id === this.myId);
    if (me && me.score > this.bestScore) {
      this.bestScore = me.score;
      try {
        localStorage.setItem('aqua_ace_best_score', String(this.bestScore));
      } catch {
        // ignore
      }
    }
  }

  public toggleMute(): boolean {
    const muted = this.sound.toggleMute();
    this.emitHud();
    return muted;
  }

  // --- Сенсорное управление (телефон): стик и кнопки превращаются в «зажатые клавиши» ---
  private setKey(code: string, down: boolean): void {
    if (down) {
      if (!this.heldKeys.has(code)) this.justPressed.add(code);
      this.heldKeys.add(code);
    } else {
      this.heldKeys.delete(code);
    }
  }

  public setTouchStick(x: number, y: number): void {
    const dz = 0.28;
    this.setKey('KeyA', x < -dz);
    this.setKey('KeyD', x > dz);
    this.setKey('KeyW', y > dz);
    this.setKey('KeyS', y < -dz);
  }

  public setTouchHold(btn: 'fire' | 'boost' | 'brake', down: boolean): void {
    if (btn === 'fire') this.mouseFireHeld = down && this.phase === 'playing';
    else if (btn === 'boost') this.setKey('ShiftLeft', down);
    else this.setKey('KeyC', down);
    if (down) this.sound.unlock();
  }

  public triggerJump(): void {
    if (this.phase === 'playing') this.justPressed.add('Space');
  }

  public triggerEjectOrBoard(): void {
    if (this.phase !== 'playing') return;
    this.justPressed.add('KeyF');
  }

  public triggerSummonPlane(): void {
    if (this.phase !== 'playing') return;
    this.justPressed.add('KeyR');
  }

  public triggerLoop(): void {
    if (this.phase !== 'playing' || this.mode !== 'plane') return;
    this.justPressed.add('KeyX');
  }

  public triggerSideRoll(dir?: 1 | -1): void {
    if (this.phase !== 'playing' || this.mode !== 'plane') return;
    if (dir === 1) {
      this.justPressed.add('KeyQ');
    } else {
      this.justPressed.add('KeyE');
    }
  }

  // -------------------------------------------------------
  // INPUT BINDINGS
  // -------------------------------------------------------
  private handleKeyDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'KeyM') {
      this.toggleMute();
      return;
    }
    if (this.phase !== 'playing') return;
    if (!this.heldKeys.has(e.code)) {
      this.justPressed.add(e.code);
    }
    this.heldKeys.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.heldKeys.delete(e.code);
  };

  private handleBlur = () => {
    this.heldKeys.clear();
    this.justPressed.clear();
    this.mouseFireHeld = false;
    this.isDraggingCamera = false;
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (this.phase !== 'playing') return;
    this.sound.unlock();
    if (e.button === 0) {
      this.mouseFireHeld = true;
    }
    if (e.button === 2 || e.button === 1) {
      this.isDraggingCamera = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.phase !== 'playing') return;
    if (this.isDraggingCamera) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      if (this.mode === 'plane') {
        this.planeYaw -= dx * 0.0045;
        this.planePitch = THREE.MathUtils.clamp(this.planePitch - dy * 0.0035, -0.58, 0.58);
      } else {
        this.camYawOffset -= dx * 0.005;
        this.camPitchOffset = THREE.MathUtils.clamp(this.camPitchOffset + dy * 0.004, -0.1, 0.65);
      }
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (e.button === 0) this.mouseFireHeld = false;
    if (e.button === 2 || e.button === 1) this.isDraggingCamera = false;
  };

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('contextmenu', this.handleContextMenu);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener('resize', this.handleResize);
    }
  }

  // -------------------------------------------------------
  // SPAWNING & POOL HELPERS
  // -------------------------------------------------------
  private clearDynamicEntities(): void {
    this.enemies.forEach((e) => this.scene.remove(e.model.root));
    this.enemies = [];

    this.pickups.forEach((p) => this.scene.remove(p.mesh));
    this.pickups = [];

    this.ejectedNpcs.forEach((n) => this.scene.remove(n.group));
    this.ejectedNpcs = [];

    this.projectiles.forEach((p) => {
      p.active = false;
      p.mesh.visible = false;
    });
    this.particles.forEach((p) => {
      p.active = false;
      p.mesh.visible = false;
    });
  }

  private showWaveBanner(text: string): void {
    this.waveBanner = text;
    this.waveBannerTimer = 2.4;
  }

  private spawnEnemiesForWave(waveNum: number, idlePreview: boolean): void {
    const count = idlePreview ? 3 : Math.min(8, 2 + waveNum);
    for (let i = 0; i < count; i++) {
      const palette = ENEMY_PLANE_PALETTES[(i + waveNum) % ENEMY_PLANE_PALETTES.length];
      const model = createPlaneModel(palette, this.textures, false);

      const angle = (i / count) * Math.PI * 2;
      const startPos = new THREE.Vector3(
        Math.cos(angle) * 52,
        8.5 + (i % 3) * 4.2,
        Math.sin(angle) * 38 - 10,
      );
      model.root.position.copy(startPos);
      this.scene.add(model.root);

      const maxHp = 60 + (waveNum - 1) * 18;
      this.enemies.push({
        id: this.nextEnemyId++,
        model,
        pos: startPos,
        vel: new THREE.Vector3(),
        yaw: angle + Math.PI / 2,
        pitch: 0,
        roll: 0,
        hp: maxHp,
        maxHp,
        speed: 13.5 + Math.min(6, waveNum * 0.9),
        patrolPhase: angle,
        patrolCenter: new THREE.Vector3((i % 2 === 0 ? -1 : 1) * 22, 11 + (i % 3) * 3.5, -12),
        fireCooldown: 1.5 + Math.random() * 1.8,
        telegraphTimer: 0,
        hitFlash: 0,
        alive: true,
      });
    }
  }

  private spawnProjectile(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    speed: number,
    fromPlayer: boolean,
    damage: number,
    remote = false,
  ): void {
    const slot = this.projectiles.find((p) => !p.active);
    if (!slot) return;

    slot.active = true;
    slot.fromPlayer = fromPlayer;
    slot.remote = remote;
    slot.damage = damage;
    slot.life = fromPlayer ? 1.8 : 2.5;
    slot.pos.copy(origin);
    slot.vel.copy(dir).normalize().multiplyScalar(speed);

    if (fromPlayer && !remote) {
      _v4.copy(slot.vel).normalize();
      this.net.send({
        t: 'shot',
        p: [origin.x, origin.y, origin.z],
        d: [_v4.x, _v4.y, _v4.z],
        s: speed,
        k: this.mode === 'plane' ? 0 : 1,
      });
    }

    const mat = slot.mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(remote ? 0xffb454 : fromPlayer ? 0x38bdf8 : 0xff6b4a);
    slot.mesh.position.copy(origin);
    _v1.copy(origin).add(slot.vel);
    slot.mesh.lookAt(_v1);
    slot.mesh.visible = true;
  }

  private spawnBurst(
    origin: THREE.Vector3,
    count: number,
    colors: number[],
    speed: number,
    gravity: number,
    scale = 1,
    life = 0.65,
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active) continue;
      p.active = true;
      p.life = life * (0.7 + Math.random() * 0.5);
      p.maxLife = p.life;
      p.gravity = gravity;
      p.startScale = scale * (0.7 + Math.random() * 0.65);

      p.mesh.position.copy(origin);
      p.vel.set(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.4 - 0.2,
        (Math.random() - 0.5) * 2,
      )
        .normalize()
        .multiplyScalar(speed * (0.45 + Math.random() * 0.8));

      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(colors[spawned % colors.length]);
      mat.opacity = 1;
      p.mesh.scale.setScalar(p.startScale);
      p.mesh.visible = true;
      spawned++;
    }
  }

  private spawnPickup(pos: THREE.Vector3): void {
    const roll = Math.random();
    const kind: PickupKind = roll < 0.45 ? 'duck' : roll < 0.78 ? 'repair' : 'turbo';
    const mesh = createPickupModel(kind);
    const clampedPos = pos.clone();
    clampedPos.y = THREE.MathUtils.clamp(clampedPos.y, 1.4, 9.5);
    mesh.position.copy(clampedPos);
    this.scene.add(mesh);
    this.pickups.push({
      id: -1,
      kind,
      mesh,
      pos: clampedPos,
      bobPhase: Math.random() * Math.PI * 2,
      active: true,
    });
  }

  private spawnEjectedNpc(pos: THREE.Vector3, ribbonHex: string): void {
    const npc = createCharacterModel(this.textures, ribbonHex);
    npc.parachuteGroup.visible = true;
    npc.contactShadow.visible = false;
    npc.root.position.copy(pos);
    this.scene.add(npc.root);
    this.ejectedNpcs.push({ group: npc.root, velY: -3.2, life: 4.5 });
  }

  // -------------------------------------------------------
  // MAIN SIMULATION LOOP
  // -------------------------------------------------------
  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (this.phase === 'title') {
      this.elapsed += dt;
      this.env.update(this.elapsed, dt);
      this.updateTitleShowcase(dt);
    } else if (this.phase === 'playing') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
      } else {
        this.elapsed += dt;
        this.env.update(this.elapsed, dt);
        this.stepGameplay(dt);
      }
    } else {
      // Paused or Game Over: keep water subtly rippling
      this.env.update(this.elapsed, 0);
      this.sound.updateEngine(false, 0, false);
    }

    this.justPressed.clear();
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateTitleShowcase(dt: number): void {
    this.sound.updateEngine(false, 0, false);

    // Gentle hover & prop spin on the showcase plane
    this.playerPlane.propeller.rotation.z += dt * 24;
    this.planePos.y = 9.2 + Math.sin(this.elapsed * 1.4) * 0.55;
    this.playerPlane.root.position.copy(this.planePos);
    this.playerPlane.root.rotation.set(
      Math.sin(this.elapsed * 0.9) * 0.06,
      0.45 + Math.sin(this.elapsed * 0.4) * 0.15,
      -0.14 + Math.cos(this.elapsed * 1.1) * 0.07,
      'YXZ',
    );

    // Enemy planes patrol lazily in background
    this.enemies.forEach((enemy) => {
      enemy.patrolPhase += dt * 0.4;
      const nx = Math.cos(enemy.patrolPhase) * 48;
      const nz = Math.sin(enemy.patrolPhase) * 34 - 14;
      const ny = 13.5 + Math.sin(enemy.patrolPhase * 2) * 2.5;
      _v1.set(nx - enemy.pos.x, ny - enemy.pos.y, nz - enemy.pos.z);
      enemy.pos.set(nx, ny, nz);
      enemy.yaw = Math.atan2(-_v1.x, -_v1.z);
      enemy.model.root.position.copy(enemy.pos);
      enemy.model.root.rotation.set(0, enemy.yaw, -0.32, 'YXZ');
      enemy.model.propeller.rotation.z += dt * 26;
    });

    // Atmospheric sweeping camera over the pool, twin jacuzzis & chandeliers
    const camAngle = this.elapsed * 0.14;
    this.camera.position.set(
      Math.sin(camAngle) * 28 + 8,
      13.5 + Math.sin(this.elapsed * 0.25) * 1.8,
      Math.cos(camAngle) * 28 + 22,
    );
    this.camera.lookAt(0, 6.2, -10);
  }

  private stepGameplay(dt: number): void {
    // Decrement timers
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 1;
    }
    if (this.waveBannerTimer > 0) {
      this.waveBannerTimer -= dt;
      if (this.waveBannerTimer <= 0) this.waveBanner = null;
    }
    if (this.hitMarkerTimer > 0) this.hitMarkerTimer = Math.max(0, this.hitMarkerTimer - dt);
    if (this.damageFlashTimer > 0) this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt);
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.turboRemaining > 0) this.turboRemaining = Math.max(0, this.turboRemaining - dt);
    if (this.planeRespawnCooldown > 0) {
      this.planeRespawnCooldown = Math.max(0, this.planeRespawnCooldown - dt);
    }
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.splashCooldown > 0) this.splashCooldown -= dt;
    if (this.loopCooldown > 0) this.loopCooldown = Math.max(0, this.loopCooldown - dt);
    if (this.sideRollCooldown > 0) this.sideRollCooldown = Math.max(0, this.sideRollCooldown - dt);
    if (this.vaporTrailTimer > 0) this.vaporTrailTimer = Math.max(0, this.vaporTrailTimer - dt);

    // Handle Use / Catapult / Eject / Board (KeyF) & Summon Plane (KeyR)
    if (this.justPressed.has('KeyF')) {
      if (this.mode === 'plane') {
        this.ejectFromPlane();
      } else if (this.planeAlive && this.charPos.distanceTo(this.planePos) <= 5.5) {
        this.boardPlane();
      }
    }

    if (this.justPressed.has('KeyR') && this.mode !== 'plane') {
      this.summonFreshPlane();
    }

    for (const f of this.feed) f.ttl -= dt;
    this.feed = this.feed.filter((f) => f.ttl > 0);

    if (this.dead) {
      // Сбит: ждём возрождения от сервера, мир вокруг продолжает жить
      this.updateProjectiles(dt);
      this.updateParticles(dt);
      this.updateRemotes(dt);
      this.sendNetState(dt);
      this.updateCamera(dt);
      this.hudSyncAccum += dt;
      if (this.hudSyncAccum >= 0.05) {
        this.hudSyncAccum = 0;
        this.emitHud();
      }
      return;
    }

    // Update active player controller
    if (this.mode === 'plane') {
      this.updatePlaneFlight(dt);
    } else {
      this.updateParkedPlane(dt);
      this.updateCharacter(dt);
    }

    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    this.updateRemotes(dt);
    this.sendNetState(dt);

    this.updateCamera(dt);

    this.hudSyncAccum += dt;
    if (this.hudSyncAccum >= 0.05) {
      this.hudSyncAccum = 0;
      this.emitHud();
    }
  }

  private ejectFromPlane(): void {
    this.mode = 'parachute';
    this.loopTimer = 0;
    this.sideRollTimer = 0;
    this.sound.playEject();
    this.sound.updateEngine(false, 0, false);

    this.playerPlane.seatedPilot.visible = false;
    this.playerPlane.beaconRing.visible = true;

    this.charPos.copy(this.planePos).add(new THREE.Vector3(0, 1.1, 0));
    this.charVel.copy(this.planeVel).multiplyScalar(0.35);
    this.charVel.y = 8.5;
    this.charYaw = this.planeYaw;
    this.charGrounded = false;
    this.camYawOffset = 0;
    this.camPitchOffset = 0.2;

    this.playerChar.root.position.copy(this.charPos);
    this.playerChar.root.visible = true;
    this.playerChar.parachuteGroup.visible = true;
    this.spawnBurst(this.charPos, 10, [0xffffff, 0xbae6fd], 5, 4, 0.9, 0.45);
    this.emitHud();
  }

  private boardPlane(): void {
    this.mode = 'plane';
    this.sound.playBoard();

    this.playerChar.root.visible = false;
    this.playerChar.parachuteGroup.visible = false;

    this.playerPlane.seatedPilot.visible = true;
    this.playerPlane.beaconRing.visible = false;

    // Lift plane gently if sitting on water or deck so takeoff feels crisp
    if (this.planePos.y < 2.2) {
      this.planePos.y = 2.4;
    }
    this.planeParked = false;
    this.loopTimer = 0;
    this.sideRollTimer = 0;
    this.planePitch = 0.14;
    this.planeSpeed = Math.max(this.planeSpeed, 14);
    this.emitHud();
  }

  private summonFreshPlane(): void {
    if (this.planeAlive && this.charPos.distanceTo(this.planePos) < 12) {
      // Just hop right in if close!
      this.boardPlane();
      return;
    }
    if (this.planeRespawnCooldown > 0) return;

    this.planeAlive = true;
    this.planeHp = this.maxPlaneHp;
    this.planeRespawnCooldown = 4.0;
    this.playerPlane.root.visible = true;

    _v1.set(-Math.sin(this.charYaw), 0, -Math.cos(this.charYaw));
    this.planePos.copy(this.charPos).addScaledVector(_v1, 3.2);
    this.planePos.x = THREE.MathUtils.clamp(this.planePos.x, -ARENA_HALF_W + 6, ARENA_HALF_W - 6);
    this.planePos.z = THREE.MathUtils.clamp(this.planePos.z, -ARENA_HALF_D + 6, ARENA_HALF_D - 6);
    this.planePos.y = Math.max(this.charPos.y + 1.2, 2.2);
    this.planeYaw = this.charYaw;
    this.planePitch = 0;
    this.planeRoll = 0;
    this.planeSpeed = 14;
    this.planeVel.set(-Math.sin(this.planeYaw), 0, -Math.cos(this.planeYaw)).multiplyScalar(14);

    this.spawnBurst(this.planePos, 16, [0x6eb8d8, 0xefe5a5, 0xffffff], 8, 5, 1.2, 0.55);
    this.boardPlane();
  }

  private updatePlaneFlight(dt: number): void {
    const turnLeft = this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft');
    const turnRight = this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight');
    const pitchUp = this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp');
    const pitchDown = this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown');
    const boostHeld = this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight');
    const brakeHeld = this.heldKeys.has('KeyC') || this.heldKeys.has('ControlLeft');

    const turnInput = (turnLeft ? 1 : 0) - (turnRight ? 1 : 0);
    const pitchInput = (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0);

    const boosting = !brakeHeld && ((boostHeld && this.boostEnergy > 4) || this.turboRemaining > 0);
    if (boostHeld && !brakeHeld && this.turboRemaining <= 0) {
      this.boostEnergy = Math.max(0, this.boostEnergy - dt * 14);
    } else {
      this.boostEnergy = Math.min(100, this.boostEnergy + dt * 14);
    }

    const inWater = isPointInWater(this.planePos.x, this.planePos.z);
    const surfaceWaterY = getWaterSurfaceY(this.planePos.x, this.planePos.z) ?? MAIN_POOL.waterY;
    const minPontoonY = inWater ? surfaceWaterY + 0.92 : 1.02;
    const onSurface = this.planePos.y <= minPontoonY + 0.08;

    // Wake up from full ground stop when accelerating (W / Shift) and not braking
    if (this.planeParked) {
      if ((pitchUp || boostHeld) && !brakeHeld) {
        this.planeParked = false;
        this.planeSpeed = 6.5;
        this.planePitch = 0.16;
      } else {
        this.planeSpeed = 0;
        this.planePitch = THREE.MathUtils.damp(this.planePitch, 0, 8, dt);
        this.planeRoll = THREE.MathUtils.damp(this.planeRoll, 0, 8, dt);
        this.planeYaw += turnInput * 1.4 * dt;
      }
    }

    if (!this.planeParked) {
      // Trigger Loop-the-Loop (X)
      if (
        this.justPressed.has('KeyX') &&
        this.loopTimer <= 0 &&
        this.loopCooldown <= 0 &&
        this.sideRollTimer <= 0
      ) {
        if (this.planePos.y < minPontoonY + 1.5) {
          this.planePos.y = minPontoonY + 1.5;
        }
        this.loopTimer = this.loopDuration;
        this.loopCooldown = 1.8;
        this.planeSpeed = Math.max(this.planeSpeed, 23);
        this.invulnTimer = Math.max(this.invulnTimer, 0.75);
        this.sound.playWhoosh(true);
      }

      // Trigger Side Barrel-Roll Maneuver (Q = left, E = right)
      const wantRollLeft = this.justPressed.has('KeyQ');
      const wantRollRight = this.justPressed.has('KeyE') || this.justPressed.has('KeyV');

      if (
        (wantRollLeft || wantRollRight) &&
        this.sideRollTimer <= 0 &&
        this.sideRollCooldown <= 0 &&
        this.loopTimer <= 0
      ) {
        this.sideRollDir = wantRollRight ? -1 : 1;
        this.sideRollTimer = this.sideRollDuration;
        this.sideRollCooldown = 1.1;
        this.invulnTimer = Math.max(this.invulnTimer, 0.45);
        this.sound.playWhoosh(false);
      }

      if (this.loopTimer > 0) {
        // 360-degree vertical loop using quaternion composition (no gimbal lock)
        this.loopTimer = Math.max(0, this.loopTimer - dt);
        const progress = 1 - this.loopTimer / this.loopDuration;
        const theta = progress * Math.PI * 2;
        this.planeYaw += turnInput * 0.75 * dt;

        const loopSpeed = 24;
        this.planeSpeed = loopSpeed;

        _v1.set(-Math.sin(this.planeYaw), 0, -Math.cos(this.planeYaw));
        _v2
          .copy(_v1)
          .multiplyScalar(Math.cos(theta))
          .addScaledVector(_axisY, Math.sin(theta))
          .normalize();
        this.planeVel.copy(_v2).multiplyScalar(loopSpeed);
        this.planePos.addScaledVector(this.planeVel, dt);

        _q1.setFromAxisAngle(_axisY, this.planeYaw);
        _q2.setFromAxisAngle(_axisX, theta);
        this.playerPlane.root.quaternion.copy(_q1).multiply(_q2);

        if (this.loopTimer === 0) {
          this.planePitch = 0;
          this.planeRoll = 0;
        }
        this.emitWingtipVapor();
      } else if (this.sideRollTimer > 0) {
        // Snap side barrel-roll & lateral carve dash
        this.sideRollTimer = Math.max(0, this.sideRollTimer - dt);
        const progress = 1 - this.sideRollTimer / this.sideRollDuration;

        this.planeYaw += this.sideRollDir * 0.92 * dt;
        if (pitchInput !== 0) {
          this.planePitch = THREE.MathUtils.clamp(
            this.planePitch + pitchInput * 1.4 * dt,
            -0.62,
            0.62,
          );
        }

        _euler.set(this.planePitch, this.planeYaw, 0, 'YXZ');
        _v1.set(0, 0, -1).applyEuler(_euler).normalize();
        _v2.set(Math.cos(this.planeYaw), 0, -Math.sin(this.planeYaw));

        const lateralSpeed = -this.sideRollDir * Math.sin(progress * Math.PI) * 18;
        const fwdSpeed = boosting ? 29 : 19;
        this.planeSpeed = Math.hypot(fwdSpeed, lateralSpeed);
        this.planeVel.copy(_v1).multiplyScalar(fwdSpeed).addScaledVector(_v2, lateralSpeed);
        this.planePos.addScaledVector(this.planeVel, dt);

        _q1.setFromEuler(_euler);
        _q2.setFromAxisAngle(_axisZ, this.sideRollDir * progress * Math.PI * 2);
        this.playerPlane.root.quaternion.copy(_q1).multiply(_q2);

        if (this.sideRollTimer === 0) {
          this.planeRoll = this.sideRollDir * 0.45;
        }
        this.emitWingtipVapor();
      } else {
        // Normal flight with deep steep side banks (боковые виражи)
        if (brakeHeld) {
          const brakeRate = onSurface ? 8.5 : 3.2;
          this.planeSpeed = THREE.MathUtils.damp(this.planeSpeed, 0, brakeRate, dt);
          if (this.planeSpeed < 0.45 && onSurface) {
            this.planeSpeed = 0;
            this.planeParked = true;
          }
        } else {
          const targetSpeed = boosting ? 29 : 16.5;
          this.planeSpeed = THREE.MathUtils.damp(this.planeSpeed, targetSpeed, 5.5, dt);
        }

        const turnRate = brakeHeld ? 2.4 : boosting ? 2.75 : 2.35;
        this.planeYaw += turnInput * turnRate * dt;

        if (pitchInput !== 0) {
          this.planePitch = THREE.MathUtils.clamp(
            this.planePitch + pitchInput * 1.65 * dt,
            -0.62,
            0.62,
          );
        } else {
          this.planePitch = THREE.MathUtils.damp(this.planePitch, 0, 2.2, dt);
        }

        const targetRoll = turnInput * (this.planeSpeed < 4 ? 0.15 : 1.18);
        this.planeRoll = THREE.MathUtils.damp(this.planeRoll, targetRoll, 8.2, dt);

        _euler.set(this.planePitch, this.planeYaw, 0, 'YXZ');
        _v1.set(0, 0, -1).applyEuler(_euler).normalize();
        _v2.set(Math.cos(this.planeYaw), 0, -Math.sin(this.planeYaw));
        const carveLateral = -Math.sin(this.planeRoll) * (this.planeSpeed * 0.22);
        this.planeVel.copy(_v1).multiplyScalar(this.planeSpeed).addScaledVector(_v2, carveLateral);
        this.planePos.addScaledVector(this.planeVel, dt);

        // Airbrake sink when slowing down in mid-air so plane descends smoothly to land
        if (brakeHeld && this.planePos.y > minPontoonY && this.planeSpeed < 11) {
          this.planePos.y -= (11 - this.planeSpeed) * 0.72 * dt;
        }

        _euler.set(this.planePitch, this.planeYaw, this.planeRoll, 'YXZ');
        this.playerPlane.root.quaternion.setFromEuler(_euler);

        if (Math.abs(this.planeRoll) > 0.78 && this.planeSpeed > 10) {
          this.emitWingtipVapor();
        }
      }
    } else {
      this.planeVel.set(0, 0, 0);
      _euler.set(this.planePitch, this.planeYaw, this.planeRoll, 'YXZ');
      this.playerPlane.root.quaternion.setFromEuler(_euler);
    }

    // Ground & Water landing / skimming with pontoons
    if (this.planePos.y <= minPontoonY) {
      this.planePos.y =
        this.planeParked && inWater
          ? minPontoonY + Math.sin(this.elapsed * 2.5) * 0.04
          : minPontoonY;
      if (this.planePitch < 0) this.planePitch *= 0.45;
      if (inWater && this.planeSpeed > 2.2 && this.splashCooldown <= 0) {
        this.splashCooldown = 0.08;
        this.sound.playSplash(false);
        _v2.set(this.planePos.x, surfaceWaterY + 0.1, this.planePos.z);
        this.spawnBurst(_v2, 4, [0xbef2ff, 0x38bdf8, 0xffffff], 4.5, 11, 0.85, 0.45);
      }
    }

    // Ceiling & Wall soft bounce inside the Spa Hall
    const ceilingY = getRoofCeilingAt(this.planePos.x) - 1.5;
    if (this.planePos.y > ceilingY) {
      this.planePos.y = ceilingY;
      if (this.planePitch > 0) this.planePitch = -0.12;
    }

    const limitX = ARENA_HALF_W - 3.0;
    const limitZ = ARENA_HALF_D - 3.0;
    if (Math.abs(this.planePos.x) > limitX) {
      this.planePos.x = Math.sign(this.planePos.x) * limitX;
      this.planeYaw += Math.PI * 0.32 * dt * 10;
    }
    if (Math.abs(this.planePos.z) > limitZ) {
      this.planePos.z = Math.sign(this.planePos.z) * limitZ;
      this.planeYaw += Math.PI * 0.32 * dt * 10;
    }

    // Obstacle avoidance (Sauna house, Hammam & Pool fountain)
    for (const obs of this.env.obstacles) {
      if (
        this.planePos.x > obs.minX - 1.4 &&
        this.planePos.x < obs.maxX + 1.4 &&
        this.planePos.z > obs.minZ - 1.4 &&
        this.planePos.z < obs.maxZ + 1.4 &&
        this.planePos.y < obs.maxY + 0.9
      ) {
        if (this.planePos.y > obs.maxY - 0.8) {
          this.planePos.y = obs.maxY + 0.95;
        } else {
          const cx = (obs.minX + obs.maxX) * 0.5;
          const cz = (obs.minZ + obs.maxZ) * 0.5;
          _v2.set(this.planePos.x - cx, 0, this.planePos.z - cz).normalize();
          this.planePos.addScaledVector(_v2, 0.45);
        }
      }
    }

    // Apply position & spin propeller (orientation already set via quaternion above)
    this.playerPlane.root.position.copy(this.planePos);
    this.playerPlane.propeller.rotation.z += dt * (this.planeParked ? 3.5 : 14 + this.planeSpeed * 1.4);
    this.playerPlane.setHitFlash(this.damageFlashTimer * 3);

    this.sound.updateEngine(
      true,
      this.planeParked ? 0.02 : Math.max(0.05, this.planeSpeed / 25),
      boosting && !this.planeParked,
    );

    // Shooting (Space or Left Mouse)
    const fireHeld = this.heldKeys.has('Space') || this.mouseFireHeld;
    const fireInterval = this.turboRemaining > 0 ? 0.08 : 0.145;
    if (fireHeld && this.fireCooldown <= 0) {
      this.fireCooldown = fireInterval;
      this.firePlayerPlaneGuns();
    }
  }

  private emitWingtipVapor(): void {
    if (this.vaporTrailTimer > 0) return;
    this.vaporTrailTimer = 0.035;
    _v3.set(-2.35, 0.08, 0.25).applyQuaternion(this.playerPlane.root.quaternion).add(this.planePos);
    _v4.set(2.35, 0.08, 0.25).applyQuaternion(this.playerPlane.root.quaternion).add(this.planePos);
    this.spawnBurst(_v3, 1, [0xffffff, 0xe0f2fe], 0.8, 0, 0.55, 0.28);
    this.spawnBurst(_v4, 1, [0xffffff, 0xe0f2fe], 0.8, 0, 0.55, 0.28);
  }

  private firePlayerPlaneGuns(): void {
    this.sound.playShoot(false);
    this.playerPlane.root.updateMatrixWorld();

    const forward = _v3.set(0, 0, -1).applyQuaternion(this.playerPlane.root.quaternion).normalize();

    // Gentle aim magnetism toward closest enemy within 14° forward cone
    let bestDir = forward.clone();
    let bestDot = 0.965;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      _v4.copy(enemy.pos).sub(this.planePos);
      const dist = _v4.length();
      if (dist > 65) continue;
      _v4.divideScalar(dist);
      const dot = forward.dot(_v4);
      if (dot > bestDot) {
        bestDot = dot;
        bestDir.copy(_v4);
      }
    }

    this.playerPlane.muzzleLeft.getWorldPosition(_v1);
    this.playerPlane.muzzleRight.getWorldPosition(_v2);
    const dmg = this.turboRemaining > 0 ? 34 : 25;
    this.spawnProjectile(_v1, bestDir, 68, true, dmg);
    this.spawnProjectile(_v2, bestDir, 68, true, dmg);
    this.spawnBurst(_v1, 2, [0xbae6fd, 0xfff3c4], 4, 0, 0.5, 0.16);
    this.spawnBurst(_v2, 2, [0xbae6fd, 0xfff3c4], 4, 0, 0.5, 0.16);
  }

  private updateParkedPlane(dt: number): void {
    if (!this.planeAlive) {
      this.playerPlane.root.visible = false;
      return;
    }

    // Gentle glide slowdown & settle onto water or brick deck
    this.planeVel.x = THREE.MathUtils.damp(this.planeVel.x, 0, 1.5, dt);
    this.planeVel.z = THREE.MathUtils.damp(this.planeVel.z, 0, 1.5, dt);
    const inWater = isPointInWater(this.planePos.x, this.planePos.z);
    const settleY = inWater ? MAIN_POOL.waterY + 0.85 : 0.96;

    if (this.planePos.y > settleY + 0.05) {
      this.planeVel.y = Math.max(-7, this.planeVel.y - 12 * dt);
    } else {
      this.planeVel.y = 0;
      this.planePos.y = settleY + (inWater ? Math.sin(this.elapsed * 2.5) * 0.06 : 0);
    }

    this.planePos.addScaledVector(this.planeVel, dt);
    this.planePos.x = THREE.MathUtils.clamp(this.planePos.x, -ARENA_HALF_W + 3, ARENA_HALF_W - 3);
    this.planePos.z = THREE.MathUtils.clamp(this.planePos.z, -ARENA_HALF_D + 3, ARENA_HALF_D - 3);

    this.planePitch = THREE.MathUtils.damp(this.planePitch, 0, 3, dt);
    this.planeRoll = THREE.MathUtils.damp(
      this.planeRoll,
      inWater ? Math.sin(this.elapsed * 2.1) * 0.05 : 0,
      3,
      dt,
    );

    this.playerPlane.root.position.copy(this.planePos);
    this.playerPlane.root.rotation.set(this.planePitch, this.planeYaw, this.planeRoll, 'YXZ');
    this.playerPlane.propeller.rotation.z += dt * 2.5;
    this.playerPlane.beaconRing.rotation.z += dt * 1.5;
    const pulse = 1 + Math.sin(this.elapsed * 4.5) * 0.08;
    this.playerPlane.beaconRing.scale.setScalar(pulse);
  }

  private updateCharacter(dt: number): void {
    this.sound.updateEngine(false, 0, false);

    // Camera-relative movement on foot / parachute / swim
    const moveFwd =
      (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp') ? 1 : 0) -
      (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown') ? 1 : 0);
    const moveRight =
      (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight') ? 1 : 0) -
      (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft') ? 1 : 0);

    const camForward = _v1.set(-Math.sin(this.camYawOffset), 0, -Math.cos(this.camYawOffset));
    const camRight = _v2.set(Math.cos(this.camYawOffset), 0, -Math.sin(this.camYawOffset));

    _v3.set(0, 0, 0).addScaledVector(camForward, moveFwd).addScaledVector(camRight, moveRight);
    const hasMove = _v3.lengthSq() > 0.01;
    if (hasMove) _v3.normalize();

    const waterZone = isPointInWater(this.charPos.x, this.charPos.z);
    const moveSpeed =
      this.mode === 'parachute' ? 10.5 : this.mode === 'swim' ? 6.8 : 9.8;

    this.charVel.x = THREE.MathUtils.damp(this.charVel.x, _v3.x * moveSpeed, 10, dt);
    this.charVel.z = THREE.MathUtils.damp(this.charVel.z, _v3.z * moveSpeed, 10, dt);

    if (hasMove) {
      const targetYaw = Math.atan2(-_v3.x, -_v3.z);
      let diff = targetYaw - this.charYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.charYaw += diff * Math.min(1, dt * 12);
    }

    // Vertical physics
    if (this.mode === 'parachute') {
      this.charVel.y = Math.max(-4.2, this.charVel.y - 14 * dt);
    } else if (this.mode === 'swim') {
      const surfaceY = getWaterSurfaceY(this.charPos.x, this.charPos.z) ?? MAIN_POOL.waterY;
      const targetSwimY = surfaceY - 0.52;
      this.charPos.y = THREE.MathUtils.damp(this.charPos.y, targetSwimY, 8, dt);
      this.charVel.y = 0;
      if (this.justPressed.has('Space')) {
        this.charVel.y = 8.2;
        this.charPos.y += 0.25;
        this.mode = 'foot';
        this.charGrounded = false;
        this.sound.playSplash(false);
      }
    } else {
      this.charVel.y -= 24 * dt;
      if (this.charGrounded && this.justPressed.has('Space')) {
        this.charVel.y = 9.4;
        this.charGrounded = false;
        this.squashY = 1.24;
      }
    }

    this.charPos.addScaledVector(this.charVel, dt);
    this.charPos.x = THREE.MathUtils.clamp(this.charPos.x, -ARENA_HALF_W + 2, ARENA_HALF_W - 2);
    this.charPos.z = THREE.MathUtils.clamp(this.charPos.z, -ARENA_HALF_D + 2, ARENA_HALF_D - 2);

    // Check water / deck landing transitions
    const surfaceY = getWaterSurfaceY(this.charPos.x, this.charPos.z);
    if (surfaceY !== null) {
      const swimY = surfaceY - 0.52;
      if (this.charPos.y <= swimY + 0.15 && this.charVel.y <= 0) {
        if (this.mode !== 'swim') {
          this.sound.playSplash(true);
          this.spawnBurst(
            new THREE.Vector3(this.charPos.x, surfaceY + 0.1, this.charPos.z),
            12,
            [0xffffff, 0x38bdf8, 0xbef2ff],
            6,
            12,
            0.9,
            0.5,
          );
        }
        this.mode = 'swim';
        this.charPos.y = swimY;
        this.charVel.y = 0;
        this.charGrounded = true;
        this.playerChar.parachuteGroup.visible = false;
      }
    } else {
      if (this.mode === 'swim') {
        this.mode = 'foot';
      }
      if (this.charPos.y <= 0) {
        if (!this.charGrounded) {
          this.squashY = 0.78;
        }
        this.charPos.y = 0;
        this.charVel.y = 0;
        this.charGrounded = true;
        this.mode = 'foot';
        this.playerChar.parachuteGroup.visible = false;
      }
    }

    // Squash & stretch recovery + limb animation
    this.squashY = THREE.MathUtils.damp(this.squashY, 1, 14, dt);
    this.charRecoil = THREE.MathUtils.damp(this.charRecoil, 0, 14, dt);

    const horizSpeed = Math.hypot(this.charVel.x, this.charVel.z);
    if (horizSpeed > 0.5 && (this.charGrounded || this.mode === 'swim')) {
      this.walkCycle += dt * horizSpeed * 1.4;
      const swing = Math.sin(this.walkCycle) * 0.72;
      this.playerChar.leftLegPivot.rotation.x = swing;
      this.playerChar.rightLegPivot.rotation.x = -swing;
      this.playerChar.leftArmPivot.rotation.x = -swing * 0.8;
    } else {
      this.playerChar.leftLegPivot.rotation.x = THREE.MathUtils.damp(
        this.playerChar.leftLegPivot.rotation.x,
        0,
        10,
        dt,
      );
      this.playerChar.rightLegPivot.rotation.x = THREE.MathUtils.damp(
        this.playerChar.rightLegPivot.rotation.x,
        0,
        10,
        dt,
      );
      this.playerChar.leftArmPivot.rotation.x = THREE.MathUtils.damp(
        this.playerChar.leftArmPivot.rotation.x,
        0,
        10,
        dt,
      );
    }

    // Right arm aims forward when firing blaster
    this.playerChar.rightArmPivot.rotation.x = 1.15 - this.charRecoil * 0.5;
    this.playerChar.bodyPivot.scale.set(1 / Math.sqrt(this.squashY), this.squashY, 1 / Math.sqrt(this.squashY));
    this.playerChar.contactShadow.visible = this.mode === 'foot' && this.charPos.y < 4;
    this.playerChar.contactShadow.position.y = Math.max(0.025, 0.025 - this.charPos.y);
    this.playerChar.setHitFlash(this.damageFlashTimer * 3);

    this.playerChar.root.position.copy(this.charPos);
    this.playerChar.root.rotation.set(0, this.charYaw, 0);

    // Handheld blaster shooting (Left Click)
    const fireHeld = this.mouseFireHeld;
    if (fireHeld && this.fireCooldown <= 0) {
      this.fireCooldown = 0.22;
      this.fireCharacterBlaster();
    }
  }

  private fireCharacterBlaster(): void {
    this.sound.playShoot(true);
    this.charRecoil = 1.0;
    this.playerChar.root.updateMatrixWorld();
    this.playerChar.muzzle.getWorldPosition(_v1);

    // Aim toward nearest enemy plane in front or forward direction
    const forward = _v2.set(-Math.sin(this.charYaw), 0.18, -Math.cos(this.charYaw)).normalize();
    let aimDir = forward.clone();
    let bestScore = -1;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      _v3.copy(enemy.pos).sub(_v1);
      const dist = _v3.length();
      if (dist > 70) continue;
      _v3.divideScalar(dist);
      const align = forward.dot(_v3);
      if (align > 0.45 && align > bestScore) {
        bestScore = align;
        aimDir.copy(_v3);
      }
    }

    this.spawnProjectile(_v1, aimDir, 58, true, 30);
    this.spawnBurst(_v1, 3, [0xbae6fd, 0xffffff], 3.5, 0, 0.45, 0.16);
  }

  private updateEnemies(dt: number): void {
    const targetPos = this.mode === 'plane' ? this.planePos : this.charPos;

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      if (enemy.hitFlash > 0) {
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 5);
        enemy.model.setHitFlash(enemy.hitFlash);
      }

      // Smoke puffs when damaged
      if (enemy.hp < enemy.maxHp * 0.45 && Math.random() < dt * 10) {
        this.spawnBurst(enemy.pos, 1, [0x64748b, 0x94a3b8], 2, -1.5, 1.1, 0.55);
      }

      // Smooth 3D figure-8 + pursuit steering inside the 2x spa hall
      enemy.patrolPhase += dt * 0.45;
      const toPlayerDist = enemy.pos.distanceTo(targetPos);

      let goalX = enemy.patrolCenter.x + Math.sin(enemy.patrolPhase) * 46;
      let goalZ = enemy.patrolCenter.z + Math.cos(enemy.patrolPhase * 0.7) * 34;
      let goalY = 16.0 + Math.sin(enemy.patrolPhase * 1.4) * 9.0;

      if (toPlayerDist > 20 && toPlayerDist < 90) {
        // Blend toward sweeping pursuit pass
        goalX = THREE.MathUtils.lerp(goalX, targetPos.x, 0.48);
        goalZ = THREE.MathUtils.lerp(goalZ, targetPos.z, 0.48);
        goalY = THREE.MathUtils.clamp(targetPos.y + 2.0, 4.0, 46.0);
      }

      _v1.set(goalX - enemy.pos.x, goalY - enemy.pos.y, goalZ - enemy.pos.z).normalize();
      const desiredYaw = Math.atan2(-_v1.x, -_v1.z);
      let yawDiff = desiredYaw - enemy.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

      enemy.yaw += THREE.MathUtils.clamp(yawDiff, -1.8 * dt, 1.8 * dt);
      const desiredPitch = THREE.MathUtils.clamp(_v1.y * 0.7, -0.45, 0.45);
      enemy.pitch = THREE.MathUtils.damp(enemy.pitch, desiredPitch, 3.5, dt);
      enemy.roll = THREE.MathUtils.damp(enemy.roll, THREE.MathUtils.clamp(yawDiff * 0.9, -0.65, 0.65), 4.5, dt);

      _euler.set(enemy.pitch, enemy.yaw, 0, 'YXZ');
      _v2.set(0, 0, -1).applyEuler(_euler).normalize();
      enemy.vel.copy(_v2).multiplyScalar(enemy.speed);
      enemy.pos.addScaledVector(enemy.vel, dt);

      // Keep enemy strictly inside spa walls & roof
      enemy.pos.x = THREE.MathUtils.clamp(enemy.pos.x, -ARENA_HALF_W + 8, ARENA_HALF_W - 8);
      enemy.pos.z = THREE.MathUtils.clamp(enemy.pos.z, -ARENA_HALF_D + 8, ARENA_HALF_D - 8);
      enemy.pos.y = THREE.MathUtils.clamp(enemy.pos.y, 3.2, getRoofCeilingAt(enemy.pos.x) - 3.0);

      enemy.model.root.position.copy(enemy.pos);
      enemy.model.root.rotation.set(enemy.pitch, enemy.yaw, enemy.roll, 'YXZ');
      enemy.model.propeller.rotation.z += dt * 26;

      // Telegraph & Fire at player
      enemy.fireCooldown -= dt;
      if (enemy.fireCooldown <= 0.45 && enemy.telegraphTimer <= 0) {
        enemy.telegraphTimer = 0.45;
      }
      if (enemy.telegraphTimer > 0) {
        enemy.telegraphTimer -= dt;
        enemy.model.setHitFlash(0.45);
      }
      if (enemy.fireCooldown <= 0) {
        enemy.fireCooldown = Math.max(1.3, 3.1 - this.wave * 0.2) + Math.random() * 1.2;
        _v3.copy(targetPos).sub(enemy.pos);
        const dist = _v3.length();
        if (dist < 78) {
          _v3.divideScalar(dist);
          if (_v2.dot(_v3) > 0.35) {
            this.spawnProjectile(enemy.pos, _v3, 36, false, 12);
          }
        }
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const playerTarget = this.mode === 'plane' ? this.planePos : this.charPos;
    const playerRadius = this.mode === 'plane' ? 2.15 : 0.85;

    for (const proj of this.projectiles) {
      if (!proj.active) continue;

      proj.life -= dt;
      if (proj.life <= 0) {
        proj.active = false;
        proj.mesh.visible = false;
        continue;
      }

      proj.pos.addScaledVector(proj.vel, dt);
      proj.mesh.position.copy(proj.pos);

      // Wall / water / floor impact
      if (
        Math.abs(proj.pos.x) > ARENA_HALF_W ||
        Math.abs(proj.pos.z) > ARENA_HALF_D ||
        proj.pos.y > getRoofCeilingAt(proj.pos.x)
      ) {
        this.spawnBurst(proj.pos, 4, [0xfff3c4, 0xffffff], 5, 6, 0.55, 0.25);
        proj.active = false;
        proj.mesh.visible = false;
        continue;
      }

      if (proj.pos.y <= 0) {
        const hitWater = isPointInWater(proj.pos.x, proj.pos.z);
        this.spawnBurst(
          proj.pos,
          5,
          hitWater ? [0x38bdf8, 0xffffff] : [0xd9b382, 0xffffff],
          5.5,
          12,
          0.6,
          0.35,
        );
        proj.active = false;
        proj.mesh.visible = false;
        continue;
      }

      if (proj.remote) continue;

      if (proj.fromPlayer) {
        // Попадание в другого игрока: считаем у себя, сервер проверяет и вычитает HP
        if (this.dead) continue;
        for (const r of this.remotes.values()) {
          if (!r.seen || r.dead) continue;
          const inPlane = r.charMode === 0;
          if (inPlane) _v1.copy(r.plane.root.position);
          else _v1.copy(r.char.root.position).y += 1.0;
          const rad = inPlane ? 2.4 : 1.2;
          if (proj.pos.distanceToSquared(_v1) <= rad * rad) {
            proj.active = false;
            proj.mesh.visible = false;
            this.net.send({ t: 'hit', id: r.id, dmg: proj.damage });
            r.plane.setHitFlash(1);
            this.spawnBurst(proj.pos, 6, [0xffffff, 0xffd54f, 0xff6b4a], 7, 6, 0.7, 0.35);
            break;
          }
        }
      } else if (this.invulnTimer <= 0) {
        // Check hit on player (plane or on-foot character)
        if (proj.pos.distanceToSquared(playerTarget) <= playerRadius * playerRadius) {
          proj.active = false;
          proj.mesh.visible = false;
          this.damagePlayer(proj.damage);
        }
      }
    }
  }

  private damageEnemy(enemy: EnemyPlane, dmg: number): void {
    enemy.hp -= dmg;
    enemy.hitFlash = 1.0;
    this.hitMarkerTimer = 0.16;
    this.sound.playHit(enemy.hp <= 0);
    this.spawnBurst(enemy.pos, 7, [0xffffff, 0xffd54f, 0xff6b4a], 7, 6, 0.7, 0.35);

    if (enemy.hp <= 0) {
      enemy.alive = false;
      enemy.model.root.visible = false;
      this.hitstopTimer = 0.042;
      this.shakeStrength = Math.max(this.shakeStrength, 0.45);
      this.sound.playExplosion();

      this.spawnBurst(
        enemy.pos,
        22,
        [0xff6b4a, 0xffd54f, 0x38bdf8, 0xffffff, 0x6ec49c],
        13,
        9,
        1.25,
        0.75,
      );
      this.spawnEjectedNpc(enemy.pos, '#386fa4');
      this.spawnPickup(enemy.pos);

      this.kills += 1;
      this.score += 100 * this.combo;
      this.combo = Math.min(8, this.combo + 1);
      this.comboTimer = 4.5;
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        try {
          localStorage.setItem('aqua_ace_best_score', String(this.bestScore));
        } catch {
          // ignore
        }
      }
      this.emitHud();
    }
  }

  private damagePlayer(dmg: number): void {
    this.damageFlashTimer = 0.25;
    this.shakeStrength = Math.max(this.shakeStrength, 0.38);
    this.sound.playHit(true);

    if (this.mode === 'plane') {
      this.planeHp = Math.max(0, this.planeHp - dmg);
      if (this.planeHp <= 0) {
        // Plane destroyed! Auto-eject the little pilot with parachute!
        this.planeAlive = false;
        this.planeRespawnCooldown = 4.5;
        this.sound.playExplosion();
        this.hitstopTimer = 0.055;
        this.spawnBurst(this.planePos, 20, [0x6eb8d8, 0xefe5a5, 0xff6b4a, 0xffffff], 11, 9, 1.2, 0.7);
        this.ejectFromPlane();
        this.playerPlane.root.visible = false;
        this.invulnTimer = 2.0;
        this.showWaveBanner('САМОЛЁТ СБИТ! ПРЫГАЙ ИЛИ НАЖМИ R!');
      }
    } else {
      this.playerHp = Math.max(0, this.playerHp - dmg);
      if (this.playerHp <= 0) {
        this.phase = 'gameover';
        this.sound.updateEngine(false, 0, false);
        this.emitHud();
      }
    }
  }

  private updatePickups(dt: number): void {
    const collectorPos = this.mode === 'plane' ? this.planePos : this.charPos;
    const radius = this.mode === 'plane' ? 2.8 : 1.7;

    for (const p of this.pickups) {
      if (!p.active) continue;
      p.bobPhase += dt * 3.2;
      p.mesh.position.y = p.pos.y + Math.sin(p.bobPhase) * 0.28;
      p.mesh.rotation.y += dt * 1.8;

      if (!this.dead && collectorPos.distanceTo(p.mesh.position) <= radius) {
        p.active = false;
        p.mesh.visible = false;
        this.sound.playPickup();
        this.spawnBurst(p.mesh.position, 10, [0xffd54f, 0x34d399, 0x38bdf8], 7, 4, 0.85, 0.45);
        // лечение и очки начисляет сервер (первый успевший забирает бонус)
        this.net.send({ t: 'pick', id: p.id });
        if (p.kind === 'turbo') {
          this.turboRemaining = 8.0;
          this.boostEnergy = 100;
        }
        this.emitHud();
      }
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      p.mesh.scale.setScalar(p.startScale * t);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = t;
    }
  }

  private updateEjectedNpcs(dt: number): void {
    for (let i = this.ejectedNpcs.length - 1; i >= 0; i--) {
      const npc = this.ejectedNpcs[i];
      npc.life -= dt;
      npc.group.position.y += npc.velY * dt;
      npc.group.rotation.y += dt * 1.2;
      if (npc.life <= 0 || npc.group.position.y < -0.5) {
        this.scene.remove(npc.group);
        this.ejectedNpcs.splice(i, 1);
      }
    }
  }

  private updateCamera(dt: number): void {
    if (this.shakeStrength > 0) {
      this.shakeStrength = Math.max(0, this.shakeStrength - dt * 2.2);
    }

    if (this.mode === 'plane') {
      const inLoop = this.loopTimer > 0;
      _euler.set(inLoop ? 0 : this.planePitch * 0.55, this.planeYaw, 0, 'YXZ');
      const backDir = _v1.set(0, 0, 1).applyEuler(_euler);
      const backDist = inLoop ? 10.8 : 8.6;
      const upOffset = inLoop ? 3.4 : 2.7;
      const desiredCam = _v2
        .copy(this.planePos)
        .addScaledVector(backDir, backDist)
        .add(_v4.set(0, upOffset, 0));

      desiredCam.x = THREE.MathUtils.clamp(desiredCam.x, -ARENA_HALF_W + 1.8, ARENA_HALF_W - 1.8);
      desiredCam.z = THREE.MathUtils.clamp(desiredCam.z, -ARENA_HALF_D + 1.8, ARENA_HALF_D - 1.8);
      desiredCam.y = THREE.MathUtils.clamp(desiredCam.y, 1.3, getRoofCeilingAt(desiredCam.x) - 0.8);

      const alpha = 1 - Math.exp(-9.5 * dt);
      this.camPos.lerp(desiredCam, alpha);

      const desiredLook = inLoop
        ? _v3.copy(this.planePos).add(_v4.set(0, 0.5, 0))
        : _v3
            .copy(this.planePos)
            .addScaledVector(backDir, -10)
            .add(_v4.set(0, 0.7, 0));
      this.camLook.lerp(desiredLook, 1 - Math.exp(-12 * dt));

      const targetFov = inLoop ? 68 : this.planeSpeed > 22 ? 72 : 62;
      if (Math.abs(this.camera.fov - targetFov) > 0.05) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
        this.camera.updateProjectionMatrix();
      }
    } else {
      const dist = 7.2;
      const horiz = Math.cos(this.camPitchOffset) * dist;
      const desiredCam = _v1.set(
        this.charPos.x + Math.sin(this.camYawOffset) * horiz,
        Math.max(1.2, this.charPos.y + 1.8 + Math.sin(this.camPitchOffset) * dist),
        this.charPos.z + Math.cos(this.camYawOffset) * horiz,
      );
      desiredCam.x = THREE.MathUtils.clamp(desiredCam.x, -ARENA_HALF_W + 1.8, ARENA_HALF_W - 1.8);
      desiredCam.z = THREE.MathUtils.clamp(desiredCam.z, -ARENA_HALF_D + 1.8, ARENA_HALF_D - 1.8);

      this.camPos.lerp(desiredCam, 1 - Math.exp(-10 * dt));
      _v2.set(this.charPos.x, this.charPos.y + 1.35, this.charPos.z);
      this.camLook.lerp(_v2, 1 - Math.exp(-14 * dt));

      if (Math.abs(this.camera.fov - 60) > 0.05) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 60, 6, dt);
        this.camera.updateProjectionMatrix();
      }
    }

    this.camera.position.copy(this.camPos);
    if (this.shakeStrength > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeStrength;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeStrength;
    }
    this.camera.lookAt(this.camLook);
  }

  private emitHud(): void {
    const distToPlane = this.planeAlive ? this.charPos.distanceTo(this.planePos) : 999;
    const me = this.board.find((r) => r.id === this.myId);
    this.onHudUpdate({
      connection: this.connection,
      connectionError: this.connectionError,
      myId: this.myId,
      nick: this.nick,
      dead: this.dead,
      board: this.board,
      feed: this.feed.map((f) => f.text),
      deaths: me ? me.deaths : this.deaths,
      phase: this.phase,
      mode: this.mode,
      playerHp: Math.ceil(this.playerHp),
      maxPlayerHp: this.maxPlayerHp,
      planeHp: Math.ceil(this.planeHp),
      maxPlaneHp: this.maxPlaneHp,
      planeAlive: this.planeAlive,
      canBoardPlane: this.mode !== 'plane' && this.planeAlive && distToPlane <= 5.5,
      distanceToPlane: Math.round(distToPlane),
      speed: Math.round(this.mode === 'plane' ? this.planeSpeed * 4 : Math.hypot(this.charVel.x, this.charVel.z) * 3),
      altitude: Math.max(0, Math.round(this.mode === 'plane' ? this.planePos.y : this.charPos.y)),
      boostEnergy: Math.round(this.boostEnergy),
      turboRemaining: Math.ceil(this.turboRemaining),
      score: me ? me.score : 0,
      bestScore: this.bestScore,
      combo: this.combo,
      kills: me ? me.kills : 0,
      wave: this.wave,
      enemiesRemaining: this.remotes.size,
      waveBanner: this.waveBanner,
      muted: this.sound.isMuted(),
      hitMarkerTimer: this.hitMarkerTimer,
      damageFlashTimer: this.damageFlashTimer,
      loopReady: this.loopCooldown <= 0 && this.loopTimer <= 0 && !this.planeParked,
      sideRollReady: this.sideRollCooldown <= 0 && this.sideRollTimer <= 0 && !this.planeParked,
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.net.close();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();

    this.sound.dispose();
    this.textures.dispose();
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    this.renderer.dispose();
    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
