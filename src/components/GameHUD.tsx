import React from 'react';
import { Volume2, VolumeX, Pause, Play, RotateCcw } from 'lucide-react';
import { HudSnapshot } from '../game/types';

interface GameHUDProps {
  hud: HudSnapshot;
  onStart: () => void;
  onTogglePause: () => void;
  onToggleMute: () => void;
  onEjectOrBoard: () => void;
  onSummonPlane: () => void;
  onTriggerLoop: () => void;
  onTriggerSideRoll: (dir?: 1 | -1) => void;
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
  onTogglePause,
  onToggleMute,
  onEjectOrBoard,
  onSummonPlane,
  onTriggerLoop,
  onTriggerSideRoll,
}) => {
  const isPlaying = hud.phase === 'playing';

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
                СПА-КОМПЛЕКС · ВОЗДУШНЫЙ БОЙ
              </text>
            </svg>
          </div>

          <div className="mb-4 flex flex-col items-center gap-4">
            {hud.bestScore > 0 && (
              <div className="rounded-md border border-[#f5c451]/45 bg-[#121c30]/88 px-4 py-1.5 text-sm font-semibold tracking-wide text-[#fde68a] tabular-nums">
                РЕКОРД: {hud.bestScore.toLocaleString('ru-RU')}
              </div>
            )}

            <button
              type="button"
              onClick={onStart}
              className="cursor-pointer rounded-lg border-2 border-[#fff3b0] bg-[#e65b48] px-10 py-3.5 text-lg font-extrabold tracking-wider text-white shadow-[0_6px_0_#9b2c1e,0_14px_30px_rgba(0,0,0,0.45)] transition-transform hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_2px_0_#9b2c1e]"
            >
              ВЗЛЕТЕТЬ
            </button>

            <div className="rounded-md border border-[#7dd3fc]/25 bg-[#0f182a]/85 px-4 py-2 text-center text-xs font-medium tracking-wide text-[#dbeafe] sm:text-sm">
              WASD Полет · X Петля · Q/E Боковой вираж · Пробел / ЛКМ Огонь · F Выпрыгнуть / Сесть · Shift Форсаж
            </div>
          </div>
        </div>
      )}

      {/* IN-GAME HUD (Low-occlusion perimeter clusters) */}
      {(isPlaying || hud.phase === 'paused') && (
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
                <span className="w-16 text-[11px] font-bold text-[#cbd5e1]">САМОЛЁТ</span>
                <div className="h-2.5 w-32 overflow-hidden rounded-sm bg-[#1e293b]">
                  <div
                    className="h-full bg-[#38bdf8] transition-all duration-100"
                    style={{
                      width: `${hud.planeAlive ? (hud.planeHp / hud.maxPlaneHp) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-bold tabular-nums">
                  {hud.planeAlive ? hud.planeHp : 0}
                </span>
              </div>

              {/* Pilot HP Bar */}
              <div className="flex items-center gap-2">
                <span className="w-16 text-[11px] font-bold text-[#cbd5e1]">ПИЛОТ</span>
                <div className="h-2.5 w-32 overflow-hidden rounded-sm bg-[#1e293b]">
                  <div
                    className="h-full bg-[#34d399] transition-all duration-100"
                    style={{ width: `${(hud.playerHp / hud.maxPlayerHp) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-bold tabular-nums">{hud.playerHp}</span>
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
            <div className="flex items-center gap-5 rounded-lg border border-[#d4a45c]/45 bg-[#121b2e]/88 px-5 py-2 shadow-lg">
              <div className="text-center">
                <div className="text-[10px] font-bold tracking-widest text-[#94a3b8]">ВОЛНА</div>
                <div className="text-lg font-black text-[#fde68a] tabular-nums">{hud.wave}</div>
              </div>
              <div className="h-7 w-px bg-white/15" />
              <div className="text-center">
                <div className="text-[10px] font-bold tracking-widest text-[#94a3b8]">ВРАГИ</div>
                <div className="text-lg font-black text-[#fb7185] tabular-nums">
                  {hud.enemiesRemaining}
                </div>
              </div>
              <div className="h-7 w-px bg-white/15" />
              <div className="text-center">
                <div className="text-[10px] font-bold tracking-widest text-[#94a3b8]">СЧЁТ</div>
                <div className="flex items-baseline gap-1.5 text-lg font-black text-white tabular-nums">
                  <span>{hud.score.toLocaleString('ru-RU')}</span>
                  {hud.combo > 1 && (
                    <span className="text-xs font-extrabold text-[#38bdf8]">x{hud.combo}</span>
                  )}
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
                onClick={onTogglePause}
                title="Пауза (Esc)"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-[#d4a45c]/45 bg-[#121b2e]/88 text-[#f8f5ee] hover:bg-[#1e2d4a]"
              >
                {hud.phase === 'paused' ? <Play className="h-5 w-5 text-[#fde68a]" /> : <Pause className="h-5 w-5" />}
              </button>
            </div>
          </div>

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

          {/* Contextual Action Prompts + Bottom Single Control Line */}
          <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 px-4">
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
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

            <div className="rounded-md border border-white/15 bg-[#0f172a]/84 px-4 py-1.5 text-center text-xs font-medium text-[#cbd5e1]">
              {hud.mode === 'plane'
                ? 'WASD Виражи · X Петля · Q/E Боковой вираж · Пробел / ЛКМ Огонь · Shift Форсаж · C Тормоз · F Выпрыгнуть'
                : 'WASD Бег / Плавание · Пробел Прыжок · ЛКМ Бластер · ПКМ Камера · F Сесть · R Новый самолёт'}
            </div>
          </div>
        </>
      )}

      {/* PAUSE MODAL */}
      {hud.phase === 'paused' && (
        <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-[#090e1a]/70">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border-2 border-[#d4a45c]/60 bg-[#131d31] p-7 text-center shadow-2xl">
            <h2 className="text-2xl font-black tracking-wider text-[#fde68a]">ПАУЗА</h2>
            <p className="text-sm text-[#cbd5e1]">
              Волна {hud.wave} · Сбито самолётов: <span className="font-bold text-white tabular-nums">{hud.kills}</span>
            </p>
            <div className="mt-2 flex w-full flex-col gap-2.5">
              <button
                type="button"
                onClick={onTogglePause}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#38bdf8] py-2.5 font-extrabold text-[#0f172a] hover:bg-[#7dd3fc]"
              >
                <Play className="h-4 w-4" /> ПРОДОЛЖИТЬ
              </button>
              <button
                type="button"
                onClick={onStart}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-white/20 bg-[#1e293b] py-2.5 font-bold text-white hover:bg-[#334155]"
              >
                <RotateCcw className="h-4 w-4" /> НАЧАТЬ ЗАНОВО
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER MODAL */}
      {hud.phase === 'gameover' && (
        <div className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-[#090e1a]/75">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border-2 border-[#fb7185]/60 bg-[#131d31] p-7 text-center shadow-2xl">
            <h2 className="text-2xl font-black tracking-wider text-[#fb7185]">ИГРА ОКОНЧЕНА</h2>
            <div className="grid w-full grid-cols-3 gap-2 rounded-lg bg-[#0d1424] p-3 tabular-nums">
              <div>
                <div className="text-[10px] font-bold text-[#94a3b8]">СЧЁТ</div>
                <div className="text-lg font-black text-white">{hud.score}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#94a3b8]">ВОЛНА</div>
                <div className="text-lg font-black text-[#fde68a]">{hud.wave}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#94a3b8]">СБИТО</div>
                <div className="text-lg font-black text-[#38bdf8]">{hud.kills}</div>
              </div>
            </div>
            <div className="text-xs font-semibold text-[#fde68a] tabular-nums">
              ЛУЧШИЙ РЕЗУЛЬТАТ: {hud.bestScore.toLocaleString('ru-RU')}
            </div>
            <button
              type="button"
              onClick={onStart}
              className="mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#e65b48] py-3 font-extrabold tracking-wide text-white shadow-lg hover:bg-[#f06e5c]"
            >
              <RotateCcw className="h-4 w-4" /> ИГРАТЬ СНОВА
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
