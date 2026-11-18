import { useEffect, useRef, useState } from 'react';
import { GameHUD } from './components/GameHUD';
import { SpaFlightEngine } from './game/SpaFlightEngine';
import { HudSnapshot } from './game/types';

const INITIAL_HUD: HudSnapshot = {
  phase: 'title',
  mode: 'plane',
  playerHp: 100,
  maxPlayerHp: 100,
  planeHp: 100,
  maxPlaneHp: 100,
  planeAlive: true,
  canBoardPlane: false,
  distanceToPlane: 0,
  speed: 64,
  altitude: 6,
  boostEnergy: 100,
  turboRemaining: 0,
  score: 0,
  bestScore: 0,
  combo: 1,
  kills: 0,
  deaths: 0,
  wave: 1,
  enemiesRemaining: 3,
  waveBanner: null,
  muted: false,
  hitMarkerTimer: 0,
  damageFlashTimer: 0,
  loopReady: true,
  sideRollReady: true,
  connection: 'idle',
  connectionError: null,
  myId: 0,
  nick: '',
  dead: false,
  board: [],
  feed: [],
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SpaFlightEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new SpaFlightEngine(container, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;
    if (location.search.includes('debug')) (window as unknown as Record<string, unknown>).__engine = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-screen w-screen touch-none select-none overflow-hidden bg-[#1b2d4e]">
      <div ref={mountRef} className="h-full w-full" />
      <GameHUD
        hud={hud}
        onStart={(nick) => engineRef.current?.startGame(nick)}
        onLeave={() => engineRef.current?.leaveGame()}
        onToggleMute={() => engineRef.current?.toggleMute()}
        onEjectOrBoard={() => engineRef.current?.triggerEjectOrBoard()}
        onSummonPlane={() => engineRef.current?.triggerSummonPlane()}
        onTouchStick={(x, y) => engineRef.current?.setTouchStick(x, y)}
        onTouchHold={(b, d) => engineRef.current?.setTouchHold(b, d)}
        onJump={() => engineRef.current?.triggerJump()}
        onTriggerLoop={() => engineRef.current?.triggerLoop()}
        onTriggerSideRoll={(dir?: 1 | -1) => engineRef.current?.triggerSideRoll(dir)}
      />
    </main>
  );
}
