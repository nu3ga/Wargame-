import React from 'react';
import type { WorldHudSnapshot } from '../world/types';

interface PauseModalProps {
  hud: WorldHudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  hud,
  onResume,
  onRestart,
  onReturnTitle,
}) => {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 14, 11, 0.72)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
        className="w-full max-w-md rounded-xl p-6"
        style={{
          backgroundColor: '#18201b',
          border: '1px solid rgba(244, 232, 206, 0.18)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)',
        }}
      >
        <h2 id="pause-title" className="font-display text-2xl font-bold text-[#f6efe2]">
          Renda Journey Paused
        </h2>
        <p className="text-sm text-[#b7ae9c] mt-1">
          {hud.discoveredIds.length} of {hud.totalLandmarks} Abava Valley landmarks discovered
        </p>

        <div className="grid grid-cols-3 gap-3 my-5 py-4 border-y border-white/10">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#b7ae9c]">Score</div>
            <div className="text-xl font-bold text-[#f6efe2] font-mono-num">{hud.score}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#b7ae9c]">Deliveries</div>
            <div className="text-xl font-bold text-[#e6a145] font-mono-num">
              {hud.deliveriesCompleted}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#b7ae9c]">Distance</div>
            <div className="text-xl font-bold text-[#f6efe2] font-mono-num">
              {hud.distanceTraveledM}m
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm text-[#141a16] bg-[#e6a145] hover:bg-[#f0b35e] transition-colors cursor-pointer whitespace-nowrap"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm text-[#f6efe2] bg-white/10 hover:bg-white/15 transition-colors cursor-pointer whitespace-nowrap"
          >
            Restart
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="flex-1 px-4 py-2.5 rounded-lg font-medium text-sm text-[#ddd5c5] hover:text-white hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
          >
            Title
          </button>
        </div>
      </div>
    </div>
  );
};
