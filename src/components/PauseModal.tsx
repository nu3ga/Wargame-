import React, { useEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { RenderQuality, WorldHudSnapshot } from '../world/types';
import { RenderQualitySelector } from './TitleOverlay';

interface PauseModalProps {
  hud: WorldHudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
  quality?: RenderQuality;
  onSetQuality?: (quality: RenderQuality) => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({ hud, onResume, onRestart, onReturnTitle, quality, onSetQuality }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    resumeRef.current?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button');
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      previous?.focus();
    };
  }, []);

  return (
    <div className="r-pause-screen">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="pause-title" className="r-pause-content">
        <div className="r-eyebrow"><span className="r-short-rule" /> RENDA / ABAVA VALLEY</div>
        <h2 id="pause-title">PAUSED</h2>
        <p className="r-pause-subtitle">Your journey continues when you’re ready.</p>
        <div className="r-pause-actions">
          <button ref={resumeRef} type="button" onClick={onResume} className="r-menu-button r-menu-button-active"><span>RESUME PATROL</span><ArrowUpRight size={21} strokeWidth={1.5} aria-hidden="true" /></button>
          <button type="button" onClick={onRestart} className="r-menu-button"><span>RESTART JOURNEY</span><ArrowUpRight size={21} strokeWidth={1.5} aria-hidden="true" /></button>
          <button type="button" onClick={onReturnTitle} className="r-menu-button"><span>RETURN TO TITLE</span><ArrowUpRight size={21} strokeWidth={1.5} aria-hidden="true" /></button>
        </div>
        <RenderQualitySelector quality={quality} onSetQuality={onSetQuality} />
        <div className="r-pause-stats">
          <div><span>LANDMARKS</span><strong>{hud.discoveredIds.length}<small> / {hud.totalLandmarks}</small></strong></div>
          <div><span>DISTANCE</span><strong>{(hud.distanceTraveledM / 1000).toFixed(2)}<small> KM</small></strong></div>
          <div><span>SCORE</span><strong>{hud.score.toLocaleString()}</strong></div>
        </div>
        <p className="r-pause-hint"><kbd>ESC</kbd> RESUME</p>
      </div>
    </div>
  );
};
