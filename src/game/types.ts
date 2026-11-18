export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type PlayerMode = 'plane' | 'parachute' | 'foot' | 'swim';

export type PickupKind = 'repair' | 'duck' | 'turbo';

export interface HudSnapshot {
  phase: GamePhase;
  mode: PlayerMode;
  playerHp: number;
  maxPlayerHp: number;
  planeHp: number;
  maxPlaneHp: number;
  planeAlive: boolean;
  canBoardPlane: boolean;
  distanceToPlane: number;
  speed: number;
  altitude: number;
  boostEnergy: number;
  turboRemaining: number;
  score: number;
  bestScore: number;
  combo: number;
  kills: number;
  wave: number;
  enemiesRemaining: number;
  waveBanner: string | null;
  muted: boolean;
  hitMarkerTimer: number;
  damageFlashTimer: number;
  loopReady: boolean;
  sideRollReady: boolean;
}
