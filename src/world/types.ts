export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type PlayMode = 'walk' | 'drive' | 'canoe' | 'studio';

export type AtmospherePreset = 'morning' | 'golden' | 'overcast_rain' | 'noon' | 'twilight';

export type CameraPerspective = 'first_person' | 'third_person';

export type FireMode = 'SEMI' | 'AUTO';

export type RenderQuality = 'performance' | 'balanced' | 'cinematic';

export type MaterialPattern =
  | 'clapboard'
  | 'brick'
  | 'plaster'
  | 'roof_tile'
  | 'standing_seam'
  | 'fieldstone'
  | 'gravel'
  | 'asphalt'
  | 'moss_timber'
  | 'photo_timber'
  | 'photo_clay_roof'
  | 'photo_gravel';

export interface MaterialRecipe {
  id: string;
  name: string;
  pattern: MaterialPattern;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  roughness: number;
  metalness: number;
  bumpScale: number;
  repeatX: number;
  repeatY: number;
  weathering: number;
  grain: number;
  notes?: string;
}

export interface LandmarkData {
  id: string;
  name: string;
  lvName: string;
  lat: number;
  lon: number;
  x: number;
  z: number;
  category: string;
  year: string;
  desc: string;
}

export interface BuildingData {
  id: number;
  name: string | null;
  street?: string | null;
  kind: string;
  levels: number;
  roof: string;
  roofHex?: string;
  roofTone?: string;
  wallH?: number;
  roofH?: number;
  roofShape?: 'gabled' | 'hipped' | 'flat' | 'low_hip';
  ring: [number, number][];
  towerXZ?: [number, number];
}

export interface RoadData {
  id: number;
  name: string | null;
  kind: string;
  width: number;
  surface: string;
  bridge?: boolean;
  pts: [number, number][];
}

export interface WaterwayData {
  id: number;
  name: string;
  kind: string;
  width: number;
  elevs?: number[];
  pts: [number, number][];
}

export interface WoodPolygon {
  id: number;
  kind?: 'wood' | 'park';
  ring: [number, number][];
  holes?: [number, number][][];
}

export interface PondPolygon {
  id: number;
  elev?: number;
  ring: [number, number][];
  holes?: [number, number][][];
}

export interface MappedTreeData {
  x: number;
  z: number;
  species?: string | null;
}

export interface SpecialStructureData {
  id: number;
  kind: 'water_tower' | 'bandstand';
  name: string;
  x: number;
  z: number;
}

export interface RendaWorldMeta {
  name: string;
  centerLat: number;
  centerLon: number;
  halfW: number;
  halfH: number;
  baseElev: number;
  gridX: number;
  gridZ: number;
  centerX: number;
  centerZ: number;
  spawnX: number;
  spawnZ: number;
  spawnHeading: number;
  churchSpireH?: number;
  waterTowerH?: number;
}

/** Tuple: [x, z, heightM, speciesCode (0=pine, 1=spruce, 2=birch, 3=oak_linden)] */
export type LidarTreeTuple = [number, number, number, number];

export interface RendaWorldDataset {
  meta: RendaWorldMeta;
  heights: number[];
  buildings: BuildingData[];
  roads: RoadData[];
  waterways: WaterwayData[];
  woods: WoodPolygon[];
  ponds?: PondPolygon[];
  mappedTrees?: MappedTreeData[];
  treeRows?: [number, number][][];
  trees?: LidarTreeTuple[];
  specialStructures?: SpecialStructureData[];
  landmarks: LandmarkData[];
}

export interface CourierMission {
  id: string;
  pickupName: string;
  targetLandmarkId: string;
  targetName: string;
  targetX: number;
  targetZ: number;
  cargoLabel: string;
  distanceMeters: number;
  rewardScore: number;
}

export type PrecisionMode = 'stylized' | 'precise';

export type ArchitecturalStyle =
  | 'kurzeme_cottage'
  | 'modern_nordic'
  | 'manor_classic'
  | 'timber_cabin'
  | 'brick_hall'
  | 'studio_loft';

export type RoofStyle = 'pitched_hip' | 'steep_gable' | 'flat_modern' | 'mansard' | 'gambrel';

