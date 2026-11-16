import React, { useEffect, useRef } from 'react';
import {
  computeCompassBearingDeg,
  computeCompassTicks,
  computeSignedAngleDiffDeg,
} from '../world/rendaMath';
import type {
  AtmospherePreset,
  CameraPerspective,
  PlayMode,
  RendaWorldDataset,
  WorldHudSnapshot,
} from '../world/types';
import worldRaw from '../data/rendaWorld.json';

const WORLD = worldRaw as unknown as RendaWorldDataset;

interface GameHudProps {
  hud: WorldHudSnapshot;
  muted: boolean;
  drawerOpen: boolean;
  atmosphere: AtmospherePreset;
  onToggleDrawer: () => void;
  onCloseDrawer: () => void;
  onSelectMode: (mode: PlayMode) => void;
  onSetPerspective: (next: CameraPerspective) => void;
  onSetAtmosphere: (preset: AtmospherePreset) => void;
  onTeleportLandmark: (id: string) => void;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
}

const ATMOSPHERE_OPTIONS: { id: AtmospherePreset; label: string }[] = [
  { id: 'morning', label: 'Morning Fog' },
  { id: 'golden', label: 'Golden Hour' },
  { id: 'overcast_rain', label: 'Overcast Rain' },
  { id: 'noon', label: 'Baltic Noon' },
  { id: 'twilight', label: 'Twilight' },
];

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  muted,
  drawerOpen,
  atmosphere,
  onToggleDrawer,
  onCloseDrawer,
  onSelectMode,
  onSetPerspective,
  onSetAtmosphere,
  onTeleportLandmark,
  onToggleMute,
  onPause,
  onRestart,
}) => {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);

  // Draw Renda roads, rivers, landmarks & player onto 132x132 minimap inside Tactical Drawer
  useEffect(() => {
    if (!drawerOpen) return;
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#141b17';
    ctx.fillRect(0, 0, w, h);

    const scale = 0.058;
    const toPx = (wx: number, wz: number): [number, number] => [
      w * 0.5 + (wx - hud.playerX) * scale,
      h * 0.5 + (wz - hud.playerZ) * scale,
    ];

    ctx.strokeStyle = '#4f9199';
    ctx.lineWidth = 3;
    for (const ww of WORLD.waterways) {
      if (ww.pts.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < ww.pts.length; i++) {
        const [px, py] = toPx(ww.pts[i][0], ww.pts[i][1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(218, 208, 188, 0.45)';
    ctx.lineWidth = 1.4;
    for (const r of WORLD.roads) {
      if (r.pts.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < r.pts.length; i++) {
        const [px, py] = toPx(r.pts[i][0], r.pts[i][1]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    const discovered = new Set(hud.discoveredIds);
    for (const lm of WORLD.landmarks) {
      const [px, py] = toPx(lm.x, lm.z);
      if (px < -6 || px > w + 6 || py < -6 || py > h + 6) continue;
      ctx.fillStyle = discovered.has(lm.id) ? '#7ec482' : '#d1c7b2';
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (hud.activeMission) {
      const [mx, my] = toPx(hud.activeMission.targetX, hud.activeMission.targetZ);
      const clampedX = Math.max(7, Math.min(w - 7, mx));
      const clampedY = Math.max(7, Math.min(h - 7, my));
      ctx.fillStyle = '#e6a145';
      ctx.beginPath();
      ctx.arc(clampedX, clampedY, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#141a16';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.rotate(-hud.playerHeading + Math.PI);
    ctx.fillStyle = '#f6efe2';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [drawerOpen, hud.playerX, hud.playerZ, hud.playerHeading, hud.discoveredIds, hud.activeMission]);

  const modes: { id: PlayMode; label: string; keyHint: string }[] = [
    { id: 'walk', label: 'Patrol (FPS)', keyHint: '1' },
    { id: 'drive', label: 'Drive', keyHint: '2' },
    { id: 'canoe', label: 'Canoe', keyHint: '3' },
    { id: 'studio', label: 'Studio', keyHint: '4' },
  ];

  const missionDist = hud.activeMission
    ? Math.round(Math.hypot(hud.activeMission.targetX - hud.playerX, hud.activeMission.targetZ - hud.playerZ))
    : 0;

  const camDeg = hud.compassBearingDeg ?? computeCompassBearingDeg(hud.camYaw ?? hud.playerHeading);
  const compassTicks = computeCompassTicks(camDeg, 72);
  const missionDeg = hud.activeMission
    ? ((Math.atan2(hud.activeMission.targetX - hud.playerX, -(hud.activeMission.targetZ - hud.playerZ)) * 180) /
        Math.PI +
        360) %
      360
    : null;
  const missionDelta = missionDeg !== null ? computeSignedAngleDiffDeg(camDeg, missionDeg) : null;

  const adsAlpha = hud.adsAlpha ?? 0;
  const crosshairOpacity = Math.max(0, 1 - adsAlpha * 2.6);
  const crosshairSpreadPx = Math.round(7 + Math.min(10, (hud.speedKmh ?? 0) * 0.45));
  const showCrosshair = hud.mode === 'walk' && hud.cameraPerspective !== 'third_person' && !drawerOpen;
  const staminaPct = Math.round(Math.max(0, Math.min(1, hud.stamina ?? 1)) * 100);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5 pt-safe pb-safe">
      {/* Top Row: Ultra-Minimal Borderless AAA Compass & Whisper Corner Triggers */}
      <div className="relative flex items-start justify-between gap-2">
        {/* Top-Left Whisper Tactical Menu Trigger */}
        <div className="pointer-events-auto flex flex-col items-start gap-0.5 rounded-lg bg-black/38 backdrop-blur-[2px] border border-white/10 px-2.5 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
          <button
            type="button"
            tabIndex={-1}
            aria-expanded={drawerOpen}
            aria-label="Open tactical map and modes drawer"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleDrawer();
            }}
            className="min-h-[28px] text-left text-xs sm:text-[13px] font-medium text-[#f4efe4] hover:text-white cursor-pointer transition-opacity hud-text-shadow flex items-center gap-2"
          >
            <span className="inline-block px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-mono-num tracking-wider">
              TAB
            </span>
            <span>
              Renda · <strong className="font-mono-num text-[#f0b35e]">{hud.discoveredIds.length}/{hud.totalLandmarks}</strong>
              <span className="hidden sm:inline text-[#d6cfc0]"> · {hud.score} pts</span>
            </span>
          </button>

          {hud.mode !== 'studio' && hud.activeMission && (
            <div className="text-[11px] text-[#ebe4d6] hud-text-shadow font-mono-num truncate max-w-[44vw]">
              → {hud.activeMission.targetName} ({missionDist}m)
            </div>
          )}
        </div>

        {/* Top-Center Borderless AAA Compass (Ref 1 / Ref 2 / Ref 3 Style) */}
        {hud.mode !== 'studio' && (
          <div
            aria-label="Compass navigation bar"
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[220px] sm:w-[336px] h-10 pointer-events-none select-none overflow-hidden rounded-b-xl bg-gradient-to-b from-black/50 via-black/28 to-transparent"
          >
            {/* Subtle top hairline & center white downward triangle caret */}
            <div
              className="absolute top-[18px] left-6 right-6 h-px"
              style={{
                background:
                  'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0) 100%)',
              }}
            />
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                borderLeft: '4.5px solid transparent',
                borderRight: '4.5px solid transparent',
                borderTop: '5.5px solid #ffffff',
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.85))',
              }}
            />

            {compassTicks.map((tick) => {
              const pct = 50 + (tick.offsetDeg / 72) * 46;
              return (
                <div
                  key={tick.deg}
                  className="absolute -translate-x-1/2 flex flex-col items-center hud-text-shadow"
                  style={{ left: `${pct}%`, top: '6px' }}
                >
                  <span
                    className={`font-mono-num leading-none ${
                      tick.label === 'N'
                        ? 'text-[12px] font-bold text-[#f6efe2]'
                        : tick.isCardinal
                          ? 'text-[11px] font-semibold text-[#f2ede2]'
                          : 'text-[10px] font-medium text-[#d5d0c4]/85'
                    }`}
                  >
                    {tick.label}
                  </span>
                  <span className="mt-1 w-px h-1.5 bg-white/50" />
                </div>
              );
            })}

            {missionDelta !== null && (
              <div
                className="absolute bottom-0 -translate-x-1/2 text-[9px] font-bold font-mono-num text-[#f5b85c] hud-text-shadow whitespace-nowrap"
                style={{
                  left: `${50 + (Math.max(-64, Math.min(64, missionDelta)) / 72) * 44}%`,
                }}
              >
                ◆ {missionDist}m
              </div>
            )}
          </div>
        )}

        {/* Top-Right Minimal Whisper Mute & Pause Buttons */}
        <div className="pointer-events-auto flex items-center gap-1.5">
          {hud.selectedBuilding && hud.mode !== 'studio' && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectMode('studio');
              }}
              className="hidden sm:inline-flex items-center min-h-[38px] px-3 py-1 rounded-lg text-xs font-semibold text-[#141a16] bg-[#e6a145] hover:bg-[#f0b35e] cursor-pointer shadow-md"
            >
              Restyle {hud.selectedBuilding.name}
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            title="Mute [M]"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#f4efe4] hover:text-white hover:bg-black/35 cursor-pointer transition-colors hud-text-shadow"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              {muted ? (
                <path d="M22 9l-6 6M16 9l6 6" />
              ) : (
                <path d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
              )}
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause game"
            title="Pause [Esc]"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="w-10 h-10 rounded-lg flex items-center justify-center text-[#f4efe4] hover:text-white hover:bg-black/35 cursor-pointer transition-colors hud-text-shadow"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Center Dynamic Hipfire Crosshair (fades out cleanly into EOTech reticle in ADS) */}
      {showCrosshair && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none flex items-center justify-center"
          style={{ opacity: crosshairOpacity }}
        >
          <div className="relative w-12 h-12 flex items-center justify-center">
            <span className="w-1 h-1 rounded-full bg-white/85 shadow-[0_0_2px_rgba(0,0,0,0.85)]" />
            <span
              className="absolute w-2 h-[1.5px] bg-white/80 shadow-[0_0_2px_rgba(0,0,0,0.85)]"
              style={{ right: `calc(50% + ${crosshairSpreadPx}px)` }}
            />
            <span
              className="absolute w-2 h-[1.5px] bg-white/80 shadow-[0_0_2px_rgba(0,0,0,0.85)]"
              style={{ left: `calc(50% + ${crosshairSpreadPx}px)` }}
            />
            <span
              className="absolute h-2 w-[1.5px] bg-white/80 shadow-[0_0_2px_rgba(0,0,0,0.85)]"
              style={{ bottom: `calc(50% + ${crosshairSpreadPx}px)` }}
            />
            <span
              className="absolute h-2 w-[1.5px] bg-white/80 shadow-[0_0_2px_rgba(0,0,0,0.85)]"
              style={{ top: `calc(50% + ${crosshairSpreadPx}px)` }}
            />
            {hud.isReloading && (
              <span className="absolute top-11 text-[10px] tracking-[0.2em] uppercase text-[#f0b35e] font-semibold hud-text-shadow whitespace-nowrap">
                Reloading
              </span>
            )}
          </div>
        </div>
      )}

      {/* Non-blocking Discovery / Delivery Banner */}
      {hud.activeBanner && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-[92vw] sm:w-auto max-w-md">
          <div
            className="px-4 py-2 rounded-lg text-center"
            style={{
              backgroundColor: 'rgba(14, 19, 16, 0.86)',
              border: '1px solid rgba(230, 161, 69, 0.4)',
              boxShadow: '0 10px 28px rgba(0, 0, 0, 0.45)',
            }}
          >
            <div className="text-xs sm:text-sm font-semibold text-[#f0b35e]">{hud.activeBanner.title}</div>
            <div className="text-[11px] sm:text-xs text-[#ddd5c5] mt-0.5 line-clamp-2">
              {hud.activeBanner.subtitle}
            </div>
          </div>
        </div>
      )}

      {/* Collapsible [Tab] Tactical Drawer (Modes, Perspective, Atmosphere, Landmarks, Minimap) */}
      {drawerOpen && hud.mode !== 'studio' && (
        <div
          role="dialog"
          aria-label="Renda tactical navigation and modes"
          className="pointer-events-auto fixed top-14 left-3 sm:left-5 z-30 w-[94vw] max-w-xl max-h-[78dvh] overflow-y-auto rounded-xl p-4"
          style={{
            backgroundColor: 'rgba(15, 21, 18, 0.94)',
            border: '1px solid rgba(244, 232, 206, 0.18)',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65)',
          }}
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
            <div>
              <h2 className="font-display text-base font-bold text-[#f6efe2]">Renda Valley Tactical Map</h2>
              <p className="text-[11px] text-[#a7b2a8] font-mono-num">
                {hud.nearestLandmark
                  ? `Near ${hud.nearestLandmark.name} (${hud.nearestLandmark.distanceM}m) · `
                  : ''}
                {hud.elevationM}m ASL · {hud.deliveriesCompleted} deliveries
              </p>
            </div>
            <button
              type="button"
              onClick={onCloseDrawer}
              className="px-2.5 py-1 rounded-md text-xs text-[#ddd5c5] hover:text-white bg-white/10 hover:bg-white/15 cursor-pointer"
            >
              Close [Tab]
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[144px_1fr] gap-3.5 py-3 border-b border-white/10">
            <div className="flex flex-col items-center gap-2">
              <canvas
                ref={minimapRef}
                width={132}
                height={132}
                className="rounded-lg border border-white/15 block"
                aria-label="Renda village minimap"
              />
              <button
                type="button"
                onClick={() => {
                  onSetPerspective(hud.cameraPerspective === 'third_person' ? 'first_person' : 'third_person');
                }}
                className="w-full px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-white/10 hover:bg-white/15 text-[#f6efe2] cursor-pointer"
              >
                View: {hud.cameraPerspective === 'third_person' ? '3rd Person' : '1st Person'} [V]
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {/* Modes 1-4 */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#a7b2a8] mb-1.5">Play Mode</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {modes.map((m) => {
                    const active = hud.mode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onSelectMode(m.id);
                          onCloseDrawer();
                        }}
                        className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#e6a145] text-[#141a16]'
                            : 'bg-white/5 text-[#ddd5c5] hover:bg-white/15'
                        }`}
                      >
                        {m.label} [{m.keyHint}]
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Atmosphere / Weather Presets */}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#a7b2a8] mb-1.5">
                  Kurzeme Atmosphere [T]
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ATMOSPHERE_OPTIONS.map((opt) => {
                    const active = atmosphere === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSetAtmosphere(opt.id)}
                        className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#e6a145] text-[#141a16] font-semibold'
                            : 'bg-white/5 text-[#ddd5c5] hover:bg-white/15'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Fast-Travel Landmarks */}
          <div className="pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider text-[#a7b2a8]">
                Fast-Travel Landmarks ({hud.discoveredIds.length}/{hud.totalLandmarks})
              </div>
              <button
                type="button"
                onClick={() => {
                  onRestart();
                  onCloseDrawer();
                }}
                className="text-[11px] text-[#d5cdc0] hover:text-white underline cursor-pointer"
              >
                Reset Position
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onTeleportLandmark('abava_bridge');
                  onCloseDrawer();
                }}
                className="min-h-[42px] text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer bg-white/5 hover:bg-white/15"
              >
                <div className="font-medium text-[#f0b35e] truncate">P120 Abava Bridge</div>
                <div className="text-[10px] text-[#a7b2a8] truncate">Granite Pier River View</div>
              </button>

              {WORLD.landmarks.map((lm) => {
                const found = hud.discoveredIds.includes(lm.id);
                return (
                  <button
                    key={lm.id}
                    type="button"
                    onClick={() => {
                      onTeleportLandmark(lm.id);
                      onCloseDrawer();
                    }}
                    className="min-h-[42px] text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer bg-white/5 hover:bg-white/15"
                  >
                    <div className="font-medium text-[#f6efe2] truncate">{lm.name}</div>
                    <div className="text-[10px] text-[#a7b2a8] truncate">
                      {lm.year} · {found ? 'Visited' : 'Unvisited'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Row: Ultra-Minimal Weapon Silhouette & Ammo Counter (Ref 1 / Ref 2 / Ref 3) */}
      {hud.mode !== 'studio' && (
        <div className="flex items-end justify-between gap-4">
          {/* Bottom-Left subtle whisper controls hint on desktop */}
          <div className="hidden md:flex items-center gap-3 text-[11px] text-[#efe9dc]/90 hud-text-shadow select-none px-2.5 py-1 rounded bg-black/32 backdrop-blur-[1px]">
            <span>
              {hud.mode === 'walk'
                ? 'Click Canvas Lock Aim · Left-Click Fire · Right-Click/F ADS · R Reload · V 1st/3rd · Tab Map'
                : 'WASD Steer · Space Brake · 1-4 Modes · Tab Map'}
            </span>
          </div>

          {/* Bottom-Right Minimal Weapon Silhouette + 30 | 180 Telemetry */}
          <div className="ml-auto flex flex-col items-end gap-1 select-none hud-text-shadow">
            {hud.mode === 'walk' ? (
              <>
                <div className="flex items-center gap-2.5 text-[#f6efe2]">
                  {/* Crisp carbine silhouette + 3-bullet icon matching Ref 1/2 */}
                  <svg
                    viewBox="0 0 88 22"
                    className="w-16 h-4 text-[#f6efe2]/90 hidden sm:block"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M4 9h14v3H4V9zm14-1.5h18l2-2h14v2h10l3 1.5h15v2.5H65l-2 1.5H50l-1 4h-4l-1-4H34l-2 7h-5l1-7H18V7.5zm26-4h8v2h-8v-2z" />
                  </svg>
                  <svg viewBox="0 0 18 16" className="w-3.5 h-3.5 text-[#f6efe2]/90" fill="currentColor" aria-hidden="true">
                    <path d="M2 5c0-2 .8-3.5 1.5-4C4.2 1.5 5 3 5 5v9H2V5zm5.5 0c0-2 .8-3.5 1.5-4 .7.5 1.5 2 1.5 4v9H7.5V5zm5.5 0c0-2 .8-3.5 1.5-4 .7.5 1.5 2 1.5 4v9H13V5z" />
                  </svg>
                  <div className="font-mono-num flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-[26px] font-bold leading-none text-[#ffffff]">
                      {hud.ammoInMag ?? 30}
                    </span>
                    <span className="text-sm text-white/50">|</span>
                    <span className="text-sm sm:text-base font-medium text-[#e6dfd1]">
                      {hud.ammoReserve ?? 180}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono-num uppercase tracking-wider text-[#d8d1c2]">
                  <span>{hud.fireMode ?? 'SEMI'}</span>
                  {hud.crouching && <span className="text-[#f0b35e]">CROUCH</span>}
                  {staminaPct < 98 && (
                    <span className="inline-flex items-center gap-1">
                      <span className="w-10 h-1 bg-white/20 rounded-full overflow-hidden">
                        <span className="block h-full bg-[#e6a145]" style={{ width: `${staminaPct}%` }} />
                      </span>
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-baseline gap-1.5 font-mono-num text-[#ffffff]">
                <span className="text-2xl font-bold leading-none">{hud.speedKmh}</span>
                <span className="text-xs uppercase tracking-wider text-[#d8d1c2]">km/h</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
