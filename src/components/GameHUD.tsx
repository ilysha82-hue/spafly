import React, { useState } from 'react';
import { Volume2, VolumeX, LogOut } from 'lucide-react';
import { HudSnapshot } from '../game/types';

interface GameHUDProps {
  hud: HudSnapshot;
  onStart: (nick: string) => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onEjectOrBoard: () => void;
  onSummonPlane: () => void;
  onTriggerLoop: () => void;
  onTriggerSideRoll: (dir?: 1 | -1) => void;
  onTouchStick: (x: number, y: number) => void;
  onTouchHold: (btn: 'fire' | 'boost' | 'brake', down: boolean) => void;
  onJump: () => void;
}

const MODE_LABELS: Record<HudSnapshot['mode'], string> = {
  plane: 'В ПОЛЁТЕ',
  parachute: 'ПАРАШЮТ',
  foot: 'НА БЕРЕГУ',
  swim: 'В БАССЕЙНЕ',
};

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  onStart,
  onLeave,
  onToggleMute,
  onEjectOrBoard,
  onSummonPlane,
  onTriggerLoop,
  onTriggerSideRoll,
  onTouchStick,
  onTouchHold,
  onJump,
}) => {
  const isPlaying = hud.phase === 'playing';
  const [isTouch] = useState(
    () => typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  );
  const [nick, setNick] = useState(() => {
    try {
      return localStorage.getItem('aqua_ace_nick') || '';
    } catch {
      return '';
    }
  });
  const connecting = hud.connection === 'connecting';
  const submit = () => {
    const clean = nick.trim();
    if (!clean || connecting) return;
    try {
      localStorage.setItem('aqua_ace_nick', clean);
    } catch {
      // ignore
    }
    onStart(clean);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none font-sans text-[#f8f5ee]">
      {/* Damage edge vignette */}
      {isPlaying && hud.damageFlashTimer > 0 && (
        <div
          className="absolute inset-0 border-8 border-[#ef4444]/65 transition-opacity duration-75"
          style={{ opacity: Math.min(1, hud.damageFlashTimer * 4) }}
        />
      )}

      {/* TITLE SCREEN */}
      {hud.phase === 'title' && (
        <div className="pointer-events-auto flex h-full w-full flex-col items-center justify-between px-6 py-10">
          <div className="mt-4 flex flex-col items-center text-center">
            {/* Bespoke inline SVG Title Lockup */}
            <svg
              viewBox="0 0 460 120"
              className="h-24 w-auto max-w-[90vw] drop-shadow-[0_6px_22px_rgba(12,20,38,0.8)] sm:h-28"
              aria-label="Аква-Ас"
            >
              <defs>
                <linearGradient id="titleGold" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#fff3b0" />
                  <stop offset="55%" stopColor="#f5c451" />
                  <stop offset="100%" stopColor="#d9822b" />
                </linearGradient>
                <linearGradient id="wingCyan" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#7dd3fc" />
                </linearGradient>
              </defs>
              {/* Stylized wing silhouette behind title */}
              <path
                d="M42 66 L158 54 L230 34 L302 54 L418 66 L396 76 L296 68 L230 78 L164 68 L64 76 Z"
                fill="url(#wingCyan)"
                stroke="#162238"
                strokeWidth="3"
              />
              <circle cx="230" cy="36" r="9" fill="#f8f5ee" stroke="#162238" strokeWidth="3" />
              <text
                x="230"
                y="74"
                textAnchor="middle"
                fill="url(#titleGold)"
                stroke="#162238"
                strokeWidth="7"
                paintOrder="stroke"
                style={{
                  fontSize: '54px',
                  fontWeight: 900,
                  letterSpacing: '0.06em',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
              >
                АКВА-АС
              </text>
              <text
                x="230"
                y="104"
                textAnchor="middle"
                fill="#bae6fd"
                stroke="#101a2e"
                strokeWidth="3.5"
                paintOrder="stroke"
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  letterSpacing: '0.24em',
                }}
              >
                СПА-КОМПЛЕКС · ОНЛАЙН-БОЙ
              </text>
            </svg>
          </div>

          <div className="mb-4 flex flex-col items-center gap-4">
            {hud.bestScore > 0 && (
              <div className="rounded-md border border-[#f5c451]/45 bg-[#121c30]/88 px-4 py-1.5 text-sm font-semibold tracking-wide text-[#fde68a] tabular-nums">
                РЕКОРД: {hud.bestScore.toLocaleString('ru-RU')}
              </div>
            )}

            <form
              className="flex w-full max-w-xs flex-col items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                value={nick}
                onChange={(e) => setNick(e.target.value.slice(0, 16))}
                placeholder="Твой ник"
                maxLength={16}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-lg border-2 border-[#7dd3fc]/60 bg-[#0f182a]/92 px-4 py-3 text-center text-lg font-bold text-white placeholder:text-[#64748b] focus:border-[#fde68a] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!nick.trim() || connecting}
                className="w-full cursor-pointer rounded-lg border-2 border-[#fff3b0] bg-[#e65b48] px-10 py-3.5 text-lg font-extrabold tracking-wider text-white shadow-[0_6px_0_#9b2c1e,0_14px_30px_rgba(0,0,0,0.45)] transition-transform hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_2px_0_#9b2c1e] disabled:cursor-default disabled:opacity-55 disabled:hover:translate-y-0"
              >
                {connecting ? 'ПОДКЛЮЧЕНИЕ…' : 'В БОЙ!'}
              </button>
              {hud.connectionError && (
                <div className="rounded-md border border-[#fb7185]/60 bg-[#3b0f1a]/90 px-3 py-1.5 text-center text-sm font-semibold text-[#fecdd3]">
                  {hud.connectionError}
                </div>
              )}
            </form>

            <div className="rounded-md border border-[#7dd3fc]/25 bg-[#0f182a]/85 px-4 py-2 text-center text-xs font-medium tracking-wide text-[#dbeafe] sm:text-sm">
              WASD Полет · X Петля · Q/E Боковой вираж · Пробел / ЛКМ Огонь · F Выпрыгнуть / Сесть · Shift Форсаж
            </div>
          </div>
        </div>
      )}

      {/* IN-GAME HUD (Low-occlusion perimeter clusters) */}
      {isPlaying && (
        <>
          {/* Top Bar */}
          <div className="flex items-start justify-between p-4">
            {/* Top-Left: Plane & Pilot Status */}
            <div className="flex flex-col gap-2 rounded-lg border border-[#d4a45c]/45 bg-[#121b2e]/88 px-3.5 py-2.5 shadow-lg">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-extrabold tracking-widest text-[#7dd3fc]">
                  {MODE_LABELS[hud.mode]}
                </span>
                <span className="text-xs font-semibold text-[#fde68a] tabular-nums">
                  {hud.speed} км/ч · {hud.altitude}м
                </span>
              </div>

              {/* Plane Hull Bar */}
              <div className="flex items-center gap-2">
                <span className="w-16 text-[11px] font-bold text-[#cbd5e1]">ЗДОРОВЬЕ</span>
                <div className="h-2.5 w-32 overflow-hidden rounded-sm bg-[#1e293b]">
                  <div
                    className="h-full bg-[#38bdf8] transition-all duration-100"
                    style={{
                      width: `${(hud.planeHp / hud.maxPlaneHp) * 100}%`,
                    }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-bold tabular-nums">
                  {hud.planeHp}
                </span>
              </div>

              {/* Boost Fuel Bar */}
              <div className="flex items-center gap-2">
                <span className="w-16 text-[11px] font-bold text-[#cbd5e1]">ФОРСАЖ</span>
                <div className="h-2 w-32 overflow-hidden rounded-sm bg-[#1e293b]">
                  <div
                    className="h-full bg-[#f5c451] transition-all duration-100"
                    style={{ width: `${hud.boostEnergy}%` }}
                  />
                </div>
                <span className="w-8 text-right text-[11px] font-bold text-[#fde68a] tabular-nums">
                  {hud.turboRemaining > 0 ? `x2` : `${hud.boostEnergy}%`}
                </span>
              </div>
            </div>

            {/* Top-Center: Wave & Score */}
            <div className="hidden items-center gap-5 rounded-lg sm:flex border border-[#d4a45c]/45 bg-[#121b2e]/88 px-5 py-2 shadow-lg">
              <div className="text-center">
                <div className="text-[10px] font-bold tracking-widest text-[#94a3b8]">СБИТО</div>
                <div className="text-lg font-black text-[#38bdf8] tabular-nums">{hud.kills}</div>
              </div>
              <div className="h-7 w-px bg-white/15" />
              <div className="text-center">
                <div className="text-[10px] font-bold tracking-widest text-[#94a3b8]">СБИТ</div>
                <div className="text-lg font-black text-[#fb7185] tabular-nums">{hud.deaths}</div>
              </div>
              <div className="h-7 w-px bg-white/15" />
              <div className="text-center">
                <div className="text-[10px] font-bold tracking-widest text-[#94a3b8]">СЧЁТ</div>
                <div className="flex items-baseline gap-1.5 text-lg font-black text-white tabular-nums">
                  <span>{hud.score.toLocaleString('ru-RU')}</span>
                </div>
              </div>
            </div>

            {/* Top-Right: Mute & Pause */}
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleMute}
                title="Звук (M)"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-[#d4a45c]/45 bg-[#121b2e]/88 text-[#f8f5ee] hover:bg-[#1e2d4a]"
              >
                {hud.muted ? <VolumeX className="h-5 w-5 text-[#fb7185]" /> : <Volume2 className="h-5 w-5 text-[#7dd3fc]" />}
              </button>
              <button
                type="button"
                onClick={onLeave}
                title="Выйти из боя"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-[#d4a45c]/45 bg-[#121b2e]/88 text-[#f8f5ee] hover:bg-[#1e2d4a]"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Leaderboard */}
          <div className={`pointer-events-none absolute right-4 top-20 w-56 ${isTouch ? 'hidden' : 'hidden sm:block'} rounded-lg border border-[#d4a45c]/45 bg-[#121b2e]/80 px-3 py-2 shadow-lg`}>
            <div className="mb-1 flex items-center justify-between text-[10px] font-bold tracking-widest text-[#94a3b8]">
              <span>ИГРОКИ · {Math.max(hud.board.length, 1)}</span>
              <span>СБИТО</span>
            </div>
            {hud.board.slice(0, 8).map((row, i) => (
              <div
                key={row.id}
                className={`flex items-center justify-between gap-2 text-xs ${
                  row.id === hud.myId ? 'font-extrabold text-[#fde68a]' : 'font-semibold text-[#e2e8f0]'
                }`}
              >
                <span className="truncate">
                  {i + 1}. {row.nick}
                </span>
                <span className="tabular-nums">{row.kills}</span>
              </div>
            ))}
          </div>

          {/* Kill feed */}
          {hud.feed.length > 0 && (
            <div className="pointer-events-none absolute left-4 top-40 flex max-w-[16rem] flex-col gap-1">
              {hud.feed.map((line, i) => (
                <div
                  key={`${i}-${line}`}
                  className="rounded border border-white/10 bg-[#0f172a]/80 px-2.5 py-1 text-xs font-semibold text-[#e2e8f0]"
                >
                  {line}
                </div>
              ))}
            </div>
          )}

          {hud.dead && (
            <div className="pointer-events-none absolute inset-0 bg-[#3b0a12]/35" />
          )}

          {/* Center Crosshair & Hit Marker */}
          {isPlaying && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <svg viewBox="0 0 48 48" className="h-11 w-11 opacity-75">
                <circle cx="24" cy="24" r="10" fill="none" stroke="#bae6fd" strokeWidth="1.5" strokeDasharray="4 4" />
                <circle cx="24" cy="24" r="2" fill="#fde68a" />
                {hud.hitMarkerTimer > 0 && (
                  <g stroke="#fb7185" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="12" x2="18" y2="18" />
                    <line x1="36" y1="12" x2="30" y2="18" />
                    <line x1="12" y1="36" x2="18" y2="30" />
                    <line x1="36" y1="36" x2="30" y2="30" />
                  </g>
                )}
              </svg>
            </div>
          )}

          {/* Wave Banner */}
          {hud.waveBanner && isPlaying && (
            <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
              <div className="rounded-lg border border-[#fde68a]/60 bg-[#121b2e]/92 px-6 py-2 text-lg font-black tracking-wider text-[#fde68a] shadow-xl">
                {hud.waveBanner}
              </div>
            </div>
          )}


          {/* Touch controls (phone) */}
          {isTouch && (
            <TouchControls
              mode={hud.mode}
              loopReady={hud.loopReady}
              rollReady={hud.sideRollReady}
              canBoard={hud.canBoardPlane}
              onStick={onTouchStick}
              onHold={onTouchHold}
              onJump={onJump}
              onLoop={onTriggerLoop}
              onRoll={onTriggerSideRoll}
              onEject={onEjectOrBoard}
              onSummon={onSummonPlane}
            />
          )}

          {/* Contextual Action Prompts + Bottom Single Control Line */}
          <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 px-4">
            <div className={`pointer-events-auto flex flex-wrap items-center justify-center gap-2 ${isTouch ? 'hidden' : ''}`}>
              {hud.mode === 'plane' ? (
                <>
                  <button
                    type="button"
                    onClick={onTriggerLoop}
                    disabled={!hud.loopReady}
                    className={`rounded-md border px-3 py-1.5 text-xs font-bold tracking-wide transition-opacity ${
                      hud.loopReady
                        ? 'cursor-pointer border-[#38bdf8]/75 bg-[#121b2e]/90 text-[#bae6fd] hover:bg-[#1e2d4a]'
                        : 'cursor-default border-white/15 bg-[#121b2e]/60 text-[#94a3b8] opacity-60'
                    }`}
                  >
                    [X] МЁРТВАЯ ПЕТЛЯ
                  </button>
                  <button
                    type="button"
                    onClick={() => onTriggerSideRoll(1)}
                    disabled={!hud.sideRollReady}
                    className={`rounded-md border px-3 py-1.5 text-xs font-bold tracking-wide transition-opacity ${
                      hud.sideRollReady
                        ? 'cursor-pointer border-[#34d399]/70 bg-[#121b2e]/90 text-[#a7f3d0] hover:bg-[#1e2d4a]'
                        : 'cursor-default border-white/15 bg-[#121b2e]/60 text-[#94a3b8] opacity-60'
                    }`}
                  >
                    [Q] ВИРАЖ ←
                  </button>
                  <button
                    type="button"
                    onClick={() => onTriggerSideRoll(-1)}
                    disabled={!hud.sideRollReady}
                    className={`rounded-md border px-3 py-1.5 text-xs font-bold tracking-wide transition-opacity ${
                      hud.sideRollReady
                        ? 'cursor-pointer border-[#34d399]/70 bg-[#121b2e]/90 text-[#a7f3d0] hover:bg-[#1e2d4a]'
                        : 'cursor-default border-white/15 bg-[#121b2e]/60 text-[#94a3b8] opacity-60'
                    }`}
                  >
                    [E] ВИРАЖ →
                  </button>
                  <button
                    type="button"
                    onClick={onEjectOrBoard}
                    className="cursor-pointer rounded-md border border-[#fde68a]/50 bg-[#121b2e]/88 px-3.5 py-1.5 text-xs font-bold tracking-wide text-[#fde68a] hover:bg-[#1e2d4a]"
                  >
                    [F] ВЫПРЫГНУТЬ
                  </button>
                </>
              ) : (
                <>
                  {hud.canBoardPlane && (
                    <button
                      type="button"
                      onClick={onEjectOrBoard}
                      className="cursor-pointer rounded-md border border-[#34d399]/70 bg-[#064e3b]/92 px-3.5 py-1.5 text-xs font-bold tracking-wide text-[#a7f3d0] hover:bg-[#065f46]"
                    >
                      [F] СЕСТЬ В САМОЛЁТ
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onSummonPlane}
                    className="cursor-pointer rounded-md border border-[#7dd3fc]/60 bg-[#121b2e]/90 px-3.5 py-1.5 text-xs font-bold tracking-wide text-[#bae6fd] hover:bg-[#1e2d4a]"
                  >
                    [R] ВЫЗВАТЬ САМОЛЁТ {hud.planeAlive ? `(${hud.distanceToPlane}м)` : ''}
                  </button>
                </>
              )}
            </div>

            <div className={`rounded-md border border-white/15 bg-[#0f172a]/84 px-4 py-1.5 text-center text-xs font-medium text-[#cbd5e1] ${isTouch ? 'hidden' : ''}`}>
              {hud.mode === 'plane'
                ? 'WASD Виражи · X Петля · Q/E Боковой вираж · Пробел / ЛКМ Огонь · Shift Форсаж · C Тормоз · F Выпрыгнуть'
                : 'WASD Бег / Плавание · Пробел Прыжок · ЛКМ Бластер · ПКМ Камера · F Сесть · R Новый самолёт'}
            </div>
          </div>
        </>
      )}

    </div>
  );
};

interface TouchControlsProps {
  mode: HudSnapshot['mode'];
  loopReady: boolean;
  rollReady: boolean;
  canBoard: boolean;
  onStick: (x: number, y: number) => void;
  onHold: (btn: 'fire' | 'boost' | 'brake', down: boolean) => void;
  onJump: () => void;
  onLoop: () => void;
  onRoll: (dir?: 1 | -1) => void;
  onEject: () => void;
  onSummon: () => void;
}

const BTN =
  'pointer-events-auto flex touch-none select-none items-center justify-center rounded-full border-2 font-extrabold text-white shadow-lg active:scale-95 active:brightness-125';

const HoldButton: React.FC<{
  label: string;
  className: string;
  onChange: (down: boolean) => void;
}> = ({ label, className, onChange }) => (
  <button
    type="button"
    className={`${BTN} ${className}`}
    onPointerDown={(e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      onChange(true);
    }}
    onPointerUp={() => onChange(false)}
    onPointerCancel={() => onChange(false)}
    onContextMenu={(e) => e.preventDefault()}
  >
    {label}
  </button>
);

const TapButton: React.FC<{
  label: string;
  className: string;
  disabled?: boolean;
  onTap: () => void;
}> = ({ label, className, disabled, onTap }) => (
  <button
    type="button"
    disabled={disabled}
    className={`${BTN} ${className} ${disabled ? 'opacity-45' : ''}`}
    onPointerDown={(e) => {
      e.preventDefault();
      onTap();
    }}
    onContextMenu={(e) => e.preventDefault()}
  >
    {label}
  </button>
);

const TouchControls: React.FC<TouchControlsProps> = ({
  mode,
  loopReady,
  rollReady,
  canBoard,
  onStick,
  onHold,
  onJump,
  onLoop,
  onRoll,
  onEject,
  onSummon,
}) => {
  const baseRef = React.useRef<HTMLDivElement | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 52;

  const updateStick = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let dx = clientX - (rect.left + rect.width / 2);
    let dy = clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    setKnob({ x: dx, y: dy });
    onStick(dx / R, -dy / R);
  };
  const releaseStick = () => {
    setKnob({ x: 0, y: 0 });
    onStick(0, 0);
  };

  const inPlane = mode === 'plane';

  return (
    <>
      {/* Стик слева */}
      <div
        ref={baseRef}
        className="pointer-events-auto absolute bottom-6 left-6 h-36 w-36 touch-none rounded-full border-2 border-white/35 bg-[#0f172a]/45"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          updateStick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) updateStick(e.clientX, e.clientY);
        }}
        onPointerUp={releaseStick}
        onPointerCancel={releaseStick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border-2 border-[#bae6fd] bg-[#38bdf8]/70"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>

      {/* Кнопки справа */}
      <div className="absolute bottom-6 right-5 flex flex-col items-end gap-3">
        <div className="flex items-end gap-3">
          {inPlane ? (
            <>
              <TapButton
                label="ПЕТЛЯ"
                disabled={!loopReady}
                onTap={onLoop}
                className="h-12 w-12 border-[#38bdf8]/80 bg-[#0c4a6e]/80 text-[10px]"
              />
              <TapButton
                label="⟲"
                disabled={!rollReady}
                onTap={() => onRoll(1)}
                className="h-12 w-12 border-[#34d399]/80 bg-[#064e3b]/80 text-xl"
              />
              <TapButton
                label="⟳"
                disabled={!rollReady}
                onTap={() => onRoll(-1)}
                className="h-12 w-12 border-[#34d399]/80 bg-[#064e3b]/80 text-xl"
              />
            </>
          ) : (
            <>
              <TapButton
                label="ПРЫЖОК"
                onTap={onJump}
                className="h-14 w-14 border-[#fde68a]/80 bg-[#78350f]/80 text-[10px]"
              />
              <TapButton
                label="САМОЛЁТ"
                onTap={onSummon}
                className="h-14 w-14 border-[#7dd3fc]/80 bg-[#0c4a6e]/80 text-[9px]"
              />
            </>
          )}
        </div>
        <div className="flex items-end gap-3">
          {inPlane && (
            <>
              <HoldButton
                label="ТОРМОЗ"
                onChange={(d) => onHold('brake', d)}
                className="h-12 w-12 border-white/50 bg-[#334155]/80 text-[9px]"
              />
              <HoldButton
                label="ФОРСАЖ"
                onChange={(d) => onHold('boost', d)}
                className="h-14 w-14 border-[#f5c451]/90 bg-[#92400e]/80 text-[10px]"
              />
            </>
          )}
          <TapButton
            label={inPlane ? 'ВЫПРЫГ' : 'СЕСТЬ'}
            onTap={onEject}
            disabled={!inPlane && !canBoard}
            className="h-12 w-12 border-[#fde68a]/70 bg-[#1e293b]/80 text-[9px]"
          />
          <HoldButton
            label="ОГОНЬ"
            onChange={(d) => onHold('fire', d)}
            className="h-20 w-20 border-[#fff3b0] bg-[#e65b48]/90 text-sm"
          />
        </div>
      </div>
    </>
  );
};
