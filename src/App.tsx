import { useEffect, useRef, useState } from 'react';
import { DefaultLoadingManager } from 'three';
import { GameHud } from './components/GameHud';
import { PauseModal } from './components/PauseModal';
import { StudioDock } from './components/StudioDock';
import { TitleOverlay } from './components/TitleOverlay';
import { TouchControls } from './components/TouchControls';
import { RendaSceneEngine } from './world/RendaSceneEngine';
import type {
  AtmospherePreset,
  BuildingDesignRecipe,
  CameraPerspective,
  ImportedModelState,
  MaterialRecipe,
  PlayMode,
  WorldHudSnapshot,
  RenderQuality,
} from './world/types';

const INITIAL_HUD: WorldHudSnapshot = {
  phase: 'title',
  mode: 'walk',
  playerX: 168,
  playerZ: 38.5,
  playerHeading: 0.4142,
  camYaw: 0.4142,
  elevationM: 37.8,
  speedKmh: 0,
  distanceTraveledM: 0,
  discoveredIds: [],
  totalLandmarks: 10,
  nearestLandmark: {
    id: 'church',
    name: 'Renda Lutheran Church',
    distanceM: 72,
  },
  activeMission: null,
  deliveriesCompleted: 0,
  score: 0,
  bestScore: 0,
  activeBanner: null,
  selectedBuilding: null,
  importedModel: null,
  cameraPerspective: 'first_person',
  atmosphere: 'overcast_rain',
  compassBearingDeg: 336,
  adsAlpha: 0,
  ammoInMag: 30,
  ammoReserve: 180,
  isReloading: false,
  fireMode: 'SEMI',
  stamina: 1,
  crouching: false,
  leaning: 0,
  pointerLocked: false,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<RendaSceneEngine | null>(null);
  const [hud, setHud] = useState<WorldHudSnapshot>(INITIAL_HUD);
  const [muted, setMuted] = useState(false);
  const [atmosphere, setAtmosphere] = useState<AtmospherePreset>('overcast_rain');
  const [tacticalDrawerOpen, setTacticalDrawerOpen] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [quality, setQuality] = useState<RenderQuality>('balanced');
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let engine: RendaSceneEngine | null = null;
    let initialAssetsLoaded = false;
    const previousProgress = DefaultLoadingManager.onProgress;
    const previousLoad = DefaultLoadingManager.onLoad;
    DefaultLoadingManager.onProgress = (url, loaded, total) => {
      previousProgress?.(url, loaded, total);
      if (!initialAssetsLoaded) setLoadProgress(Math.round(loaded / Math.max(total, 1) * 100));
    };
    DefaultLoadingManager.onLoad = () => {
      previousLoad?.();
      initialAssetsLoaded = true;
      engine?.finishLoading();
      setLoading(false);
    };
    // Paint the loading screen before the synchronous terrain/geometry preparation.
    const initialization = window.setTimeout(() => { try {
      engine = new RendaSceneEngine(container, (snapshot) => {
        setHud(snapshot);
        if (snapshot.atmosphere) {
          setAtmosphere(snapshot.atmosphere);
        }
      });
      engineRef.current = engine;
      setQuality(engine.getRenderQuality());

      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        engine.startGame();
      } else {
        document.body.dataset.state = 'title';
      }
    } catch (err) {
      setWebglError(err instanceof Error ? err.message : 'Unable to initialize 3D viewport.');
      setLoading(false);
    }
    }, 50);

    return () => {
      window.clearTimeout(initialization);
      DefaultLoadingManager.onProgress = previousProgress;
      DefaultLoadingManager.onLoad = previousLoad;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Enter or Space starts from Title Screen
  useEffect(() => {
    if (hud.phase !== 'title' || loading) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('button, input, select, textarea')) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        engineRef.current?.startGame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hud.phase, loading]);

  // Tab opens navigation from the scene; the open dialog owns keyboard focus.
  useEffect(() => {
    if (hud.phase !== 'playing') {
      setTacticalDrawerOpen(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || tacticalDrawerOpen || (e.target as HTMLElement)?.closest('button, input, select, textarea, [contenteditable="true"]')) return;
      if (e.code === 'Tab' && hud.mode !== 'studio') {
        e.preventDefault();
        setTacticalDrawerOpen((prev) => {
          const next = !prev;
          if (next && document.pointerLockElement) {
            document.exitPointerLock?.();
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hud.phase, hud.mode, tacticalDrawerOpen]);

  const handleStart = () => {
    (document.activeElement as HTMLElement | null)?.blur();
    engineRef.current?.startGame();
  };

  const handleSetQuality = (next: RenderQuality) => {
    engineRef.current?.setRenderQuality(next);
    setQuality(next);
  };

  const handleSelectMode = (mode: PlayMode) => {
    if (mode === 'studio') setTacticalDrawerOpen(false);
    engineRef.current?.setMode(mode);
  };

  const handleTeleportLandmark = (id: string) => {
    engineRef.current?.teleportToLandmark(id);
  };

  const handleToggleMute = () => {
    if (!engineRef.current) return;
    setMuted(engineRef.current.toggleMute());
  };

  const handlePause = () => {
    setTacticalDrawerOpen(false);
    engineRef.current?.setPhase('paused');
  };

  const handleResume = () => {
    engineRef.current?.setPhase('playing');
  };

  const handleRestart = () => {
    setTacticalDrawerOpen(false);
    engineRef.current?.restartGame();
  };

  const handleReturnTitle = () => {
    setTacticalDrawerOpen(false);
    engineRef.current?.setPhase('title');
  };

  const handleSelectNearest = (): number | null => {
    return engineRef.current?.selectNearestBuilding() ?? null;
  };

  const handleApplyMaterial = (
    recipe: MaterialRecipe,
    scope: 'selected_wall' | 'selected_roof' | 'all_walls' | 'all_roofs' | 'roads'
  ) => {
    engineRef.current?.applyMaterialRecipe(recipe, scope);
  };

  const handleApplyBuildingDesign = (buildingId: number, design: BuildingDesignRecipe) => {
    engineRef.current?.applyBuildingDesign(buildingId, design);
  };

  const handleResetBuildingDesign = (buildingId: number) => {
    engineRef.current?.resetBuildingDesign(buildingId);
  };

  const handleSetAtmosphere = (preset: AtmospherePreset) => {
    setAtmosphere(preset);
    engineRef.current?.setAtmosphere(preset);
  };

  const handleSetPerspective = (next: CameraPerspective) => {
    engineRef.current?.setCameraPerspective(next);
  };

  const handleImportGlb = async (file: File) => {
    await engineRef.current?.importGlbFile(file);
  };

  const handleUpdateImported = (patch: Partial<ImportedModelState>) => {
    engineRef.current?.updateImportedModel(patch);
  };

  const handleTouchMove = (turn: number, throttle: number) => {
    engineRef.current?.setTouchMove(turn, throttle);
  };

  const handleTouchAction = (action: 'jump' | 'sprint', active: boolean) => {
    engineRef.current?.setTouchAction(action, active);
  };

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#161c18]">
      {/* Dedicated isolated WebGL mount container */}
      <div
        ref={mountRef}
        data-testid="renda-viewport"
        className="w-full h-full"
        aria-label="Renda 3D Interactive World"
      />

      {webglError && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-[#161c18]">
          <div className="max-w-md rounded-xl p-6 bg-[#1e2620] border border-white/15">
            <h1 className="font-display text-xl font-bold text-[#f6efe2]">3D Viewport Unavailable</h1>
            <p className="text-sm text-[#b7ae9c] mt-2">{webglError}</p>
          </div>
        </div>
      )}

      {loading && !webglError && (
        <div className="r-loading-screen" role="status" aria-live="polite">
          <span className="r-eyebrow">RENDA / ABAVA VALLEY</span>
          <strong>PREPARING THE VALLEY</strong>
          <div className="r-loading-track" role="progressbar" aria-label="Loading world" aria-valuemin={0} aria-valuemax={100} aria-valuenow={loadProgress}>
            <span style={{ width: `${Math.max(3, loadProgress)}%` }} />
          </div>
          <span className="r-loading-caption">{loadProgress}%</span>
        </div>
      )}

      {hud.phase === 'title' && !loading && !webglError && (
        <TitleOverlay bestScore={hud.bestScore} onStart={handleStart} quality={quality} onSetQuality={handleSetQuality} />
      )}

      {hud.phase === 'playing' && !loading && !webglError && (
        <>
          <GameHud
            hud={hud}
            muted={muted}
            drawerOpen={tacticalDrawerOpen}
            atmosphere={atmosphere}
            onToggleDrawer={() => {
              setTacticalDrawerOpen((prev) => {
                const next = !prev;
                if (next && document.pointerLockElement) {
                  document.exitPointerLock?.();
                }
                return next;
              });
            }}
            onCloseDrawer={() => setTacticalDrawerOpen(false)}
            onSelectMode={handleSelectMode}
            onSetPerspective={handleSetPerspective}
            onSetAtmosphere={handleSetAtmosphere}
            onTeleportLandmark={handleTeleportLandmark}
            onToggleMute={handleToggleMute}
            onPause={handlePause}
            onRestart={handleRestart}
          />
          <TouchControls
            mode={hud.mode}
            selectedBuilding={hud.selectedBuilding}
            isAiming={(hud.adsAlpha ?? 0) > 0.5}
            onMove={handleTouchMove}
            onAction={handleTouchAction}
            onLook={(dx, dy) => engineRef.current?.applyTouchLook(dx, dy)}
            onLookEnd={() => engineRef.current?.endTouchLook()}
            onTapWorld={(cx, cy) => engineRef.current?.tapWorldAt(cx, cy)}
            onOpenStudio={() => handleSelectMode('studio')}
            onFire={() => engineRef.current?.fireWeapon()}
            onToggleAim={() => engineRef.current?.setAiming((hud.adsAlpha ?? 0) <= 0.5)}
            onReload={() => engineRef.current?.reloadWeapon()}
          />
          {hud.mode === 'studio' && (
            <StudioDock
              hud={hud}
              atmosphere={atmosphere}
              onExitStudio={handleSelectMode}
              onSelectNearest={handleSelectNearest}
              onApplyMaterial={handleApplyMaterial}
              onApplyBuildingDesign={handleApplyBuildingDesign}
              onResetBuildingDesign={handleResetBuildingDesign}
              onSetAtmosphere={handleSetAtmosphere}
              onImportGlb={handleImportGlb}
              onUpdateImported={handleUpdateImported}
            />
          )}
        </>
      )}

      {hud.phase === 'paused' && (
        <PauseModal
          hud={hud}
          onResume={handleResume}
          onRestart={handleRestart}
          onReturnTitle={handleReturnTitle}
          quality={quality}
          onSetQuality={handleSetQuality}
        />
      )}
    </main>
  );
}
