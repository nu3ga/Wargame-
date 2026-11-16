import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { RenderQuality } from '../world/types';

interface TitleOverlayProps {
  bestScore: number;
  onStart: () => void;
  quality?: RenderQuality;
  onSetQuality?: (quality: RenderQuality) => void;
}

export const RenderQualitySelector = ({ quality = 'balanced', onSetQuality }: {
  quality?: RenderQuality;
  onSetQuality?: (quality: RenderQuality) => void;
}) => onSetQuality ? (
  <div className="r-quality-selector" role="group" aria-label="Render quality">
    <div className="r-quality-label">RENDER QUALITY</div>
    <div className="r-quality-choices">
      {(['performance', 'balanced', 'cinematic'] as const).map((preset) => <button key={preset} type="button" aria-pressed={quality === preset} onClick={() => onSetQuality(preset)}>{preset.charAt(0).toUpperCase() + preset.slice(1)}</button>)}
    </div>
  </div>
) : null;

export const TitleOverlay: React.FC<TitleOverlayProps> = ({ bestScore, onStart, quality, onSetQuality }) => (
  <div className="r-title-screen">
    <header className="r-title-header">
      <div className="r-brandmark" aria-label="Renda">
        <svg viewBox="0 0 32 32" width="29" height="29" fill="none" aria-hidden="true">
          <path d="M6 25V9l10-5 10 5v16l-10 4-10-4Z" stroke="currentColor" strokeWidth="1.3" />
          <path d="M11 22V11h7l4 4-4 3h-7m6 0 5 5" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span>RENDA<span className="r-brand-divider">/</span>ABAVA VALLEY</span>
      </div>
      <span className="r-title-location">KURZEME, LATVIA</span>
    </header>

    <section className="r-title-content" aria-labelledby="renda-title">
      <div className="r-eyebrow"><span className="r-short-rule" /> A WORLD WORTH EXPLORING</div>
      <h1 id="renda-title">RENDA<span>ABAVA VALLEY</span></h1>
      <p className="r-title-description">
        The quiet before the storm. Step into the forests, village streets, and river valleys of Kurzeme.
      </p>
      <button type="button" data-start="true" onClick={onStart} className="r-deploy-button">
        <span>ENTER THE VALLEY</span>
        <ArrowUpRight className="r-deploy-arrow" size={23} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <div className="r-start-caption"><kbd>ENTER</kbd><span>BEGIN PATROL</span></div>
      <RenderQualitySelector quality={quality} onSetQuality={onSetQuality} />
      {bestScore > 0 && <div className="r-best-score">PERSONAL BEST <strong>{bestScore.toLocaleString()}</strong></div>}
    </section>

    <footer className="r-title-footer">
      <span>ON FOOT <i /> BY ROAD <i /> BY RIVER</span>
      <span className="r-title-keyhint"><kbd>W A S D</kbd> MOVE <span className="r-footer-separator">/</span> MOUSE LOOK <span className="r-footer-separator">/</span> <kbd>TAB</kbd> MAP &amp; MODES</span>
      <span className="r-touch-title-hint">TOUCH TO MOVE · DRAG TO LOOK</span>
    </footer>
  </div>
);
