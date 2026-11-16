import React, { useRef, useState } from 'react';
import { ROAD_PRESETS, ROOF_PRESETS, WALL_PRESETS } from '../world/materialPresets';
import { formatLatLon, normalizeBuildingDesign } from '../world/rendaMath';
import worldRaw from '../data/rendaWorld.json';
import type {
  AtmospherePreset,
  BuildingDesignRecipe,
  ChimneyStyle,
  DoorPlacement,
  DoorStyle,
  ImportedModelState,
  MaterialRecipe,
  PlayMode,
  PorchStyle,
  PrecisionMode,
  ReferenceImagePayload,
  RendaWorldDataset,
  RoofStyle,
  TrimStyle,
  WindowMullionStyle,
  WindowPattern,
  WindowStyle,
  WorldHudSnapshot,
} from '../world/types';

const WORLD = worldRaw as unknown as RendaWorldDataset;

interface StudioDockProps {
  hud: WorldHudSnapshot;
  atmosphere: AtmospherePreset;
  onExitStudio: (mode: PlayMode) => void;
  onSelectNearest: () => number | null;
  onApplyMaterial: (
    recipe: MaterialRecipe,
    scope: 'selected_wall' | 'selected_roof' | 'all_walls' | 'all_roofs' | 'roads'
  ) => void;
  onApplyBuildingDesign: (buildingId: number, design: BuildingDesignRecipe) => void;
  onResetBuildingDesign: (buildingId: number) => void;
  onSetAtmosphere: (preset: AtmospherePreset) => void;
  onImportGlb: (file: File) => Promise<void>;
  onUpdateImported: (patch: Partial<ImportedModelState>) => void;
}

type StudioTab = 'restyle' | 'materials' | 'import' | 'atmosphere';
type ApplyScope = 'selected_wall' | 'selected_roof' | 'all_walls' | 'all_roofs' | 'roads';

interface RefPreview {
  id: string;
  previewUrl: string;
  payload: ReferenceImagePayload;
}

const RENDA_PHOTO_REFS = [
  {
    id: 'church',
    label: 'Renda Church',
    url: '/assets/refs/church.jpg',
    prompt: 'Warm cream limewashed Lutheran facade with terracotta roof, dark slate spire trim, and arched windows',
  },
  {
    id: 'manor',
    label: 'Lielrenda Manor',
    url: '/assets/refs/manor.jpg',
    prompt: 'Ochre-sand manor plaster walls with deep burgundy metal roof, crisp white multi-pane windows, and trim',
  },
  {
    id: 'water_tower',
    label: 'Water Tower',
    url: '/assets/refs/water_tower.jpg',
    prompt: 'Pale cream brick and weathered concrete industrial tower facade with dark steel catwalk accents',
  },
  {
    id: 'bridge',
    label: 'P120 Bridge',
    url: '/assets/refs/bridge_p120.jpg',
    prompt: 'Coursed fieldstone masonry base with pale concrete upper plaster and galvanized grey roof',
  },
  {
    id: 'ivande',
    label: 'Īvande Rumba',
    url: '/assets/refs/ivande_rumba.jpg',
    prompt: 'Rustic Kurzeme riverside dolomite stone lower walls, dark weathered timber gable, and mossy accents',
  },
  {
    id: 'panorama',
    label: 'Renda Village',
    url: '/assets/refs/panorama.jpg',
    prompt: 'Authentic Kurzeme countryside house with warm timber siding, white window trim, and clay tile roof',
  },
] as const;

async function compressImageFile(file: File, highRes = true): Promise<RefPreview> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read reference image'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Invalid image file'));
    el.src = dataUrl;
  });

  const maxDim = highRes ? 1024 : 640;
  const quality = highRes ? 0.88 : 0.82;
  const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
  const w = Math.max(1, Math.round((img.width || maxDim) * scale));
  const h = Math.max(1, Math.round((img.height || maxDim) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Image processing unavailable');
  }
  ctx.drawImage(img, 0, 0, w, h);
  const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = compressedDataUrl.replace(/^data:image\/jpeg;base64,/, '');

  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    previewUrl: compressedDataUrl,
    payload: {
      mimeType: 'image/jpeg',
      dataBase64: base64,
    },
  };
}

