import React, { useEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
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
  const mapTriggerRef = useRef<HTMLButtonElement | null>(null);
  const tacticalPanelRef = useRef<HTMLDivElement | null>(null);
  const closeDrawerRef = useRef(onCloseDrawer);
  closeDrawerRef.current = onCloseDrawer;

  useEffect(() => {
    if (!drawerOpen || hud.mode === 'studio') return;
    const panel = tacticalPanelRef.current;
    if (!panel) return;
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    ));
    const trigger = mapTriggerRef.current;
    (focusable()[0] ?? panel).focus({ preventScroll: true });
    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeDrawerRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      // Native Tab navigation stays inside the dialog, without reaching gameplay shortcuts.
      event.stopPropagation();
      const controls = focusable();
      const first = controls[0] ?? panel;
      const last = controls[controls.length - 1] ?? panel;
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Capture Escape before the engine's window listener can pause the game.
    document.addEventListener('keydown', handleDialogKey, true);
    return () => {
      document.removeEventListener('keydown', handleDialogKey, true);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
    // HUD snapshots and parent callbacks update frequently; preserve the current control's focus.
  }, [drawerOpen, hud.mode]);

  // Draw roads, rivers, landmarks and the player inside the tactical map.
  useEffect(() => {
    if (!drawerOpen) return;
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#171c19';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(216, 224, 207, 0.06)';
    ctx.lineWidth = 1;
    for (let n = 0; n <= w; n += 33) {
      ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, n); ctx.lineTo(w, n); ctx.stroke();
    }
    const scale = 0.095;
    const toPx = (wx: number, wz: number): [number, number] => [
      w * 0.5 + (wx - hud.playerX) * scale,
      h * 0.5 + (wz - hud.playerZ) * scale,
    ];

    ctx.strokeStyle = '#5b7e82';
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
      ctx.fillStyle = discovered.has(lm.id) ? '#b4c592' : '#d1c7b2';
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (hud.activeMission) {
      const [mx, my] = toPx(hud.activeMission.targetX, hud.activeMission.targetZ);
      const clampedX = Math.max(7, Math.min(w - 7, mx));
      const clampedY = Math.max(7, Math.min(h - 7, my));
      ctx.fillStyle = '#c8d0ad';
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
    { id: 'walk', label: 'Patrol', keyHint: '1' },
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
    <div className="r-hud">
      <header className="r-hud-header">
        <button ref={mapTriggerRef} type="button" className="r-map-trigger" aria-haspopup="dialog" aria-expanded={drawerOpen} aria-controls="r-tactical-panel" onClick={(e) => { e.currentTarget.blur(); onToggleDrawer(); }}>
          <kbd>TAB</kbd><span>TACTICAL MAP</span><span className="r-map-count">{hud.discoveredIds.length}/{hud.totalLandmarks}</span>
        </button>

        {hud.mode !== 'studio' && (
          <div className="r-compass" aria-label={`Compass heading ${Math.round(camDeg)} degrees`}>
            <span className="r-compass-caret" />
            <div className="r-compass-rail" />
            {compassTicks.map((tick) => (
              <div key={tick.deg} className={`r-compass-tick ${tick.isCardinal ? 'r-cardinal' : ''}`} style={{ left: `${50 + (tick.offsetDeg / 72) * 46}%` }}>
                <span>{tick.label}</span><i />
              </div>
            ))}
            <span className="r-compass-bearing">{String(Math.round(camDeg) % 360).padStart(3, '0')}°</span>
            {missionDelta !== null && <span className="r-compass-mission" style={{ left: `${50 + (Math.max(-64, Math.min(64, missionDelta)) / 72) * 44}%` }}>◆ {missionDist}m</span>}
          </div>
        )}

        <div className="r-hud-tools">
          {hud.selectedBuilding && hud.mode !== 'studio' && <button type="button" className="r-restyle-button" onClick={(e) => { e.currentTarget.blur(); onSelectMode('studio'); }}>RESTYLE BUILDING</button>}
          <button type="button" className="r-icon-button" aria-label={muted ? 'Unmute audio' : 'Mute audio'} title="Audio [M]" onClick={(e) => { e.currentTarget.blur(); onToggleMute(); }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z" />{muted ? <path d="m22 9-6 6m0-6 6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7m3.5-10a9 9 0 0 1 0 13" />}</svg>
          </button>
          <button type="button" className="r-icon-button" aria-label="Pause game" title="Pause [Esc]" onClick={(e) => { e.currentTarget.blur(); onPause(); }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
          </button>
        </div>
      </header>

      {showCrosshair && (
        <div aria-hidden="true" className="r-crosshair" style={{ opacity: crosshairOpacity }}>
          <span className="r-crosshair-dot" />
          <span className="r-crosshair-horizontal" style={{ right: `calc(50% + ${crosshairSpreadPx}px)` }} />
          <span className="r-crosshair-horizontal" style={{ left: `calc(50% + ${crosshairSpreadPx}px)` }} />
          <span className="r-crosshair-vertical" style={{ bottom: `calc(50% + ${crosshairSpreadPx}px)` }} />
          <span className="r-crosshair-vertical" style={{ top: `calc(50% + ${crosshairSpreadPx}px)` }} />
        </div>
      )}

      {hud.activeBanner && (
        <div className="r-event-banner" role="status"><span className="r-eyebrow">FIELD UPDATE</span><strong>{hud.activeBanner.title}</strong><p>{hud.activeBanner.subtitle}</p></div>
      )}

      {drawerOpen && hud.mode !== 'studio' && (
        <div ref={tacticalPanelRef} id="r-tactical-panel" role="dialog" aria-modal="true" aria-labelledby="r-tactical-title" tabIndex={-1} className="r-tactical-panel">
          <header className="r-panel-header"><div><span className="r-eyebrow">ABAVA VALLEY / KURZEME</span><h2 id="r-tactical-title">TACTICAL MAP</h2></div><button type="button" className="r-icon-button" aria-label="Close tactical map" onClick={onCloseDrawer}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></header>
          <div className="r-map-overview">
            <div className="r-map-frame"><canvas ref={minimapRef} width={264} height={264} aria-label="Renda village minimap" /><span className="r-map-north">N ↑</span><div className="r-map-legend"><span>— ROAD</span><span>— RIVER</span><span>● LANDMARK</span></div></div>
            <div className="r-map-position"><span className="r-eyebrow">CURRENT POSITION</span><strong>{hud.nearestLandmark?.name ?? 'Abava Valley'}</strong><p>{hud.nearestLandmark ? `${hud.nearestLandmark.distanceM} m from landmark` : 'Exploring the valley'}</p><div><span>ELEVATION</span><b>{Math.round(hud.elevationM)} m ASL</b></div><div><span>DISCOVERED</span><b>{hud.discoveredIds.length} / {hud.totalLandmarks}</b></div><div><span>DELIVERIES</span><b>{hud.deliveriesCompleted}</b></div><button type="button" className="r-panel-secondary" onClick={() => onSetPerspective(hud.cameraPerspective === 'third_person' ? 'first_person' : 'third_person')}>{hud.cameraPerspective === 'third_person' ? 'THIRD PERSON' : 'FIRST PERSON'}<kbd>V</kbd></button></div>
          </div>
          <section className="r-panel-section" aria-label="Play mode"><div className="r-section-label">TRAVERSAL &amp; CREATION</div><div className="r-mode-grid">{modes.map((mode) => <button key={mode.id} type="button" aria-pressed={hud.mode === mode.id} className={`r-choice-button ${hud.mode === mode.id ? 'r-choice-active' : ''}`} onClick={() => { onSelectMode(mode.id); onCloseDrawer(); }}><kbd>{mode.keyHint}</kbd><span>{mode.label}</span></button>)}</div></section>
          <section className="r-panel-section" aria-label="Atmosphere"><div className="r-section-label">ATMOSPHERE <kbd>T</kbd></div><div className="r-weather-options">{ATMOSPHERE_OPTIONS.map((option) => <button key={option.id} type="button" aria-pressed={atmosphere === option.id} onClick={() => onSetAtmosphere(option.id)} className={atmosphere === option.id ? 'r-weather-active' : ''}>{option.label}</button>)}</div></section>
          <section className="r-panel-section"><div className="r-section-label">LANDMARKS <button type="button" onClick={() => { onRestart(); onCloseDrawer(); }}>RESET POSITION <ArrowUpRight size={10} strokeWidth={1.5} aria-hidden="true" /></button></div><div className="r-landmark-grid"><button type="button" className="r-landmark-button" onClick={() => { onTeleportLandmark('abava_bridge'); onCloseDrawer(); }}><span>P120 Abava Bridge</span><small>RIVER CROSSING</small><i aria-hidden="true"><ArrowUpRight size={12} strokeWidth={1.5} /></i></button>{WORLD.landmarks.map((landmark) => <button key={landmark.id} type="button" className="r-landmark-button" onClick={() => { onTeleportLandmark(landmark.id); onCloseDrawer(); }}><span>{landmark.name}</span><small>{hud.discoveredIds.includes(landmark.id) ? 'VISITED' : 'UNEXPLORED'} · {landmark.year}</small><i aria-hidden="true"><ArrowUpRight size={12} strokeWidth={1.5} /></i></button>)}</div></section>
          <footer className="r-panel-footer"><kbd>ESC</kbd> CLOSE MAP<span>SELECT A LANDMARK TO FAST TRAVEL</span></footer>
        </div>
      )}

      {hud.mode !== 'studio' && (
        <div className="r-hud-bottom">
          <div className="r-field-position">
            <div className="r-field-label"><i />{hud.mode === 'walk' ? 'ON FOOT' : hud.mode === 'drive' ? 'VEHICLE' : 'ON THE RIVER'}<span>ABAVA VALLEY</span></div>
            {hud.activeMission ? <><strong>{hud.activeMission.targetName}</strong><p><span className="r-objective-diamond">◆</span> {missionDist} m TO DESTINATION</p></> : <><strong>{hud.nearestLandmark?.name ?? 'Renda, Kurzeme'}</strong><p>{Math.round(hud.elevationM)} m ASL{hud.nearestLandmark && <> <span className="r-footer-separator">/</span> {hud.nearestLandmark.distanceM} m AWAY</>}</p></>}
            {hud.mode === 'walk' && staminaPct < 98 && <div className="r-stamina" role="meter" aria-label="Stamina" aria-valuenow={staminaPct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${staminaPct}%` }} /></div>}
          </div>
          {hud.mode === 'walk' && !hud.pointerLocked && !drawerOpen && <div className="r-aim-prompt"><span>CLICK SCENE TO CONTROL</span><p>WASD MOVE <i /> RMB / F AIM <i /> R RELOAD</p></div>}
          <div className="r-weapon-status">
            {hud.mode === 'walk' ? <>
              <div className="r-weapon-label">CARBINE <span>5.56</span></div>
              <div className={`r-ammo ${(hud.ammoInMag ?? 30) <= 7 ? 'r-ammo-low' : ''}`} aria-label={`${hud.ammoInMag ?? 30} rounds loaded, ${hud.ammoReserve ?? 180} in reserve`}><strong>{String(hud.ammoInMag ?? 30).padStart(2, '0')}</strong><i /><span>{String(hud.ammoReserve ?? 180).padStart(3, '0')}</span></div>
              <div className="r-weapon-state"><span><i /> {hud.fireMode ?? 'SEMI'}</span><span>{hud.isReloading ? 'RELOADING' : hud.crouching ? 'CROUCHED' : 'R · RELOAD'}</span></div>
            </> : <><div className="r-weapon-label">GROUND SPEED</div><div className="r-ammo"><strong>{Math.round(hud.speedKmh)}</strong><span>KM/H</span></div></>}
          </div>
        </div>
      )}
    </div>
  );
};