export type WindowStyle = 'arched' | 'modern_panes' | 'timber_framed' | 'tall_minimal';

export type WindowPattern = 'uniform' | 'paired' | 'grouped_bays' | 'ribbon';

export type WindowMullionStyle = 'none' | 'cross' | 'six_pane' | 'vertical_split';

export type DoorPlacement = 'center_front' | 'offset_front' | 'side_wall' | 'none';

export type DoorStyle = 'single_panel' | 'double_manor' | 'glazed_modern' | 'arched_oak';

export type PorchStyle = 'none' | 'steps_only' | 'column_portico' | 'timber_veranda' | 'modern_canopy';

export type TrimStyle = 'none' | 'corner_boards' | 'stone_quoins' | 'pilasters';

export type ChimneyStyle = 'brick_stack' | 'plastered_cap' | 'metal_flue';

export interface BuildingDesignRecipe {
  id: string;
  designName: string;
  precisionMode?: PrecisionMode;
  architecturalStyle: ArchitecturalStyle;
  heightScale: number;
  widthScale?: number;
  depthScale?: number;
  floors?: number;
  roofStyle: RoofStyle;
  roofPitch: number;
  overhangScale: number;
  addWindows: boolean;
  windowStyle: WindowStyle;
  windowPattern?: WindowPattern;
  windowCols?: number;
  windowRows?: number;
  windowWidthM?: number;
  windowHeightM?: number;
  windowMullions?: WindowMullionStyle;
  addShutters?: boolean;
  shutterHex?: string;
  windowFrameHex: string;
  windowGlowHex: string;
  addChimney: boolean;
  chimneyCount?: number;
  chimneyStyle?: ChimneyStyle;
  addPorch: boolean;
  porchStyle?: PorchStyle;
  doorPlacement?: DoorPlacement;
  doorStyle?: DoorStyle;
  doorHex?: string;
  addBalcony?: boolean;
  addDormers: boolean;
  dormerCount?: number;
  addTrim: boolean;
  trimStyle?: TrimStyle;
  trimHex: string;
  addPlinth?: boolean;
  plinthHeightM?: number;
  plinthHex?: string;
  addCornice?: boolean;
  addGutters?: boolean;
  addGableWindow?: boolean;
  wallRecipe: MaterialRecipe;
  roofRecipe: MaterialRecipe;
  designSummary: string;
  source?: 'gemini' | 'deterministic';
}

export interface ReferenceImagePayload {
  mimeType: string;
  dataBase64: string;
}

export interface SelectedBuildingInfo {
  id: number;
  name: string;
  kind: string;
  levels: number;
  cx: number;
  cz: number;
  widthM: number;
  depthM: number;
  baseWallH?: number;
  baseRoofH?: number;
  wallMaterialId: string;
  roofMaterialId: string;
  hasCustomDesign?: boolean;
  designSummary?: string;
  customDesign?: BuildingDesignRecipe | null;
}

export interface ImportedModelState {
  name: string;
  x: number;
  z: number;
  scale: number;
  rotationDeg: number;
}

export interface WorldHudSnapshot {
  phase: GamePhase;
  mode: PlayMode;
  playerX: number;
  playerZ: number;
  playerHeading: number;
  camYaw?: number;
  elevationM: number;
  speedKmh: number;
  distanceTraveledM: number;
  discoveredIds: string[];
  totalLandmarks: number;
  nearestLandmark: {
    id: string;
    name: string;
    distanceM: number;
  } | null;
  activeMission: CourierMission | null;
  deliveriesCompleted: number;
  score: number;
  bestScore: number;
  activeBanner: {
    title: string;
    subtitle: string;
  } | null;
  selectedBuilding: SelectedBuildingInfo | null;
  importedModel: ImportedModelState | null;
  cameraPerspective?: CameraPerspective;
  atmosphere?: AtmospherePreset;
  compassBearingDeg?: number;
  adsAlpha?: number;
  ammoInMag?: number;
  ammoReserve?: number;
  isReloading?: boolean;
  fireMode?: FireMode;
  stamina?: number;
  crouching?: boolean;
  leaning?: number;
  pointerLocked?: boolean;
}