export const StudioDock: React.FC<StudioDockProps> = ({
  hud,
  atmosphere,
  onExitStudio,
  onSelectNearest,
  onApplyMaterial,
  onApplyBuildingDesign,
  onResetBuildingDesign,
  onSetAtmosphere,
  onImportGlb,
  onUpdateImported,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<StudioTab>('restyle');

  // AI Photo Restyle state
  const [precisionMode, setPrecisionMode] = useState<PrecisionMode>('precise');
  const [autoApplyUpload, setAutoApplyUpload] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [refImages, setRefImages] = useState<RefPreview[]>([]);
  const [restylePrompt, setRestylePrompt] = useState(
    'Match exact window arrangement, mullions, door, roof profile, and architectural trim from the reference photo'
  );
  const [restyling, setRestyling] = useState(false);
  const [restyleError, setRestyleError] = useState<string | null>(null);
  const [lastDesign, setLastDesign] = useState<BuildingDesignRecipe | null>(null);
  const [loadingRefId, setLoadingRefId] = useState<string | null>(null);
  const refPhotoInputRef = useRef<HTMLInputElement | null>(null);

  // Materials synthesis state
  const [scope, setScope] = useState<ApplyScope>('selected_wall');
  const [prompt, setPrompt] = useState('weathered Kurzeme pine clapboard with moss');
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthError, setSynthError] = useState<string | null>(null);
  const [lastRecipe, setLastRecipe] = useState<MaterialRecipe | null>(null);

  // GLB importer state
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const coords = hud.selectedBuilding
    ? formatLatLon(WORLD, hud.selectedBuilding.cx, hud.selectedBuilding.cz)
    : formatLatLon(WORLD, hud.playerX, hud.playerZ);

  const activeDesignRaw = hud.selectedBuilding ? (hud.selectedBuilding.customDesign ?? null) : lastDesign;
  const activeNormalized = activeDesignRaw
    ? normalizeBuildingDesign(activeDesignRaw, hud.selectedBuilding?.levels ?? 1)
    : null;

  const runRestyleApi = async (
    overrideImages?: RefPreview[],
    overridePrompt?: string,
    overrideMode?: PrecisionMode
  ) => {
    if (restyling) return;

    let targetId = hud.selectedBuilding?.id ?? null;
    if (targetId === null) {
      targetId = onSelectNearest();
    }
    if (targetId === null) {
      setRestyleError('Tap any building in 3D to select it first.');
      return;
    }

    const imgsToSend = overrideImages ?? refImages;
    const promptToSend = (overridePrompt ?? restylePrompt).trim();
    const modeToSend = overrideMode ?? precisionMode;

    if (!promptToSend && imgsToSend.length === 0) {
      setRestyleError('Upload a reference photo or describe how to restyle this building.');
      return;
    }

    setRestyling(true);
    setRestyleError(null);
    try {
      const res = await fetch('/api/studio/restyle-from-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptToSend,
          precisionMode: modeToSend,
          images: imgsToSend.map((r) => r.payload),
          buildingContext: {
            name: hud.selectedBuilding?.name ?? 'Nearest Renda House',
            kind: hud.selectedBuilding?.kind ?? 'house',
            levels: hud.selectedBuilding?.levels ?? 1,
            widthM: hud.selectedBuilding?.widthM ?? 12,
            depthM: hud.selectedBuilding?.depthM ?? 8,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI restyle failed');
      }
      const design = data as BuildingDesignRecipe;
      setLastDesign(design);
      onApplyBuildingDesign(targetId, design);
    } catch (err) {
      setRestyleError(err instanceof Error ? err.message : 'Unable to restyle 3D building');
    } finally {
      setRestyling(false);
    }
  };

  const handleReferenceFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - refImages.length);
    if (files.length === 0) return;
    setRestyleError(null);
    try {
      const processed = await Promise.all(
        files.map((f) => compressImageFile(f, precisionMode === 'precise'))
      );
      const nextImages = [...refImages, ...processed].slice(0, 3);
      setRefImages(nextImages);
      if (autoApplyUpload) {
        await runRestyleApi(nextImages);
      }
    } catch (err) {
      setRestyleError(err instanceof Error ? err.message : 'Unable to load selected photo.');
    } finally {
      e.target.value = '';
    }
  };

  const handleUseRendaPhotoRef = async (preset: (typeof RENDA_PHOTO_REFS)[number]) => {
    if (loadingRefId || restyling) return;
    setLoadingRefId(preset.id);
    setRestyleError(null);
    setRestylePrompt(preset.prompt);
    try {
      const res = await fetch(preset.url);
      if (!res.ok) throw new Error('Unable to load local Renda reference photo');
      const blob = await res.blob();
      const file = new File([blob], `${preset.id}.jpg`, { type: blob.type || 'image/jpeg' });
      const processed = await compressImageFile(file, precisionMode === 'precise');
      const nextImages = [...refImages.slice(-2), processed].slice(0, 3);
      setRefImages(nextImages);
      if (autoApplyUpload) {
        await runRestyleApi(nextImages, preset.prompt);
      }
    } catch (err) {
      setRestyleError(err instanceof Error ? err.message : 'Could not load Renda reference photo');
    } finally {
      setLoadingRefId(null);
    }
  };

  const handleRestyleBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    await runRestyleApi();
  };

  const patchDesignLive = (patch: Partial<BuildingDesignRecipe>) => {
    if (!hud.selectedBuilding || !activeNormalized) return;
    const updated: BuildingDesignRecipe = {
      ...activeNormalized,
      ...patch,
    };
    setLastDesign(updated);
    onApplyBuildingDesign(hud.selectedBuilding.id, updated);
  };

  const handleSynthesize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || synthesizing) return;
    setSynthesizing(true);
    setSynthError(null);
    try {
      const targetSurface =
        scope === 'selected_roof' || scope === 'all_roofs'
          ? 'roof'
          : scope === 'roads'
            ? 'road'
            : 'wall';
      const res = await fetch('/api/studio/synthesize-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), targetSurface }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Synthesis failed');
      }
      const recipe: MaterialRecipe = {
        id: `synth_${Date.now()}`,
        name: data.name,
        pattern: data.pattern,
        primaryHex: data.primaryHex,
        secondaryHex: data.secondaryHex,
        accentHex: data.accentHex,
        roughness: data.roughness,
        metalness: data.metalness,
        bumpScale: data.bumpScale,
        repeatX: data.repeatX,
        repeatY: data.repeatY,
        weathering: data.weathering,
        grain: data.grain,
        notes: data.notes,
      };
      setLastRecipe(recipe);
      onApplyMaterial(recipe, scope);
    } catch (err) {
      setSynthError(err instanceof Error ? err.message : 'Unable to synthesize material');
    } finally {
      setSynthesizing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      await onImportGlb(file);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not parse 3D file (.glb / .gltf)');
    } finally {
      setImporting(false);
    }
  };

  const activePresets =
    scope === 'selected_roof' || scope === 'all_roofs'
      ? ROOF_PRESETS
      : scope === 'roads'
        ? ROAD_PRESETS
        : WALL_PRESETS;

  return (
    <div className="fixed inset-x-0 bottom-0 md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:w-[min(920px,94vw)] z-20 pointer-events-none flex flex-col items-center">
      {/* Top Action Row above sheet */}
      <div className="pointer-events-auto flex items-center gap-2 mb-2 px-3">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-medium text-[#f6efe2] cursor-pointer transition-colors whitespace-nowrap"
          style={{
            backgroundColor: 'rgba(18, 24, 20, 0.92)',
            border: '1px solid rgba(244, 232, 206, 0.18)',
          }}
        >
          {collapsed ? 'Open Studio Sheet' : 'View 3D'}
        </button>

        <button
          type="button"
          onClick={() => onExitStudio('walk')}
          className="min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold text-[#141a16] bg-[#e6a145] hover:bg-[#f0b35e] cursor-pointer transition-colors whitespace-nowrap"
        >
          Back to Play
        </button>
      </div>

      {!collapsed && (
        <div
          className="pointer-events-auto w-full rounded-t-2xl md:rounded-xl p-4 pb-safe max-h-[60dvh] md:max-h-[52vh] overflow-y-auto"
          style={{
            backgroundColor: 'rgba(18, 24, 20, 0.94)',
            borderTop: '1px solid rgba(244, 232, 206, 0.18)',
            borderLeft: '1px solid rgba(244, 232, 206, 0.14)',
            borderRight: '1px solid rgba(244, 232, 206, 0.14)',
            borderBottom: '1px solid rgba(244, 232, 206, 0.14)',
            boxShadow: '0 -12px 36px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Mobile grab affordance */}
          <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-3 md:hidden" aria-hidden="true" />

          {/* Header: Selected Building + Scrollable Single-Line Tabs */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-3 border-b border-white/10">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#ddd5c5]">
              {hud.selectedBuilding ? (
                <>
                  <span>
                    Selected: <strong className="text-[#f0b35e]">{hud.selectedBuilding.name}</strong> ·{' '}
                    {hud.selectedBuilding.widthM}×{hud.selectedBuilding.depthM}m ·{' '}
                    {hud.selectedBuilding.levels}L
                  </span>
                  {hud.selectedBuilding.hasCustomDesign && (
                    <button
                      type="button"
                      onClick={() => {
                        onResetBuildingDesign(hud.selectedBuilding!.id);
                        setLastDesign(null);
                        setShowDetails(false);
                      }}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium text-[#f6efe2] bg-white/10 hover:bg-white/20 cursor-pointer whitespace-nowrap"
                    >
                      Reset House
                    </button>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span>Tap any house in 3D to select &amp; restyle</span>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectNearest();
                    }}
                    className="px-2.5 py-1 rounded-md text-xs font-medium text-[#141a16] bg-[#e6a145] hover:bg-[#f0b35e] cursor-pointer whitespace-nowrap"
                  >
                    Select Nearest House
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 sm:flex items-center gap-1 bg-black/30 p-1 rounded-lg w-full sm:w-auto shrink-0">
              {(
                [
                  { id: 'restyle', label: 'AI Photo Restyle', shortLabel: 'AI Photo' },
                  { id: 'materials', label: 'Materials', shortLabel: 'Materials' },
                  { id: 'import', label: 'Import .glb', shortLabel: '.glb' },
                  { id: 'atmosphere', label: 'Sky & GPS', shortLabel: 'Sky & GPS' },
                ] as { id: StudioTab; label: string; shortLabel: string }[]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`min-h-[36px] px-1.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-medium cursor-pointer transition-colors whitespace-nowrap text-center ${
                    tab === t.id
                      ? 'bg-[#e6a145] text-[#141a16] font-semibold'
                      : 'text-[#ddd5c5] hover:text-white'
                  }`}
                >
                  <span className="sm:hidden">{t.shortLabel}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {tab === 'restyle' && (
            <form onSubmit={handleRestyleBuilding} className="pt-3 space-y-3">
              {/* Precision Mode + Auto-Rebuild Controls + Photo Upload */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    role="group"
                    aria-label="Architectural reconstruction mode"
                    className="inline-flex items-center bg-black/35 p-0.5 rounded-lg border border-white/10"
                  >
                    <button
                      type="button"
                      onClick={() => setPrecisionMode('precise')}
                      aria-pressed={precisionMode === 'precise'}
                      className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                        precisionMode === 'precise'
                          ? 'bg-[#e6a145] text-[#141a16]'
                          : 'text-[#ddd5c5] hover:text-white'
                      }`}
                    >
                      Precise Match
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrecisionMode('stylized')}
                      aria-pressed={precisionMode === 'stylized'}
                      className={`min-h-[36px] px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                        precisionMode === 'stylized'
                          ? 'bg-[#e6a145] text-[#141a16] font-semibold'
                          : 'text-[#ddd5c5] hover:text-white'
                      }`}
                    >
                      Stylized Indie
                    </button>
                  </div>

                  <label className="inline-flex items-center gap-1.5 text-xs text-[#ddd5c5] cursor-pointer select-none min-h-[36px] px-2">
                    <input
                      type="checkbox"
                      checked={autoApplyUpload}
                      onChange={(e) => setAutoApplyUpload(e.target.checked)}
                      className="w-4 h-4 accent-[#e6a145] cursor-pointer"
                    />
                    <span>Auto-rebuild on upload</span>
                  </label>
                </div>

                {activeNormalized && hud.selectedBuilding && (
                  <button
                    type="button"
                    aria-expanded={showDetails}
                    onClick={() => setShowDetails((s) => !s)}
                    className="min-h-[36px] px-3 py-1 rounded-md text-xs font-medium text-[#f0b35e] bg-white/8 hover:bg-white/15 border border-[#e6a145]/35 cursor-pointer transition-colors whitespace-nowrap"
                  >
                    {showDetails ? 'Hide Precise Details' : 'Fine-Tune Details'}
                  </button>
                )}
              </div>

              {/* Reference image uploader + live previews + inspiration */}
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  ref={refPhotoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleReferenceFiles}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => refPhotoInputRef.current?.click()}
                  disabled={refImages.length >= 3 || restyling}
                  className="min-h-[44px] px-3.5 py-2 rounded-lg text-xs font-semibold text-[#f6efe2] bg-white/10 hover:bg-white/15 border border-white/15 disabled:opacity-45 cursor-pointer transition-colors whitespace-nowrap"
                >
                  {restyling
                    ? 'AI Analyzing Photo...'
                    : refImages.length > 0
                      ? `Add Photo (${refImages.length}/3)`
                      : 'Upload Reference Photo'}
                </button>

                {refImages.map((img) => (
                  <div
                    key={img.id}
                    className="relative w-12 h-12 rounded-lg overflow-hidden border border-white/20 shrink-0"
                  >
                    <img
                      src={img.previewUrl}
                      alt="Uploaded building reference"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Remove reference photo"
                      onClick={() => setRefImages((prev) => prev.filter((item) => item.id !== img.id))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/80 text-white text-[10px] leading-none flex items-center justify-center cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {/* Quick Style Prompts */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    {
                      label: 'Nordic Loft',
                      text: 'Modern 2-story Scandinavian timber building with tall split-mullion windows, offset glazed door, canopy, and dark standing seam roof',
                    },
                    {
                      label: 'Brick + Quoins',
                      text: 'Kurzeme red brick building with stone quoins, arched 6-pane windows, granite plinth, twin dormers, and brick chimney',
                    },
                    {
                      label: 'Manor Portico',
                      text: 'Ochre limewashed 2-story manor with paired 6-pane windows, pilasters, column portico, double oak doors, and burgundy roof',
                    },
                  ].map((idea) => (
                    <button
                      key={idea.label}
                      type="button"
                      onClick={() => setRestylePrompt(idea.text)}
                      className="min-h-[36px] px-2.5 py-1 rounded-md text-[11px] text-[#ddd5c5] bg-white/5 hover:bg-white/15 border border-white/10 cursor-pointer whitespace-nowrap"
                    >
                      {idea.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Real Renda Reference Photo Presets */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-[11px] text-[#b7ae9c] whitespace-nowrap shrink-0">
                  Real Renda Photos:
                </span>
                {RENDA_PHOTO_REFS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={loadingRefId !== null || restyling}
                    onClick={() => handleUseRendaPhotoRef(preset)}
                    className="min-h-[40px] flex items-center gap-2 pr-2.5 pl-1 py-1 rounded-lg bg-[#101612] hover:bg-white/10 border border-white/12 text-[11px] text-[#ebe3d3] cursor-pointer transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                  >
                    <img
                      src={preset.url}
                      alt={preset.label}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded object-cover shrink-0"
                    />
                    <span>{loadingRefId === preset.id ? 'Loading...' : preset.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <label htmlFor="restyle-prompt" className="sr-only">
                  Describe how to restyle the selected building
                </label>
                <input
                  id="restyle-prompt"
                  type="text"
                  value={restylePrompt}
                  onChange={(e) => setRestylePrompt(e.target.value)}
                  placeholder="Optional notes (e.g. 6 paired windows, shutters, column porch, stone plinth, gambrel roof)..."
                  className="flex-1 min-h-[44px] px-3.5 py-2 rounded-lg text-sm md:text-xs text-[#f6efe2] bg-[#101612] border border-white/15 focus:outline-none focus:border-[#e6a145]"
                />
                <button
                  type="submit"
                  disabled={restyling}
                  className="min-h-[44px] px-5 py-2 rounded-lg text-xs font-bold text-[#141a16] bg-[#e6a145] hover:bg-[#f0b35e] disabled:opacity-50 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  {restyling
                    ? 'AI Rebuilding 3D...'
                    : hud.selectedBuilding
                      ? precisionMode === 'precise'
                        ? 'Precise Rebuild 3D'
                        : 'Restyle 3D Building'
                      : 'Pick Nearest & Rebuild'}
                </button>
              </div>

              {restyleError && <div className="text-xs text-red-400">{restyleError}</div>}

              {activeNormalized && (
                <div className="rounded-lg bg-black/25 border border-white/10 px-3 py-2 text-xs text-[#c7bfb0] space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong className="text-[#f0b35e]">{activeNormalized.designName}</strong> ·{' '}
                      <span className="font-mono-num text-[11px] text-[#ebe3d3]">
                        {activeNormalized.floors}F · {activeNormalized.windowCols}×
                        {activeNormalized.windowRows} {activeNormalized.windowPattern.replace('_', ' ')} ·{' '}
                        {activeNormalized.windowMullions.replace('_', ' ')} ·{' '}
                        {activeNormalized.roofStyle.replace('_', ' ')} ·{' '}
                        {activeNormalized.porchStyle.replace('_', ' ')}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono-num uppercase tracking-wider px-2 py-0.5 rounded bg-white/8 text-[#e6a145]">
                      {activeNormalized.source === 'gemini' ? 'Gemini AI Vision' : 'Smart Preset'} ·{' '}
                      {activeNormalized.precisionMode}
                    </span>
                  </div>
                  <div>{activeNormalized.designSummary}</div>
                </div>
              )}

              {/* Collapsible Live Precise Architectural Inspector */}
              {showDetails && activeNormalized && hud.selectedBuilding && (
                <div className="rounded-lg bg-[#101612] border border-white/12 p-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-[#ddd5c5]">
                  {/* Column 1: Dimensions & Roof */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#e6a145]">
                      Dimensions &amp; Roof
                    </div>
                    <label className="flex items-center justify-between gap-2">
                      <span>Roof Style</span>
                      <select
                        value={activeNormalized.roofStyle}
                        onChange={(e) => patchDesignLive({ roofStyle: e.target.value as RoofStyle })}
                        className="min-h-[34px] px-2 py-1 rounded bg-[#18201b] border border-white/15 text-[#f6efe2] text-xs"
                      >
                        <option value="steep_gable">Steep Gable</option>
                        <option value="pitched_hip">Pitched Hip</option>
                        <option value="gambrel">Gambrel Barn</option>
                        <option value="mansard">Mansard</option>
                        <option value="flat_modern">Flat Modern</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Wall H ({activeNormalized.heightScale.toFixed(2)}×)</span>
                      <input
                        type="range"
                        min="0.72"
                        max="1.95"
                        step="0.05"
                        value={activeNormalized.heightScale}
                        onChange={(e) => patchDesignLive({ heightScale: Number(e.target.value) })}
                        className="w-28 accent-[#e6a145]"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Width ({activeNormalized.widthScale.toFixed(2)}×)</span>
                      <input
                        type="range"
                        min="0.7"
                        max="1.6"
                        step="0.05"
                        value={activeNormalized.widthScale}
                        onChange={(e) => patchDesignLive({ widthScale: Number(e.target.value) })}
                        className="w-28 accent-[#e6a145]"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Depth ({activeNormalized.depthScale.toFixed(2)}×)</span>
                      <input
                        type="range"
                        min="0.7"
                        max="1.6"
                        step="0.05"
                        value={activeNormalized.depthScale}
                        onChange={(e) => patchDesignLive({ depthScale: Number(e.target.value) })}
                        className="w-28 accent-[#e6a145]"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Pitch ({activeNormalized.roofPitch.toFixed(2)}×)</span>
                      <input
                        type="range"
                        min="0.5"
                        max="1.95"
                        step="0.05"
                        value={activeNormalized.roofPitch}
                        onChange={(e) => patchDesignLive({ roofPitch: Number(e.target.value) })}
                        className="w-28 accent-[#e6a145]"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Eaves ({activeNormalized.overhangScale.toFixed(2)}×)</span>
                      <input
                        type="range"
                        min="1.0"
                        max="1.26"
                        step="0.02"
                        value={activeNormalized.overhangScale}
                        onChange={(e) => patchDesignLive({ overhangScale: Number(e.target.value) })}
                        className="w-28 accent-[#e6a145]"
                      />
                    </label>
                  </div>

                  {/* Column 2: Windows & Patterns */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#e6a145]">
                      Windows &amp; Joinery
                    </div>
                    <label className="flex items-center justify-between gap-2">
                      <span>Pattern</span>
                      <select
                        value={activeNormalized.windowPattern}
                        onChange={(e) => patchDesignLive({ windowPattern: e.target.value as WindowPattern })}
                        className="min-h-[34px] px-2 py-1 rounded bg-[#18201b] border border-white/15 text-[#f6efe2] text-xs"
                      >
                        <option value="uniform">Uniform Grid</option>
                        <option value="paired">Paired Windows</option>
                        <option value="grouped_bays">Grouped Bays</option>
                        <option value="ribbon">Ribbon Strip</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Window Style</span>
                      <select
                        value={activeNormalized.windowStyle}
                        onChange={(e) => patchDesignLive({ windowStyle: e.target.value as WindowStyle })}
                        className="min-h-[34px] px-2 py-1 rounded bg-[#18201b] border border-white/15 text-[#f6efe2] text-xs"
                      >
                        <option value="timber_framed">Timber Framed</option>
                        <option value="modern_panes">Modern Panes</option>
                        <option value="arched">Arched Top</option>
                        <option value="tall_minimal">Tall Minimal</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Mullions</span>
                      <select
                        value={activeNormalized.windowMullions}
                        onChange={(e) =>
                          patchDesignLive({ windowMullions: e.target.value as WindowMullionStyle })
                        }
                        className="min-h-[34px] px-2 py-1 rounded bg-[#18201b] border border-white/15 text-[#f6efe2] text-xs"
                      >
                        <option value="six_pane">6-Pane Grid</option>
                        <option value="cross">Cross Mullion</option>
                        <option value="vertical_split">Center Split</option>
                        <option value="none">Clear Glass</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Cols ({activeNormalized.windowCols})</span>
                      <input
                        type="range"
                        min="1"
                        max="8"
                        step="1"
                        value={activeNormalized.windowCols}
                        onChange={(e) => patchDesignLive({ windowCols: Number(e.target.value) })}
                        className="w-28 accent-[#e6a145]"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Rows ({activeNormalized.windowRows})</span>
                      <input
                        type="range"
                        min="1"
                        max="4"
                        step="1"
                        value={activeNormalized.windowRows}
                        onChange={(e) => patchDesignLive({ windowRows: Number(e.target.value) })}
                        className="w-28 accent-[#e6a145]"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Win W×H ({activeNormalized.windowWidthM.toFixed(1)}×{activeNormalized.windowHeightM.toFixed(1)}m)</span>
                      <input
                        type="range"
                        min="0.6"
                        max="2.2"
                        step="0.1"
                        value={activeNormalized.windowWidthM}
                        onChange={(e) => patchDesignLive({ windowWidthM: Number(e.target.value) })}
                        className="w-24 accent-[#e6a145]"
                      />
                    </label>
                  </div>

                  {/* Column 3: Doors, Porch & Small Trim */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[#e6a145]">
                      Doors, Porch &amp; Trim
                    </div>
                    <label className="flex items-center justify-between gap-2">
                      <span>Door</span>
                      <select
                        value={activeNormalized.doorStyle}
                        onChange={(e) => patchDesignLive({ doorStyle: e.target.value as DoorStyle })}
                        className="min-h-[34px] px-2 py-1 rounded bg-[#18201b] border border-white/15 text-[#f6efe2] text-xs"
                      >
                        <option value="single_panel">Single Panel</option>
                        <option value="double_manor">Double Manor</option>
                        <option value="glazed_modern">Glazed Sidelight</option>
                        <option value="arched_oak">Arched Oak</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Door Side</span>
                      <select
                        value={activeNormalized.doorPlacement}
                        onChange={(e) =>
                          patchDesignLive({ doorPlacement: e.target.value as DoorPlacement })
                        }
                        className="min-h-[34px] px-2 py-1 rounded bg-[#18201b] border border-white/15 text-[#f6efe2] text-xs"
                      >
                        <option value="center_front">Center Front</option>
                        <option value="offset_front">Offset Front</option>
                        <option value="side_wall">Side Wall</option>
                        <option value="none">No Door</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Porch</span>
                      <select
                        value={activeNormalized.porchStyle}
                        onChange={(e) =>
                          patchDesignLive({
                            porchStyle: e.target.value as PorchStyle,
                            addPorch: e.target.value !== 'none',
                          })
                        }
                        className="min-h-[34px] px-2 py-1 rounded bg-[#18201b] border border-white/15 text-[#f6efe2] text-xs"
                      >
                        <option value="timber_veranda">Timber Veranda</option>
                        <option value="column_portico">Column Portico</option>
                        <option value="modern_canopy">Modern Canopy</option>
                        <option value="steps_only">Stone Steps</option>
                        <option value="none">None</option>
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-2">
                      <span>Corner Trim</span>
                      <select
                        value={activeNormalized.trimStyle}
                        onChange={(e) =>
                          patchDesignLive({
                            trimStyle: e.target.value as TrimStyle,
                            addTrim: e.target.value !== 'none',
                          })
                        }
                        className="min-h-[34px] px-2 py-1 rounded bg-[#18201b] border border-white/15 text-[#f6efe2] text-xs"
                      >
                        <option value="corner_boards">Corner Boards</option>
                        <option value="stone_quoins">Stone Quoins</option>
                        <option value="pilasters">Pilasters</option>
                        <option value="none">None</option>
                      </select>
                    </label>
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-1.5">
                        <span>Chimneys</span>
                        <select
                          value={activeNormalized.chimneyCount}
                          onChange={(e) => {
                            const cnt = Number(e.target.value);
                            patchDesignLive({ chimneyCount: cnt, addChimney: cnt > 0 });
                          }}
                          className="min-h-[32px] px-1.5 rounded bg-[#18201b] border border-white/15 text-[#f6efe2] text-xs"
                        >
                          <option value={0}>0</option>
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span>Dormers</span>
                        <select
                          value={activeNormalized.dormerCount}
                          onChange={(e) => {
                            const cnt = Number(e.target.value);
                            patchDesignLive({ dormerCount: cnt, addDormers: cnt > 0 });
                          }}
                          className="min-h-[32px] px-1.5 rounded bg-[#18201b] border border-white/15 text-[#f6efe2] text-xs"
                        >
                          <option value={0}>0</option>
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                          <option value={4}>4</option>
                        </select>
                      </label>
                      <select
                        aria-label="Chimney style"
                        value={activeNormalized.chimneyStyle}
                        onChange={(e) => patchDesignLive({ chimneyStyle: e.target.value as ChimneyStyle })}
                        className="min-h-[32px] px-1.5 rounded bg-[#18201b] border border-white/15 text-[#f6efe2] text-xs"
                      >
                        <option value="brick_stack">Brick</option>
                        <option value="plastered_cap">Stucco</option>
                        <option value="metal_flue">Flue</option>
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1">
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeNormalized.addShutters}
                          onChange={(e) => patchDesignLive({ addShutters: e.target.checked })}
                          className="accent-[#e6a145]"
                        />
                        <span>Shutters</span>
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeNormalized.addPlinth}
                          onChange={(e) => patchDesignLive({ addPlinth: e.target.checked })}
                          className="accent-[#e6a145]"
                        />
                        <span>Plinth</span>
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeNormalized.addCornice}
                          onChange={(e) => patchDesignLive({ addCornice: e.target.checked })}
                          className="accent-[#e6a145]"
                        />
                        <span>Cornice</span>
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeNormalized.addGutters}
                          onChange={(e) => patchDesignLive({ addGutters: e.target.checked })}
                          className="accent-[#e6a145]"
                        />
                        <span>Gutters</span>
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeNormalized.addBalcony}
                          onChange={(e) => patchDesignLive({ addBalcony: e.target.checked })}
                          className="accent-[#e6a145]"
                        />
                        <span>Balcony</span>
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={activeNormalized.addGableWindow}
                          onChange={(e) => patchDesignLive({ addGableWindow: e.target.checked })}
                          className="accent-[#e6a145]"
                        />
                        <span>Attic Win</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </form>
          )}

          {tab === 'materials' && (
            <div className="pt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="studio-scope" className="text-xs text-[#b7ae9c]">
                  Target
                </label>
                <select
                  id="studio-scope"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as ApplyScope)}
                  className="min-h-[40px] px-2.5 py-1.5 rounded-md text-xs bg-[#101612] text-[#f6efe2] border border-white/15"
                >
                  <option value="selected_wall">Selected Building Facade</option>
                  <option value="selected_roof">Selected Building Roof</option>
                  <option value="all_walls">All Village Facades</option>
                  <option value="all_roofs">All Village Roofs</option>
                  <option value="roads">Village Roads</option>
                </select>

                <div className="flex flex-wrap items-center gap-1.5">
                  {activePresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onApplyMaterial(preset, scope)}
                      className="min-h-[38px] flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-[#f6efe2] bg-white/5 hover:bg-white/15 border border-white/10 cursor-pointer transition-colors whitespace-nowrap"
                    >
                      <span
                        className="w-3 h-3 rounded-sm inline-block shrink-0"
                        style={{ backgroundColor: preset.primaryHex }}
                        aria-hidden="true"
                      />
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSynthesize} className="flex flex-col sm:flex-row gap-2">
                <label htmlFor="synth-prompt" className="sr-only">
                  Describe texture material
                </label>
                <input
                  id="synth-prompt"
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe surface (e.g., red Kurzeme brick with lime mortar)..."
                  className="flex-1 min-h-[44px] px-3 py-2 rounded-lg text-sm md:text-xs text-[#f6efe2] bg-[#101612] border border-white/15 focus:outline-none focus:border-[#e6a145]"
                />
                <button
                  type="submit"
                  disabled={synthesizing || !prompt.trim()}
                  className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold text-[#141a16] bg-[#e6a145] hover:bg-[#f0b35e] disabled:opacity-50 cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  {synthesizing ? 'Synthesizing...' : 'Synthesize Material'}
                </button>
              </form>

              {synthError && <div className="text-xs text-red-400">{synthError}</div>}
              {lastRecipe && (
                <div className="text-xs text-[#b7ae9c]">
                  Applied <strong className="text-[#f6efe2]">{lastRecipe.name}</strong> ·{' '}
                  {lastRecipe.notes}
                </div>
              )}
            </div>
          )}

          {tab === 'import' && (
            <div className="pt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs text-[#ddd5c5] mb-2">
                  Upload a <span className="font-mono-num">.glb</span> or{' '}
                  <span className="font-mono-num">.gltf</span> model to place on the selected Renda lot.
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".glb,.gltf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-semibold text-[#141a16] bg-[#e6a145] hover:bg-[#f0b35e] cursor-pointer transition-colors whitespace-nowrap"
                >
                  {importing ? 'Loading 3D Model...' : 'Choose .glb / .gltf File'}
                </button>
                {importError && <div className="text-xs text-red-400 mt-1.5">{importError}</div>}
              </div>

              {hud.importedModel && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-[#ddd5c5]">
                  <span className="font-semibold text-[#f0b35e]">{hud.importedModel.name}</span>
                  <label className="flex items-center gap-1.5">
                    Scale
                    <input
                      type="range"
                      min="0.2"
                      max="4"
                      step="0.1"
                      value={hud.importedModel.scale}
                      onChange={(e) => onUpdateImported({ scale: Number(e.target.value) })}
                      className="w-24 accent-[#e6a145]"
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    Rotate
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="5"
                      value={hud.importedModel.rotationDeg}
                      onChange={(e) => onUpdateImported({ rotationDeg: Number(e.target.value) })}
                      className="w-24 accent-[#e6a145]"
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {tab === 'atmosphere' && (
            <div className="pt-3 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-[#b7ae9c] mr-1">Kurzeme Sky:</span>
                {(
                  [
                    { id: 'morning', label: 'Misty Morning' },
                    { id: 'noon', label: 'Baltic Noon' },
                    { id: 'golden', label: 'Golden Hour' },
                    { id: 'overcast_rain', label: 'Overcast Rain' },
                    { id: 'twilight', label: 'Twilight' },
                  ] as { id: AtmospherePreset; label: string }[]
                ).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onSetAtmosphere(a.id)}
                    className={`min-h-[40px] px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                      atmosphere === a.id
                        ? 'bg-[#e6a145] text-[#141a16] font-semibold'
                        : 'bg-white/5 text-[#ddd5c5] hover:bg-white/15'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              <div className="text-xs text-[#b7ae9c] font-mono-num">
                {coords.lat}° N, {coords.lon}° E · {hud.elevationM}m ASL
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
