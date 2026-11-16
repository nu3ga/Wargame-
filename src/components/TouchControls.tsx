import React, { useEffect, useRef, useState } from 'react';
import { computeTouchStickVector } from '../world/rendaMath';
import type { PlayMode, SelectedBuildingInfo } from '../world/types';

interface TouchControlsProps {
  mode: PlayMode;
  selectedBuilding: SelectedBuildingInfo | null;
  isAiming?: boolean;
  onMove: (turn: number, throttle: number) => void;
  onAction: (action: 'jump' | 'sprint', active: boolean) => void;
  onLook: (dx: number, dy: number) => void;
  onLookEnd: () => void;
  onTapWorld: (clientX: number, clientY: number) => void;
  onOpenStudio: () => void;
  onFire?: () => void;
  onToggleAim?: () => void;
  onReload?: () => void;
}

const MAX_STICK_R = 46;

export const TouchControls: React.FC<TouchControlsProps> = ({
  mode,
  selectedBuilding,
  isAiming = false,
  onMove,
  onAction,
  onLook,
  onLookEnd,
  onTapWorld,
  onOpenStudio,
  onFire,
  onToggleAim,
  onReload,
}) => {
  const leftZoneRef = useRef<HTMLDivElement | null>(null);
  const stickPointerIdRef = useRef<number | null>(null);
  const stickCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const stickVecRef = useRef<{ turn: number; throttle: number }>({ turn: 0, throttle: 0 });
  const pedalThrottleRef = useRef<number>(0);
  const autoSprintLockRef = useRef<boolean>(false);
  const manualSprintRef = useRef<boolean>(false);

  const lookPointerIdRef = useRef<number | null>(null);
  const lookDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lookLastRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false
  );
  const [stickActive, setStickActive] = useState(false);
  const [floatingCenter, setFloatingCenter] = useState<{ x: number; y: number } | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [sprintLocked, setSprintLocked] = useState(false);
  const [sprintHeld, setSprintHeld] = useState(false);
  const [primaryPressed, setPrimaryPressed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null;
    const handleMq = () => {
      if (mq) setIsTouchDevice(mq.matches);
    };
    const handleTouchUpgrade = () => setIsTouchDevice(true);
    mq?.addEventListener?.('change', handleMq);
    window.addEventListener('touchstart', handleTouchUpgrade, { passive: true, once: true });
    return () => {
      mq?.removeEventListener?.('change', handleMq);
      window.removeEventListener('touchstart', handleTouchUpgrade);
    };
  }, []);

  if (mode === 'studio' || !isTouchDevice) return null;

  const emitCombinedMove = (turn: number, stickThrottle: number) => {
    const th = pedalThrottleRef.current !== 0 ? pedalThrottleRef.current : stickThrottle;
    onMove(turn, th);
  };

  const syncSprint = () => {
    onAction('sprint', manualSprintRef.current || autoSprintLockRef.current);
  };

  const updateStickFromClient = (clientX: number, clientY: number) => {
    const dx = clientX - stickCenterRef.current.x;
    const dy = clientY - stickCenterRef.current.y;
    const vec = computeTouchStickVector(dx, dy, MAX_STICK_R, 0.14);
    stickVecRef.current = { turn: vec.turn, throttle: vec.throttle };
    setKnobOffset({ x: vec.clampedX, y: vec.clampedY });
    emitCombinedMove(vec.turn, vec.throttle);

    if (mode === 'walk') {
      const dist = Math.hypot(dx, dy);
      if (vec.throttle > 0.88 && dist >= MAX_STICK_R * 0.9) {
        if (!autoSprintLockRef.current) {
          autoSprintLockRef.current = true;
          setSprintLocked(true);
          syncSprint();
        }
      } else if (autoSprintLockRef.current && (vec.throttle < 0.65 || dist < MAX_STICK_R * 0.68)) {
        autoSprintLockRef.current = false;
        setSprintLocked(false);
        syncSprint();
      }
    }
  };

  const handleLeftDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickPointerIdRef.current !== null) return;
    e.stopPropagation();
    const zone = leftZoneRef.current;
    if (!zone) return;
    zone.setPointerCapture(e.pointerId);
    stickPointerIdRef.current = e.pointerId;
    setStickActive(true);

    const rect = zone.getBoundingClientRect();
    const pad = 56;
    const clampedClientX = Math.max(rect.left + pad, Math.min(rect.right - pad, e.clientX));
    const clampedClientY = Math.max(rect.top + pad, Math.min(rect.bottom - pad, e.clientY));
    stickCenterRef.current = { x: clampedClientX, y: clampedClientY };
    setFloatingCenter({
      x: clampedClientX - rect.left,
      y: clampedClientY - rect.top,
    });
    updateStickFromClient(e.clientX, e.clientY);
  };

  const handleLeftMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickPointerIdRef.current !== e.pointerId) return;
    e.stopPropagation();
    updateStickFromClient(e.clientX, e.clientY);
  };

  const handleLeftUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (stickPointerIdRef.current !== e.pointerId) return;
    e.stopPropagation();
    stickPointerIdRef.current = null;
    stickVecRef.current = { turn: 0, throttle: 0 };
    setStickActive(false);
    setFloatingCenter(null);
    setKnobOffset({ x: 0, y: 0 });
    emitCombinedMove(0, 0);
    if (autoSprintLockRef.current) {
      autoSprintLockRef.current = false;
      setSprintLocked(false);
      syncSprint();
    }
  };

  const handleLookDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== null) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    lookPointerIdRef.current = e.pointerId;
    lookDownPosRef.current = { x: e.clientX, y: e.clientY };
    lookLastRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - lookLastRef.current.x;
    const dy = e.clientY - lookLastRef.current.y;
    lookLastRef.current = { x: e.clientX, y: e.clientY };
    onLook(dx, dy);
  };

  const handleLookUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== e.pointerId) return;
    e.stopPropagation();
    lookPointerIdRef.current = null;
    onLookEnd();
    const dist = Math.hypot(
      e.clientX - lookDownPosRef.current.x,
      e.clientY - lookDownPosRef.current.y
    );
    if (dist < 8) {
      onTapWorld(e.clientX, e.clientY);
    }
  };

  const isSprintActive = sprintHeld || sprintLocked;

  return (
    <div data-testid="touch-controls" className="fixed inset-0 z-10 pointer-events-none select-none lg:hidden">
      {/* Left Floating Dynamic Thumbstick Zone */}
      <div
        ref={leftZoneRef}
        role="application"
        aria-label="Movement thumbstick"
        onPointerDown={handleLeftDown}
        onPointerMove={handleLeftMove}
        onPointerUp={handleLeftUp}
        onPointerCancel={handleLeftUp}
        className="pointer-events-auto fixed bottom-16 left-0 w-[46vw] h-[54dvh] touch-none"
      >
        <div
          className="absolute w-28 h-28 rounded-full flex items-center justify-center pointer-events-none transition-opacity duration-150"
          style={{
            left: floatingCenter ? `${floatingCenter.x - 56}px` : '18px',
            bottom: floatingCenter ? undefined : '20px',
            top: floatingCenter ? `${floatingCenter.y - 56}px` : undefined,
            backgroundColor: stickActive ? 'rgba(14, 19, 16, 0.72)' : 'rgba(14, 19, 16, 0.42)',
            border: sprintLocked
              ? '1.5px solid rgba(230, 161, 69, 0.92)'
              : '1px solid rgba(244, 232, 206, 0.24)',
            boxShadow: sprintLocked ? '0 0 18px rgba(230, 161, 69, 0.35)' : undefined,
          }}
        >
          <div
            className="w-16 h-16 rounded-full pointer-events-none"
            style={{ border: '1px dashed rgba(244, 232, 206, 0.14)' }}
          />
          {mode === 'walk' && stickActive && (
            <span
              className="absolute -top-5 text-[9px] font-semibold uppercase tracking-widest pointer-events-none"
              style={{ color: sprintLocked ? '#f0b35e' : 'rgba(244, 232, 206, 0.48)' }}
            >
              {sprintLocked ? 'Sprint Lock' : 'Push Lock'}
            </span>
          )}
          <div
            className="absolute w-12 h-12 rounded-full pointer-events-none"
            style={{
              transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
              backgroundColor: sprintLocked ? '#f5b85c' : '#e6a145',
              border: '2px solid rgba(255, 248, 232, 0.55)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.48)',
            }}
          />
        </div>
      </div>

      {/* Right Multi-Touch Camera Look Pad */}
      <div
        aria-label="Camera look drag area"
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
        className="pointer-events-auto fixed bottom-16 right-0 w-[54vw] h-[68dvh] touch-none"
      />

      {/* Bottom-Right Radial Action Cluster */}
      <div className="pointer-events-none fixed bottom-20 right-4 z-20 w-52 h-48">
        {selectedBuilding && (
          <button
            type="button"
            aria-label={`Restyle ${selectedBuilding.name}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.currentTarget.blur();
              onOpenStudio();
            }}
            className="pointer-events-auto absolute bottom-2 left-0 w-12 h-12 rounded-full flex items-center justify-center text-[#141a16] bg-[#f0b35e] active:scale-95 touch-none cursor-pointer"
            style={{
              border: '1.5px solid rgba(255, 248, 232, 0.65)',
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.45)',
            }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.1">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}

        {/* FPS Tactical Fire / ADS / Reload Satellite Buttons in Walk Mode */}
        {mode === 'walk' && onFire && (
          <button
            type="button"
            aria-label="Fire weapon"
            onPointerDown={(e) => {
              e.stopPropagation();
              onFire();
            }}
            className="pointer-events-auto absolute bottom-16 right-16 w-14 h-14 rounded-full flex flex-col items-center justify-center text-[#f6efe2] touch-none cursor-pointer active:scale-95"
            style={{
              backgroundColor: 'rgba(180, 62, 42, 0.88)',
              border: '1.5px solid rgba(255, 235, 210, 0.55)',
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.45)',
            }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="7" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
            <span className="text-[8px] font-bold uppercase tracking-wider leading-none mt-0.5">Fire</span>
          </button>
        )}

        {mode === 'walk' && onToggleAim && (
          <button
            type="button"
            aria-label="Toggle aim down sights"
            onPointerDown={(e) => {
              e.stopPropagation();
              onToggleAim();
            }}
            className="pointer-events-auto absolute top-0 right-14 w-12 h-12 rounded-full flex flex-col items-center justify-center touch-none cursor-pointer active:scale-95"
            style={{
              backgroundColor: isAiming ? '#e6a145' : 'rgba(14, 19, 16, 0.78)',
              color: isAiming ? '#141a16' : '#f6efe2',
              border: '1px solid rgba(244, 232, 206, 0.3)',
              boxShadow: '0 6px 16px rgba(0, 0, 0, 0.38)',
            }}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.1">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
            </svg>
            <span className="text-[8px] font-bold uppercase tracking-wider leading-none mt-0.5">ADS</span>
          </button>
        )}

        {mode === 'walk' && onReload && (
          <button
            type="button"
            aria-label="Reload weapon"
            onPointerDown={(e) => {
              e.stopPropagation();
              onReload();
            }}
            className="pointer-events-auto absolute top-14 right-0 w-11 h-11 rounded-full flex items-center justify-center text-[#f6efe2] touch-none cursor-pointer active:scale-95"
            style={{
              backgroundColor: 'rgba(14, 19, 16, 0.78)',
              border: '1px solid rgba(244, 232, 206, 0.28)',
              boxShadow: '0 6px 16px rgba(0, 0, 0, 0.38)',
            }}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.1">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        )}

        {/* Secondary Action Button: Walk Sprint / Drive Brake+Rev / Canoe Reverse */}
        <button
          type="button"
          aria-label={mode === 'drive' ? 'Brake or Reverse' : mode === 'canoe' ? 'Reverse paddle' : 'Sprint'}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (mode === 'walk') {
              manualSprintRef.current = true;
              setSprintHeld(true);
              syncSprint();
            } else {
              pedalThrottleRef.current = -0.9;
              setSprintHeld(true);
              emitCombinedMove(stickVecRef.current.turn, stickVecRef.current.throttle);
            }
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            if (mode === 'walk') {
              manualSprintRef.current = false;
              setSprintHeld(false);
              syncSprint();
            } else {
              pedalThrottleRef.current = 0;
              setSprintHeld(false);
              emitCombinedMove(stickVecRef.current.turn, stickVecRef.current.throttle);
            }
          }}
          onPointerCancel={() => {
            manualSprintRef.current = false;
            pedalThrottleRef.current = 0;
            setSprintHeld(false);
            syncSprint();
            emitCombinedMove(stickVecRef.current.turn, stickVecRef.current.throttle);
          }}
          className="pointer-events-auto absolute bottom-2 right-16 w-[48px] h-[48px] rounded-full flex flex-col items-center justify-center touch-none cursor-pointer transition-transform active:scale-95"
          style={{
            backgroundColor: isSprintActive ? '#e6a145' : 'rgba(14, 19, 16, 0.78)',
            color: isSprintActive ? '#141a16' : '#f6efe2',
            border: '1px solid rgba(244, 232, 206, 0.28)',
            boxShadow: '0 6px 16px rgba(0, 0, 0, 0.38)',
          }}
        >
          {mode === 'walk' ? (
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.1">
              <path d="M13 4v7l5 3" />
              <path d="M7 13l4-2 2-5" />
              <path d="M5 20l4-5 3 2 4 3" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.1">
              <path d="M12 5v14" />
              <path d="M5 12l7 7 7-7" />
            </svg>
          )}
          <span className="text-[8px] font-semibold uppercase tracking-wider leading-none mt-0.5">
            {mode === 'walk' ? 'Run' : 'Rev'}
          </span>
        </button>

        {/* Drive Turbo / Boost satellite button */}
        {mode === 'drive' && (
          <button
            type="button"
            aria-label="Turbo boost"
            onPointerDown={(e) => {
              e.stopPropagation();
              manualSprintRef.current = true;
              setSprintHeld(true);
              syncSprint();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              manualSprintRef.current = false;
              setSprintHeld(false);
              syncSprint();
            }}
            onPointerCancel={() => {
              manualSprintRef.current = false;
              setSprintHeld(false);
              syncSprint();
            }}
            className="pointer-events-auto absolute top-6 right-1 w-12 h-12 rounded-full flex flex-col items-center justify-center touch-none cursor-pointer active:scale-95"
            style={{
              backgroundColor: sprintHeld ? '#f0b35e' : 'rgba(14, 19, 16, 0.78)',
              color: sprintHeld ? '#141a16' : '#f0b35e',
              border: '1px solid rgba(230, 161, 69, 0.45)',
              boxShadow: '0 6px 16px rgba(0, 0, 0, 0.38)',
            }}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M13 2L4 14h7l-1 8 10-12h-7l0-8z" />
            </svg>
            <span className="text-[8px] font-bold uppercase tracking-wider leading-none mt-0.5">Boost</span>
          </button>
        )}

        {/* Hero Primary Action: Walk Jump / Drive Gas / Canoe Stroke */}
        <button
          type="button"
          aria-label={mode === 'drive' ? 'Accelerate' : mode === 'canoe' ? 'Paddle forward' : 'Jump'}
          onPointerDown={(e) => {
            e.stopPropagation();
            setPrimaryPressed(true);
            if (mode === 'walk') {
              onAction('jump', true);
            } else {
              pedalThrottleRef.current = 1;
              emitCombinedMove(stickVecRef.current.turn, stickVecRef.current.throttle);
            }
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            setPrimaryPressed(false);
            if (mode === 'walk') {
              onAction('jump', false);
            } else {
              pedalThrottleRef.current = 0;
              emitCombinedMove(stickVecRef.current.turn, stickVecRef.current.throttle);
            }
          }}
          onPointerCancel={() => {
            setPrimaryPressed(false);
            if (mode === 'walk') {
              onAction('jump', false);
            } else {
              pedalThrottleRef.current = 0;
              emitCombinedMove(stickVecRef.current.turn, stickVecRef.current.throttle);
            }
          }}
          className="pointer-events-auto absolute bottom-1 right-0 w-[56px] h-[56px] rounded-full flex flex-col items-center justify-center text-[#141a16] touch-none cursor-pointer transition-transform"
          style={{
            backgroundColor: primaryPressed ? '#f5be6d' : '#e6a145',
            transform: primaryPressed ? 'scale(0.93)' : 'scale(1)',
            border: '2px solid rgba(255, 248, 232, 0.55)',
            boxShadow: '0 8px 22px rgba(0, 0, 0, 0.48)',
          }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 19V5" />
            <path d="M5 12l7-7 7 7" />
          </svg>
          <span className="text-[9px] font-bold uppercase tracking-wider leading-none">
            {mode === 'drive' ? 'Gas' : mode === 'canoe' ? 'Row' : 'Jump'}
          </span>
        </button>
      </div>
    </div>
  );
};
