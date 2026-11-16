import React from 'react';

interface TitleOverlayProps {
  bestScore: number;
  onStart: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({ bestScore, onStart }) => {
  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 pt-safe pb-safe md:p-12">
      {/* Upper-left negative-space anchor */}
      <div className="max-w-lg pointer-events-auto pt-2 md:pt-8">
        <div
          className="w-full sm:inline-block sm:w-auto p-5 sm:p-6 rounded-2xl"
          style={{
            backgroundColor: 'rgba(18, 24, 20, 0.82)',
            border: '1px solid rgba(244, 232, 206, 0.16)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
          }}
        >
          {/* Bespoke inline SVG crest lockup */}
          <svg
            viewBox="0 0 360 88"
            className="w-60 sm:w-72 md:w-80 h-auto mb-3 sm:mb-4"
            aria-label="Renda Abava Valley"
          >
            <g fill="none" stroke="#e6a145" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M24 72 L24 38 L34 28 L44 38 L44 72" />
              <path d="M34 28 L34 10" />
              <path d="M29 16 L39 16" />
              <path d="M12 72 Q42 64 72 72" stroke="#6aa6ad" />
              <path d="M18 78 Q46 71 78 78" stroke="#6aa6ad" opacity="0.7" />
            </g>
            <text
              x="92"
              y="46"
              fill="#f6efe2"
              fontFamily="Bricolage Grotesque, sans-serif"
              fontSize="38"
              fontWeight="700"
              letterSpacing="1"
            >
              RENDA
            </text>
            <text
              x="94"
              y="70"
              fill="#c9bfa9"
              fontFamily="Plus Jakarta Sans, sans-serif"
              fontSize="13"
              fontWeight="600"
              letterSpacing="2.8"
            >
              ABAVA VALLEY · KURZEME
            </text>
          </svg>

          <p className="text-sm md:text-base text-[#ddd5c5] leading-relaxed mb-5 max-w-md">
            Patrol authentic Latvian village roads, Abava River bridges, and Īvande waterfalls in first-person — or switch seamlessly to Drive, Canoe, and Live Architecture Studio.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
            <button
              type="button"
              data-start="true"
              onClick={onStart}
              className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-xl font-semibold text-sm md:text-base text-[#141a16] bg-[#e6a145] hover:bg-[#f0b35e] active:translate-y-px transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0b35e]"
            >
              Explore Renda
            </button>

            {bestScore > 0 && (
              <div className="text-xs text-[#c9bfa9] font-mono-num text-center sm:text-left">
                Best Score <span className="text-[#f6efe2] font-semibold ml-1">{bestScore}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom flat borderless control hint */}
      <div className="text-[11px] sm:text-xs md:text-sm text-[#e8e1d3] hud-text-shadow text-center tracking-wide px-2">
        <span className="md:hidden">Stick Move · Drag Look · Fire / ADS / Reload · Tab Map</span>
        <span className="hidden md:inline">
          WASD Move · Mouse / F Aim · Click Fire · R Reload · Q/E Lean · V 1st/3rd · T Sky · Tab Map &amp; Modes
        </span>
      </div>
    </div>
  );
};
