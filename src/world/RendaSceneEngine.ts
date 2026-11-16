import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import worldRaw from '../data/rendaWorld.json';
import {
  applyFpsRecoilImpulse,
  BUILDING_UV_METER_SCALE,
  buildBuildingColliders,
  checkLandmarkDiscoveries,
  clampToPlayableBounds,
  computeCameraRelativeMoveVector,
  computeCompassBearingDeg,
  computeFacadeWindowPositions,
  computeFpsCameraFov,
  computeFpsMoveSpeed,
  computeGableRidgePlan,
  computeInsetPolygon,
  computeMetricRoofQuadUvs,
  computePolygonCentroid,
  computePrimaryAxisAndBounds,
  computeRoadEdgeDisplacement,
  computeTerrainSlope,
  computeTitleFlyoverPose,
  computeWallSegments,
  computeWaterwayFlowAtPoint,
  createInitialFpsWeaponState,
  createNextCourierMission,
  evaluateMoodColorProfile,
  findNearestLandmark,
  findNearestRiverPoint,
  groundHeightAt,
  normalizeBuildingDesign,
  pointInPolygon,
  resolveBuildingCollisions,
  scaleFootprintRingAlongAxes,
  shortestAngleLerp,
  snapShadowCenter,
  stepFpsWeaponPhysics,
  type BuildingCollider,
  type FlyoverAnchor,
  type FpsWeaponSpringState,
} from './rendaMath';
import {
  applyMetricTriplanarUvAndUv2,
  createSharedArchMaterials,
  ensureGeometryUv2,
  type ArchTrimMaterialBundle,
} from './architecturalDetails';
import { MaterialLibrary, ROAD_PRESETS, ROOF_PRESETS, WALL_PRESETS } from './materialPresets';
import {
  createBandstandGroup,
  createBusShelterGroup,
  createCanoeGroup,
  createCourierCarGroup,
  createExplorerGroup,
  createGateArchGroup,
  createLandmarkMonument,
  createRendaChurchGroup,
  createWaterTowerGroup,
  RendaAudioEngine,
  type CanoeRig,
  type CourierCarRig,
  type ExplorerRig,
} from './proceduralAssets';
import {
  createAbavaBridgeGroup,
  createCultureHouseDetails,
  createLielrendaManorDetails,
  createPagrabinsCafeDetails,
  createShopPastsDetails,
} from './heroLandmarks';
import {
  buildV2MeadowAndProps,
  createAbavaWaterMaterial,
  createCinematicColorGradeShader,
  createValleyMistSystem,
  createVolumetricCloudDome,
  createVolumetricSunShafts,
  enhanceBuildingRoofMaterial,
  enhanceBuildingWallMaterial,
  enhanceRoadMaterial,
  enhanceTerrainMaterial,
} from './v2Environment';
import {
  buildAaaTreeSystem,
  loadAaaGroundCoverAndProps,
  type AaaGroundCoverHandle,
  type AaaTreeSystemHandle,
  type BoulderPlacement,
  type ReedPlacement,
  type ShrubPlacement,
  type TreeInstanceRecord,
} from './aaaFoliageSystem';
import { loadAaaVillageProps, type AaaPropsConfig, type AaaVillagePropsHandle } from './aaaPropsSystem';
import { createWeaponViewmodelRig, type WeaponViewmodelRig } from './weaponViewmodel';
import { ContactOcclusionPass } from './ContactOcclusionPass';
import { BulletImpactSystem } from './BulletImpactSystem';
import { QUALITY_STORAGE_KEY, RENDER_QUALITY, readRenderQuality } from './renderQuality';
import { createTacticalVillage } from './tacticalVillage';
import { createStreetSurfaces } from './streetSurfaces';
import { createBuildingArt } from './buildingArt';
import { createBattlefieldAtmosphere } from './battlefieldAtmosphere';
import { batchStaticScenery } from './staticSceneBatches';
import type {
  AtmospherePreset,
  BuildingDesignRecipe,
  CameraPerspective,
  CourierMission,
  FireMode,
  GamePhase,
  ImportedModelState,
  MaterialRecipe,
  PlayMode,
  RendaWorldDataset,
  RoofStyle,
  SelectedBuildingInfo,
  WorldHudSnapshot,
  RenderQuality,
} from './types';

const WORLD = worldRaw as unknown as RendaWorldDataset;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _lookDesired = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

const FOUNDATION_DEPTH = 1.8;

interface BuildingEntry {
  id: number;
  name: string;
  kind: string;
  levels: number;
  cx: number;
  cz: number;
  baseY: number;
  widthM: number;
  depthM: number;
  baseWidthM: number;
  baseDepthM: number;
  radius: number;
  baseRadius: number;
  ring: [number, number][];
  currentRing: [number, number][];
  baseWallH: number;
  baseRoofH: number;
  baseRoofShape: string;
  currentWallH: number;
  wallMesh: THREE.Mesh | null;
  roofMesh: THREE.Mesh | null;
  detailGroup: THREE.Group | null;
  wallMaterialId: string;
  roofMaterialId: string;
  baseWallMaterialId: string;
  baseRoofMaterialId: string;
  customDesign: BuildingDesignRecipe | null;
  defaultWinIndices?: number[];
  defaultWinShutterIndices?: number[];
  defaultTrimIndices?: { segIndices: number[]; doorIndices: number[]; ridgeIndices: number[] };
  buildBaseDetails?: () => THREE.Group;
}

function buildRibbonGeometry(
  pts: [number, number][],
  width: number,
  yOffset: number,
  uvRepeatY = 0.08,
  isBridge = false,
  elevs?: number[],
  surfaceKind?: 'asphalt' | 'gravel' | 'trail'
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let accumDist = 0;

  let totalLen = 0;
  for (let i = 1; i < pts.length; i++) {
    totalLen += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  totalLen = Math.max(1, totalLen);
  const startY = groundHeightAt(WORLD, pts[0][0], pts[0][1]) + 1.05;
  const endY = groundHeightAt(WORLD, pts[pts.length - 1][0], pts[pts.length - 1][1]) + 1.05;

  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;

    const halfW = width * 0.5;
    const dispL = !isBridge && surfaceKind ? computeRoadEdgeDisplacement(x, z, -1, halfW, surfaceKind) : 0;
    const dispR = !isBridge && surfaceKind ? computeRoadEdgeDisplacement(x, z, 1, halfW, surfaceKind) : 0;
    const leftW = Math.max(0.32, halfW + dispL);
    const rightW = Math.max(0.32, halfW + dispR);
    const lx = x - -dz * leftW;
    const lz = z - dx * leftW;
    const rx = x + -dz * rightW;
    const rz = z + dx * rightW;

    if (i > 0) {
      accumDist += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    }

    let yUse: number;
    if (isBridge) {
      const t = accumDist / totalLen;
      const deckY = startY + (endY - startY) * t + Math.sin(t * Math.PI) * 0.38;
      yUse = Math.max(deckY, groundHeightAt(WORLD, x, z) + 0.55);
    } else if (elevs && elevs.length === pts.length && Number.isFinite(elevs[i])) {
      yUse = elevs[i] + yOffset;
    } else {
      const yl = groundHeightAt(WORLD, lx, lz);
      const yr = groundHeightAt(WORLD, rx, rz);
      const yc = groundHeightAt(WORLD, x, z);
      yUse = yc * 0.65 + Math.min(yl, yr) * 0.35 + yOffset;
    }

    positions.push(lx, yUse, lz);
    positions.push(rx, yUse, rz);

    uvs.push(0, accumDist * uvRepeatY);
    uvs.push(1, accumDist * uvRepeatY);

    if (i > 0) {
      const base = (i - 1) * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildPitchedRoofGeometry(
  ring: [number, number][],
  cx: number,
  cz: number,
  roofH: number,
  overhangScale = 1.06,
  roofStyle: RoofStyle | 'low_hip' = 'pitched_hip'
): THREE.BufferGeometry {
  if (roofStyle === 'flat_modern') {
    const shape = new THREE.Shape();
    for (let i = 0; i < ring.length; i++) {
      const lx = (ring[i][0] - cx) * overhangScale;
      const ly = -((ring[i][1] - cz) * overhangScale);
      if (i === 0) shape.moveTo(lx, ly);
      else shape.lineTo(lx, ly);
    }
    shape.closePath();
    const flatGeo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.4, Math.min(0.95, roofH * 0.45)),
      bevelEnabled: false,
    });
    flatGeo.rotateX(-Math.PI / 2);
    applyMetricTriplanarUvAndUv2(flatGeo, BUILDING_UV_METER_SCALE);
    flatGeo.computeVertexNormals();
    return flatGeo;
  }

  const localPts: [number, number][] = ring.map(([rx, rz]) => [
    (rx - cx) * overhangScale,
    (rz - cz) * overhangScale,
  ]);
  const positions: number[] = [];
  const uvs: number[] = [];

  const ridgeFactor =
    roofStyle === 'steep_gable' || roofStyle === 'gambrel'
      ? 1.0
      : roofStyle === 'mansard'
        ? 0.56
        : roofStyle === 'low_hip'
          ? 0.68
          : 0.82;
  const gablePlan = computeGableRidgePlan(localPts, ridgeFactor);

  if (gablePlan) {
    const { ptsCCW: pts, ridgeA, ridgeB } = gablePlan;

    if (roofStyle === 'gambrel') {
      const breakY = roofH * 0.58;
      const midLerp = 0.42;
      for (let i = 0; i < 4; i++) {
        const [x0, z0] = pts[i];
        const [x1, z1] = pts[(i + 1) % 4];
        const r0 = Math.hypot(x0 - ridgeA[0], z0 - ridgeA[1]) <= Math.hypot(x0 - ridgeB[0], z0 - ridgeB[1]) ? ridgeA : ridgeB;
        const r1 = Math.hypot(x1 - ridgeA[0], z1 - ridgeA[1]) <= Math.hypot(x1 - ridgeB[0], z1 - ridgeB[1]) ? ridgeA : ridgeB;
        if (r0 !== r1) {
          const b0x = x0 + (r0[0] - x0) * midLerp;
          const b0z = z0 + (r0[1] - z0) * midLerp;
          const b1x = x1 + (r1[0] - x1) * midLerp;
          const b1z = z1 + (r1[1] - z1) * midLerp;

          const lowUv = computeMetricRoofQuadUvs(x0, z0, x1, z1, b0x, b0z, b1x, b1z, 0, breakY, BUILDING_UV_METER_SCALE);
          const upUv = computeMetricRoofQuadUvs(b0x, b0z, b1x, b1z, r0[0], r0[1], r1[0], r1[1], breakY, roofH, BUILDING_UV_METER_SCALE);
          const vOff = lowUv.t0[1];

          // Lower steep gambrel slope
          positions.push(x0, 0, z0, b0x, breakY, b0z, x1, 0, z1);
          uvs.push(lowUv.b0[0], lowUv.b0[1], lowUv.t0[0], lowUv.t0[1], lowUv.b1[0], lowUv.b1[1]);
          positions.push(x1, 0, z1, b0x, breakY, b0z, b1x, breakY, b1z);
          uvs.push(lowUv.b1[0], lowUv.b1[1], lowUv.t0[0], lowUv.t0[1], lowUv.t1[0], lowUv.t1[1]);

          // Upper gentle gambrel slope (v-continued seamlessly from break line)
          positions.push(b0x, breakY, b0z, r0[0], roofH, r0[1], b1x, breakY, b1z);
          uvs.push(upUv.b0[0], vOff + upUv.b0[1], upUv.t0[0], vOff + upUv.t0[1], upUv.b1[0], vOff + upUv.b1[1]);
          positions.push(b1x, breakY, b1z, r0[0], roofH, r0[1], r1[0], roofH, r1[1]);
          uvs.push(upUv.b1[0], vOff + upUv.b1[1], upUv.t0[0], vOff + upUv.t0[1], upUv.t1[0], vOff + upUv.t1[1]);
        }
        positions.push(x0, 0, z0, x1, 0, z1, 0, 0, 0);
        uvs.push(0, 0, 1, 0, 0.5, 0.5);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      ensureGeometryUv2(geo);
      geo.computeVertexNormals();
      return geo;
    }

    for (let i = 0; i < 4; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[(i + 1) % 4];
      const mx = (x0 + x1) * 0.5;
      const mz = (z0 + z1) * 0.5;
      const dA = Math.hypot(mx - ridgeA[0], mz - ridgeA[1]);
      const dB = Math.hypot(mx - ridgeB[0], mz - ridgeB[1]);
      const r0 = Math.hypot(x0 - ridgeA[0], z0 - ridgeA[1]) <= Math.hypot(x0 - ridgeB[0], z0 - ridgeB[1]) ? ridgeA : ridgeB;
      const r1 = Math.hypot(x1 - ridgeA[0], z1 - ridgeA[1]) <= Math.hypot(x1 - ridgeB[0], z1 - ridgeB[1]) ? ridgeA : ridgeB;
      const rNear = dA <= dB ? ridgeA : ridgeB;

      if (r0 === r1) {
        // Skip degenerate zero-area gable end slope triangles when ridgeFactor === 1.0
        if (roofStyle !== 'steep_gable') {
          const triUv = computeMetricRoofQuadUvs(x0, z0, x1, z1, rNear[0], rNear[1], rNear[0], rNear[1], 0, roofH, BUILDING_UV_METER_SCALE);
          positions.push(x0, 0, z0, rNear[0], roofH, rNear[1], x1, 0, z1);
          uvs.push(triUv.b0[0], triUv.b0[1], triUv.t0[0], triUv.t0[1], triUv.b1[0], triUv.b1[1]);
        }
      } else {
        const quadUv = computeMetricRoofQuadUvs(x0, z0, x1, z1, r0[0], r0[1], r1[0], r1[1], 0, roofH, BUILDING_UV_METER_SCALE);
        positions.push(x0, 0, z0, r0[0], roofH, r0[1], x1, 0, z1);
        uvs.push(quadUv.b0[0], quadUv.b0[1], quadUv.t0[0], quadUv.t0[1], quadUv.b1[0], quadUv.b1[1]);
        positions.push(x1, 0, z1, r0[0], roofH, r0[1], r1[0], roofH, r1[1]);
        uvs.push(quadUv.b1[0], quadUv.b1[1], quadUv.t0[0], quadUv.t0[1], quadUv.t1[0], quadUv.t1[1]);
      }
      positions.push(x0, 0, z0, x1, 0, z1, 0, 0, 0);
      uvs.push(0, 0, 1, 0, 0.5, 0.5);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    ensureGeometryUv2(geo);
    geo.computeVertexNormals();
    return geo;
  }

  // Ensure CCW winding in XZ for arbitrary N-gon roofs
  const n = localPts.length;
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = localPts[i];
    const [x1, z1] = localPts[(i + 1) % n];
    signedArea += x0 * z1 - x1 * z0;
  }
  const pts = signedArea < 0 ? [...localPts].reverse() : localPts;

  // Complex N-gon footprints (L-shaped, U-shaped Lielrenda Manor, Vīgneri 17-gon, Zelmeņi 8-gon):
  // Use inward polygon inset hipped roof skirt + triangulated roof deck (never single-point cones!)
  const obb = computePrimaryAxisAndBounds(pts);
  const insetDist = Math.max(0.9, Math.min(2.8, obb.widthV * 0.34));
  const insetData = computeInsetPolygon(pts, insetDist);

  if (insetData) {
    const { outer, inset } = insetData;
    const m = outer.length;
    for (let i = 0; i < m; i++) {
      const next = (i + 1) % m;
      const [ox0, oz0] = outer[i];
      const [ox1, oz1] = outer[next];
      const [ix0, iz0] = inset[i];
      const [ix1, iz1] = inset[next];
      const skirtUv = computeMetricRoofQuadUvs(ox0, oz0, ox1, oz1, ix0, iz0, ix1, iz1, 0, roofH, BUILDING_UV_METER_SCALE);

      // Sloped eave skirt quad
      positions.push(ox0, 0, oz0, ix0, roofH, iz0, ox1, 0, oz1);
      uvs.push(skirtUv.b0[0], skirtUv.b0[1], skirtUv.t0[0], skirtUv.t0[1], skirtUv.b1[0], skirtUv.b1[1]);
      positions.push(ox1, 0, oz1, ix0, roofH, iz0, ix1, roofH, iz1);
      uvs.push(skirtUv.b1[0], skirtUv.b1[1], skirtUv.t0[0], skirtUv.t0[1], skirtUv.t1[0], skirtUv.t1[1]);
    }

    // Triangulate roof deck cap cleanly at y = roofH
    const contour = inset.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [a, b, c] of tris) {
      positions.push(
        inset[a][0], roofH, inset[a][1],
        inset[c][0], roofH, inset[c][1],
        inset[b][0], roofH, inset[b][1]
      );
      uvs.push(
        inset[a][0] * BUILDING_UV_METER_SCALE, inset[a][1] * BUILDING_UV_METER_SCALE,
        inset[c][0] * BUILDING_UV_METER_SCALE, inset[c][1] * BUILDING_UV_METER_SCALE,
        inset[b][0] * BUILDING_UV_METER_SCALE, inset[b][1] * BUILDING_UV_METER_SCALE
      );
    }

    // Soffit underside
    const outerContour = outer.map(([x, z]) => new THREE.Vector2(x, z));
    const botTris = THREE.ShapeUtils.triangulateShape(outerContour, []);
    for (const [a, b, c] of botTris) {
      positions.push(
        outer[a][0], 0, outer[a][1],
        outer[b][0], 0, outer[b][1],
        outer[c][0], 0, outer[c][1]
      );
      uvs.push(0, 0, 1, 0, 0.5, 1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    ensureGeometryUv2(geo);
    geo.computeVertexNormals();
    return geo;
  }

  // Fallback for ultra-thin jagged polygons: crisp beveled architectural roof cap
  const shape = new THREE.Shape();
  for (let i = 0; i < pts.length; i++) {
    const lx = pts[i][0];
    const ly = -pts[i][1];
    if (i === 0) shape.moveTo(lx, ly);
    else shape.lineTo(lx, ly);
  }
  shape.closePath();
  const bevelGeo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.45, roofH * 0.35),
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.35,
    bevelThickness: Math.max(0.45, roofH * 0.38),
  });
  bevelGeo.rotateX(-Math.PI / 2);
  applyMetricTriplanarUvAndUv2(bevelGeo, BUILDING_UV_METER_SCALE);
  bevelGeo.computeVertexNormals();
  return bevelGeo;
}

export class RendaSceneEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: WorldHudSnapshot) => void;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private composerRenderTarget: THREE.WebGLRenderTarget | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private colorGradePass: ShaderPass | null = null;
  private fxaaPass: ShaderPass | null = null;
  private contactOcclusionPass: ContactOcclusionPass | null = null;
  private renderQuality: RenderQuality = 'balanced';
  private bulletImpacts: BulletImpactSystem;
  private terrainMesh: THREE.Mesh | null = null;
  private tacticalVillage: ReturnType<typeof createTacticalVillage> | null = null;
  private streetSurfaces: ReturnType<typeof createStreetSurfaces> | null = null;
  private buildingArt: ReturnType<typeof createBuildingArt> | null = null;
  private battlefieldAtmosphere: ReturnType<typeof createBattlefieldAtmosphere> | null = null;
  private staticScenery: ReturnType<typeof batchStaticScenery> | null = null;
  private buildingCollisionBase: BuildingCollider[] = [];
  private dressingColliders: BuildingCollider[] = [];
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private sky: Sky;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private materialLib: MaterialLibrary;
  private archMaterials: ArchTrimMaterialBundle | null = null;
  private audio = new RendaAudioEngine();
  private isSoftwareGl: boolean;
  private frameCount = 0;
  private readonly shadowHalfExtent = 76;
  private shadowMapRes = 2048;

  private colliders: BuildingCollider[] = [];
  private buildingMap = new Map<number, BuildingEntry>();
  private interactableWalls: THREE.Mesh[] = [];
  private roadAsphaltMeshes: THREE.Mesh[] = [];
  private roadGravelMeshes: THREE.Mesh[] = [];
  private waterMaterial: THREE.MeshPhysicalMaterial | null = null;
  private waterTexture: THREE.CanvasTexture | null = null;
  private waterBumpTexture: THREE.CanvasTexture | null = null;
  private waterfallTexture: THREE.CanvasTexture | null = null;
  private terrainTexture: THREE.Texture | null = null;
  private extraTextures: THREE.Texture[] = [];
  private windTimeUniform = { value: 0 };
  private sunDirUniform = { value: new THREE.Vector3(0.4, 0.5, -0.7).normalize() };
  private sunColorUniform = { value: new THREE.Color(0xffbd75) };
  private skyColorUniform = { value: new THREE.Color(0x6d98c2) };
  private horizonColorUniform = { value: new THREE.Color(0xd9c2a3) };
  private waterMeshes: THREE.Mesh[] = [];
  private waterRaycaster = new THREE.Raycaster();
  private defaultWinFrameMesh: THREE.InstancedMesh | null = null;
  private defaultWinGlassMesh: THREE.InstancedMesh | null = null;
  private defaultWinSillMesh: THREE.InstancedMesh | null = null;
  private defaultWinMullionMesh: THREE.InstancedMesh | null = null;
  private defaultWinShutterMesh: THREE.InstancedMesh | null = null;
  private defaultWinTransforms: THREE.Matrix4[] = [];
  private defaultWinShutterTransforms: THREE.Matrix4[] = [];
  private defaultPlinthMesh: THREE.InstancedMesh | null = null;
  private defaultFasciaMesh: THREE.InstancedMesh | null = null;
  private defaultPlinthTransforms: THREE.Matrix4[] = [];
  private defaultFasciaTransforms: THREE.Matrix4[] = [];
  private defaultDoorMesh: THREE.InstancedMesh | null = null;
  private defaultDoorStepMesh: THREE.InstancedMesh | null = null;
  private defaultDoorTransforms: THREE.Matrix4[] = [];
  private defaultDoorStepTransforms: THREE.Matrix4[] = [];
  private defaultRidgeMesh: THREE.InstancedMesh | null = null;
  private defaultRidgeTransforms: THREE.Matrix4[] = [];
  private flyoverAnchors: FlyoverAnchor[] = [];
  private treeSystem: AaaTreeSystemHandle | null = null;
  private groundCoverSystem: AaaGroundCoverHandle | null = null;
  private villagePropsSystem: AaaVillagePropsHandle | null = null;
  private shrubPlacements: ShrubPlacement[] = [];
  private boulderPlacements: BoulderPlacement[] = [];
  private reedPlacements: ReedPlacement[] = [];
  private treeBaseAnchors: { x: number; z: number }[] = [];
  private isDisposed = false;

  private wetnessUniform = { value: 0.45 };
  private mistOpacityUniform = { value: 0.55 };
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private outdoorEnvironments = new Map<string, THREE.WebGLRenderTarget>();
  private skyPanoramas = new Map<string, THREE.Texture>();
  private readyToRender = false;
  private initialAssetsReady = false;
  private skyEnvBuilt = false;
  private skyEnvPreset: AtmospherePreset | null = null;

  private cloudDome: THREE.Mesh | null = null;
  private valleyMistGroup: THREE.Group | null = null;
  private sunShaftsGroup: THREE.Group | null = null;
  private warmLights: THREE.PointLight[] = [];

  private particleMesh: THREE.InstancedMesh | null = null;
  private readonly maxParticles = 180;
  private pActive = new Uint8Array(180);
  private pPos = new Float32Array(180 * 3);
  private pVel = new Float32Array(180 * 3);
  private pAge = new Float32Array(180);
  private pMaxAge = new Float32Array(180);
  private pSize = new Float32Array(180);
  private pCursor = 0;
  private pDummy = new THREE.Object3D();
  private pColor = new THREE.Color();
  private ambientParticleTimer = 0;
  private trailParticleTimer = 0;

  private explorerRig: ExplorerRig;
  private weaponViewmodel: WeaponViewmodelRig;
  private carRig: CourierCarRig;
  private canoeRig: CanoeRig;
  private selectionRing: THREE.Mesh;
  private missionBeacon: THREE.Group;
  private landmarkDiamonds: THREE.Mesh[] = [];

  private importedGroup: THREE.Group | null = null;
  private importedState: ImportedModelState | null = null;

  private keys = new Set<string>();
  private frameId = 0;
  private lastTime = 0;
  private lastHudEmit = 0;
  private titleAngle = 0;
  private bannerTimeout = 0;
  private stepAccum = 0;
  private pointerDownPos = { x: 0, y: 0 };

  // Simulation & AAA FPS state
  private phase: GamePhase = 'title';
  private mode: PlayMode = 'walk';
  private cameraPerspective: CameraPerspective = 'first_person';
  private atmosphere: AtmospherePreset = 'overcast_rain';
  private fpsState: FpsWeaponSpringState = createInitialFpsWeaponState();
  private fireMode: FireMode = 'SEMI';
  private ammoInMag = 30;
  private ammoReserve = 180;
  private reloadTimer = 0;
  private readonly reloadDuration = 1.65;
  private inspectTimer = 0;
  private muzzleFlashTimer = 0;
  private boltKick = 0;
  private shotCooldown = 0;
  private fireJitterSeed = 1;
  private isAiming = false;
  private isFiringHeld = false;
  private stamina = 1.0;
  private staminaCooldown = 0;
  private isCrouching = false;
  private leanInput = 0;
  private pointerLocked = false;
  private lookDeltaFrameX = 0;
  private lookDeltaFrameY = 0;

  private playerX = WORLD.meta.spawnX;
  private playerZ = WORLD.meta.spawnZ;
  private playerY = 0;
  private playerVy = 0;
  private playerHeading = WORLD.meta.spawnHeading;
  private speed = 0;
  private prevSpeed = 0;
  private distanceTraveledM = 0;
  private discoveredIds: string[] = [];
  private activeMission: CourierMission | null = null;
  private deliveriesCompleted = 0;
  private score = 0;
  private bestScore = 0;
  private activeBanner: { title: string; subtitle: string } | null = null;
  private selectedBuildingId: number | null = null;
  private camYaw = WORLD.meta.spawnHeading;
  private camPitch = 0.04;
  private camYawVel = 0;
  private camPitchVel = 0;
  private camDistSmooth = 6.8;
  private camZoomOffset = 0;
  private lookTargetSmooth = new THREE.Vector3();
  private hasInitCamera = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private wasGrounded = true;
  private squashY = 1;
  private carBodyPitch = 0;
  private carBodyRoll = 0;
  private isDraggingCamera = false;
  private activeDragPointerId: number | null = null;
  private dragLast = { x: 0, y: 0 };

  // Mobile touch input state
  private touchTurn = 0;
  private touchThrottle = 0;
  private touchJump = false;
  private touchSprint = false;
  private popAnims = new Map<number, number>();

  private customRecipes = new Map<string, MaterialRecipe>();

  constructor(container: HTMLElement, onHudUpdate: (snapshot: WorldHudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;

    // Load best score safely
    try {
      const saved = localStorage.getItem('renda_3d_best_score');
      if (saved) this.bestScore = Number(saved) || 0;
    } catch {
      // ignore storage failure
    }

    // Software WebGL probe
    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderQuality = readRenderQuality(this.isSoftwareGl);
    this.shadowMapRes = RENDER_QUALITY[this.renderQuality].shadowSize;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.isSoftwareGl,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.setPixelRatio(this.getRenderPixelRatio());
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = this.renderQuality !== 'performance' || !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xcbd7dc, 0.0014);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(66, w / h, 0.12, 2400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 520;
    this.controls.enabled = false;

    this.materialLib = new MaterialLibrary(this.getMaxTexAnisotropy());
    for (const r of [...WALL_PRESETS, ...ROOF_PRESETS, ...ROAD_PRESETS]) {
      this.customRecipes.set(r.id, r);
    }

    // Sky & lighting rig
    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    this.scene.add(this.sky);

    this.sunLight = new THREE.DirectionalLight(0xffe7c2, 2.35);
    this.sunLight.castShadow = this.renderer.shadowMap.enabled;
    this.sunLight.shadow.mapSize.set(this.shadowMapRes, this.shadowMapRes);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 760;
    const d = this.shadowHalfExtent;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.00012;
    this.sunLight.shadow.normalBias = 0.035;
    this.sunLight.shadow.radius = 2;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.hemiLight = new THREE.HemisphereLight(0x7e99b3, 0x1e241a, 0.44);
    this.scene.add(this.hemiLight);

    // Build Renda world geometry
    this.buildTerrain();
    this.buildWaterways();
    this.buildRoads();
    this.buildBuildings();
    this.buildTrees();
    this.buildSpecialStructures();
    this.buildLandmarks();
    this.buildSceneryProps();
    this.buildAtmosphereClouds();
    this.initParticles();

    // Retain editable/animated objects; combine fixed scenery into spatially culled batches.
    const excluded = new Set<THREE.Object3D>([
      ...this.interactableWalls, ...this.roadAsphaltMeshes, ...this.roadGravelMeshes,
      ...this.waterMeshes, ...this.landmarkDiamonds,
    ]);
    if (this.terrainMesh) excluded.add(this.terrainMesh);
    for (const building of this.buildingMap.values()) if (building.detailGroup) excluded.add(building.detailGroup);
    this.staticScenery = batchStaticScenery(this.scene, excluded);

    this.buildingCollisionBase = this.colliders.slice();
    this.tacticalVillage = createTacticalVillage(this.scene, WORLD, this.colliders, this.getMaxTexAnisotropy());
    this.buildingArt = createBuildingArt(this.scene, WORLD, this.getMaxTexAnisotropy());
    this.dressingColliders = [...this.tacticalVillage.colliders, ...this.buildingArt.colliders];
    this.colliders.push(...this.dressingColliders);
    this.streetSurfaces = createStreetSurfaces(this.scene, WORLD, this.colliders, this.getMaxTexAnisotropy());
    this.battlefieldAtmosphere = createBattlefieldAtmosphere(this.scene, WORLD);

    // Build sweeping multi-landmark desktop flyover tour for title backdrop
    for (const [id, radius, height] of [
      ['church', 112, 34],
      ['abava_boats', 118, 32],
      ['manor', 124, 36],
      ['ivande_rumba', 92, 28],
    ] as [string, number, number][]) {
      const lm = WORLD.landmarks.find((l) => l.id === id);
      if (lm) {
        this.flyoverAnchors.push({
          x: lm.x,
          y: groundHeightAt(WORLD, lm.x, lm.z),
          z: lm.z,
          radius,
          height,
        });
      }
    }

    // Actors & First-Person Tactical Viewmodel Rig
    this.explorerRig = createExplorerGroup();
    this.explorerRig.group.visible = false;
    this.scene.add(this.explorerRig.group);

    this.weaponViewmodel = createWeaponViewmodelRig();
    this.weaponViewmodel.root.userData.excludeContactOcclusion = true;
    this.weaponViewmodel.root.visible = false;
    this.camera.add(this.weaponViewmodel.root);
    this.bulletImpacts = new BulletImpactSystem(this.scene);

    this.carRig = createCourierCarGroup();
    this.carRig.group.visible = false;
    this.scene.add(this.carRig.group);

    this.canoeRig = createCanoeGroup();
    this.canoeRig.group.visible = false;
    this.scene.add(this.canoeRig.group);

    // Studio selection ring
    const ringGeo = new THREE.RingGeometry(6, 7.2, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.selectionRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xe6a145, side: THREE.DoubleSide })
    );
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);

    // Courier target beacon
    this.missionBeacon = new THREE.Group();
    const beamGeo = new THREE.CylinderGeometry(1.1, 2.2, 42, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xe69f38,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 21;
    this.missionBeacon.add(beam);
    const markerRing = new THREE.Mesh(
      new THREE.RingGeometry(4.5, 5.6, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf4b64f, side: THREE.DoubleSide })
    );
    markerRing.position.y = 0.25;
    this.missionBeacon.add(markerRing);
    this.missionBeacon.visible = false;
    this.scene.add(this.missionBeacon);

    // Set initial positions & atmosphere
    this.playerY = groundHeightAt(WORLD, this.playerX, this.playerZ);
    this.syncActorTransforms();
    this.setAtmosphere(this.atmosphere);
    this.activeMission = createNextCourierMission(
      WORLD.landmarks,
      this.playerX,
      this.playerZ,
      0,
      'church'
    );
    this.updateMissionBeacon();

    {
      const pr = this.getRenderPixelRatio();
      this.composerRenderTarget = new THREE.WebGLRenderTarget(
        Math.max(1, Math.round(w * pr)),
        Math.max(1, Math.round(h * pr)),
        {
          type: THREE.HalfFloatType,
          samples: RENDER_QUALITY[this.renderQuality].samples,
        }
      );
      this.composer = new EffectComposer(this.renderer, this.composerRenderTarget);
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      if (RENDER_QUALITY[this.renderQuality].contactShadows) {
        this.contactOcclusionPass = new ContactOcclusionPass(this.scene, this.camera, w, h);
        this.composer.addPass(this.contactOcclusionPass);
      }
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.1, 0.4, 1.4);
      this.bloomPass.enabled = RENDER_QUALITY[this.renderQuality].bloom;
      this.composer.addPass(this.bloomPass);
      this.colorGradePass = new ShaderPass(createCinematicColorGradeShader());
      this.colorGradePass.uniforms['uResolution'].value.set(w * pr, h * pr);
      this.composer.addPass(this.colorGradePass);
      this.composer.addPass(new OutputPass());
      this.fxaaPass = new ShaderPass(FXAAShader);
      this.fxaaPass.uniforms['resolution'].value.set(1 / (w * pr), 1 / (h * pr));
      this.composer.addPass(this.fxaaPass);
      // Sync atmosphere uniforms after colorGradePass exists
      this.setAtmosphere(this.atmosphere);
      // Compile on first use so disabled quality effects do not delay startup.
    }

    this.bindEvents();
    this.readyToRender = true;
    document.body.dataset.quality = this.renderQuality;
    this.loadOutdoorLighting();
    this.lastTime = performance.now();
    this.emitHud(true);
    this.loop();
  }

  private buildTerrain(): void {
    const { halfW, halfH, gridX, gridZ, heights } = WORLD.meta
      ? { ...WORLD.meta, heights: WORLD.heights }
      : { halfW: 1150, halfH: 950, gridX: 360, gridZ: 300, heights: WORLD.heights };
    const geo = new THREE.PlaneGeometry(halfW * 2, halfH * 2, gridX - 1, gridZ - 1);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    // Bright neutral-warm modulation so real aerial orthophoto ground colors stay crisp,
    // while blending Devonian bluff rock tones onto steep valley slopes and deepening forest interiors
    const cMeadow = new THREE.Color(0xd8dfd0);
    const cSlope = new THREE.Color(0xc6cfb8);
    const cDolomiteCliff = new THREE.Color(0x8a7965);
    const cForest = new THREE.Color(0x6f7d64);
    const tmp = new THREE.Color();

    // P120 Abava Bridge river channel: carve LiDAR bridge-deck DTM hump along the real Abava river centerline
    // segment (266.3, -178.73) -> (210.01, -123.3) so both piers stand in unobstructed water while road banks remain intact
    const rivAx = 266.3;
    const rivAz = -178.73;
    const rivBx = 210.01;
    const rivBz = -123.3;
    const rivDx = rivBx - rivAx;
    const rivDz = rivBz - rivAz;
    const rivLenSq = rivDx * rivDx + rivDz * rivDz;

    for (let i = 0; i < pos.count; i++) {
      let h = heights[i] ?? 0;
      const vx = pos.getX(i);
      const vz = pos.getZ(i);

      const projT = Math.max(0, Math.min(1, ((vx - rivAx) * rivDx + (vz - rivAz) * rivDz) / rivLenSq));
      const cx = rivAx + rivDx * projT;
      const cz = rivAz + rivDz * projT;
      const distToRiv = Math.hypot(vx - cx, vz - cz);
      if (distToRiv < 15.8 && h > 0.05) {
        const channelMask = THREE.MathUtils.smoothstep(15.8 - distToRiv, 0, 4.8);
        h = THREE.MathUtils.lerp(h, 0.05, channelMask);
      }

      pos.setY(i, h);
      const t = Math.min(1, Math.max(0, h / 44));
      tmp.copy(cMeadow).lerp(cSlope, t * 0.45);

      const slope = computeTerrainSlope(WORLD, vx, vz);
      if (slope > 0.36) {
        const bluffBlend = Math.min(0.65, (slope - 0.36) * 1.45);
        tmp.lerp(cDolomiteCliff, bluffBlend);
      }

      for (let wi = 0; wi < WORLD.woods.length; wi++) {
        const wd = WORLD.woods[wi];
        if (wd.kind !== 'park' && pointInPolygon(vx, vz, wd.ring, wd.holes)) {
          tmp.lerp(cForest, 0.5);
          break;
        }
      }

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // Soft organic radial micro-bump so close-up ground keeps natural soil relief without pixel grid artifacts
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 256;
    bumpCanvas.height = 256;
    const bCtx = bumpCanvas.getContext('2d')!;
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 650; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      const r = 6 + Math.random() * 14;
      const bright = Math.random() > 0.5;
      const grad = bCtx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, bright ? 'rgba(185,185,185,0.16)' : 'rgba(65,65,65,0.16)');
      grad.addColorStop(1, 'rgba(128,128,128,0)');
      bCtx.fillStyle = grad;
      bCtx.beginPath();
      bCtx.arc(x, y, r, 0, Math.PI * 2);
      bCtx.fill();
    }

    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.wrapS = THREE.RepeatWrapping;
    bumpTex.wrapT = THREE.RepeatWrapping;
    bumpTex.minFilter = THREE.LinearMipmapLinearFilter;
    bumpTex.magFilter = THREE.LinearFilter;
    bumpTex.repeat.set(38, 38);
    this.extraTextures.push(bumpTex);

    const texAniso = this.getMaxTexAnisotropy();
    const loader = new THREE.TextureLoader();
    const aerialTex = loader.load('/assets/renda_aerial_ground.jpg', (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.wrapS = THREE.ClampToEdgeWrapping;
      loaded.wrapT = THREE.ClampToEdgeWrapping;
      loaded.anisotropy = texAniso;
      loaded.needsUpdate = true;
    });
    aerialTex.colorSpace = THREE.SRGBColorSpace;
    aerialTex.wrapS = THREE.ClampToEdgeWrapping;
    aerialTex.wrapT = THREE.ClampToEdgeWrapping;
    aerialTex.anisotropy = texAniso;
    this.terrainTexture = aerialTex;

    const loadTerrainDetail = (url: string, isColor: boolean) => {
      const t = loader.load(url, (loaded) => {
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.wrapT = THREE.RepeatWrapping;
        loaded.anisotropy = texAniso;
        loaded.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        loaded.needsUpdate = true;
      });
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = texAniso;
      t.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      this.extraTextures.push(t);
      return t;
    };
    const shortGrassDiff = loadTerrainDetail('/assets/textures/lush_meadow/diff.jpg', true);
    const shortGrassNormal = loadTerrainDetail('/assets/textures/lush_meadow/nor_gl.jpg', false);
    const shortGrassRough = loadTerrainDetail('/assets/textures/lush_meadow/rough.jpg', false);
    const grassDiff = loadTerrainDetail('/assets/textures/leafy_grass/diff.jpg', true);
    const grassNormal = loadTerrainDetail('/assets/textures/leafy_grass/nor_gl.jpg', false);
    const grassRough = loadTerrainDetail('/assets/textures/leafy_grass/rough.jpg', false);
    const forestDiff = loadTerrainDetail('/assets/textures/forrest_ground_03/diff.jpg', true);
    const forestNormal = loadTerrainDetail('/assets/textures/forrest_ground_03/nor_gl.jpg', false);
    const cliffDiff = loadTerrainDetail('/assets/textures/aerial_grass_rock/diff.jpg', true);
    const cliffNormal = loadTerrainDetail('/assets/textures/aerial_grass_rock/nor_gl.jpg', false);

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: aerialTex,
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.01,
      envMapIntensity: 0.2,
      bumpMap: bumpTex,
      bumpScale: 0.055,
    });
    enhanceTerrainMaterial(mat, {
      shortGrassDiff,
      shortGrassNormal,
      shortGrassRough,
      grassDiff,
      grassNormal,
      grassRough,
      forestDiff,
      forestNormal,
      cliffDiff,
      cliffNormal,
    });
    const terrain = new THREE.Mesh(geo, mat);
    this.terrainMesh = terrain;
    terrain.receiveShadow = true;
    this.scene.add(terrain);
  }

  private buildWaterways(): void {
    // Vertical streaked cascade texture for Ivandes & Valdatu Rumba waterfalls
    const fc = document.createElement('canvas');
    fc.width = 128;
    fc.height = 128;
    const fCtx = fc.getContext('2d')!;
    fCtx.fillStyle = '#b9e2ea';
    fCtx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 80; i++) {
      fCtx.fillStyle = i % 3 === 0 ? '#ffffff' : '#85c4d0';
      fCtx.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 5, 18 + Math.random() * 34);
    }
    this.waterfallTexture = new THREE.CanvasTexture(fc);
    this.waterfallTexture.colorSpace = THREE.SRGBColorSpace;
    this.waterfallTexture.wrapS = THREE.RepeatWrapping;
    this.waterfallTexture.wrapT = THREE.RepeatWrapping;

    this.waterMaterial = createAbavaWaterMaterial(
      this.windTimeUniform,
      this.sunDirUniform,
      this.sunColorUniform,
      this.skyColorUniform,
      this.horizonColorUniform
    );

    for (const ww of WORLD.waterways) {
      if (ww.pts.length < 2) continue;
      let cleanElevs = ww.elevs ? [...ww.elevs] : undefined;
      if (cleanElevs && cleanElevs.length > 4) {
        // Bridge over upward LiDAR DTM spikes (e.g. P120 Abava Bridge deck) while keeping real descending waterfalls intact
        for (let pass = 0; pass < 3; pass++) {
          for (let i = 1; i < cleanElevs.length - 1; i++) {
            let lMin = cleanElevs[i];
            let lIdx = i;
            for (let k = Math.max(0, i - 6); k < i; k++) {
              if (cleanElevs[k] < lMin) {
                lMin = cleanElevs[k];
                lIdx = k;
              }
            }
            let rMin = cleanElevs[i];
            let rIdx = i;
            for (let k = i + 1; k <= Math.min(cleanElevs.length - 1, i + 6); k++) {
              if (cleanElevs[k] < rMin) {
                rMin = cleanElevs[k];
                rIdx = k;
              }
            }
            if (cleanElevs[i] > Math.max(lMin, rMin) + 0.65 && lIdx < i && rIdx > i) {
              const t = (i - lIdx) / (rIdx - lIdx);
              cleanElevs[i] = lMin + (rMin - lMin) * t;
            }
          }
        }
      }
      // Use real LGIA LiDAR river elevations when present so water follows waterfall steps inside incised channels
      const yOff = cleanElevs ? 0.12 : 0.55;
      const geo = buildRibbonGeometry(ww.pts, ww.width, yOff, 0.04, false, cleanElevs);
      const mesh = new THREE.Mesh(geo, this.waterMaterial);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.waterMeshes.push(mesh);
    }

    // Real OSM village & manor ponds anchored cleanly at LiDAR / local shoreline elevation
    if (WORLD.ponds) {
      for (const pond of WORLD.ponds) {
        if (pond.ring.length < 3) continue;
        const shape = new THREE.Shape();
        for (let i = 0; i < pond.ring.length; i++) {
          const lx = pond.ring[i][0];
          const ly = -pond.ring[i][1];
          if (i === 0) shape.moveTo(lx, ly);
          else shape.lineTo(lx, ly);
        }
        shape.closePath();
        const pGeo = new THREE.ShapeGeometry(shape);
        pGeo.rotateX(-Math.PI / 2);

        let minY = Infinity;
        for (const [px, pz] of pond.ring) {
          const y = groundHeightAt(WORLD, px, pz);
          if (y < minY) minY = y;
        }
        const pMesh = new THREE.Mesh(pGeo, this.waterMaterial);
        pMesh.position.y = Math.max((pond.elev ?? minY) + 0.08, minY + 0.12);
        pMesh.receiveShadow = true;
        this.scene.add(pMesh);
      }
    }
  }

  private buildRoads(): void {
    const asphaltMat = this.materialLib.getMaterial(ROAD_PRESETS[1]);
    enhanceRoadMaterial(
      asphaltMat,
      'asphalt',
      this.wetnessUniform,
      this.sunDirUniform,
      this.sunColorUniform,
      this.skyColorUniform,
      this.horizonColorUniform
    );
    asphaltMat.side = THREE.DoubleSide;
    asphaltMat.polygonOffset = true;
    asphaltMat.polygonOffsetFactor = -4;
    asphaltMat.polygonOffsetUnits = -4;

    const gravelMat = this.materialLib.getMaterial(ROAD_PRESETS[0]);
    enhanceRoadMaterial(
      gravelMat,
      'gravel',
      this.wetnessUniform,
      this.sunDirUniform,
      this.sunColorUniform,
      this.skyColorUniform,
      this.horizonColorUniform
    );
    gravelMat.side = THREE.DoubleSide;
    gravelMat.polygonOffset = true;
    gravelMat.polygonOffsetFactor = -2;
    gravelMat.polygonOffsetUnits = -2;

    const trailMat = this.materialLib.getMaterial({
      ...ROAD_PRESETS[0],
      id: 'footpath_dirt',
      primaryHex: '#5e5543',
      secondaryHex: '#433d2e',
      accentHex: '#4e5438',
      roughness: 0.94,
      weathering: 0.65,
      repeatX: 1.0,
      repeatY: 6.0,
    });
    enhanceRoadMaterial(
      trailMat,
      'trail',
      this.wetnessUniform,
      this.sunDirUniform,
      this.sunColorUniform,
      this.skyColorUniform,
      this.horizonColorUniform
    );
    trailMat.side = THREE.DoubleSide;
    trailMat.polygonOffset = true;
    trailMat.polygonOffsetFactor = -1;
    trailMat.polygonOffsetUnits = -1;

    const stonePierMat = this.materialLib.getMaterial(WALL_PRESETS[3]);
    const concreteDeckMat = new THREE.MeshStandardMaterial({
      color: 0x8e8a80,
      roughness: 0.92,
      metalness: 0.04,
    });
    const steelRailMat = new THREE.MeshStandardMaterial({
      color: 0x8d9396,
      roughness: 0.55,
      metalness: 0.52,
    });

    for (const r of WORLD.roads) {
      if (r.pts.length < 2) continue;
      const isAsphalt =
        r.id === 124755771 ||
        r.surface === 'asphalt' ||
        r.surface === 'paved' ||
        r.kind === 'primary' ||
        r.kind === 'living_street';
      const isTrail = r.kind === 'footway' || r.kind === 'path' || r.kind === 'track' || r.kind === 'steps';

      const yOff = r.kind === 'primary' ? 0.22 : isAsphalt ? 0.19 : isTrail ? 0.07 : 0.14;
      const roadW = isTrail ? Math.max(0.95, r.width * 0.78) : r.width;
      const surfaceKind: 'asphalt' | 'gravel' | 'trail' = isAsphalt ? 'asphalt' : isTrail ? 'trail' : 'gravel';
      const geo = buildRibbonGeometry(r.pts, roadW, yOff, 0.12, Boolean(r.bridge), undefined, surfaceKind);
      const mat = isAsphalt ? asphaltMat : isTrail ? trailMat : gravelMat;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      if (isAsphalt) this.roadAsphaltMeshes.push(mesh);
      else if (!isTrail) this.roadGravelMeshes.push(mesh);

      // P120 Abava Bridge & footbridges: hero concrete-arch haunched bridge for P120 (38786002) & piers for footbridges
      if (r.bridge && r.pts.length >= 2) {
        const p0 = r.pts[0];
        const p1 = r.pts[r.pts.length - 1];
        const span = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);

        // Sidewalks flanking P120 (narrow bridges < 2m running parallel to primary P120) share P120's main structure
        const isParallelSidewalk = r.width < 2.2 && span > 30;
        if (isParallelSidewalk) continue;

        if (r.id === 38786002 || (r.kind === 'primary' && span >= 30)) {
          const abavaBridge = createAbavaBridgeGroup(
            r.pts,
            r.width,
            (x, z) => groundHeightAt(WORLD, x, z),
            stonePierMat,
            concreteDeckMat,
            steelRailMat
          );
          this.scene.add(abavaBridge);
          continue;
        }

        let totalLen = 0;
        for (let i = 1; i < r.pts.length; i++) {
          totalLen += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
        }
        totalLen = Math.max(1, totalLen);

        const startY = groundHeightAt(WORLD, p0[0], p0[1]) + 1.05;
        const endY = groundHeightAt(WORLD, p1[0], p1[1]) + 1.05;
        const deckW = r.width + 0.7;

        const bridgePointY = (t: number, x: number, z: number) => {
          const deckY = startY + (endY - startY) * t + Math.sin(t * Math.PI) * 0.38;
          return Math.max(deckY, groundHeightAt(WORLD, x, z) + 0.55);
        };

        let acc = 0;
        for (let i = 0; i < r.pts.length - 1; i++) {
          const a = r.pts[i];
          const b = r.pts[i + 1];
          const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (segLen < 0.2) continue;

          const t0 = acc / totalLen;
          const t1 = (acc + segLen) / totalLen;
          acc += segLen;

          const ya = bridgePointY(t0, a[0], a[1]);
          const yb = bridgePointY(t1, b[0], b[1]);
          const segMidX = (a[0] + b[0]) * 0.5;
          const segMidY = (ya + yb) * 0.5;
          const segMidZ = (a[1] + b[1]) * 0.5;
          const segYaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
          const segSlope = Math.atan2(yb - ya, segLen);

          const deckSlab = new THREE.Mesh(
            new THREE.BoxGeometry(deckW, 0.52, segLen + 0.25),
            concreteDeckMat
          );
          deckSlab.position.set(segMidX, segMidY - 0.28, segMidZ);
          deckSlab.rotation.order = 'YXZ';
          deckSlab.rotation.y = segYaw;
          deckSlab.rotation.x = -segSlope;
          deckSlab.receiveShadow = true;
          this.scene.add(deckSlab);

          for (const side of [-1, 1]) {
            const off = side * (deckW * 0.5 - 0.14);
            const ox = segMidX + Math.cos(segYaw) * off;
            const oz = segMidZ - Math.sin(segYaw) * off;
            const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, segLen + 0.1), steelRailMat);
            topRail.position.set(ox, segMidY + 0.88, oz);
            topRail.rotation.order = 'YXZ';
            topRail.rotation.y = segYaw;
            topRail.rotation.x = -segSlope;
            this.scene.add(topRail);
          }
        }
      }
    }
  }

  private buildBuildings(): void {
    this.colliders = buildBuildingColliders(WORLD.buildings);
    this.archMaterials = createSharedArchMaterials(this.getMaxTexAnisotropy());
    const archMats = this.archMaterials;

    const timberMat = this.materialLib.getMaterial(WALL_PRESETS[0]);
    const plasterMat = this.materialLib.getMaterial(WALL_PRESETS[1]);
    const brickMat = this.materialLib.getMaterial(WALL_PRESETS[2]);
    const stoneRuinMat = this.materialLib.getMaterial(WALL_PRESETS[3]);
    const barnMat = this.materialLib.getMaterial(WALL_PRESETS[4]);
    const manorOchreMat = this.materialLib.getMaterial(WALL_PRESETS[5]);

    for (const wm of [timberMat, plasterMat, brickMat, stoneRuinMat, barnMat, manorOchreMat]) {
      enhanceBuildingWallMaterial(wm);
    }

    const clayRoofMat = this.materialLib.getMaterial(ROOF_PRESETS[0]);
    const crimsonManorMat = this.materialLib.getMaterial(ROOF_PRESETS[1]);
    const seamRoofMat = this.materialLib.getMaterial(ROOF_PRESETS[2]);
    const zincRoofMat = this.materialLib.getMaterial(ROOF_PRESETS[3]);
    const brownRoofMat = this.materialLib.getMaterial(ROOF_PRESETS[4]);
    const churchSpireMat = this.materialLib.getMaterial(ROOF_PRESETS[5]);

    for (const rm of [clayRoofMat, crimsonManorMat, seamRoofMat, zincRoofMat, brownRoofMat, churchSpireMat]) {
      enhanceBuildingRoofMaterial(rm);
    }

    const windowPlacements: { entry: BuildingEntry; mat4: THREE.Matrix4; withShutter: boolean }[] = [];
    const plinthPlacements: { entry: BuildingEntry; mat4: THREE.Matrix4 }[] = [];
    const fasciaPlacements: { entry: BuildingEntry; mat4: THREE.Matrix4 }[] = [];
    const doorPlacements: { entry: BuildingEntry; doorMat4: THREE.Matrix4; stepMat4: THREE.Matrix4 }[] = [];
    const ridgePlacements: { entry: BuildingEntry; mat4: THREE.Matrix4 }[] = [];
    const chimneyPlacements: { x: number; y: number; z: number; yaw: number }[] = [];
    const winDummy = new THREE.Object3D();

    for (const b of WORLD.buildings) {
      const bounds = computePolygonCentroid(b.ring);
      const baseY = groundHeightAt(WORLD, bounds.cx, bounds.cz);
      const obb = computePrimaryAxisAndBounds(b.ring);
      const displayName =
        b.name && b.street
          ? `${b.name} (${b.street})`
          : b.name || `Renda ${b.kind.replace(/_/g, ' ')} #${String(b.id).slice(-4)}`;

      if (b.kind === 'church') {
        const churchGroup = createRendaChurchGroup(
          plasterMat,
          clayRoofMat,
          churchSpireMat,
          obb.lengthU,
          Math.min(13.2, Math.max(10.5, obb.widthV * 0.78)),
          WORLD.meta.churchSpireH ?? 26.43,
          archMats
        );
        // Align local +X along OSM church axis, ensuring belltower (-X) sits at true West towerXZ
        let churchRotY = -obb.angle;
        if (b.towerXZ) {
          const dirX = Math.cos(obb.angle);
          const dirZ = Math.sin(obb.angle);
          const toTowerX = b.towerXZ[0] - obb.centerX;
          const toTowerZ = b.towerXZ[1] - obb.centerZ;
          // Local tower is at -X, so if dot > 0, flip by PI so -X points toward towerXZ
          if (dirX * toTowerX + dirZ * toTowerZ > 0) {
            churchRotY += Math.PI;
          }
        }
        churchGroup.position.set(obb.centerX, baseY, obb.centerZ);
        churchGroup.rotation.y = churchRotY;
        this.scene.add(churchGroup);

        const wallMesh = churchGroup.children[1] as THREE.Mesh;
        const roofMesh = churchGroup.children[2] as THREE.Mesh;
        wallMesh.userData.buildingId = b.id;
        roofMesh.userData.buildingId = b.id;
        this.interactableWalls.push(wallMesh, roofMesh);
        this.buildingMap.set(b.id, {
          id: b.id,
          name: displayName,
          kind: 'church',
          levels: b.levels,
          cx: obb.centerX,
          cz: obb.centerZ,
          baseY,
          widthM: Math.round(obb.lengthU),
          depthM: Math.round(obb.widthV),
          baseWidthM: Math.round(obb.lengthU),
          baseDepthM: Math.round(obb.widthV),
          radius: bounds.radius,
          baseRadius: bounds.radius,
          ring: b.ring,
          currentRing: b.ring,
          baseWallH: b.wallH ?? 6.0,
          baseRoofH: b.roofH ?? 5.3,
          baseRoofShape: 'gabled',
          currentWallH: b.wallH ?? 6.0,
          wallMesh,
          roofMesh,
          detailGroup: null,
          wallMaterialId: 'lime_plaster',
          roofMaterialId: 'clay_tile',
          baseWallMaterialId: 'lime_plaster',
          baseRoofMaterialId: 'clay_tile',
          customDesign: null,
        });
        continue;
      }

      if (b.kind === 'gate' || b.kind === 'shelter') {
        const propGroup = b.kind === 'gate' ? createGateArchGroup() : createBusShelterGroup();
        propGroup.position.set(obb.centerX, baseY, obb.centerZ);
        if (b.kind === 'gate') {
          const churchLm = WORLD.landmarks.find((l) => l.id === 'church');
          if (churchLm) {
            // Orient +X flagstone walkway & open gate leaves directly toward Renda Church West portal
            propGroup.rotation.y = Math.atan2(-(churchLm.z - obb.centerZ), churchLm.x - obb.centerX);
          } else {
            propGroup.rotation.y = -obb.angle + Math.PI / 2;
          }
        } else {
          propGroup.rotation.y = -obb.angle;
        }
        this.scene.add(propGroup);
        continue;
      }

      const isRuin = b.kind === 'ruins' || b.roof === 'none';
      const isPagrabins = b.id === 790959832;
      const isShopPasts = b.id === 790959825;
      const isCultureHouse = b.id === 790959820;

      // Real LGIA LiDAR building wall heights (keeping two-story prominence for Lielrenda Manor & cellar height for Abavas pagrabiņš)
      const wallH = isRuin
        ? 1.95
        : isPagrabins
        ? 3.75
        : b.kind === 'manor'
        ? Math.max(6.2, b.wallH ?? 6.2)
        : b.wallH && b.wallH >= 2.1
        ? Math.min(14.0, b.wallH)
        : Math.max(2.5, b.levels * 2.95);

      const roofStyle: RoofStyle | 'low_hip' =
        isPagrabins
          ? 'steep_gable'
          : b.roofShape === 'flat' || b.roof === 'flat'
          ? 'flat_modern'
          : b.roofShape === 'low_hip' || b.roof === 'low_hip'
          ? 'low_hip'
          : b.roofShape === 'hipped'
          ? 'pitched_hip'
          : b.roofShape === 'gabled'
          ? 'steep_gable'
          : b.kind === 'barn' || b.kind === 'apartments'
          ? 'low_hip'
          : b.ring.length <= 5
          ? 'steep_gable'
          : 'pitched_hip';

      const roofH = isRuin
        ? 0
        : isPagrabins
        ? 2.45
        : roofStyle === 'flat_modern'
        ? 0.65
        : b.kind === 'manor'
        ? 3.85
        : b.roofH && b.roofH >= 0.85
        ? Math.min(5.6, b.roofH)
        : roofStyle === 'low_hip'
        ? Math.min(2.6, Math.max(1.3, obb.widthV * 0.14))
        : b.kind === 'shed'
        ? Math.min(1.8, Math.max(0.9, obb.widthV * 0.24))
        : Math.min(3.5, Math.max(1.6, obb.widthV * 0.26));

      const wallGeo = this.createBuildingWallGeo(
        b.ring,
        bounds.cx,
        bounds.cz,
        wallH,
        roofH,
        roofStyle
      );

      let wallMat = timberMat;
      let wallMatId = 'kurzeme_timber';
      if (isRuin || isPagrabins) {
        wallMat = stoneRuinMat;
        wallMatId = 'fieldstone';
      } else if (b.kind === 'manor') {
        wallMat = manorOchreMat;
        wallMatId = 'manor_ochre';
      } else if (b.kind === 'public' || b.kind === 'school') {
        wallMat = plasterMat;
        wallMatId = 'lime_plaster';
      } else if (b.kind === 'apartments') {
        wallMat = b.id % 2 === 0 ? brickMat : plasterMat;
        wallMatId = b.id % 2 === 0 ? 'red_brick' : 'lime_plaster';
      } else if (b.kind === 'barn' || b.kind === 'shed' || b.kind === 'farm_auxiliary' || b.kind === 'garage') {
        wallMat = barnMat;
        wallMatId = 'moss_timber';
      } else if (b.id % 5 === 0) {
        wallMat = brickMat;
        wallMatId = 'red_brick';
      } else if (b.id % 4 === 0) {
        wallMat = plasterMat;
        wallMatId = 'lime_plaster';
      }

      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(bounds.cx, baseY - FOUNDATION_DEPTH, bounds.cz);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      wallMesh.userData.buildingId = b.id;
      this.scene.add(wallMesh);
      this.interactableWalls.push(wallMesh);

      let roofMesh: THREE.Mesh | null = null;
      let roofMatId = 'clay_tile';

      if (!isRuin) {
        const roofGeo = buildPitchedRoofGeometry(b.ring, bounds.cx, bounds.cz, roofH, 1.06, roofStyle);
        let roofMat = clayRoofMat;
        if (isPagrabins) {
          roofMat = clayRoofMat;
          roofMatId = 'clay_tile';
        } else if (b.kind === 'manor' || b.roofTone === 'crimson') {
          roofMat = crimsonManorMat;
          roofMatId = 'crimson_manor';
        } else if (b.roofTone === 'clay') {
          roofMat = clayRoofMat;
          roofMatId = 'clay_tile';
        } else if (b.roofTone === 'zinc') {
          roofMat = zincRoofMat;
          roofMatId = 'zinc_seam';
        } else if (b.roofTone === 'brown') {
          roofMat = brownRoofMat;
          roofMatId = 'weathered_brown';
        } else if (b.roofTone === 'slate') {
          roofMat = seamRoofMat;
          roofMatId = 'standing_seam';
        } else {
          const useSeam =
            b.kind === 'barn' ||
            b.kind === 'apartments' ||
            b.kind === 'shed' ||
            b.id % 3 === 0 ||
            b.roof === 'flat';
          roofMat = useSeam ? seamRoofMat : clayRoofMat;
          roofMatId = useSeam ? 'standing_seam' : 'clay_tile';
        }

        roofMesh = new THREE.Mesh(roofGeo, roofMat);
        roofMesh.position.set(bounds.cx, baseY + wallH, bounds.cz);
        roofMesh.castShadow = true;
        roofMesh.receiveShadow = true;
        roofMesh.userData.buildingId = b.id;
        this.scene.add(roofMesh);
        this.interactableWalls.push(roofMesh);

        // Queue Latvian masonry chimney on inhabited village buildings (skip custom-chimney hero landmarks)
        if (
          !isShopPasts &&
          !isPagrabins &&
          !isCultureHouse &&
          b.kind !== 'manor' &&
          roofStyle !== 'flat_modern' &&
          b.kind !== 'shed' &&
          b.kind !== 'barn' &&
          b.kind !== 'garage' &&
          obb.lengthU >= 7
        ) {
          const chOff = obb.lengthU * 0.16;
          chimneyPlacements.push({
            x: obb.centerX + Math.cos(obb.angle) * chOff,
            y: baseY + wallH + roofH,
            z: obb.centerZ + Math.sin(obb.angle) * chOff,
            yaw: -obb.angle,
          });
        }
      }

      const isManor = b.kind === 'manor';
      const buildBaseDetails = isManor
        ? () => createLielrendaManorDetails(b.ring, bounds.cx, bounds.cz, wallH, roofH, archMats)
        : isShopPasts
        ? () => createShopPastsDetails(b.ring, bounds.cx, bounds.cz, wallH, roofH, archMats)
        : isPagrabins
        ? () => createPagrabinsCafeDetails(b.ring, bounds.cx, bounds.cz, wallH, roofH, archMats)
        : isCultureHouse
        ? () => createCultureHouseDetails(b.ring, bounds.cx, bounds.cz, wallH, roofH, archMats)
        : undefined;

      let heroDetailGroup: THREE.Group | null = null;
      if (buildBaseDetails) {
        heroDetailGroup = buildBaseDetails();
        heroDetailGroup.position.set(bounds.cx, baseY, bounds.cz);
        this.scene.add(heroDetailGroup);
      }

      const entry: BuildingEntry = {
        id: b.id,
        name: displayName,
        kind: b.kind,
        levels: b.levels,
        cx: bounds.cx,
        cz: bounds.cz,
        baseY,
        widthM: Math.round(obb.lengthU),
        depthM: Math.round(obb.widthV),
        baseWidthM: Math.round(obb.lengthU),
        baseDepthM: Math.round(obb.widthV),
        radius: bounds.radius,
        baseRadius: bounds.radius,
        ring: b.ring,
        currentRing: b.ring,
        baseWallH: wallH,
        baseRoofH: roofH,
        baseRoofShape: roofStyle,
        currentWallH: wallH,
        wallMesh,
        roofMesh,
        detailGroup: heroDetailGroup,
        wallMaterialId: wallMatId,
        roofMaterialId: roofMatId,
        baseWallMaterialId: wallMatId,
        baseRoofMaterialId: roofMatId,
        customDesign: null,
        defaultWinIndices: [],
        defaultWinShutterIndices: [],
        defaultTrimIndices: { segIndices: [], doorIndices: [], ridgeIndices: [] },
        buildBaseDetails,
      };
      this.buildingMap.set(b.id, entry);

      // Upgrade ALL non-hero village buildings with stone plinths, eave fascia, entry doors, ridge caps & 4-part windows
      if (!buildBaseDetails && !isRuin) {
        const segs = computeWallSegments(b.ring, bounds.cx, bounds.cz);
        const longestSeg = [...segs].sort((a, b2) => b2.length - a.length)[0] ?? null;

        // Stone foundation plinth + eave fascia trim along each facade wall
        for (const seg of segs) {
          if (seg.length < 1.8) continue;
          winDummy.position.set(
            bounds.cx + seg.midX + seg.normalX * 0.04,
            baseY - 0.14,
            bounds.cz + seg.midZ + seg.normalZ * 0.04
          );
          winDummy.rotation.set(0, seg.yaw, 0);
          winDummy.scale.set(seg.length + 0.14, 1, 1);
          winDummy.updateMatrix();
          plinthPlacements.push({ entry, mat4: winDummy.matrix.clone() });

          winDummy.position.set(
            bounds.cx + seg.midX + seg.normalX * 0.07,
            baseY + wallH - 0.09,
            bounds.cz + seg.midZ + seg.normalZ * 0.07
          );
          winDummy.scale.set(seg.length + 0.2, 1, 1);
          winDummy.updateMatrix();
          fasciaPlacements.push({ entry, mat4: winDummy.matrix.clone() });
        }

        // Front entry door + granite stoop step on residential / public / shop buildings
        const hasWindows = b.kind !== 'shed' && b.kind !== 'barn' && b.kind !== 'garage';
        if (hasWindows && longestSeg && longestSeg.length >= 4.2 && wallH >= 2.5) {
          winDummy.position.set(
            bounds.cx + longestSeg.midX + longestSeg.normalX * 0.08,
            baseY + 1.12,
            bounds.cz + longestSeg.midZ + longestSeg.normalZ * 0.08
          );
          winDummy.rotation.set(0, longestSeg.yaw, 0);
          winDummy.scale.set(1, 1, 1);
          winDummy.updateMatrix();
          const doorM = winDummy.matrix.clone();

          winDummy.position.set(
            bounds.cx + longestSeg.midX + longestSeg.normalX * 0.44,
            baseY + 0.08,
            bounds.cz + longestSeg.midZ + longestSeg.normalZ * 0.44
          );
          winDummy.updateMatrix();
          const stepM = winDummy.matrix.clone();
          doorPlacements.push({ entry, doorMat4: doorM, stepMat4: stepM });
        }

        // Roof ridge beam cap on steep_gable roofs
        if (roofStyle === 'steep_gable' && roofH > 0.3) {
          const localPts: [number, number][] = b.ring.map(([rx, rz]) => [rx - bounds.cx, rz - bounds.cz]);
          const gable = computeGableRidgePlan(localPts, 1.0);
          if (gable) {
            const [ax, az] = gable.ridgeA;
            const [bx, bz] = gable.ridgeB;
            const rLen = Math.hypot(bx - ax, bz - az);
            if (rLen >= 2.0) {
              winDummy.position.set(
                bounds.cx + (ax + bx) * 0.5,
                baseY + wallH + roofH + 0.04,
                bounds.cz + (az + bz) * 0.5
              );
              winDummy.rotation.set(0, Math.atan2(bx - ax, bz - az), 0);
              winDummy.scale.set(1, 1, rLen + 0.3);
              winDummy.updateMatrix();
              ridgePlacements.push({ entry, mat4: winDummy.matrix.clone() });
            }
          }
        }

        // Multi-part architectural windows (frame + reflective interior glass + stone sill + 4-pane cross muntin + shutters)
        if (hasWindows) {
          const stories = wallH >= 5.3 ? 2 : 1;
          const isShutteredHome =
            (b.kind === 'house' || b.kind === 'residential' || b.kind === 'cottage' || wallMatId === 'kurzeme_timber') &&
            b.id % 2 === 0;
          for (const seg of segs) {
            if (seg.length < 3.4) continue;
            const winCount = Math.min(5, Math.max(1, Math.floor((seg.length - 1.4) / 3.1)));
            const tx = -seg.normalZ;
            const tz = seg.normalX;
            for (let fl = 0; fl < stories; fl++) {
              const wy = baseY + (stories === 1 ? wallH * 0.54 : fl === 0 ? wallH * 0.34 : wallH * 0.72);
              for (let wi = 0; wi < winCount; wi++) {
                const frac = winCount === 1 ? 0 : (wi / (winCount - 1) - 0.5) * (seg.length - 2.6);
                if (fl === 0 && seg === longestSeg && Math.abs(frac) < 1.15) continue;
                winDummy.position.set(
                  bounds.cx + seg.midX + tx * frac + seg.normalX * 0.06,
                  wy,
                  bounds.cz + seg.midZ + tz * frac + seg.normalZ * 0.06
                );
                winDummy.rotation.set(0, seg.yaw, 0);
                winDummy.scale.set(1, 1, 1);
                winDummy.updateMatrix();
                windowPlacements.push({ entry, mat4: winDummy.matrix.clone(), withShutter: isShutteredHome });
              }
            }
          }
        }
      }
    }

    // Build shared 3-draw-call InstancedMesh for all village chimneys (2K brick + stone cornice cap + terracotta pots)
    if (chimneyPlacements.length > 0) {
      const chBodyGeo = ensureGeometryUv2(new THREE.BoxGeometry(0.68, 2.3, 0.68));
      const chCapGeo = ensureGeometryUv2(new THREE.BoxGeometry(0.88, 0.16, 0.88));
      const chPotGeo = ensureGeometryUv2(new THREE.CylinderGeometry(0.11, 0.14, 0.42, 10));
      const chBody = new THREE.InstancedMesh(chBodyGeo, archMats.brickChimneyMat, chimneyPlacements.length);
      const chCap = new THREE.InstancedMesh(chCapGeo, archMats.chimneyCapMat, chimneyPlacements.length);
      const chPot = new THREE.InstancedMesh(chPotGeo, archMats.terracottaPotMat, chimneyPlacements.length);
      for (let i = 0; i < chimneyPlacements.length; i++) {
        const c = chimneyPlacements[i];
        winDummy.position.set(c.x, c.y - 0.15, c.z);
        winDummy.rotation.set(0, c.yaw, 0);
        winDummy.scale.set(1, 1, 1);
        winDummy.updateMatrix();
        chBody.setMatrixAt(i, winDummy.matrix);

        winDummy.position.set(c.x, c.y + 1.06, c.z);
        winDummy.updateMatrix();
        chCap.setMatrixAt(i, winDummy.matrix);

        winDummy.position.set(c.x, c.y + 1.32, c.z);
        winDummy.updateMatrix();
        chPot.setMatrixAt(i, winDummy.matrix);
      }
      chBody.instanceMatrix.needsUpdate = true;
      chCap.instanceMatrix.needsUpdate = true;
      chPot.instanceMatrix.needsUpdate = true;
      chBody.computeBoundingSphere();
      chCap.computeBoundingSphere();
      chPot.computeBoundingSphere();
      this.scene.add(chBody, chCap, chPot);
    }

    // Build shared instanced village stone plinths (2K medieval_blocks_05) & painted wood eave fascia
    if (plinthPlacements.length > 0) {
      this.defaultPlinthMesh = new THREE.InstancedMesh(
        ensureGeometryUv2(new THREE.BoxGeometry(1, 0.92, 0.15)),
        archMats.stonePlinthMat,
        plinthPlacements.length
      );
      this.defaultFasciaMesh = new THREE.InstancedMesh(
        ensureGeometryUv2(new THREE.BoxGeometry(1, 0.18, 0.18)),
        archMats.woodFasciaMat,
        fasciaPlacements.length
      );
      for (let i = 0; i < plinthPlacements.length; i++) {
        this.defaultPlinthMesh.setMatrixAt(i, plinthPlacements[i].mat4);
        this.defaultPlinthTransforms.push(plinthPlacements[i].mat4);
        plinthPlacements[i].entry.defaultTrimIndices?.segIndices.push(i);
      }
      for (let i = 0; i < fasciaPlacements.length; i++) {
        this.defaultFasciaMesh.setMatrixAt(i, fasciaPlacements[i].mat4);
        this.defaultFasciaTransforms.push(fasciaPlacements[i].mat4);
      }
      this.defaultPlinthMesh.instanceMatrix.needsUpdate = true;
      this.defaultFasciaMesh.instanceMatrix.needsUpdate = true;
      this.defaultPlinthMesh.computeBoundingSphere();
      this.defaultFasciaMesh.computeBoundingSphere();
      this.scene.add(this.defaultPlinthMesh, this.defaultFasciaMesh);
    }

    // Build shared instanced village paneled timber front doors & granite steps
    if (doorPlacements.length > 0) {
      this.defaultDoorMesh = new THREE.InstancedMesh(
        ensureGeometryUv2(new THREE.BoxGeometry(1.06, 2.12, 0.14)),
        archMats.woodDoorMat,
        doorPlacements.length
      );
      this.defaultDoorStepMesh = new THREE.InstancedMesh(
        ensureGeometryUv2(new THREE.BoxGeometry(1.55, 0.24, 0.75)),
        archMats.graniteStepMat,
        doorPlacements.length
      );
      for (let i = 0; i < doorPlacements.length; i++) {
        this.defaultDoorMesh.setMatrixAt(i, doorPlacements[i].doorMat4);
        this.defaultDoorStepMesh.setMatrixAt(i, doorPlacements[i].stepMat4);
        this.defaultDoorTransforms.push(doorPlacements[i].doorMat4);
        this.defaultDoorStepTransforms.push(doorPlacements[i].stepMat4);
        doorPlacements[i].entry.defaultTrimIndices?.doorIndices.push(i);
      }
      this.defaultDoorMesh.instanceMatrix.needsUpdate = true;
      this.defaultDoorStepMesh.instanceMatrix.needsUpdate = true;
      this.defaultDoorMesh.computeBoundingSphere();
      this.defaultDoorStepMesh.computeBoundingSphere();
      this.scene.add(this.defaultDoorMesh, this.defaultDoorStepMesh);
    }

    // Build shared instanced zinc roof ridge caps
    if (ridgePlacements.length > 0) {
      this.defaultRidgeMesh = new THREE.InstancedMesh(
        ensureGeometryUv2(new THREE.BoxGeometry(0.24, 0.14, 1)),
        archMats.zincRidgeMat,
        ridgePlacements.length
      );
      for (let i = 0; i < ridgePlacements.length; i++) {
        this.defaultRidgeMesh.setMatrixAt(i, ridgePlacements[i].mat4);
        this.defaultRidgeTransforms.push(ridgePlacements[i].mat4);
        ridgePlacements[i].entry.defaultTrimIndices?.ridgeIndices.push(i);
      }
      this.defaultRidgeMesh.instanceMatrix.needsUpdate = true;
      this.defaultRidgeMesh.computeBoundingSphere();
      this.scene.add(this.defaultRidgeMesh);
    }

    // Build shared 5-draw-call InstancedMesh for all village windows (frame + interior-curtain reflective glass + granite sill/lintel + 4-pane cross muntin + shutters)
    if (windowPlacements.length > 0) {
      const totalWins = windowPlacements.length;

      this.defaultWinFrameMesh = new THREE.InstancedMesh(
        ensureGeometryUv2(new THREE.BoxGeometry(1.08, 1.28, 0.1)),
        archMats.woodFrameMat,
        totalWins
      );
      this.defaultWinGlassMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.84, 1.04, 0.13),
        archMats.windowGlassMat,
        totalWins
      );
      const botSillGeo = new THREE.BoxGeometry(1.22, 0.09, 0.18).translate(0, -0.66, 0.04);
      const topLintelGeo = new THREE.BoxGeometry(1.24, 0.1, 0.16).translate(0, 0.67, 0.03);
      const mergedSillGeo = ensureGeometryUv2(mergeGeometries([botSillGeo, topLintelGeo], false) ?? botSillGeo);
      botSillGeo.dispose();
      topLintelGeo.dispose();

      this.defaultWinSillMesh = new THREE.InstancedMesh(
        mergedSillGeo,
        archMats.graniteSillMat,
        totalWins
      );
      const vBarGeo = new THREE.BoxGeometry(0.05, 1.04, 0.15);
      const hBarGeo = new THREE.BoxGeometry(0.84, 0.045, 0.15).translate(0, 0.12, 0);
      const mergedMullGeo = ensureGeometryUv2(mergeGeometries([vBarGeo, hBarGeo], false) ?? vBarGeo);
      vBarGeo.dispose();
      hBarGeo.dispose();
      this.defaultWinMullionMesh = new THREE.InstancedMesh(
        mergedMullGeo,
        archMats.woodFrameMat,
        totalWins
      );

      const shutterList = windowPlacements.filter((w) => w.withShutter);
      if (shutterList.length > 0) {
        const leftShut = new THREE.BoxGeometry(0.34, 1.22, 0.07).translate(-0.72, 0, 0.03);
        const rightShut = new THREE.BoxGeometry(0.34, 1.22, 0.07).translate(0.72, 0, 0.03);
        const mergedShutGeo = ensureGeometryUv2(mergeGeometries([leftShut, rightShut], false) ?? leftShut);
        leftShut.dispose();
        rightShut.dispose();
        this.defaultWinShutterMesh = new THREE.InstancedMesh(
          mergedShutGeo,
          archMats.woodShutterMat,
          shutterList.length
        );
        for (let si = 0; si < shutterList.length; si++) {
          this.defaultWinShutterMesh.setMatrixAt(si, shutterList[si].mat4);
          this.defaultWinShutterTransforms.push(shutterList[si].mat4);
          shutterList[si].entry.defaultWinShutterIndices?.push(si);
        }
        this.defaultWinShutterMesh.instanceMatrix.needsUpdate = true;
        this.defaultWinShutterMesh.computeBoundingSphere();
        this.scene.add(this.defaultWinShutterMesh);
      }

      for (let i = 0; i < totalWins; i++) {
        const { entry, mat4 } = windowPlacements[i];
        this.defaultWinFrameMesh.setMatrixAt(i, mat4);
        this.defaultWinGlassMesh.setMatrixAt(i, mat4);
        this.defaultWinSillMesh.setMatrixAt(i, mat4);
        this.defaultWinMullionMesh.setMatrixAt(i, mat4);
        this.defaultWinTransforms.push(mat4);
        entry.defaultWinIndices?.push(i);
      }
      this.defaultWinFrameMesh.instanceMatrix.needsUpdate = true;
      this.defaultWinGlassMesh.instanceMatrix.needsUpdate = true;
      this.defaultWinSillMesh.instanceMatrix.needsUpdate = true;
      this.defaultWinMullionMesh.instanceMatrix.needsUpdate = true;
      this.scene.add(
        this.defaultWinFrameMesh,
        this.defaultWinGlassMesh,
        this.defaultWinSillMesh,
        this.defaultWinMullionMesh
      );
    }
  }

  private createBuildingWallGeo(
    ring: [number, number][],
    cx: number,
    cz: number,
    wallH: number,
    roofH = 0,
    roofStyle: RoofStyle | 'low_hip' = 'pitched_hip'
  ): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    for (let i = 0; i < ring.length; i++) {
      const lx = ring[i][0] - cx;
      const ly = -(ring[i][1] - cz);
      if (i === 0) shape.moveTo(lx, ly);
      else shape.lineTo(lx, ly);
    }
    shape.closePath();

    const extruded = new THREE.ExtrudeGeometry(shape, {
      depth: wallH + FOUNDATION_DEPTH,
      bevelEnabled: false,
    });
    extruded.rotateX(-Math.PI / 2);

    const uvAttr = extruded.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) * BUILDING_UV_METER_SCALE, uvAttr.getY(i) * BUILDING_UV_METER_SCALE);
    }

    // Add vertical gable-end walls when roofStyle is steep_gable or gambrel
    if ((roofStyle === 'steep_gable' || roofStyle === 'gambrel') && roofH > 0.2) {
      const localPts: [number, number][] = ring.map(([rx, rz]) => [rx - cx, rz - cz]);
      const gable = computeGableRidgePlan(localPts, 1.0);
      if (gable) {
        const baseGeo = extruded.index ? extruded.toNonIndexed() : extruded;
        if (baseGeo !== extruded) extruded.dispose();

        const oldPos = baseGeo.attributes.position as THREE.BufferAttribute;
        const oldUv = baseGeo.attributes.uv as THREE.BufferAttribute;
        const oldPosArr = oldPos.array as Float32Array;
        const oldUvArr = oldUv.array as Float32Array;

        const topWallY = wallH + FOUNDATION_DEPTH;
        const peakY = topWallY + roofH;
        const breakY = topWallY + roofH * 0.58;
        const addTris: number[] = [];
        const addUvs: number[] = [];

        for (const [endPts, ridge] of [
          [gable.eaveEndA, gable.ridgeA],
          [gable.eaveEndB, gable.ridgeB],
        ] as [[[number, number], [number, number]], [number, number]][]) {
          const [p0, p1] = endPts;
          const span = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          if (roofStyle === 'gambrel') {
            const b0x = p0[0] + (ridge[0] - p0[0]) * 0.42;
            const b0z = p0[1] + (ridge[1] - p0[1]) * 0.42;
            const b1x = p1[0] + (ridge[0] - p1[0]) * 0.42;
            const b1z = p1[1] + (ridge[1] - p1[1]) * 0.42;
            addTris.push(
              p0[0], topWallY, p0[1], b0x, breakY, b0z, p1[0], topWallY, p1[1],
              p1[0], topWallY, p1[1], b0x, breakY, b0z, b1x, breakY, b1z,
              b0x, breakY, b0z, ridge[0], peakY, ridge[1], b1x, breakY, b1z
            );
            const s = BUILDING_UV_METER_SCALE;
            addUvs.push(
              0, topWallY * s, span * 0.21 * s, breakY * s, span * s, topWallY * s,
              span * s, topWallY * s, span * 0.21 * s, breakY * s, span * 0.79 * s, breakY * s,
              span * 0.21 * s, breakY * s, span * 0.5 * s, peakY * s, span * 0.79 * s, breakY * s
            );
          } else {
            // Outward CCW winding: [p0_eave, ridge_peak, p1_eave]
            addTris.push(
              p0[0], topWallY, p0[1],
              ridge[0], peakY, ridge[1],
              p1[0], topWallY, p1[1]
            );
            const s = BUILDING_UV_METER_SCALE;
            addUvs.push(0, topWallY * s, span * 0.5 * s, peakY * s, span * s, topWallY * s);
          }
        }

        const mergedPos = new Float32Array(oldPosArr.length + addTris.length);
        mergedPos.set(oldPosArr, 0);
        mergedPos.set(addTris, oldPosArr.length);

        const mergedUv = new Float32Array(oldUvArr.length + addUvs.length);
        mergedUv.set(oldUvArr, 0);
        mergedUv.set(addUvs, oldUvArr.length);

        baseGeo.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
        baseGeo.setAttribute('uv', new THREE.BufferAttribute(mergedUv, 2));
        ensureGeometryUv2(baseGeo);
        baseGeo.computeVertexNormals();
        return baseGeo;
      }
    }

    ensureGeometryUv2(extruded);
    return extruded;
  }

  private buildTrees(): void {
    const lidarTrees = WORLD.trees ?? [];
    const maxPines = 1680;
    const maxSpruces = 1280;
    const maxBirches = 1060;
    const maxOaks = 650;
    const maxShrubs = 1500;

    const dummy = new THREE.Object3D();
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const churchLm = WORLD.landmarks.find((l) => l.id === 'church');
    const ivandeLm = WORLD.landmarks.find((l) => l.id === 'ivande_rumba');
    const valdatuLm = WORLD.landmarks.find((l) => l.id === 'valdatu_rumba');

    const distPointToSegment = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
      const abx = bx - ax;
      const abz = bz - az;
      const abLenSq = abx * abx + abz * abz || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / abLenSq));
      return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
    };

    const isClearSpot = (x: number, z: number, checkChurchCorridor = false) => {
      if (Math.hypot(x - WORLD.meta.spawnX, z - WORLD.meta.spawnZ) < 16) return false;
      if (churchLm) {
        if (Math.hypot(x - churchLm.x, z - churchLm.z) < 11.5) return false;
        if (
          checkChurchCorridor &&
          distPointToSegment(x, z, WORLD.meta.spawnX, WORLD.meta.spawnZ, churchLm.x, churchLm.z) < 7.2
        ) {
          return false;
        }
      }
      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (Math.hypot(x - c.cx, z - c.cz) < c.radius + 3.5) return false;
      }
      return true;
    };

    const isInsideAnyWood = (x: number, z: number) => {
      for (let i = 0; i < WORLD.woods.length; i++) {
        const wd = WORLD.woods[i];
        if (pointInPolygon(x, z, wd.ring, wd.holes)) return wd.kind === 'park' ? 'park' : 'wood';
      }
      return null;
    };

    let placedPine = 0;
    let placedSpruce = 0;
    let placedBirch = 0;
    let placedOak = 0;

    const records: TreeInstanceRecord[] = [];
    this.shrubPlacements = [];

    const buildTreeMatrix = (
      x: number,
      z: number,
      sXZ: number,
      sY: number,
      yaw: number,
      leanX: number,
      leanZ: number
    ) => {
      const y = groundHeightAt(WORLD, x, z);
      dummy.position.set(x, y, z);
      dummy.scale.set(sXZ, sY, sXZ);
      dummy.rotation.set(leanX, yaw, leanZ, 'YXZ');
      dummy.updateMatrix();
      return dummy.matrix.clone();
    };

    const addPine = (x: number, z: number, heightM: number) => {
      if (placedPine >= maxPines) return;
      const sY = Math.max(0.48, Math.min(2.25, heightM / 10.6));
      const sXZ = sY * (0.9 + rand() * 0.22);
      const variant = (placedPine % 2) as 0 | 1;
      records.push({
        species: 'pine',
        variant,
        x,
        z,
        matrix: buildTreeMatrix(x, z, sXZ, sY, rand() * Math.PI * 2, (rand() - 0.5) * 0.05, (rand() - 0.5) * 0.05),
        barkColor: new THREE.Color(0.92 + rand() * 0.12, 0.9 + rand() * 0.1, 0.88 + rand() * 0.1),
        canopyColor: new THREE.Color().setHSL(0.28 + (rand() - 0.5) * 0.035, 0.14, 0.78 + rand() * 0.14),
      });
      placedPine++;
    };

    const addSpruce = (x: number, z: number, heightM: number) => {
      if (placedSpruce >= maxSpruces) return;
      const sY = Math.max(0.48, Math.min(2.25, heightM / 10.6));
      const sXZ = sY * (0.88 + rand() * 0.22);
      const variant = (placedSpruce % 2) as 0 | 1;
      records.push({
        species: 'spruce',
        variant,
        x,
        z,
        matrix: buildTreeMatrix(x, z, sXZ, sY, rand() * Math.PI * 2, (rand() - 0.5) * 0.035, (rand() - 0.5) * 0.035),
        barkColor: new THREE.Color(0.88 + rand() * 0.12, 0.87 + rand() * 0.12, 0.86 + rand() * 0.12),
        canopyColor: new THREE.Color().setHSL(0.32 + (rand() - 0.5) * 0.03, 0.14, 0.76 + rand() * 0.14),
      });
      placedSpruce++;
    };

    const addBirch = (x: number, z: number, heightM: number) => {
      if (placedBirch >= maxBirches) return;
      const sY = Math.max(0.48, Math.min(2.05, heightM / 10.3));
      const sXZ = sY * (0.9 + rand() * 0.24);
      const variant = (placedBirch % 2) as 0 | 1;
      records.push({
        species: 'birch',
        variant,
        x,
        z,
        matrix: buildTreeMatrix(x, z, sXZ, sY, rand() * Math.PI * 2, (rand() - 0.5) * 0.07, (rand() - 0.5) * 0.07),
        barkColor: new THREE.Color(0.94 + rand() * 0.08, 0.93 + rand() * 0.08, 0.91 + rand() * 0.08),
        canopyColor: new THREE.Color().setHSL(0.245 + (rand() - 0.5) * 0.035, 0.20, 0.68 + rand() * 0.14),
      });
      placedBirch++;
    };

    const addOak = (x: number, z: number, heightM: number) => {
      if (placedOak >= maxOaks) return;
      const sY = Math.max(0.55, Math.min(2.05, heightM / 10.4));
      const sXZ = sY * (0.96 + rand() * 0.22);
      const variant = (placedOak % 2) as 0 | 1;
      records.push({
        species: 'oak',
        variant,
        x,
        z,
        matrix: buildTreeMatrix(x, z, sXZ, sY, rand() * Math.PI * 2, (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.04),
        barkColor: new THREE.Color(0.88 + rand() * 0.14, 0.87 + rand() * 0.12, 0.84 + rand() * 0.12),
        canopyColor: new THREE.Color().setHSL(0.26 + (rand() - 0.5) * 0.04, 0.20, 0.66 + rand() * 0.14),
      });
      placedOak++;
    };

    // 1. Place real mapped OSM hero trees (churchyard oaks/lindens & manor park giants)
    const placedHeroCoords: [number, number][] = [];
    if (WORLD.mappedTrees) {
      for (const mt of WORLD.mappedTrees) {
        addOak(mt.x, mt.z, 14.5 + rand() * 4.0);
        placedHeroCoords.push([mt.x, mt.z]);
      }
    }

    // 2. Place real OSM roadside & manor park tree alleys (natural=tree_row)
    if (WORLD.treeRows) {
      for (const row of WORLD.treeRows) {
        for (let i = 1; i < row.length; i++) {
          const [x0, z0] = row[i - 1];
          const [x1, z1] = row[i];
          const dist = Math.hypot(x1 - x0, z1 - z0);
          const count = Math.max(1, Math.floor(dist / 10));
          for (let k = 0; k < count; k++) {
            const t = k / count;
            const tx = x0 + (x1 - x0) * t;
            const tz = z0 + (z1 - z0) * t;
            if (isClearSpot(tx, tz, false)) {
              if (rand() < 0.55) addOak(tx, tz, 13.0 + rand() * 3.5);
              else addBirch(tx, tz, 12.0 + rand() * 3.0);
              placedHeroCoords.push([tx, tz]);
            }
          }
        }
      }
    }

    // 3. Place all LGIA LiDAR CHM canopy peaks (3,100 real trees with real-life heights & balanced Kurzeme species)
    if (lidarTrees.length > 0) {
      for (let i = 0; i < lidarTrees.length; i++) {
        const [tx, tz, hM, rawSp] = lidarTrees[i];
        if (!isClearSpot(tx, tz, true)) continue;
        let nearHero = false;
        for (let hi = 0; hi < placedHeroCoords.length; hi++) {
          const dx = tx - placedHeroCoords[hi][0];
          const dz = tz - placedHeroCoords[hi][1];
          if (dx * dx + dz * dz < 25) {
            nearHero = true;
            break;
          }
        }
        if (nearHero) continue;

        const wKind = isInsideAnyWood(tx, tz);
        const riv = findNearestRiverPoint(WORLD.waterways, tx, tz);
        const nearRiver = Boolean(riv && riv.distance <= riv.width + 26);
        let sp = rawSp;

        // Rebalance leaf-off LiDAR echo classification inside village yards, manor parks, and riverbanks
        if (wKind === 'park' || nearRiver || !wKind) {
          if ((sp === 0 || sp === 1) && rand() < 0.7) {
            sp = rand() < 0.58 ? 2 : 3;
          }
        }

        if (sp === 2) addBirch(tx, tz, hM);
        else if (sp === 3) addOak(tx, tz, hM);
        else if (sp === 1) addSpruce(tx, tz, hM);
        else addPine(tx, tz, hM);
      }
    } else {
      let attempts = 0;
      while ((placedPine < 900 || placedBirch < 400) && attempts < 12000) {
        attempts++;
        const x = (rand() * 2 - 1) * (WORLD.meta.halfW - 25);
        const z = (rand() * 2 - 1) * (WORLD.meta.halfH - 25);
        const wKind = isInsideAnyWood(x, z);
        if (!wKind || !isClearSpot(x, z, true)) continue;
        if (wKind === 'park') addOak(x, z, 13 + rand() * 5);
        else if (rand() < 0.72) addPine(x, z, 14 + rand() * 6);
        else addBirch(x, z, 11 + rand() * 4);
      }
    }

    // 3B. Multi-story woodland understory saplings (shares ez-tree buckets = zero extra downloads/draw calls)
    let saplingsAdded = 0;
    for (let attempt = 0; attempt < 900 && saplingsAdded < 260; attempt++) {
      const ang = rand() * Math.PI * 2;
      const dist = 28 + rand() * 520;
      const sx = WORLD.meta.centerX + Math.cos(ang) * dist;
      const sz = WORLD.meta.centerZ + Math.sin(ang) * dist;
      const wKind = isInsideAnyWood(sx, sz);
      if (!wKind || !isClearSpot(sx, sz, true)) continue;
      let onRoadOrWater = false;
      for (const r of WORLD.roads) {
        if (r.pts.length < 2) continue;
        for (let k = 0; k < r.pts.length - 1; k++) {
          if (distPointToSegment(sx, sz, r.pts[k][0], r.pts[k][1], r.pts[k + 1][0], r.pts[k + 1][1]) < r.width * 0.5 + 2.5) {
            onRoadOrWater = true;
            break;
          }
        }
        if (onRoadOrWater) break;
      }
      if (onRoadOrWater) continue;
      const riv = findNearestRiverPoint(WORLD.waterways, sx, sz);
      if (riv && riv.distance < riv.width * 0.55 + 2.0) continue;

      const sapH = 3.2 + rand() * 2.4;
      const roll = rand();
      if (roll < 0.42) addSpruce(sx, sz, sapH);
      else if (roll < 0.76) addBirch(sx, sz, sapH);
      else addPine(sx, sz, sapH + 0.6);
      saplingsAdded++;
    }

    // 4. Collect riparian bank & village/park edge shrub anchors (rendered as 3D Poly Haven shrub_02/03/04 GLTFs)
    const riparianCap = 380;
    for (const ww of WORLD.waterways) {
      for (let i = 1; i < ww.pts.length - 1; i += 2) {
        if (this.shrubPlacements.length >= riparianCap) break;
        const [wx, wz] = ww.pts[i];
        const next = ww.pts[i + 1];
        const prev = ww.pts[i - 1];
        let dx = next[0] - prev[0];
        let dz = next[1] - prev[1];
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
        const side = i % 4 === 1 ? 1 : -1;
        const off = ww.width * 0.65 + 2.8 + rand() * 5.0;
        const sx = wx - dz * side * off;
        const sz = wz + dx * side * off;
        if (!isClearSpot(sx, sz, false)) continue;
        if (ivandeLm && Math.hypot(sx - ivandeLm.x, sz - ivandeLm.z) < 16) continue;
        if (valdatuLm && Math.hypot(sx - valdatuLm.x, sz - valdatuLm.z) < 16) continue;
        if (computeTerrainSlope(WORLD, sx, sz) > 0.45) continue;
        this.shrubPlacements.push({
          x: sx,
          y: groundHeightAt(WORLD, sx, sz),
          z: sz,
          scale: 0.78 + rand() * 0.56,
          yaw: rand() * Math.PI * 2,
          tint: new THREE.Color().setHSL(0.25 + (rand() - 0.5) * 0.04, 0.22, 0.92 + rand() * 0.16),
        });
      }
    }

    // Add park, churchyard, manor-lawn, roadside hedgerow & woodland-edge ornamental/hazel shrubs
    const shrubAnchors: [number, number, number][] = [
      [168, 38, 44],    // Spawn meadow & roadside ditch hedgerows
      [192, 68, 48],    // Spawn-to-church edges
      [212, 102, 54],   // Renda churchyard borders
      [245, -28, 52],   // Culture House park
      [242, -144, 58],  // Abava bridge & millrace edges
      [-122, -686, 72], // Lielrenda Manor park
      [405, 117, 54],   // Ivande waterfall gorge woods
      [158, 18, 48],    // Village green borders
      [84, -32, 54],    // West road hedgerow & treeline margin
      [-878, -110, 56], // Valdatu Rumba woodland rim
    ];
    for (let attempt = 0; attempt < 3200 && this.shrubPlacements.length < maxShrubs; attempt++) {
      const [ax, az, rad] = shrubAnchors[attempt % shrubAnchors.length];
      const ang = rand() * Math.PI * 2;
      const dist = 7 + rand() * rad;
      const sx = ax + Math.cos(ang) * dist;
      const sz = az + Math.sin(ang) * dist;
      if (!isClearSpot(sx, sz, true)) continue;
      if (computeTerrainSlope(WORLD, sx, sz) > 0.38) continue;
      let onRoad = false;
      for (const r of WORLD.roads) {
        if (r.pts.length < 2) continue;
        for (let k = 0; k < r.pts.length - 1; k++) {
          if (distPointToSegment(sx, sz, r.pts[k][0], r.pts[k][1], r.pts[k + 1][0], r.pts[k + 1][1]) < r.width * 0.5 + 1.45) {
            onRoad = true;
            break;
          }
        }
        if (onRoad) break;
      }
      if (onRoad) continue;
      this.shrubPlacements.push({
        x: sx,
        y: groundHeightAt(WORLD, sx, sz),
        z: sz,
        scale: 0.68 + rand() * 0.58,
        yaw: rand() * Math.PI * 2,
        tint: new THREE.Color().setHSL(0.25 + (rand() - 0.5) * 0.045, 0.24, 0.82 + rand() * 0.16),
      });
    }

    // Collect tree base anchors for realistic root-collar ferns, nettles, and moss halos
    this.treeBaseAnchors = records
      .filter((r) => Math.hypot(r.x - WORLD.meta.centerX, r.z - WORLD.meta.centerZ) < 680)
      .slice(0, 1200)
      .map((r) => ({ x: r.x, z: r.z }));

    // Build 2-LOD hierarchical @dgreenheck/ez-tree forest system with 1K PBR bark & photographic leaf atlases
    const { handle, textures } = buildAaaTreeSystem(
      this.scene,
      records,
      this.windTimeUniform,
      this.sunDirUniform,
      this.sunColorUniform,
      this.isSoftwareGl,
      this.getMaxTexAnisotropy(),
      this.camera
    );
    this.treeSystem = handle;
    this.extraTextures.push(...textures);
  }

  private buildSpecialStructures(): void {
    if (!WORLD.specialStructures) return;
    for (const st of WORLD.specialStructures) {
      const y = groundHeightAt(WORLD, st.x, st.z);
      const meshGroup =
        st.kind === 'water_tower'
          ? createWaterTowerGroup(WORLD.meta.waterTowerH ?? 27.49)
          : createBandstandGroup();
      meshGroup.position.set(st.x, y, st.z);
      this.scene.add(meshGroup);
    }
  }

  private buildLandmarks(): void {
    const diaGeo = new THREE.OctahedronGeometry(1.15, 0);
    const diaMat = new THREE.MeshStandardMaterial({
      color: 0xf4b64f,
      emissive: 0xc27722,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.6,
    });

    for (const lm of WORLD.landmarks) {
      const y = groundHeightAt(WORLD, lm.x, lm.z);
      let diaY = y + (lm.id === 'church' ? 32 : 8.5);
      let diaX = lm.x;
      let diaZ = lm.z;

      if (lm.id !== 'church') {
        if (lm.id === 'ivande_rumba' || lm.id === 'valdatu_rumba') {
          const flow = computeWaterwayFlowAtPoint(WORLD, lm.x, lm.z);
          const monument = createLandmarkMonument(lm.id, {
            widthM: lm.id === 'ivande_rumba' ? 11.4 : 9.4,
            dropM: Math.max(1.45, (flow?.dropM ?? 1.65) + 0.25),
            cascadeTex: this.waterfallTexture,
          });
          if (flow && Math.hypot(flow.closestX - lm.x, flow.closestZ - lm.z) < 28) {
            monument.position.set(flow.closestX, flow.downstreamElev + 0.08, flow.closestZ);
            monument.rotation.y = flow.yaw;
            diaX = flow.closestX;
            diaZ = flow.closestZ;
            diaY = flow.upstreamElev + 7.5;
          } else {
            monument.position.set(lm.x, y, lm.z);
          }
          this.scene.add(monument);
        } else {
          const monument = createLandmarkMonument(lm.id);
          monument.position.set(lm.x, y, lm.z);
          this.scene.add(monument);
        }
      }

      const dia = new THREE.Mesh(diaGeo, diaMat.clone());
      dia.position.set(diaX, diaY, diaZ);
      dia.userData.landmarkId = lm.id;
      this.scene.add(dia);
      this.landmarkDiamonds.push(dia);
    }
  }

  private buildSceneryProps(): void {
    // Collect riverbank sedge & mossy dolomite boulder anchors for photoreal GLTF props
    const maxReeds = 380;
    const maxBoulders = 140;
    const dummy = new THREE.Object3D();
    let seed = 4242;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    this.reedPlacements = [];
    this.boulderPlacements = [];

    for (const ww of WORLD.waterways) {
      for (let i = 0; i < ww.pts.length; i += 2) {
        if (this.reedPlacements.length >= maxReeds && this.boulderPlacements.length >= maxBoulders) break;
        const [wx, wz] = ww.pts[i];
        const side = i % 4 === 0 ? 1 : -1;
        const next = ww.pts[Math.min(ww.pts.length - 1, i + 1)];
        const prev = ww.pts[Math.max(0, i - 1)];
        let dx = next[0] - prev[0];
        let dz = next[1] - prev[1];
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
        const nx = -dz * side;
        const nz = dx * side;

        if (this.reedPlacements.length < maxReeds) {
          const offset = ww.width * (0.48 + rand() * 0.24);
          const rx = wx + nx * offset + (rand() - 0.5) * 2.5;
          const rz = wz + nz * offset + (rand() - 0.5) * 2.5;
          const ry = groundHeightAt(WORLD, rx, rz);
          this.reedPlacements.push({
            x: rx,
            y: ry,
            z: rz,
            scale: 0.78 + rand() * 0.58,
            yaw: rand() * Math.PI * 2,
            tint: new THREE.Color().setHSL(0.22 + rand() * 0.05, 0.18, 0.88 + rand() * 0.16),
          });
        }

        if (this.boulderPlacements.length < maxBoulders && rand() < 0.65) {
          const offset = ww.width * (0.52 + rand() * 0.34);
          const bx = wx - nx * offset + (rand() - 0.5) * 2.2;
          const bz = wz - nz * offset + (rand() - 0.5) * 2.2;
          // Keep boulders completely clear of the P120 bridge deck & steep approach slopes
          if (Math.hypot(bx - 246, bz + 150) < 42) continue;
          if (computeTerrainSlope(WORLD, bx, bz) > 0.3) continue;
          const by = groundHeightAt(WORLD, bx, bz);
          const refWaterY = ww.elevs?.[i] ?? groundHeightAt(WORLD, wx, wz);
          if (by > refWaterY + 1.55) continue;
          const sx = 1.05 + rand() * 1.1;
          const sy = 0.72 + rand() * 0.62;
          this.boulderPlacements.push({
            x: bx,
            y: by,
            z: bz,
            sx,
            sy,
            sz: sx * (0.85 + rand() * 0.35),
            rx: (rand() - 0.5) * 0.12,
            ry: rand() * Math.PI * 2,
            rz: (rand() - 0.5) * 0.12,
            tint: new THREE.Color().setHSL(0.11, 0.06, 0.86 + rand() * 0.18),
          });
        }
      }
    }

    // Add photoscanned mossy dolomite river boulders around Ivandes & Valdatu waterfall gorges
    for (const gorgeCenter of [
      [405, 117],
      [310, 60],
    ] as [number, number][]) {
      for (let g = 0; g < 10; g++) {
        const ang = rand() * Math.PI * 2;
        const dist = 6.5 + rand() * 14;
        const bx = gorgeCenter[0] + Math.cos(ang) * dist;
        const bz = gorgeCenter[1] + Math.sin(ang) * dist;
        if (computeTerrainSlope(WORLD, bx, bz) > 0.36) continue;
        const by = groundHeightAt(WORLD, bx, bz);
        const sx = 1.1 + rand() * 0.95;
        const sy = 0.68 + rand() * 0.52;
        this.boulderPlacements.push({
          x: bx,
          y: by,
          z: bz,
          sx,
          sy,
          sz: sx * (0.85 + rand() * 0.3),
          rx: (rand() - 0.5) * 0.12,
          ry: rand() * Math.PI * 2,
          rz: (rand() - 0.5) * 0.12,
          tint: new THREE.Color().setHSL(0.12, 0.08, 0.84 + rand() * 0.16),
        });
      }
    }

    // 1. Gather heritage wooden park bench poses across Renda Church, Lielrenda Manor, Pier, Estrāde & Īvande
    const churchLm = WORLD.landmarks.find((l) => l.id === 'church');
    const manorLm = WORLD.landmarks.find((l) => l.id === 'manor');
    const pierLm = WORLD.landmarks.find((l) => l.id === 'abava_boats');
    const ivandeLm = WORLD.landmarks.find((l) => l.id === 'ivande_rumba');
    const pagrabinsLm = WORLD.landmarks.find((l) => l.id === 'pagrabins');
    const vineyardLm = WORLD.landmarks.find((l) => l.id === 'vini_curlandia');
    const lodgeLm = WORLD.landmarks.find((l) => l.id === 'hunting_lodge');

    const benchPoses: AaaPropsConfig['benches'] = [];
    if (churchLm) {
      benchPoses.push(
        { x: churchLm.x - 22, z: churchLm.z - 8, yaw: 0.3 },
        { x: churchLm.x - 16, z: churchLm.z + 15, yaw: -1.2 }
      );
    }
    if (manorLm) {
      benchPoses.push(
        { x: manorLm.x + 12, z: manorLm.z + 18, yaw: 0.4 },
        { x: manorLm.x - 14, z: manorLm.z + 20, yaw: -0.4 }
      );
    }
    if (pierLm) {
      benchPoses.push({ x: pierLm.x + 7, z: pierLm.z + 6, yaw: 0.9 });
    }
    benchPoses.push(
      { x: 229.0, z: 81.0, yaw: -0.6 },   // Bus shelter rest bench
      { x: 228.0, z: -32.0, yaw: -0.9 },  // Renda estrade park
      { x: 396.0, z: 112.0, yaw: 0.55 }   // Ivandes Rumba viewpoint
    );

    // 2. Heritage streetlamp poses along P120 village core, Renda Church, and Lielrenda Manor drive
    const lampPoses: AaaPropsConfig['lamps'] = [];
    if (churchLm) {
      lampPoses.push(
        { x: churchLm.x - 28, z: churchLm.z - 14, yaw: 0 },
        { x: churchLm.x - 8, z: churchLm.z - 22, yaw: 1.57 },
        { x: churchLm.x + 22, z: churchLm.z - 18, yaw: 3.14 },
        { x: churchLm.x - 36, z: churchLm.z + 18, yaw: 0.5 }
      );
    }
    if (manorLm) {
      lampPoses.push(
        { x: manorLm.x - 24, z: manorLm.z + 24, yaw: 0 },
        { x: manorLm.x + 24, z: manorLm.z + 22, yaw: 3.14 },
        { x: manorLm.x, z: manorLm.z + 36, yaw: 1.57 }
      );
    }
    const p120Roads = WORLD.roads.filter((r) => r.kind === 'primary');
    for (const r of p120Roads) {
      if (r.pts.length < 3) continue;
      for (let i = 1; i < r.pts.length - 1; i += 4) {
        const [rx, rz] = r.pts[i];
        if (Math.hypot(rx - WORLD.meta.centerX, rz - WORLD.meta.centerZ) < 420 && lampPoses.length < 18) {
          lampPoses.push({ x: rx + r.width * 0.65, z: rz + r.width * 0.65, yaw: 0 });
        }
      }
    }

    // Two subtle warm village point lights (unshadowed) so golden/twilight scenes glow cleanly
    if (churchLm) {
      const cy = groundHeightAt(WORLD, churchLm.x - 16, churchLm.z - 12);
      const churchWarm = new THREE.PointLight(0xffbe6b, 16, 48, 1.5);
      churchWarm.position.set(churchLm.x - 16, cy + 5.2, churchLm.z - 12);
      this.scene.add(churchWarm);
      this.warmLights.push(churchWarm);
    }
    if (manorLm) {
      const my = groundHeightAt(WORLD, manorLm.x, manorLm.z + 24);
      const manorWarm = new THREE.PointLight(0xffbe6b, 14, 48, 1.5);
      manorWarm.position.set(manorLm.x, my + 5.2, manorLm.z + 24);
      this.scene.add(manorWarm);
      this.warmLights.push(manorWarm);
    }

    // V3 Village yard details: Courland birch firewood stacks & granite garden flowerbeds
    const woodRackCoords: { x: number; z: number; yaw: number }[] = [];
    for (const col of this.colliders) {
      if (woodRackCoords.length >= 16) break;
      if (col.radius < 4.5 || col.radius > 16) continue;
      if (Math.hypot(col.cx - WORLD.meta.centerX, col.cz - WORLD.meta.centerZ) > 360) continue;
      const ang = ((col.id * 9301 + 49297) % 628) / 100;
      const candX = col.cx + Math.cos(ang) * (col.radius + 2.4);
      const candZ = col.cz + Math.sin(ang) * (col.radius + 2.4);
      const gy = groundHeightAt(WORLD, candX, candZ);
      if (gy < 2.2) continue;
      const blocked = this.colliders.some(
        (c) => Math.hypot(candX - c.cx, candZ - c.cz) < c.radius + 1.6
      );
      if (!blocked) {
        woodRackCoords.push({ x: candX, z: candZ, yaw: ang + Math.PI * 0.5 });
      }
    }

    if (woodRackCoords.length > 0) {
      const logMat = new THREE.MeshStandardMaterial({ color: 0xc9b48f, roughness: 0.9 });
      const barkCapMat = new THREE.MeshStandardMaterial({ color: 0x5d4531, roughness: 0.92 });
      const logGeo = new THREE.CylinderGeometry(0.11, 0.12, 0.58, 7);
      logGeo.rotateX(Math.PI / 2);
      const shelterGeo = new THREE.BoxGeometry(1.75, 0.07, 0.68);
      const postGeo = new THREE.BoxGeometry(0.08, 1.05, 0.08);

      const logsPerRack = 10;
      const logsIm = new THREE.InstancedMesh(logGeo, logMat, woodRackCoords.length * logsPerRack);
      const roofsIm = new THREE.InstancedMesh(shelterGeo, barkCapMat, woodRackCoords.length);
      const postsIm = new THREE.InstancedMesh(postGeo, barkCapMat, woodRackCoords.length * 2);

      let lIdx = 0;
      let pIdx = 0;
      for (let i = 0; i < woodRackCoords.length; i++) {
        const w = woodRackCoords[i];
        const wy = groundHeightAt(WORLD, w.x, w.z);
        const cY = Math.cos(w.yaw);
        const sY = Math.sin(w.yaw);

        for (let tier = 0; tier < 2; tier++) {
          for (let k = 0; k < 5; k++) {
            const localX = (k - 2) * 0.28;
            const localY = 0.14 + tier * 0.24;
            dummy.position.set(w.x + localX * cY, wy + localY, w.z - localX * sY);
            dummy.rotation.set(0, w.yaw, 0);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            logsIm.setMatrixAt(lIdx++, dummy.matrix);
          }
        }
        for (const side of [-0.78, 0.78]) {
          dummy.position.set(w.x + side * cY, wy + 0.52, w.z - side * sY);
          dummy.rotation.set(0, w.yaw, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          postsIm.setMatrixAt(pIdx++, dummy.matrix);
        }
        dummy.position.set(w.x, wy + 1.06, w.z);
        dummy.rotation.set(0.08, w.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        roofsIm.setMatrixAt(i, dummy.matrix);
      }

      for (const im of [logsIm, roofsIm, postsIm]) {
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        this.scene.add(im);
      }
    }

    // Granite flowerbed planters near Renda Church & Lielrenda Manor portico + wooden planter_box_01 boxes along streets
    const flowerbedCoords: [number, number][] = [];
    if (churchLm) {
      flowerbedCoords.push([churchLm.x - 19, churchLm.z - 5], [churchLm.x - 19, churchLm.z + 5]);
    }
    if (manorLm) {
      flowerbedCoords.push([manorLm.x - 7, manorLm.z + 24], [manorLm.x + 7, manorLm.z + 24]);
    }
    if (flowerbedCoords.length > 0) {
      const graniteMat = new THREE.MeshStandardMaterial({ color: 0x7c7974, roughness: 0.92 });
      const soilMat = new THREE.MeshStandardMaterial({ color: 0x3b2c20, roughness: 0.96 });
      const ringGeo = new THREE.CylinderGeometry(1.18, 1.24, 0.28, 14);
      const soilGeo = new THREE.CylinderGeometry(1.06, 1.06, 0.3, 14);

      const ringsIm = new THREE.InstancedMesh(ringGeo, graniteMat, flowerbedCoords.length);
      const soilsIm = new THREE.InstancedMesh(soilGeo, soilMat, flowerbedCoords.length);

      for (let i = 0; i < flowerbedCoords.length; i++) {
        const [fx, fz] = flowerbedCoords[i];
        const fy = groundHeightAt(WORLD, fx, fz);
        dummy.position.set(fx, fy + 0.14, fz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        ringsIm.setMatrixAt(i, dummy.matrix);
        soilsIm.setMatrixAt(i, dummy.matrix);
      }
      for (const im of [ringsIm, soilsIm]) {
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        this.scene.add(im);
      }
    }

    const planterPoses: AaaPropsConfig['planters'] = [
      { x: 165.4, z: 49.4, yaw: 0.18 },
      { x: 173.8, z: 52.6, yaw: -0.25 },
      { x: 185.8, z: 14.5, yaw: 0.65 },
      { x: 221.2, z: -31.5, yaw: 0.9 },
      ...(manorLm ? [{ x: manorLm.x - 11.5, z: manorLm.z + 21.5, yaw: 0.1 }, { x: manorLm.x + 11.5, z: manorLm.z + 21.5, yaw: -0.1 }] : []),
    ];
    for (const pl of planterPoses) {
      flowerbedCoords.push([pl.x, pl.z]);
    }

    const isPropSpotClear = (px: number, pz: number, clearanceM = 1.1, allowRoad = false) => {
      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        if (px >= c.minX - clearanceM && px <= c.maxX + clearanceM && pz >= c.minZ - clearanceM && pz <= c.maxZ + clearanceM) {
          return false;
        }
      }
      if (!allowRoad) {
        for (const r of WORLD.roads) {
          if (r.pts.length < 2) continue;
          const halfR = r.width * 0.5 + clearanceM * 0.6;
          for (let i = 0; i < r.pts.length - 1; i++) {
            const [ax, az] = r.pts[i];
            const [bx, bz] = r.pts[i + 1];
            const vx = bx - ax;
            const vz = bz - az;
            const l2 = vx * vx + vz * vz;
            if (l2 < 0.01) continue;
            const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
            if (Math.hypot(px - (ax + t * vx), pz - (az + t * vz)) < halfR) return false;
          }
        }
      }
      const riv = findNearestRiverPoint(WORLD.waterways, px, pz);
      if (riv && riv.distance < riv.width * 0.52) return false;
      return true;
    };

    const filterPropPoses = <T extends { x: number; z: number }>(poses: T[], clearanceM = 0.85, allowRoad = false): T[] =>
      poses.filter((p) => isPropSpotClear(p.x, p.z, clearanceM, allowRoad));

    // Wall-mounted street lamps (street_lamp_02) placed flush on landmark front walls
    const wallLampPoses: NonNullable<AaaPropsConfig['wallLamps']> = [];
    for (const [, entry] of this.buildingMap) {
      const nLower = entry.name.toLowerCase();
      if (
        nLower.includes('pagrab') ||
        nLower.includes('veikals') ||
        nLower.includes('kultūr') ||
        nLower.includes('manor') ||
        nLower.includes('pasts')
      ) {
        const segs = computeWallSegments(entry.ring, entry.cx, entry.cz);
        segs.sort((a, b) => b.length - a.length);
        const front = segs[0];
        if (front) {
          wallLampPoses.push({
            x: entry.cx + front.midX + front.normalX * 0.14,
            z: entry.cz + front.midZ + front.normalZ * 0.14,
            yaw: front.yaw,
            yOffset: Math.min(3.15, Math.max(2.2, entry.baseWallH * 0.66)),
          });
        }
      }
    }

    // Manhole covers aligned along primary asphalt P120 & Church Road centerlines
    const manholePoses: NonNullable<AaaPropsConfig['manholeCovers']> = [];
    for (const r of WORLD.roads) {
      if (r.kind !== 'primary' || r.bridge || r.pts.length < 3) continue;
      for (let i = 2; i < r.pts.length - 1; i += 5) {
        const [rx, rz] = r.pts[i];
        if (Math.hypot(rx - WORLD.meta.centerX, rz - WORLD.meta.centerZ) < 380 && manholePoses.length < 14) {
          manholePoses.push({ x: rx + 1.1, z: rz + 0.6, yaw: 0.3, yOffset: 0.02 });
        }
      }
    }

    // River channel navigation buoys at Abava bend & pier downstream
    const riverBuoyPoses: NonNullable<AaaPropsConfig['riverBuoys']> = [];
    for (const bx of [-864, -842, 224, 252]) {
      const riv = findNearestRiverPoint(WORLD.waterways, bx, bx < 0 ? -111 : -150);
      if (riv) {
        riverBuoyPoses.push({ x: riv.x, z: riv.z, yaw: (bx * 0.17) % 3.14, yOffset: 0.15 });
      }
    }

    // Cottage garden sets, tools & firewood axes paired with wood racks
    const axePoses: NonNullable<AaaPropsConfig['axes']> = [];
    const cooperBucketPoses: NonNullable<AaaPropsConfig['cooperBuckets']> = [];
    const woodenChairPoses: NonNullable<AaaPropsConfig['woodenChairs']> = [];
    const woodenTablePoses: NonNullable<AaaPropsConfig['woodenTables']> = [];
    const ladderPoses: NonNullable<AaaPropsConfig['ladders']> = [];
    const wateringCanPoses: NonNullable<AaaPropsConfig['wateringCans']> = [];
    const spadePoses: NonNullable<AaaPropsConfig['spades']> = [];
    const clayPotPoses: NonNullable<AaaPropsConfig['clayPots']> = [];

    for (let i = 0; i < woodRackCoords.length; i++) {
      const w = woodRackCoords[i];
      const sideX = Math.cos(w.yaw);
      const sideZ = -Math.sin(w.yaw);
      if (i < 10) {
        axePoses.push({ x: w.x + sideX * 1.18, z: w.z - sideZ * 1.18, yaw: w.yaw + 0.6, pitch: 0.18 });
      }
      if (i % 2 === 0) {
        cooperBucketPoses.push({ x: w.x - sideX * 1.15, z: w.z + sideZ * 1.15, yaw: w.yaw + 0.3 });
      }
      if (i % 3 === 0) {
        ladderPoses.push({ x: w.x + sideX * 1.65, z: w.z - sideZ * 1.65, yaw: w.yaw + 0.25, pitch: -0.22 });
      }
      if (i % 2 === 1 && woodenTablePoses.length < 7) {
        woodenTablePoses.push({ x: w.x + sideX * 2.4, z: w.z - sideZ * 2.4, yaw: w.yaw });
        woodenChairPoses.push(
          { x: w.x + sideX * 2.4 + sideZ * 0.9, z: w.z - sideZ * 2.4 + sideX * 0.9, yaw: w.yaw + 3.14 },
          { x: w.x + sideX * 2.4 - sideZ * 0.9, z: w.z - sideZ * 2.4 - sideX * 0.9, yaw: w.yaw }
        );
        wateringCanPoses.push({ x: w.x + sideX * 2.0, z: w.z - sideZ * 2.0, yaw: w.yaw + 0.8 });
        spadePoses.push({ x: w.x - sideX * 1.4, z: w.z + sideZ * 1.4, yaw: w.yaw + 0.4, pitch: 0.12 });
      }
    }

    // Clay pots near church, manor, spawn cottages & shop
    clayPotPoses.push(
      { x: 165.1, z: 50.6, yaw: 0.2 },
      { x: 173.4, z: 51.3, yaw: 1.1 },
      { x: 185.0, z: 15.8, yaw: 0.5 },
      ...(churchLm ? [{ x: churchLm.x - 16.8, z: churchLm.z - 4.5, yaw: 0.4 }, { x: churchLm.x - 16.8, z: churchLm.z + 4.5, yaw: 1.8 }] : []),
      ...(manorLm ? [{ x: manorLm.x - 5.2, z: manorLm.z + 22.8, yaw: 0.3 }, { x: manorLm.x + 5.2, z: manorLm.z + 22.8, yaw: 2.1 }] : [])
    );

    const propsConfig: AaaPropsConfig = {
      benches: filterPropPoses(benchPoses, 0.7),
      lamps: filterPropPoses(lampPoses, 0.45),
      picnicTables: filterPropPoses([
        ...(pierLm ? [{ x: pierLm.x + 10.5, z: pierLm.z + 4.5, yaw: 0.4 }] : []),
        ...(ivandeLm ? [{ x: ivandeLm.x - 13.5, z: ivandeLm.z - 2.5, yaw: -0.55 }] : []),
        { x: 218.5, z: -28.0, yaw: 0.7 },
        ...(manorLm ? [{ x: manorLm.x + 18.0, z: manorLm.z + 25.0, yaw: 0.25 }] : []),
      ], 0.9),
      utilityBoxes: filterPropPoses([
        { x: 175.4, z: 47.8, yaw: -1.4 },
        { x: 189.2, z: 10.5, yaw: 0.5 },
        { x: 237.5, z: -22.5, yaw: 1.9 },
        { x: 244.5, z: -138.0, yaw: -0.8 },
      ], 0.6),
      hydrants: filterPropPoses([
        { x: 169.8, z: 56.8, yaw: 0.2 },
        { x: 184.5, z: 87.2, yaw: 1.2 },
        { x: 193.5, z: 4.5, yaw: -0.6 },
        { x: 231.8, z: -17.0, yaw: 2.1 },
        { x: 245.5, z: -79.0, yaw: 0.4 },
      ], 0.5),
      trashCans: filterPropPoses([
        { x: 230.2, z: 79.4, yaw: 0.3 },
        ...(churchLm ? [{ x: churchLm.x - 20.5, z: churchLm.z - 9.2, yaw: 0.5 }, { x: churchLm.x - 14.2, z: churchLm.z + 15.8, yaw: -1.1 }] : []),
        ...(manorLm ? [{ x: manorLm.x + 13.8, z: manorLm.z + 19.2, yaw: 0.4 }] : []),
        ...(pierLm ? [{ x: pierLm.x + 5.4, z: pierLm.z + 6.8, yaw: 0.8 }] : []),
        { x: 226.4, z: -33.2, yaw: -0.5 },
        { x: 183.2, z: 18.4, yaw: 1.1 },
      ], 0.5),
      wineBarrels: filterPropPoses([
        ...(pagrabinsLm
          ? [
              { x: pagrabinsLm.x - 4.2, z: pagrabinsLm.z + 3.6, yaw: 0.4 },
              { x: pagrabinsLm.x - 3.3, z: pagrabinsLm.z + 4.1, yaw: 1.1 },
              { x: pagrabinsLm.x - 4.7, z: pagrabinsLm.z + 4.5, yaw: 2.2 },
            ]
          : []),
        ...(vineyardLm
          ? [
              { x: vineyardLm.x + 4.2, z: vineyardLm.z + 3.2, yaw: 0.2 },
              { x: vineyardLm.x + 5.1, z: vineyardLm.z + 3.5, yaw: 1.4 },
              { x: vineyardLm.x + 4.5, z: vineyardLm.z + 4.2, yaw: 2.5 },
              { x: vineyardLm.x + 5.5, z: vineyardLm.z + 4.4, yaw: 0.7 },
            ]
          : []),
        ...(manorLm ? [{ x: manorLm.x - 16.5, z: manorLm.z + 14.0, yaw: 0.9 }, { x: manorLm.x - 15.6, z: manorLm.z + 14.4, yaw: 1.8 }] : []),
      ], 0.5),
      crates: filterPropPoses([
        { x: 163.6, z: 58.2, yaw: 0.35 },
        { x: 174.2, z: 64.5, yaw: -0.4 },
        { x: 180.5, z: 13.2, yaw: 0.8 },
        { x: 181.6, z: 13.6, yaw: 0.2, scale: 0.88 },
        ...(pierLm ? [{ x: pierLm.x + 4.2, z: pierLm.z + 3.5, yaw: 1.1 }] : []),
        ...(pagrabinsLm ? [{ x: pagrabinsLm.x + 3.4, z: pagrabinsLm.z + 2.8, yaw: -0.6 }] : []),
      ], 0.5),
      buckets: filterPropPoses([
        { x: 164.2, z: 59.1, yaw: 0.4 },
        { x: 174.6, z: 65.4, yaw: 1.2 },
        ...(pierLm ? [{ x: pierLm.x + 5.1, z: pierLm.z + 3.9, yaw: 0.5 }] : []),
        ...(manorLm ? [{ x: manorLm.x - 14.8, z: manorLm.z + 15.2, yaw: 0.7 }] : []),
        { x: 187.4, z: 21.5, yaw: 1.6 },
      ], 0.45),
      planters: filterPropPoses(planterPoses, 0.5),
      firePits: filterPropPoses([
        ...(pierLm ? [{ x: pierLm.x + 13.5, z: pierLm.z + 9.2, yaw: 0.4 }] : []),
        ...(lodgeLm ? [{ x: lodgeLm.x + 5.5, z: lodgeLm.z + 6.5, yaw: 0.9 }] : []),
        ...(ivandeLm ? [{ x: ivandeLm.x - 10.5, z: ivandeLm.z + 5.5, yaw: 0.2 }] : []),
      ], 0.8),
      ammoBoxes: filterPropPoses([
        { x: 164.8, z: 45.2, yaw: 0.6 },
        ...(lodgeLm
          ? [
              { x: lodgeLm.x + 3.2, z: lodgeLm.z + 4.8, yaw: 0.35 },
              { x: lodgeLm.x + 3.7, z: lodgeLm.z + 5.1, yaw: 1.1 },
            ]
          : []),
        { x: 4.2, z: 298.8, yaw: 0.5 },
        { x: 4.8, z: 299.1, yaw: 1.4 },
      ], 0.4),

      // 29 new Poly Haven non-vegetation props across Renda Valley
      cafeSets: filterPropPoses([
        ...(pagrabinsLm
          ? [
              { x: pagrabinsLm.x - 2.6, z: pagrabinsLm.z + 6.8, yaw: 0.3 },
              { x: pagrabinsLm.x + 1.8, z: pagrabinsLm.z + 7.2, yaw: 0.45 },
              { x: pagrabinsLm.x + 5.6, z: pagrabinsLm.z + 6.2, yaw: -0.2 },
            ]
          : []),
        { x: 182.4, z: 16.8, yaw: 0.7 },
        { x: 224.2, z: -30.5, yaw: 1.1 },
      ], 0.8),
      chalkboards: filterPropPoses([
        ...(pagrabinsLm ? [{ x: pagrabinsLm.x - 0.8, z: pagrabinsLm.z + 4.9, yaw: 0.25 }] : []),
        { x: 184.2, z: 15.2, yaw: -0.45 },
        { x: 234.5, z: -26.4, yaw: 0.8 },
      ], 0.45),
      wallLamps: wallLampPoses,
      woodenChairs: filterPropPoses(woodenChairPoses, 0.45),
      woodenTables: filterPropPoses(woodenTablePoses, 0.65),
      lifebuoys: filterPropPoses([
        ...(pierLm ? [{ x: pierLm.x + 2.8, z: pierLm.z + 2.2, yaw: 0.5 }, { x: pierLm.x + 8.4, z: pierLm.z + 2.6, yaw: 1.1 }] : []),
        { x: 236.5, z: -135.2, yaw: 0.8 },
        { x: 256.8, z: -162.4, yaw: -0.4 },
      ], 0.45),
      riverBuoys: riverBuoyPoses,
      cargoCrates: filterPropPoses([
        { x: 179.5, z: 11.4, yaw: 0.4 },
        { x: 180.6, z: 11.0, yaw: 1.2 },
        ...(vineyardLm ? [{ x: vineyardLm.x + 6.4, z: vineyardLm.z + 2.8, yaw: 0.9 }] : []),
        ...(pagrabinsLm ? [{ x: pagrabinsLm.x + 4.8, z: pagrabinsLm.z + 2.2, yaw: 0.3 }] : []),
      ], 0.55),
      wickerBaskets: filterPropPoses([
        { x: 165.8, z: 52.8, yaw: 0.4 },
        { x: 183.1, z: 14.0, yaw: 1.3 },
        ...(vineyardLm ? [{ x: vineyardLm.x + 3.4, z: vineyardLm.z + 4.6, yaw: 0.8 }, { x: vineyardLm.x + 3.9, z: vineyardLm.z + 5.1, yaw: 2.0 }] : []),
        ...(pagrabinsLm ? [{ x: pagrabinsLm.x - 1.8, z: pagrabinsLm.z + 5.4, yaw: 0.5 }] : []),
      ], 0.4),
      ladders: filterPropPoses(ladderPoses, 0.5),
      axes: filterPropPoses(axePoses, 0.35),
      cooperBuckets: filterPropPoses(cooperBucketPoses, 0.4),
      wateringCans: filterPropPoses(wateringCanPoses, 0.35),
      spades: filterPropPoses(spadePoses, 0.35),
      lanterns: filterPropPoses([
        ...(pierLm ? [{ x: pierLm.x + 6.8, z: pierLm.z + 3.6, yaw: 0.2 }, { x: pierLm.x + 10.6, z: pierLm.z + 4.6, yaw: 0.8, yOffset: 0.72 }] : []),
        ...(pagrabinsLm ? [{ x: pagrabinsLm.x - 2.5, z: pagrabinsLm.z + 6.8, yaw: 0.3, yOffset: 0.74 }] : []),
        { x: 164.6, z: 49.0, yaw: 0.5 },
      ], 0.35),
      roadBarriers: filterPropPoses([
        { x: 234.2, z: -129.0, yaw: 0.72 },
        { x: 257.5, z: -168.5, yaw: 0.72 },
        { x: 229.8, z: -119.5, yaw: 0.72 },
      ], 0.6, true),
      manholeCovers: manholePoses,
      modernUtilBoxes: filterPropPoses([
        { x: 239.2, z: -28.2, yaw: 1.4 },
        { x: 194.6, z: 8.2, yaw: -0.6 },
        { x: 247.2, z: -92.4, yaw: 0.5 },
      ], 0.55),
      floralPlanters: filterPropPoses([
        { x: 165.8, z: 48.0, yaw: 0.25 },
        { x: 173.9, z: 54.4, yaw: -0.3 },
        { x: 186.6, z: 13.0, yaw: 0.7 },
        { x: 229.4, z: -26.2, yaw: 1.0 },
        ...(churchLm ? [{ x: churchLm.x - 16.5, z: churchLm.z - 8.2, yaw: 0.1 }, { x: churchLm.x - 16.5, z: churchLm.z + 8.2, yaw: -0.1 }] : []),
      ], 0.55),
      clayPots: filterPropPoses(clayPotPoses, 0.4),
      manorGates: manorLm
        ? filterPropPoses([{ x: manorLm.x, z: manorLm.z + 31.5, yaw: 0.05 }], 0.8, true)
        : [],
      horseStatues: manorLm
        ? filterPropPoses([{ x: manorLm.x - 10.5, z: manorLm.z + 25.5, yaw: 0.45 }], 1.0)
        : [],
      militaryCrates: filterPropPoses([
        ...(lodgeLm ? [{ x: lodgeLm.x + 4.4, z: lodgeLm.z + 4.2, yaw: 0.5 }, { x: lodgeLm.x + 5.2, z: lodgeLm.z + 3.4, yaw: 1.4 }] : []),
        { x: 163.8, z: 44.2, yaw: 0.8 },
      ], 0.5),
      jerrycans: filterPropPoses([
        ...(lodgeLm ? [{ x: lodgeLm.x + 2.8, z: lodgeLm.z + 5.4, yaw: 0.4 }, { x: lodgeLm.x + 3.3, z: lodgeLm.z + 5.7, yaw: 1.1 }] : []),
        { x: 176.2, z: 62.5, yaw: 0.7 },
      ], 0.35),
      steelDrums: filterPropPoses([
        { x: 176.8, z: 63.4, yaw: 0.4 },
        { x: 177.8, z: 63.8, yaw: 1.8 },
        ...(lodgeLm ? [{ x: lodgeLm.x + 6.4, z: lodgeLm.z + 5.2, yaw: 0.6 }] : []),
        ...(pierLm ? [{ x: pierLm.x + 3.4, z: pierLm.z + 4.4, yaw: 0.9 }] : []),
      ], 0.5),
      handTrucks: filterPropPoses([
        { x: 178.9, z: 12.6, yaw: 1.2 },
        ...(pagrabinsLm ? [{ x: pagrabinsLm.x + 4.0, z: pagrabinsLm.z + 3.4, yaw: 0.4 }] : []),
      ], 0.45),
      compostBags: filterPropPoses([
        { x: 162.8, z: 60.4, yaw: 0.5 },
        { x: 175.8, z: 72.2, yaw: -0.4 },
        ...(vineyardLm ? [{ x: vineyardLm.x + 7.2, z: vineyardLm.z + 4.5, yaw: 1.1 }] : []),
      ], 0.6),
      oldTyres: filterPropPoses([
        { x: 175.6, z: 64.2, yaw: 0.3 },
        ...(pierLm ? [{ x: pierLm.x + 2.2, z: pierLm.z + 4.9, yaw: 0.8 }] : []),
        ...(lodgeLm ? [{ x: lodgeLm.x + 7.2, z: lodgeLm.z + 4.8, yaw: 1.2 }] : []),
      ], 0.45),
      parkedCars: filterPropPoses([
        { x: 178.2, z: 58.6, yaw: 0.12 },
        { x: 194.5, z: 22.8, yaw: 1.45 },
        { x: 234.8, z: -19.2, yaw: 0.85 },
        ...(manorLm ? [{ x: manorLm.x + 15.5, z: manorLm.z + 31.0, yaw: -0.25 }] : []),
        ...(pagrabinsLm ? [{ x: pagrabinsLm.x - 10.5, z: pagrabinsLm.z + 4.2, yaw: 0.65 }] : []),
      ], 1.85),
    };

    buildV2MeadowAndProps(this.scene, WORLD, this.colliders, this.windTimeUniform, this.isSoftwareGl);

    void loadAaaGroundCoverAndProps(
      this.scene,
      WORLD,
      this.colliders,
      this.shrubPlacements,
      this.boulderPlacements,
      this.reedPlacements,
      this.windTimeUniform,
      this.sunDirUniform,
      this.sunColorUniform,
      this.isSoftwareGl,
      this.getMaxTexAnisotropy(),
      flowerbedCoords,
      this.treeBaseAnchors
    )
      .then((res) => {
        if (this.isDisposed) {
          res.dispose();
          return;
        }
        this.groundCoverSystem = res;
        res.updateLod(this.camera.position.x, this.camera.position.z, true);
        if (typeof document !== 'undefined') {
          document.body.dataset.foliageReady = '1';
        }
      })
      .catch((err) => {
        console.error('Failed to load AAA ground cover & props:', err);
      });

    void loadAaaVillageProps(
      this.scene,
      WORLD,
      propsConfig,
      this.isSoftwareGl,
      this.getMaxTexAnisotropy()
    )
      .then((res) => {
        if (this.isDisposed) {
          res.dispose();
          return;
        }
        this.villagePropsSystem = res;
        res.updateLod(this.camera.position.x, this.camera.position.z, true);
        if (typeof document !== 'undefined') {
          document.body.dataset.propsReady = '1';
        }
      })
      .catch((err) => {
        console.error('Failed to load AAA village props:', err);
      });
  }

  private buildAtmosphereClouds(): void {
    this.cloudDome = createVolumetricCloudDome(
      this.windTimeUniform,
      this.sunDirUniform,
      this.sunColorUniform,
      this.skyColorUniform,
      this.horizonColorUniform
    );
    this.scene.add(this.cloudDome);

    this.valleyMistGroup = createValleyMistSystem(
      this.windTimeUniform,
      this.horizonColorUniform,
      this.mistOpacityUniform
    );
    this.scene.add(this.valleyMistGroup);

    this.sunShaftsGroup = createVolumetricSunShafts(
      this.windTimeUniform,
      this.sunDirUniform,
      this.sunColorUniform
    );
    this.scene.add(this.sunShaftsGroup);
  }

  private initParticles(): void {
    const geo = new THREE.IcosahedronGeometry(0.32, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    const im = new THREE.InstancedMesh(geo, mat, this.maxParticles);
    im.frustumCulled = false;
    this.pDummy.scale.set(0, 0, 0);
    this.pDummy.updateMatrix();
    for (let i = 0; i < this.maxParticles; i++) {
      im.setMatrixAt(i, this.pDummy.matrix);
      im.setColorAt(i, this.pColor.setHex(0xffffff));
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    this.scene.add(im);
    this.particleMesh = im;
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    maxAge: number,
    hex: number
  ): void {
    if (!this.particleMesh) return;
    const i = this.pCursor;
    this.pCursor = (this.pCursor + 1) % this.maxParticles;
    this.pActive[i] = 1;
    this.pPos[i * 3] = x;
    this.pPos[i * 3 + 1] = y;
    this.pPos[i * 3 + 2] = z;
    this.pVel[i * 3] = vx;
    this.pVel[i * 3 + 1] = vy;
    this.pVel[i * 3 + 2] = vz;
    this.pAge[i] = 0;
    this.pMaxAge[i] = maxAge;
    this.pSize[i] = size;
    this.particleMesh.setColorAt(i, this.pColor.setHex(hex));
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private updateParticles(dt: number): void {
    if (!this.particleMesh) return;
    let dirty = false;
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.pActive[i] === 0) continue;
      dirty = true;
      this.pAge[i] += dt;
      const age = this.pAge[i];
      const maxAge = this.pMaxAge[i];
      if (age >= maxAge) {
        this.pActive[i] = 0;
        this.pDummy.scale.set(0, 0, 0);
        this.pDummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, this.pDummy.matrix);
        continue;
      }
      const idx3 = i * 3;
      this.pPos[idx3] += this.pVel[idx3] * dt;
      this.pPos[idx3 + 1] += this.pVel[idx3 + 1] * dt;
      this.pPos[idx3 + 2] += this.pVel[idx3 + 2] * dt;
      this.pVel[idx3] *= 1 - Math.min(0.4, dt * 1.5);
      this.pVel[idx3 + 2] *= 1 - Math.min(0.4, dt * 1.5);

      const t = age / maxAge;
      const s = this.pSize[i] * Math.sin(t * Math.PI);
      this.pDummy.position.set(this.pPos[idx3], this.pPos[idx3 + 1], this.pPos[idx3 + 2]);
      this.pDummy.scale.setScalar(Math.max(0.001, s));
      this.pDummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.pDummy.matrix);
    }
    if (dirty) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.handlePointerDown);
    el.addEventListener('wheel', this.handleWheel, { passive: false });
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    el.addEventListener('contextmenu', this.preventContext);
  }

  private preventContext = (e: Event) => e.preventDefault();

  private handlePointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (!this.pointerLocked) {
      this.isFiringHeld = false;
    }
    this.emitHud(true);
  };

  private handleWheel = (e: WheelEvent) => {
    if (this.phase !== 'playing' || this.mode === 'studio') return;
    if (this.mode === 'walk' && this.cameraPerspective === 'first_person') return;
    e.preventDefault();
    this.camZoomOffset = THREE.MathUtils.clamp(this.camZoomOffset + e.deltaY * 0.0045, -2.6, 10.5);
  };

  private getMovementGroundHeight(x: number, z: number): number {
    return this.buildingArt?.groundHeightAt(x, z) ?? groundHeightAt(WORLD, x, z);
  }

  private resolveActorCollisions(x: number, z: number, buildingRadius: number, propRadius: number) {
    let resolvedX = x, resolvedZ = z, collided = false;
    const offsets = buildingRadius > 2 ? [-1.25, 0, 1.25] : [0];
    const headingX = Math.sin(this.playerHeading), headingZ = Math.cos(this.playerHeading);
    // A car needs longitudinal bumper clearance while retaining its narrower road width.
    for (let iteration = 0; iteration < 2; iteration++) {
      const base = resolveBuildingCollisions(resolvedX, resolvedZ, buildingRadius, this.buildingCollisionBase);
      resolvedX = base.x; resolvedZ = base.z; collided ||= base.collided;
      for (const offset of offsets) {
        const props = resolveBuildingCollisions(resolvedX + headingX * offset, resolvedZ + headingZ * offset, propRadius, this.dressingColliders, 0.12);
        resolvedX = props.x - headingX * offset;
        resolvedZ = props.z - headingZ * offset;
        collided ||= props.collided;
      }
    }
    return { x: resolvedX, z: resolvedZ, collided };
  }

  private getRenderPixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, RENDER_QUALITY[this.renderQuality].pixelRatio);
  }

  public getRenderQuality(): RenderQuality {
    return this.renderQuality;
  }

  public finishLoading(): void {
    this.applyMaterialQuality();
    this.initialAssetsReady = true;
    this.lastTime = performance.now();
  }

  public setRenderQuality(quality: RenderQuality): void {
    if (quality === this.renderQuality) return;
    this.renderQuality = quality;
    const settings = RENDER_QUALITY[quality];
    try { localStorage.setItem(QUALITY_STORAGE_KEY, quality); } catch { /* Optional preference. */ }
    this.shadowMapRes = Math.min(settings.shadowSize, this.renderer.capabilities.maxTextureSize);
    this.renderer.shadowMap.enabled = quality !== 'performance' || !this.isSoftwareGl;
    this.sunLight.castShadow = this.renderer.shadowMap.enabled;
    this.sunLight.shadow.map?.dispose();
    this.sunLight.shadow.map = null;
    this.sunLight.shadow.mapSize.set(this.shadowMapRes, this.shadowMapRes);
    this.sunLight.shadow.needsUpdate = true;
    if (this.composer) {
      for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) {
        target.samples = settings.samples;
        target.dispose();
      }
      if (settings.contactShadows && !this.contactOcclusionPass) {
        this.contactOcclusionPass = new ContactOcclusionPass(this.scene, this.camera, 1, 1);
        this.composer.insertPass(this.contactOcclusionPass, 1);
      }
    }
    if (this.contactOcclusionPass) this.contactOcclusionPass.enabled = settings.contactShadows;
    if (this.bloomPass) this.bloomPass.enabled = settings.bloom;
    this.applyMaterialQuality();
    this.handleResize();
    document.body.dataset.quality = quality;
  }

  private applyMaterialQuality(): void {
    this.treeSystem?.setShadows?.(this.renderer.shadowMap.enabled);
    const coverage = RENDER_QUALITY[this.renderQuality].samples > 0;
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material.alphaTest > 0 && material.alphaToCoverage !== coverage) {
          material.alphaToCoverage = coverage;
          material.needsUpdate = true;
        }
      }
    });
  }

  private handleResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const pr = this.getRenderPixelRatio();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
    if (this.colorGradePass) {
      this.colorGradePass.uniforms['uResolution'].value.set(w * pr, h * pr);
    }
    if (this.fxaaPass) {
      this.fxaaPass.uniforms['resolution'].value.set(1 / (w * pr), 1 / (h * pr));
    }
    this.renderNow();
  };

  private handleBlur = () => {
    this.keys.clear();
    this.isDraggingCamera = false;
    this.isFiringHeld = false;
    this.isAiming = false;
    this.leanInput = 0;
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (target?.closest('button') && e.code !== 'Escape' && e.code !== 'KeyP') return;

    this.keys.add(e.code);

    if (e.code === 'Space' && !e.repeat && this.phase === 'playing' && this.mode === 'walk') {
      e.preventDefault();
      this.triggerJumpPress();
    }

    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.phase === 'playing') this.setPhase('paused');
      else if (this.phase === 'paused') this.setPhase('playing');
    } else if (this.phase === 'playing') {
      if (e.code === 'Digit1') this.setMode('walk');
      else if (e.code === 'Digit2') this.setMode('drive');
      else if (e.code === 'Digit3') this.setMode('canoe');
      else if (e.code === 'Digit4') this.setMode('studio');
      else if (e.code === 'KeyM') this.toggleMute();
      else if (e.code === 'KeyV' && !e.repeat && this.mode === 'walk') {
        this.setCameraPerspective(this.cameraPerspective === 'first_person' ? 'third_person' : 'first_person');
      } else if (e.code === 'KeyT' && !e.repeat) {
        this.cycleAtmosphere();
      } else if (this.mode === 'walk' && this.cameraPerspective === 'first_person') {
        if (e.code === 'KeyR' && !e.repeat) {
          this.reloadWeapon();
        } else if (e.code === 'KeyB' && !e.repeat) {
          this.toggleFireMode();
        } else if (e.code === 'KeyI' && !e.repeat) {
          this.triggerInspect();
        } else if (e.code === 'KeyF' && !e.repeat) {
          this.setAiming(!this.isAiming);
        } else if ((e.code === 'KeyC' || e.code === 'ControlLeft') && !e.repeat) {
          this.isCrouching = !this.isCrouching;
          this.emitHud(true);
        }
        this.leanInput = (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (this.mode === 'walk' && this.cameraPerspective === 'first_person') {
      this.leanInput = (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);
    }
    if (e.code === 'Space' && this.phase === 'playing' && this.mode === 'walk' && this.playerVy > 2.0) {
      this.playerVy *= 0.52;
    }
  };

  private handlePointerDown = (e: PointerEvent) => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    if (this.phase !== 'playing' || this.mode === 'studio') return;

    const isFps = this.mode === 'walk' && this.cameraPerspective === 'first_person';
    if (isFps) {
      if (e.button === 2) {
        this.setAiming(true);
        return;
      }
      if (e.button === 0) {
        if (this.pointerLocked) {
          this.isFiringHeld = true;
          this.fireWeapon();
          return;
        }
        // Fallback smooth drag-look + tap-to-fire even when Pointer Lock is blocked/inactive
        if (this.activeDragPointerId === null) {
          this.activeDragPointerId = e.pointerId;
          this.isDraggingCamera = true;
          this.camYawVel = 0;
          this.camPitchVel = 0;
          this.dragLast = { x: e.clientX, y: e.clientY };
        }
        return;
      }
    }

    if (this.activeDragPointerId === null) {
      this.activeDragPointerId = e.pointerId;
      this.isDraggingCamera = true;
      this.camYawVel = 0;
      this.camPitchVel = 0;
      this.dragLast = { x: e.clientX, y: e.clientY };
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.mode === 'studio' || this.phase !== 'playing') return;
    const isFps = this.mode === 'walk' && this.cameraPerspective === 'first_person';
    if (isFps && this.pointerLocked) {
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      const sens = this.isAiming ? 0.0017 : 0.0024;
      this.camYaw -= dx * sens;
      this.camPitch = Math.max(-1.18, Math.min(1.18, this.camPitch + dy * sens));
      this.lookDeltaFrameX += dx;
      this.lookDeltaFrameY += dy;
      return;
    }

    if (!this.isDraggingCamera || e.pointerId !== this.activeDragPointerId) {
      return;
    }
    const dx = e.clientX - this.dragLast.x;
    const dy = e.clientY - this.dragLast.y;
    this.dragLast = { x: e.clientX, y: e.clientY };
    const dyaw = -dx * (isFps ? 0.0038 : 0.0056);
    const dpitch = dy * (isFps ? 0.0032 : 0.0042);
    this.camYaw += dyaw;
    const pitchMin = isFps ? -1.18 : -0.08;
    const pitchMax = isFps ? 1.18 : 0.68;
    this.camPitch = Math.max(pitchMin, Math.min(pitchMax, this.camPitch + dpitch));
    this.camYawVel = dyaw * 32;
    this.camPitchVel = dpitch * 32;
    this.lookDeltaFrameX += dx;
    this.lookDeltaFrameY += dy;
  };

  private handlePointerUp = (e: PointerEvent) => {
    const isFps = this.mode === 'walk' && this.cameraPerspective === 'first_person';
    if (e.button === 2 && isFps) {
      this.setAiming(false);
    }
    if (e.button === 0) {
      this.isFiringHeld = false;
    }
    if (e.pointerId === this.activeDragPointerId) {
      this.isDraggingCamera = false;
      this.activeDragPointerId = null;
    }
    if (this.phase !== 'playing') return;
    const moveDist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (moveDist > 8) return;

    if (isFps && e.button === 0 && !this.pointerLocked) {
      this.fireWeapon();
      // Gently request Pointer Lock when supported on desktop interaction
      if (typeof this.renderer.domElement.requestPointerLock === 'function') {
        try {
          const maybePromise = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
          if (maybePromise && typeof maybePromise.catch === 'function') {
            maybePromise.catch(() => {});
          }
        } catch {
          // ignore if blocked by iframe/sandbox
        }
      }
      return;
    }
    if (!isFps) {
      this.tapWorldAt(e.clientX, e.clientY);
    }
  };

  public tapWorldAt(clientX: number, clientY: number): void {
    if (this.phase !== 'playing') return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndc, this.camera);
    const hits = _raycaster.intersectObjects(this.interactableWalls, false);
    if (hits.length > 0) {
      const bId = hits[0].object.userData.buildingId as number | undefined;
      if (bId) this.selectBuilding(bId, this.mode === 'studio');
    }
  }

  public selectBuilding(buildingId: number, focusCamera = true): void {
    const entry = this.buildingMap.get(buildingId);
    if (!entry) return;
    this.selectedBuildingId = buildingId;
    const ringRadius = Math.max(5.5, entry.radius * 1.18);
    this.selectionRing.position.set(entry.cx, entry.baseY + 0.35, entry.cz);
    this.selectionRing.scale.setScalar(ringRadius / 6.6);
    this.selectionRing.visible = true;
    if (focusCamera && this.mode === 'studio') {
      const camDist = Math.max(24, entry.radius * 2.5);
      this.controls.target.set(entry.cx, entry.baseY + entry.currentWallH * 0.55, entry.cz);
      this.camera.position.set(entry.cx - camDist, entry.baseY + camDist * 0.72, entry.cz - camDist);
      this.controls.update();
    }
    this.emitHud(true);
  }

  public selectNearestBuilding(): number | null {
    let bestId: number | null = null;
    let bestD = Infinity;
    for (const entry of this.buildingMap.values()) {
      const d = Math.hypot(entry.cx - this.playerX, entry.cz - this.playerZ);
      if (d < bestD) {
        bestD = d;
        bestId = entry.id;
      }
    }
    if (bestId !== null) {
      this.selectBuilding(bestId, true);
    }
    return bestId;
  }

  public setTouchMove(turn: number, throttle: number): void {
    this.touchTurn = Math.max(-1, Math.min(1, turn));
    this.touchThrottle = Math.max(-1, Math.min(1, throttle));
  }

  public setTouchAction(action: 'jump' | 'sprint', active: boolean): void {
    if (action === 'jump') {
      if (active && !this.touchJump) {
        this.triggerJumpPress();
      } else if (!active && this.touchJump && this.mode === 'walk' && this.playerVy > 2.0) {
        this.playerVy *= 0.52;
      }
      this.touchJump = active;
    } else {
      this.touchSprint = active;
    }
  }

  public applyTouchLook(dx: number, dy: number): void {
    if (this.mode === 'studio' || this.phase !== 'playing') return;
    const dyaw = -dx * 0.0054;
    const dpitch = dy * 0.004;
    this.camYaw += dyaw;
    this.camPitch = Math.max(-0.08, Math.min(0.68, this.camPitch + dpitch));
    this.camYawVel = dyaw * 34;
    this.camPitchVel = dpitch * 34;
  }

  public endTouchLook(): void {
    // Allow inertial velocity to glide smoothly to rest in stepSimulation
  }

  private syncViewmodelVisibility(): void {
    const isFirstPersonWalk =
      this.phase === 'playing' &&
      this.mode === 'walk' &&
      this.cameraPerspective === 'first_person';
    this.weaponViewmodel.root.visible = isFirstPersonWalk;
    this.explorerRig.group.visible =
      this.phase === 'playing' &&
      this.mode === 'walk' &&
      this.cameraPerspective === 'third_person';
    const hideWalkMarkers = this.phase === 'playing' && this.mode === 'walk';
    for (const d of this.landmarkDiamonds) {
      d.visible = !hideWalkMarkers;
    }
    this.updateMissionBeacon();
  }

  public setCameraPerspective(next: CameraPerspective): void {
    this.cameraPerspective = next;
    this.isAiming = false;
    this.isFiringHeld = false;
    if (next === 'third_person' && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
    if (next === 'third_person') {
      this.camera.rotation.z = 0;
      this.camPitch = Math.max(-0.08, Math.min(0.68, this.camPitch));
    }
    this.syncViewmodelVisibility();
    this.renderNow();
    this.emitHud(true);
  }

  public setAiming(aiming: boolean): void {
    if (this.mode !== 'walk' || this.cameraPerspective !== 'first_person') {
      this.isAiming = false;
      return;
    }
    this.isAiming = aiming && this.reloadTimer <= 0;
    if (this.isSoftwareGl) {
      this.fpsState = {
        ...this.fpsState,
        adsAlpha: this.isAiming ? 1 : 0,
      };
      this.weaponViewmodel.update(0.016, 0, this.fpsState, {
        speedMs: Math.abs(this.speed),
        sprinting: false,
        reloadProgress: 0,
        inspectProgress: 0,
        muzzleFlashTimer: this.muzzleFlashTimer,
        boltKick: this.boltKick,
      });
      this.camera.fov = computeFpsCameraFov(this.fpsState.adsAlpha, false, Math.abs(this.speed));
      this.camera.updateProjectionMatrix();
      this.updateFpsCameraTransform();
      this.renderNow();
    }
    this.emitHud(true);
  }

  public toggleFireMode(): void {
    this.fireMode = this.fireMode === 'SEMI' ? 'AUTO' : 'SEMI';
    this.audio.playModeSwitch();
    this.emitHud(true);
  }

  public triggerInspect(): void {
    if (this.mode !== 'walk' || this.cameraPerspective !== 'first_person' || this.reloadTimer > 0) return;
    this.inspectTimer = 1.6;
  }

  public reloadWeapon(): void {
    if (this.mode !== 'walk' || this.cameraPerspective !== 'first_person') return;
    if (this.reloadTimer > 0 || this.ammoInMag >= 30 || this.ammoReserve <= 0) return;
    this.reloadTimer = this.reloadDuration;
    this.isAiming = false;
    this.inspectTimer = 0;
    this.audio.playReload();
    this.emitHud(true);
  }

  public fireWeapon(): void {
    if (this.phase !== 'playing' || this.mode !== 'walk' || this.cameraPerspective !== 'first_person') return;
    if (this.reloadTimer > 0 || this.shotCooldown > 0) return;
    if (this.ammoInMag <= 0) {
      this.shotCooldown = 0.25;
      this.audio.playDryFire();
      if (this.ammoReserve > 0) this.reloadWeapon();
      return;
    }
    this.ammoInMag -= 1;
    this.shotCooldown = this.fireMode === 'AUTO' ? 0.095 : 0.135;
    this.muzzleFlashTimer = 0.055;
    this.boltKick = 1.0;
    this.inspectTimer = 0;
    this.fireJitterSeed += 1;
    this.fpsState = applyFpsRecoilImpulse(this.fpsState, this.fpsState.adsAlpha, this.fireJitterSeed);
    this.camPitch -= 0.0085 * (1 - this.fpsState.adsAlpha * 0.45);
    this.audio.playGunshot();
    // Restrict collision queries to solid world geometry; foliage/sky/viewmodel are visual layers.
    this.camera.updateMatrixWorld(true);
    this.bulletImpacts.fire(this.camera, [
      ...(this.terrainMesh ? [this.terrainMesh] : []),
      ...this.interactableWalls,
      ...this.roadAsphaltMeshes,
      ...this.roadGravelMeshes,
      ...(this.tacticalVillage?.impactTargets ?? []),
      ...(this.buildingArt?.impactTargets ?? []),
      ...(this.streetSurfaces?.impactTargets ?? []),
      ...(this.staticScenery?.impactTargets ?? []),
    ]);

    // Subtle muzzle smoke/spark particle in world space ahead of barrel
    this.weaponViewmodel.muzzleWorldAnchor.getWorldPosition(_v1);
    const fx = Math.sin(this.camYaw) * Math.cos(this.camPitch);
    const fy = -Math.sin(this.camPitch);
    const fz = Math.cos(this.camYaw) * Math.cos(this.camPitch);
    this.spawnParticle(_v1.x, _v1.y, _v1.z, fx * 2.2, fy * 2.2 + 0.35, fz * 2.2, 0.22, 0.28, 0xe8d9be);

    if (this.ammoInMag === 0 && this.ammoReserve > 0) {
      this.reloadWeapon();
    }
    this.emitHud(true);
  }

  public cycleAtmosphere(): void {
    const order: AtmospherePreset[] = ['morning', 'golden', 'overcast_rain', 'noon', 'twilight'];
    const idx = order.indexOf(this.atmosphere);
    const next = order[(idx + 1) % order.length];
    this.setAtmosphere(next);
    const labels: Record<AtmospherePreset, string> = {
      morning: 'Morning River Mist',
      golden: 'Kurzeme Golden Hour',
      overcast_rain: 'Baltic Overcast & Rain',
      noon: 'Crisp Baltic Noon',
      twilight: 'Abava Dusk Twilight',
    };
    this.showBanner('Atmosphere', labels[next]);
  }

  public triggerJumpPress(): void {
    this.jumpBufferTimer = 0.13;
  }

  public setPhase(next: GamePhase): void {
    this.phase = next;
    document.body.dataset.state = next;
    if (next === 'playing') {
      this.keys.clear();
      this.controls.enabled = this.mode === 'studio';
    } else {
      this.keys.clear();
      this.isDraggingCamera = false;
      this.isFiringHeld = false;
      this.isAiming = false;
      this.controls.enabled = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock?.();
      }
    }
    this.syncViewmodelVisibility();
    this.emitHud(true);
  }

  private getWaterSurfaceY(x: number, z: number): number {
    this.waterRaycaster.set(new THREE.Vector3(x, 200, z), new THREE.Vector3(0, -1, 0));
    const hits = this.waterRaycaster.intersectObjects(this.waterMeshes, false);
    if (hits.length > 0) {
      return hits[0].point.y;
    }
    return groundHeightAt(WORLD, x, z) + 0.6;
  }

  public startGame(): void {
    this.setPhase('playing');
    this.playerY = groundHeightAt(WORLD, this.playerX, this.playerZ);
    this.camYaw = this.playerHeading;
    this.camPitch = 0.04;
    this.camYawVel = 0;
    this.camPitchVel = 0;
    this.camDistSmooth = 6.8;
    this.hasInitCamera = false;
    this.syncViewmodelVisibility();
    this.updateFpsCameraTransform();
    this.updateDrawDistances(this.camera.position.x, this.camera.position.z);
    this.treeSystem?.updateLod(this.playerX, this.playerZ, true);
    this.groundCoverSystem?.updateLod(this.camera.position.x, this.camera.position.z, true);
    this.villagePropsSystem?.updateLod(this.camera.position.x, this.camera.position.z, true);
    this.renderNow();
  }

  public restartGame(): void {
    this.playerX = WORLD.meta.spawnX;
    this.playerZ = WORLD.meta.spawnZ;
    this.playerY = groundHeightAt(WORLD, this.playerX, this.playerZ);
    this.playerVy = 0;
    this.playerHeading = WORLD.meta.spawnHeading;
    this.camYaw = WORLD.meta.spawnHeading;
    this.camPitch = 0.04;
    this.camYawVel = 0;
    this.camPitchVel = 0;
    this.hasInitCamera = false;
    this.speed = 0;
    this.prevSpeed = 0;
    this.distanceTraveledM = 0;
    this.discoveredIds = [];
    this.deliveriesCompleted = 0;
    this.score = 0;
    this.ammoInMag = 30;
    this.ammoReserve = 180;
    this.reloadTimer = 0;
    this.isAiming = false;
    this.isCrouching = false;
    this.leanInput = 0;
    this.stamina = 1.0;
    this.fpsState = createInitialFpsWeaponState();
    this.activeMission = createNextCourierMission(WORLD.landmarks, this.playerX, this.playerZ, 0, 'church');
    this.updateMissionBeacon();
    this.setMode('walk');
    this.setPhase('playing');
  }

  public setMode(next: PlayMode): void {
    const changed = this.mode !== next;
    this.mode = next;
    this.speed = 0;
    this.prevSpeed = 0;
    this.isAiming = false;
    this.isFiringHeld = false;
    this.camera.rotation.z = 0;
    if (next !== 'walk' && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
    this.syncViewmodelVisibility();
    this.carRig.group.visible = next === 'drive';
    this.canoeRig.group.visible = next === 'canoe';
    this.controls.enabled = next === 'studio' && this.phase === 'playing';
    this.selectionRing.visible = next === 'studio' && this.selectedBuildingId !== null;
    if (changed && this.phase === 'playing') {
      this.audio.playModeSwitch();
    }

    if (next === 'canoe') {
      const nearest = findNearestRiverPoint(WORLD.waterways, this.playerX, this.playerZ);
      if (nearest) {
        this.playerX = nearest.x;
        this.playerZ = nearest.z;
        this.playerY = this.getWaterSurfaceY(this.playerX, this.playerZ) - 0.14;
      }
      const flow = computeWaterwayFlowAtPoint(WORLD, this.playerX, this.playerZ);
      if (flow) {
        this.playerHeading = flow.yaw;
      }
      this.camYaw = this.playerHeading;
      this.camPitch = 0.16;
      this.camYawVel = 0;
      this.camPitchVel = 0;
      this.hasInitCamera = false;
      this.camDistSmooth = 10.2;
      this.lookTargetSmooth.set(this.playerX, this.playerY + 1.5, this.playerZ);
      this.camera.position.set(
        this.playerX - Math.sin(this.camYaw) * Math.cos(this.camPitch) * 10.2,
        this.playerY + 2.8 + Math.sin(this.camPitch) * 10.2 * 0.55,
        this.playerZ - Math.cos(this.camYaw) * Math.cos(this.camPitch) * 10.2
      );
      this.camera.lookAt(this.lookTargetSmooth);
      this.showBanner('Abava River Canoe', 'Paddle along the Īvande & Abava valley currents');
    } else if (next === 'drive') {
      this.playerY = this.getMovementGroundHeight(this.playerX, this.playerZ);
      if (!this.activeMission) {
        this.activeMission = createNextCourierMission(
          WORLD.landmarks,
          this.playerX,
          this.playerZ,
          this.deliveriesCompleted
        );
      }
      this.updateMissionBeacon();
      this.showBanner('Courier Vehicle Ready', `Deliver ${this.activeMission.cargoLabel} to ${this.activeMission.targetName}`);
    } else if (next === 'studio') {
      const targetX = this.selectedBuildingId
        ? (this.buildingMap.get(this.selectedBuildingId)?.cx ?? this.playerX)
        : this.playerX;
      const targetZ = this.selectedBuildingId
        ? (this.buildingMap.get(this.selectedBuildingId)?.cz ?? this.playerZ)
        : this.playerZ;
      const ty = groundHeightAt(WORLD, targetX, targetZ);
      this.controls.target.set(targetX, ty + 4, targetZ);
      this.camera.position.set(targetX - 38, ty + 28, targetZ - 38);
      this.controls.update();
    } else {
      this.playerY = groundHeightAt(WORLD, this.playerX, this.playerZ);
      this.camPitch = 0.04;
      this.updateFpsCameraTransform();
    }

    this.syncActorTransforms();
    this.treeSystem?.updateLod(this.camera.position.x, this.camera.position.z, true);
    this.groundCoverSystem?.updateLod(this.camera.position.x, this.camera.position.z, true);
    this.villagePropsSystem?.updateLod(this.camera.position.x, this.camera.position.z, true);
    if (!this.isSoftwareGl) this.renderNow();
    this.emitHud(true);
  }

  private updateFpsCameraTransform(): void {
    if (this.mode !== 'walk' || this.cameraPerspective !== 'first_person') return;
    const eyeHeight = THREE.MathUtils.lerp(1.66, 1.12, this.fpsState.crouchBlend);
    const leanLat = this.fpsState.leanAngle * 1.45;
    const eyeX = this.playerX - Math.cos(this.camYaw) * leanLat;
    const eyeZ = this.playerZ + Math.sin(this.camYaw) * leanLat;
    const eyeY = this.playerY + eyeHeight - Math.abs(this.fpsState.leanAngle) * 0.14;
    this.camera.position.set(eyeX, eyeY, eyeZ);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(
      -this.camPitch + this.fpsState.recoilPitch,
      this.camYaw + Math.PI - this.fpsState.recoilYaw,
      -this.fpsState.leanAngle
    );
  }

  public teleportToLandmark(landmarkId: string): void {
    let targetX = WORLD.meta.spawnX;
    let targetZ = WORLD.meta.spawnZ;

    if (landmarkId === 'abava_bridge') {
      // Unobstructed dry riverbank vantage looking diagonally across calm Abava water at both central granite piers of P120 Bridge
      targetX = 238.49;
      targetZ = -149.06;
      if (this.mode === 'canoe') {
        const riv = findNearestRiverPoint(WORLD.waterways, targetX, targetZ);
        if (riv) {
          this.playerX = riv.x;
          this.playerZ = riv.z;
        }
      } else {
        this.playerX = 278.0;
        this.playerZ = -163.0;
      }
    } else {
      const lm = WORLD.landmarks.find((l) => l.id === landmarkId);
      if (!lm) return;
      targetX = lm.x;
      targetZ = lm.z;
      if (this.mode === 'canoe') {
        const riv = findNearestRiverPoint(WORLD.waterways, lm.x, lm.z);
        if (riv) {
          this.playerX = riv.x;
          this.playerZ = riv.z;
        }
      } else if (landmarkId === 'ivande_rumba' || landmarkId === 'valdatu_rumba') {
        const flow = computeWaterwayFlowAtPoint(WORLD, lm.x, lm.z);
        const yaw = flow?.yaw ?? 2.88;
        this.playerX = lm.x + Math.sin(yaw) * 14.5 - Math.cos(yaw) * 5.2;
        this.playerZ = lm.z + Math.cos(yaw) * 14.5 + Math.sin(yaw) * 5.2;
      } else {
        const offX = landmarkId === 'manor' ? 4 : landmarkId === 'abava_boats' ? 0 : -14;
        const offZ = landmarkId === 'manor' ? 32 : landmarkId === 'abava_boats' ? 11 : -14;
        this.playerX = lm.x + offX;
        this.playerZ = lm.z + offZ;
      }
      const resolved = this.resolveActorCollisions(this.playerX, this.playerZ, 1.4, 0.45);
      this.playerX = resolved.x;
      this.playerZ = resolved.z;
    }

    this.playerY =
      this.mode === 'canoe'
        ? this.getWaterSurfaceY(this.playerX, this.playerZ) - 0.14
        : groundHeightAt(WORLD, this.playerX, this.playerZ);
    this.playerHeading = Math.atan2(targetX - this.playerX, targetZ - this.playerZ);
    this.camYaw = this.playerHeading;
    this.camPitch = this.mode === 'walk' && this.cameraPerspective === 'first_person' ? 0.03 : 0.14;
    this.camYawVel = 0;
    this.camPitchVel = 0;
    this.hasInitCamera = false;
    this.lookTargetSmooth.set(this.playerX, this.playerY + (this.mode === 'walk' ? 1.78 : 1.5), this.playerZ);

    if (this.mode === 'studio') {
      this.controls.target.set(targetX, this.playerY + 4, targetZ);
      this.camera.position.set(targetX - 42, this.playerY + 26, targetZ - 42);
      this.controls.update();
    } else if (this.mode === 'walk' && this.cameraPerspective === 'first_person') {
      this.updateFpsCameraTransform();
    } else {
      const followDist = this.mode === 'drive' ? 12.2 : this.mode === 'canoe' ? 10.5 : 7.4;
      const followHeight = this.mode === 'drive' ? 3.2 : this.mode === 'canoe' ? 2.8 : 2.6;
      this.camDistSmooth = followDist;
      this.camera.position.set(
        this.playerX - Math.sin(this.camYaw) * Math.cos(this.camPitch) * followDist,
        this.playerY + followHeight + Math.sin(this.camPitch) * followDist * 0.55,
        this.playerZ - Math.cos(this.camYaw) * Math.cos(this.camPitch) * followDist
      );
      this.camera.lookAt(this.lookTargetSmooth);
    }
    const snapped = snapShadowCenter(this.playerX, this.playerZ, this.shadowHalfExtent, this.shadowMapRes);
    this.sunLight.target.position.set(snapped.x, this.playerY, snapped.z);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.position.copy(this.sunDirUniform.value).multiplyScalar(280).add(this.sunLight.target.position);

    this.syncActorTransforms();
    this.treeSystem?.updateLod(this.playerX, this.playerZ, true);
    this.groundCoverSystem?.updateLod(this.camera.position.x, this.camera.position.z, true);
    this.villagePropsSystem?.updateLod(this.camera.position.x, this.camera.position.z, true);
    if (!this.isSoftwareGl) this.renderNow();
    this.emitHud(true);
  }

  public setAtmosphere(preset: AtmospherePreset): void {
    this.atmosphere = preset;
    this.tacticalVillage?.setAtmosphere(preset);
    this.streetSurfaces?.setAtmosphere(preset);
    this.buildingArt?.setAtmosphere(preset);
    this.battlefieldAtmosphere?.setAtmosphere(preset);
    const profile = evaluateMoodColorProfile(preset);
    const skyUniforms = this.sky.material.uniforms;

    const phi = THREE.MathUtils.degToRad(90 - profile.elevDeg);
    const theta = THREE.MathUtils.degToRad(profile.azimDeg);
    _v1.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(_v1);
    skyUniforms['turbidity'].value = profile.turbidity;
    skyUniforms['rayleigh'].value = profile.rayleigh;

    this.sunDirUniform.value.copy(_v1).normalize();
    this.sunColorUniform.value.setHex(profile.sunHex);
    this.horizonColorUniform.value.setHex(profile.fogHex);
    this.skyColorUniform.value.setHex(profile.skyColorHex);
    this.wetnessUniform.value = profile.wetness;
    this.mistOpacityUniform.value = profile.mistOpacity;
    if (this.sunShaftsGroup) {
      this.sunShaftsGroup.visible = profile.shaftStrength > 0.02;
      const sMat = this.sunShaftsGroup.userData.shaftMat as THREE.ShaderMaterial | undefined;
      if (sMat) sMat.uniforms.uShaftStrength.value = profile.shaftStrength;
    }

    // Update sky-matched PBR reflections (skip repeated PMREM regeneration on SwiftShader for frame speed)
    const environmentName = preset === 'overcast_rain' || preset === 'noon' ? 'overcast_soil' : 'evening_field';
    if (!this.outdoorEnvironments.has(environmentName) && (!this.skyEnvBuilt || this.skyEnvPreset !== preset)) {
      this.skyEnvBuilt = true;
      this.skyEnvPreset = preset;
      const envScene = new THREE.Scene();
      const envSky = new Sky();
      envSky.scale.setScalar(100);
      envSky.material.uniforms['sunPosition'].value.copy(_v1);
      envSky.material.uniforms['turbidity'].value = skyUniforms['turbidity'].value;
      envSky.material.uniforms['rayleigh'].value = skyUniforms['rayleigh'].value;
      envScene.add(envSky);
      const envHemi = new THREE.HemisphereLight(profile.hemiSkyHex, profile.hemiGroundHex, 1.15);
      envScene.add(envHemi);
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const nextRt = pmrem.fromScene(envScene, 0.04);
      pmrem.dispose();
      envSky.geometry.dispose();
      (envSky.material as THREE.Material).dispose();
      this.envRenderTarget?.dispose();
      this.envRenderTarget = nextRt;
      this.scene.environment = nextRt.texture;
    }
    this.applyOutdoorLighting();

    const snapped = snapShadowCenter(this.playerX, this.playerZ, this.shadowHalfExtent, this.shadowMapRes);
    this.sunLight.target.position.set(snapped.x, this.playerY, snapped.z);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.position.copy(this.sunDirUniform.value).multiplyScalar(280).add(this.sunLight.target.position);
    this.sunLight.color.setHex(profile.sunHex);
    this.sunLight.intensity = profile.sunInt;
    this.hemiLight.color.setHex(profile.hemiSkyHex);
    this.hemiLight.groundColor.setHex(profile.hemiGroundHex);
    this.hemiLight.intensity = profile.hemiInt;
    this.renderer.toneMappingExposure = profile.exposure;

    if (this.colorGradePass) {
      this.colorGradePass.uniforms['uVignette'].value = profile.vignette;
      this.colorGradePass.uniforms['uWarmth'].value = profile.warmth;
      this.colorGradePass.uniforms['uContrast'].value = profile.contrast;
      this.colorGradePass.uniforms['uSaturation'].value = profile.saturation;
      this.colorGradePass.uniforms['uGrain'].value = profile.grain;
    }

    for (const wl of this.warmLights) wl.intensity = profile.warmLightInt;
    (this.scene.fog as THREE.FogExp2).color.setHex(profile.fogHex);
    (this.scene.fog as THREE.FogExp2).density = profile.fogDensity;
    this.renderNow();
    this.emitHud(true);
  }

  private loadOutdoorLighting(): void {
    const loader = new HDRLoader();
    for (const name of ['evening_field', 'overcast_soil']) {
      loader.load(`/assets/lighting/${name}_1k.hdr`, (texture) => {
        if (this.isDisposed) { texture.dispose(); return; }
        const generator = new THREE.PMREMGenerator(this.renderer);
        const target = generator.fromEquirectangular(texture);
        generator.dispose();
        texture.dispose();
        this.outdoorEnvironments.set(name, target);
        this.applyOutdoorLighting();
      }, undefined, () => {
        console.warn(`Outdoor lighting ${name} unavailable; using the procedural sky.`);
      });
    }
    for (const name of ['evening_road_01_puresky', 'overcast_soil_puresky']) {
      loader.load(`/assets/lighting/${name}_2k.hdr`, (texture) => {
        if (this.isDisposed) { texture.dispose(); return; }
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this.skyPanoramas.set(name, texture);
        this.applyOutdoorLighting();
      }, undefined, () => {
        console.warn(`Photographic sky ${name} unavailable; using the procedural sky.`);
      });
    }
  }

  private applyOutdoorLighting(): void {
    this.applyPhotographicSky();
    const overcast = this.atmosphere === 'overcast_rain' || this.atmosphere === 'noon';
    const target = this.outdoorEnvironments.get(overcast ? 'overcast_soil' : 'evening_field');
    if (!target) {
      this.scene.environment = this.envRenderTarget?.texture ?? null;
      this.scene.environmentIntensity = 1;
      this.scene.environmentRotation.set(0, 0, 0);
      return;
    }
    this.scene.environment = target.texture;
    this.scene.environmentIntensity = this.atmosphere === 'twilight' ? 0.32 : this.atmosphere === 'overcast_rain' ? 0.52 : overcast ? 0.85 : 0.65;
    this.scene.environmentRotation.y = (overcast ? -0.2056 : 0.6596117388)
      - Math.atan2(this.sunDirUniform.value.z, this.sunDirUniform.value.x);
  }

  private applyPhotographicSky(): void {
    const raining = this.atmosphere === 'overcast_rain';
    const name = raining ? 'overcast_soil_puresky' : 'evening_road_01_puresky';
    const panorama = this.atmosphere === 'noon' ? undefined : this.skyPanoramas.get(name);
    this.scene.background = panorama ?? null;
    this.sky.visible = !panorama;
    if (this.cloudDome) this.cloudDome.visible = !panorama;
    if (!panorama) return;
    this.scene.backgroundIntensity = this.atmosphere === 'twilight' ? 0.28 : 0.85;
    this.scene.backgroundRotation.y = (raining ? -0.20709 : 0.6028544496)
      - Math.atan2(this.sunDirUniform.value.z, this.sunDirUniform.value.x);
  }

  public applyMaterialRecipe(
    recipe: MaterialRecipe,
    scope: 'selected_wall' | 'selected_roof' | 'all_walls' | 'all_roofs' | 'roads'
  ): void {
    this.customRecipes.set(recipe.id, recipe);
    const mat = this.materialLib.getMaterial(recipe);

    if (scope === 'roads') {
      mat.side = THREE.DoubleSide;
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -2;
      mat.polygonOffsetUnits = -2;
      mat.needsUpdate = true;
      for (const m of [...this.roadAsphaltMeshes, ...this.roadGravelMeshes]) {
        m.material = mat;
      }
      this.showBanner('Road Surface Updated', `Applied ${recipe.name} across Renda streets`);
      return;
    }

    if (scope === 'all_walls') {
      for (const b of this.buildingMap.values()) {
        if (b.wallMesh) {
          b.wallMesh.material = mat;
          b.wallMaterialId = recipe.id;
        }
      }
      this.showBanner('Village Facades Updated', `Applied ${recipe.name} to all buildings`);
      this.emitHud(true);
      return;
    }

    if (scope === 'all_roofs') {
      for (const b of this.buildingMap.values()) {
        if (b.roofMesh) {
          b.roofMesh.material = mat;
          b.roofMaterialId = recipe.id;
        }
      }
      this.showBanner('Village Roofs Updated', `Applied ${recipe.name} to all roofs`);
      this.emitHud(true);
      return;
    }

    const entry = this.selectedBuildingId
      ? this.buildingMap.get(this.selectedBuildingId)
      : this.buildingMap.values().next().value;
    if (!entry) return;
    this.selectedBuildingId = entry.id;

    if (scope === 'selected_wall' && entry.wallMesh) {
      entry.wallMesh.material = mat;
      entry.wallMaterialId = recipe.id;
    } else if (scope === 'selected_roof' && entry.roofMesh) {
      entry.roofMesh.material = mat;
      entry.roofMaterialId = recipe.id;
    }
    this.showBanner('Material Applied', `${recipe.name} -> ${entry.name}`);
    this.emitHud(true);
  }

  public applyBuildingDesign(buildingId: number, rawDesign: BuildingDesignRecipe): void {
    const entry = this.buildingMap.get(buildingId);
    if (!entry) return;

    const design = normalizeBuildingDesign(rawDesign, entry.levels);
    this.customRecipes.set(design.wallRecipe.id, design.wallRecipe);
    this.customRecipes.set(design.roofRecipe.id, design.roofRecipe);
    const wallMat = this.materialLib.getMaterial(design.wallRecipe);
    const roofMat = this.materialLib.getMaterial(design.roofRecipe);

    if (entry.kind !== 'church' && entry.wallMesh && entry.roofMesh) {
      const scaledRing = scaleFootprintRingAlongAxes(
        entry.ring,
        entry.cx,
        entry.cz,
        design.widthScale,
        design.depthScale
      );
      entry.currentRing = scaledRing;
      entry.widthM = Math.max(2, Math.round(entry.baseWidthM * design.widthScale));
      entry.depthM = Math.max(2, Math.round(entry.baseDepthM * design.depthScale));
      const scaledBounds = computePolygonCentroid(scaledRing);
      entry.radius = scaledBounds.radius;

      // Keep collision AABB synced with modified footprint dimensions
      const col = this.colliders.find((c) => c.id === entry.id);
      if (col) {
        col.radius = scaledBounds.radius;
        col.minX = scaledBounds.minX;
        col.maxX = scaledBounds.maxX;
        col.minZ = scaledBounds.minZ;
        col.maxZ = scaledBounds.maxZ;
      }

      const newWallH = Math.max(2.6, entry.baseWallH * design.heightScale);
      const newRoofH =
        design.roofStyle === 'flat_modern'
          ? 0.65
          : Math.max(1.1, entry.baseRoofH * design.roofPitch);

      entry.wallMesh.geometry.dispose();
      entry.wallMesh.geometry = this.createBuildingWallGeo(
        scaledRing,
        entry.cx,
        entry.cz,
        newWallH,
        newRoofH,
        design.roofStyle
      );
      entry.wallMesh.material = wallMat;
      entry.wallMesh.position.set(entry.cx, entry.baseY - FOUNDATION_DEPTH, entry.cz);

      if (entry.roofMesh) {
        entry.roofMesh.geometry.dispose();
        entry.roofMesh.geometry = buildPitchedRoofGeometry(
          scaledRing,
          entry.cx,
          entry.cz,
          newRoofH,
          design.overhangScale,
          design.roofStyle
        );
        entry.roofMesh.material = roofMat;
        entry.roofMesh.position.set(entry.cx, entry.baseY + newWallH, entry.cz);
      }
      entry.currentWallH = newWallH;

      // Hide default instanced windows & base trim for this building so custom architecture replaces them cleanly
      const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
      if (entry.defaultWinIndices?.length && this.defaultWinFrameMesh && this.defaultWinGlassMesh) {
        for (const wi of entry.defaultWinIndices) {
          this.defaultWinFrameMesh.setMatrixAt(wi, zeroMat);
          this.defaultWinGlassMesh.setMatrixAt(wi, zeroMat);
          this.defaultWinSillMesh?.setMatrixAt(wi, zeroMat);
          this.defaultWinMullionMesh?.setMatrixAt(wi, zeroMat);
        }
        this.defaultWinFrameMesh.instanceMatrix.needsUpdate = true;
        this.defaultWinGlassMesh.instanceMatrix.needsUpdate = true;
        if (this.defaultWinSillMesh) this.defaultWinSillMesh.instanceMatrix.needsUpdate = true;
        if (this.defaultWinMullionMesh) this.defaultWinMullionMesh.instanceMatrix.needsUpdate = true;
      }
      if (entry.defaultWinShutterIndices?.length && this.defaultWinShutterMesh) {
        for (const si of entry.defaultWinShutterIndices) {
          this.defaultWinShutterMesh.setMatrixAt(si, zeroMat);
        }
        this.defaultWinShutterMesh.instanceMatrix.needsUpdate = true;
      }
      if (entry.defaultTrimIndices) {
        for (const si of entry.defaultTrimIndices.segIndices) {
          this.defaultPlinthMesh?.setMatrixAt(si, zeroMat);
          this.defaultFasciaMesh?.setMatrixAt(si, zeroMat);
        }
        for (const di of entry.defaultTrimIndices.doorIndices) {
          this.defaultDoorMesh?.setMatrixAt(di, zeroMat);
          this.defaultDoorStepMesh?.setMatrixAt(di, zeroMat);
        }
        for (const ri of entry.defaultTrimIndices.ridgeIndices) {
          this.defaultRidgeMesh?.setMatrixAt(ri, zeroMat);
        }
        if (this.defaultPlinthMesh) this.defaultPlinthMesh.instanceMatrix.needsUpdate = true;
        if (this.defaultFasciaMesh) this.defaultFasciaMesh.instanceMatrix.needsUpdate = true;
        if (this.defaultDoorMesh) this.defaultDoorMesh.instanceMatrix.needsUpdate = true;
        if (this.defaultDoorStepMesh) this.defaultDoorStepMesh.instanceMatrix.needsUpdate = true;
        if (this.defaultRidgeMesh) this.defaultRidgeMesh.instanceMatrix.needsUpdate = true;
      }

      // Remove prior custom architectural detail group if present
      if (entry.detailGroup) {
        this.scene.remove(entry.detailGroup);
      }
      const details = this.buildIndieDetailGroup(entry, newWallH, newRoofH, design);
      this.scene.add(details);
      entry.detailGroup = details;
    } else {
      if (entry.wallMesh) entry.wallMesh.material = wallMat;
      if (entry.roofMesh) entry.roofMesh.material = roofMat;
    }

    entry.wallMaterialId = design.wallRecipe.id;
    entry.roofMaterialId = design.roofRecipe.id;
    entry.customDesign = design;
    this.buildingArt?.setBuildingCustomized(buildingId, true);
    this.popAnims.set(entry.id, 0);

    // Update ring radius cleanly without resetting camera orbit if building is already focused
    this.selectedBuildingId = entry.id;
    const ringRadius = Math.max(5.5, entry.radius * 1.18);
    this.selectionRing.position.set(entry.cx, entry.baseY + 0.35, entry.cz);
    this.selectionRing.scale.setScalar(ringRadius / 6.6);
    this.selectionRing.visible = true;

    this.showBanner(`Restyled: ${design.designName}`, design.designSummary);
    this.emitHud(true);
  }

  public resetBuildingDesign(buildingId: number): void {
    const entry = this.buildingMap.get(buildingId);
    if (!entry) return;

    const origWall = this.customRecipes.get(entry.baseWallMaterialId) ?? WALL_PRESETS[0];
    const origRoof = this.customRecipes.get(entry.baseRoofMaterialId) ?? ROOF_PRESETS[0];
    const wallMat = this.materialLib.getMaterial(origWall);
    const roofMat = this.materialLib.getMaterial(origRoof);

    entry.currentRing = entry.ring;
    entry.widthM = entry.baseWidthM;
    entry.depthM = entry.baseDepthM;
    entry.radius = entry.baseRadius;

    const origBounds = computePolygonCentroid(entry.ring);
    const col = this.colliders.find((c) => c.id === entry.id);
    if (col) {
      col.radius = origBounds.radius;
      col.minX = origBounds.minX;
      col.maxX = origBounds.maxX;
      col.minZ = origBounds.minZ;
      col.maxZ = origBounds.maxZ;
    }

    if (entry.kind !== 'church' && entry.wallMesh) {
      entry.wallMesh.geometry.dispose();
      entry.wallMesh.geometry = this.createBuildingWallGeo(
        entry.ring,
        entry.cx,
        entry.cz,
        entry.baseWallH,
        entry.baseRoofH,
        entry.baseRoofShape as RoofStyle
      );
      entry.wallMesh.material = wallMat;
      entry.wallMesh.position.set(entry.cx, entry.baseY - FOUNDATION_DEPTH, entry.cz);

      if (entry.roofMesh) {
        entry.roofMesh.geometry.dispose();
        entry.roofMesh.geometry = buildPitchedRoofGeometry(
          entry.ring,
          entry.cx,
          entry.cz,
          entry.baseRoofH,
          1.06,
          entry.baseRoofShape as RoofStyle
        );
        entry.roofMesh.material = roofMat;
        entry.roofMesh.position.set(entry.cx, entry.baseY + entry.baseWallH, entry.cz);
      }
      entry.currentWallH = entry.baseWallH;

      // Restore default instanced windows & base architectural trim
      if (entry.defaultWinIndices?.length && this.defaultWinFrameMesh && this.defaultWinGlassMesh) {
        for (const wi of entry.defaultWinIndices) {
          const m = this.defaultWinTransforms[wi];
          if (m) {
            this.defaultWinFrameMesh.setMatrixAt(wi, m);
            this.defaultWinGlassMesh.setMatrixAt(wi, m);
            this.defaultWinSillMesh?.setMatrixAt(wi, m);
            this.defaultWinMullionMesh?.setMatrixAt(wi, m);
          }
        }
        this.defaultWinFrameMesh.instanceMatrix.needsUpdate = true;
        this.defaultWinGlassMesh.instanceMatrix.needsUpdate = true;
        if (this.defaultWinSillMesh) this.defaultWinSillMesh.instanceMatrix.needsUpdate = true;
        if (this.defaultWinMullionMesh) this.defaultWinMullionMesh.instanceMatrix.needsUpdate = true;
      }
      if (entry.defaultWinShutterIndices?.length && this.defaultWinShutterMesh) {
        for (const si of entry.defaultWinShutterIndices) {
          const m = this.defaultWinShutterTransforms[si];
          if (m) this.defaultWinShutterMesh.setMatrixAt(si, m);
        }
        this.defaultWinShutterMesh.instanceMatrix.needsUpdate = true;
      }
      if (entry.defaultTrimIndices) {
        for (const si of entry.defaultTrimIndices.segIndices) {
          const pm = this.defaultPlinthTransforms[si];
          const fm = this.defaultFasciaTransforms[si];
          if (pm) this.defaultPlinthMesh?.setMatrixAt(si, pm);
          if (fm) this.defaultFasciaMesh?.setMatrixAt(si, fm);
        }
        for (const di of entry.defaultTrimIndices.doorIndices) {
          const dm = this.defaultDoorTransforms[di];
          const sm = this.defaultDoorStepTransforms[di];
          if (dm) this.defaultDoorMesh?.setMatrixAt(di, dm);
          if (sm) this.defaultDoorStepMesh?.setMatrixAt(di, sm);
        }
        for (const ri of entry.defaultTrimIndices.ridgeIndices) {
          const rm = this.defaultRidgeTransforms[ri];
          if (rm) this.defaultRidgeMesh?.setMatrixAt(ri, rm);
        }
        if (this.defaultPlinthMesh) this.defaultPlinthMesh.instanceMatrix.needsUpdate = true;
        if (this.defaultFasciaMesh) this.defaultFasciaMesh.instanceMatrix.needsUpdate = true;
        if (this.defaultDoorMesh) this.defaultDoorMesh.instanceMatrix.needsUpdate = true;
        if (this.defaultDoorStepMesh) this.defaultDoorStepMesh.instanceMatrix.needsUpdate = true;
        if (this.defaultRidgeMesh) this.defaultRidgeMesh.instanceMatrix.needsUpdate = true;
      }

      if (entry.detailGroup) {
        this.scene.remove(entry.detailGroup);
        entry.detailGroup = null;
      }
      if (entry.buildBaseDetails) {
        const baseGroup = entry.buildBaseDetails();
        baseGroup.position.set(entry.cx, entry.baseY, entry.cz);
        this.scene.add(baseGroup);
        entry.detailGroup = baseGroup;
      }
    } else {
      if (entry.wallMesh) entry.wallMesh.material = wallMat;
      if (entry.roofMesh) entry.roofMesh.material = roofMat;
    }

    entry.wallMaterialId = entry.baseWallMaterialId;
    entry.roofMaterialId = entry.baseRoofMaterialId;
    entry.customDesign = null;
    this.buildingArt?.setBuildingCustomized(buildingId, false);
    this.showBanner('Building Reset', `Restored original ${entry.name}`);
    this.emitHud(true);
  }

  private buildIndieDetailGroup(
    entry: BuildingEntry,
    wallH: number,
    roofH: number,
    rawDesign: BuildingDesignRecipe
  ): THREE.Group {
    const design = normalizeBuildingDesign(rawDesign, entry.levels);
    const ring = entry.currentRing ?? entry.ring;
    const group = new THREE.Group();
    group.position.set(entry.cx, entry.baseY, entry.cz);

    const segments = computeWallSegments(ring, entry.cx, entry.cz);
    const sortedSegs = [...segments].sort((a, b) => b.length - a.length);
    const frontSeg = sortedSegs[0] ?? null;
    const sideSeg = sortedSegs.find((s) => s !== frontSeg && Math.abs(s.normalX * (frontSeg?.normalX ?? 0) + s.normalZ * (frontSeg?.normalZ ?? 0)) < 0.45) ?? sortedSegs[1] ?? frontSeg;

    const archMats = this.archMaterials;
    const frameMat = archMats
      ? (() => {
          const m = archMats.woodFrameMat.clone();
          m.color.set(design.windowFrameHex);
          return m;
        })()
      : new THREE.MeshStandardMaterial({
          color: new THREE.Color(design.windowFrameHex),
          roughness: 0.55,
          metalness: 0.05,
        });
    const glassMat = archMats
      ? (() => {
          const m = archMats.windowGlassMat.clone();
          m.color.set(design.windowGlowHex).lerp(new THREE.Color(0xffffff), 0.35);
          m.emissive.set(design.windowGlowHex);
          m.emissiveIntensity = 0.42;
          return m;
        })()
      : new THREE.MeshStandardMaterial({
          color: new THREE.Color(design.windowGlowHex),
          emissive: new THREE.Color(design.windowGlowHex),
          emissiveIntensity: 0.44,
          roughness: 0.18,
          metalness: 0.16,
        });
    const trimMat = archMats
      ? (() => {
          const m = archMats.woodFrameMat.clone();
          m.color.set(design.trimHex);
          return m;
        })()
      : new THREE.MeshStandardMaterial({
          color: new THREE.Color(design.trimHex),
          roughness: 0.62,
          metalness: 0.04,
        });
    const plinthMat = archMats
      ? (() => {
          const m = archMats.stonePlinthMat.clone();
          m.color.set(design.plinthHex).lerp(new THREE.Color(0xffffff), 0.25);
          return m;
        })()
      : new THREE.MeshStandardMaterial({
          color: new THREE.Color(design.plinthHex),
          roughness: 0.9,
          metalness: 0.02,
        });
    const shutterMat = archMats
      ? (() => {
          const m = archMats.woodShutterMat.clone();
          m.color.set(design.shutterHex);
          return m;
        })()
      : new THREE.MeshStandardMaterial({
          color: new THREE.Color(design.shutterHex),
          roughness: 0.7,
          metalness: 0.04,
        });
    const doorMat = archMats
      ? (() => {
          const m = archMats.woodDoorMat.clone();
          m.color.set(design.doorHex).lerp(new THREE.Color(0xffffff), 0.3);
          return m;
        })()
      : new THREE.MeshStandardMaterial({
          color: new THREE.Color(design.doorHex),
          roughness: 0.58,
          metalness: 0.06,
        });
    const metalTrimMat = archMats?.zincRidgeMat ?? new THREE.MeshStandardMaterial({
      color: 0x3b4044,
      roughness: 0.36,
      metalness: 0.68,
    });
    const roofMat = this.materialLib.getMaterial(design.roofRecipe);

    // 1. Stone / Concrete Foundation Plinth around building perimeter (with subterranean skirt for sloped terrain)
    const plinthH = design.addPlinth ? Math.min(design.plinthHeightM, wallH * 0.25) : 0;
    if (design.addPlinth && plinthH > 0.1) {
      const skirtDepth = 0.75;
      const totalPlinthH = plinthH + skirtDepth;
      for (const seg of segments) {
        const band = new THREE.Mesh(
          applyMetricTriplanarUvAndUv2(new THREE.BoxGeometry(seg.length + 0.14, totalPlinthH, 0.14), BUILDING_UV_METER_SCALE),
          plinthMat
        );
        band.position.set(
          seg.midX + seg.normalX * 0.04,
          plinthH - totalPlinthH * 0.5,
          seg.midZ + seg.normalZ * 0.04
        );
        band.rotation.y = seg.yaw;
        group.add(band);
      }
    }

    // 2. Corner Boards, Stone Quoins, or Classical Pilasters
    if (design.addTrim && design.trimStyle !== 'none') {
      if (design.trimStyle === 'stone_quoins') {
        const blockH = 0.36;
        const courses = Math.max(3, Math.floor((wallH - plinthH) / (blockH * 1.45)));
        for (const [rx, rz] of ring) {
          const lx = rx - entry.cx;
          const lz = rz - entry.cz;
          for (let ci = 0; ci < courses; ci++) {
            const qW = ci % 2 === 0 ? 0.42 : 0.3;
            const quoin = new THREE.Mesh(new THREE.BoxGeometry(qW, blockH, qW), trimMat);
            quoin.position.set(lx, plinthH + blockH * 0.6 + ci * blockH * 1.45, lz);
            group.add(quoin);
          }
        }
      } else {
        const postSize = design.trimStyle === 'pilasters' ? 0.34 : 0.22;
        for (const [rx, rz] of ring) {
          const lx = rx - entry.cx;
          const lz = rz - entry.cz;
          const post = new THREE.Mesh(
            new THREE.BoxGeometry(postSize, Math.max(0.5, wallH - plinthH + 0.04), postSize),
            trimMat
          );
          post.position.set(lx, plinthH + (wallH - plinthH) * 0.5, lz);
          group.add(post);
        }
        // Intermediate facade pilasters on wide walls
        if (design.trimStyle === 'pilasters') {
          for (const seg of segments) {
            if (seg.length < 9.5) continue;
            const bayCount = seg.length >= 16 ? 3 : 2;
            const tx = -seg.normalZ;
            const tz = seg.normalX;
            for (let pi = 1; pi < bayCount; pi++) {
              const t = (pi / bayCount - 0.5) * (seg.length - 1.2);
              const pil = new THREE.Mesh(
                new THREE.BoxGeometry(0.28, wallH - plinthH, 0.14),
                trimMat
              );
              pil.position.set(
                seg.midX + tx * t + seg.normalX * 0.05,
                plinthH + (wallH - plinthH) * 0.5,
                seg.midZ + tz * t + seg.normalZ * 0.05
              );
              pil.rotation.y = seg.yaw;
              group.add(pil);
            }
          }
        }
      }
    }

    // 3. Horizontal Eave Cornice & Multi-Story Belt Course
    if (design.addCornice) {
      for (const seg of segments) {
        const cornice = new THREE.Mesh(new THREE.BoxGeometry(seg.length + 0.22, 0.24, 0.22), trimMat);
        cornice.position.set(seg.midX + seg.normalX * 0.07, wallH - 0.11, seg.midZ + seg.normalZ * 0.07);
        cornice.rotation.y = seg.yaw;
        group.add(cornice);

        if (design.windowRows >= 2 && wallH >= 4.9) {
          const belt = new THREE.Mesh(new THREE.BoxGeometry(seg.length + 0.12, 0.12, 0.12), trimMat);
          belt.position.set(seg.midX + seg.normalX * 0.05, wallH * 0.5, seg.midZ + seg.normalZ * 0.05);
          belt.rotation.y = seg.yaw;
          group.add(belt);
        }
      }
    }

    // 4. Rain Gutters & Vertical Downspouts
    if (design.addGutters && design.roofStyle !== 'flat_modern') {
      const eavePush = (design.overhangScale - 1) * Math.max(2.2, entry.depthM * 0.35) + 0.18;
      for (const seg of segments) {
        const gutter = new THREE.Mesh(new THREE.BoxGeometry(seg.length + 0.25, 0.09, 0.12), metalTrimMat);
        gutter.position.set(seg.midX + seg.normalX * eavePush, wallH - 0.05, seg.midZ + seg.normalZ * eavePush);
        gutter.rotation.y = seg.yaw;
        group.add(gutter);
      }
      for (let vi = 0; vi < ring.length; vi += 2) {
        const [rx, rz] = ring[vi];
        const lx = (rx - entry.cx) * 1.02;
        const lz = (rz - entry.cz) * 1.02;
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, wallH, 6), metalTrimMat);
        pipe.position.set(lx, wallH * 0.5, lz);
        group.add(pipe);
      }
    }

    // 5. Entrance Door & Porch + Optional Balcony
    const doorSeg =
      design.doorPlacement === 'none'
        ? null
        : design.doorPlacement === 'side_wall'
          ? sideSeg
          : frontSeg;
    const doorTangentOffset =
      doorSeg && design.doorPlacement === 'offset_front'
        ? Math.min(2.4, Math.max(1.2, doorSeg.length * 0.24))
        : 0;
    const doorClearHalfWidth =
      design.doorStyle === 'double_manor' || design.porchStyle === 'column_portico' || design.porchStyle === 'timber_veranda'
        ? 1.45
        : 1.05;

    if (doorSeg && design.doorPlacement !== 'none') {
      const dtx = -doorSeg.normalZ;
      const dtz = doorSeg.normalX;
      const doorAnchorX = doorSeg.midX + dtx * doorTangentOffset;
      const doorAnchorZ = doorSeg.midZ + dtz * doorTangentOffset;

      const entrance = new THREE.Group();
      entrance.position.set(doorAnchorX, 0, doorAnchorZ);
      entrance.rotation.y = doorSeg.yaw;

      const sillY = Math.max(0.16, plinthH * 0.72);
      const isDouble = design.doorStyle === 'double_manor';
      const doorW = isDouble ? 1.65 : design.doorStyle === 'glazed_modern' ? 1.38 : 1.06;
      const doorH = Math.min(wallH * 0.78, isDouble || design.doorStyle === 'glazed_modern' ? 2.38 : 2.12);

      // Door casing frame
      const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.22, doorH + 0.16, 0.14), frameMat);
      doorFrame.position.set(0, sillY + doorH * 0.5, 0.06);
      entrance.add(doorFrame);

      if (design.doorStyle === 'glazed_modern') {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW * 0.48, doorH * 0.92, 0.17), doorMat);
        leaf.position.set(-doorW * 0.2, sillY + doorH * 0.48, 0.07);
        entrance.add(leaf);
        const sidelight = new THREE.Mesh(new THREE.BoxGeometry(doorW * 0.36, doorH * 0.92, 0.17), glassMat);
        sidelight.position.set(doorW * 0.26, sillY + doorH * 0.48, 0.07);
        entrance.add(sidelight);
      } else {
        const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(doorW * 0.9, doorH * 0.94, 0.17), doorMat);
        doorLeaf.position.set(0, sillY + doorH * 0.48, 0.07);
        entrance.add(doorLeaf);

        if (isDouble) {
          const centerStile = new THREE.Mesh(new THREE.BoxGeometry(0.06, doorH * 0.94, 0.19), frameMat);
          centerStile.position.set(0, sillY + doorH * 0.48, 0.08);
          entrance.add(centerStile);
        }
        // Brass handle
        const handle = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.18, 0.08),
          new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.32, metalness: 0.78 })
        );
        handle.position.set(isDouble ? 0.11 : doorW * 0.32, sillY + 1.02, 0.16);
        entrance.add(handle);
      }

      if (design.doorStyle === 'arched_oak' || isDouble) {
        const fanlight = new THREE.Mesh(new THREE.BoxGeometry(doorW * 0.84, 0.28, 0.17), glassMat);
        fanlight.position.set(0, sillY + doorH + 0.06, 0.07);
        entrance.add(fanlight);
      }

      // Porch / Stoop Geometry
      if (design.porchStyle !== 'none') {
        const porchW = design.porchStyle === 'timber_veranda' ? 3.2 : design.porchStyle === 'column_portico' ? 2.85 : 2.15;
        const porchD = design.porchStyle === 'steps_only' ? 1.15 : 1.55;
        const deckSkirt = sillY + 0.65;
        const deck = new THREE.Mesh(new THREE.BoxGeometry(porchW, deckSkirt, porchD), plinthMat);
        deck.position.set(0, sillY + 0.08 - deckSkirt * 0.5, porchD * 0.5);
        entrance.add(deck);

        const lowerStepH = sillY * 0.5 + 0.45;
        const lowerStep = new THREE.Mesh(new THREE.BoxGeometry(porchW * 0.76, lowerStepH, 0.55), plinthMat);
        lowerStep.position.set(0, sillY * 0.5 - lowerStepH * 0.5, porchD + 0.25);
        entrance.add(lowerStep);

        if (design.porchStyle === 'column_portico') {
          for (const px of [-porchW * 0.4, porchW * 0.4]) {
            const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, doorH + 0.35, 10), trimMat);
            col.position.set(px, sillY + (doorH + 0.35) * 0.5, porchD - 0.18);
            entrance.add(col);
          }
          const pediment = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.26, 0.2, porchD + 0.24), trimMat);
          pediment.position.set(0, sillY + doorH + 0.42, porchD * 0.52);
          entrance.add(pediment);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(porchW * 0.62, 0.65, 4), roofMat);
          cap.position.set(0, sillY + doorH + 0.82, porchD * 0.52);
          cap.rotation.y = Math.PI / 4;
          entrance.add(cap);
        } else if (design.porchStyle === 'timber_veranda') {
          for (const px of [-porchW * 0.43, porchW * 0.43]) {
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, doorH + 0.3, 0.15), trimMat);
            post.position.set(px, sillY + (doorH + 0.3) * 0.5, porchD - 0.16);
            entrance.add(post);
          }
          const rail = new THREE.Mesh(new THREE.BoxGeometry(porchW - 0.15, 0.1, 0.1), trimMat);
          rail.position.set(0, sillY + 0.85, porchD - 0.16);
          entrance.add(rail);
          const canopy = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.25, 0.16, porchD + 0.32), roofMat);
          canopy.position.set(0, sillY + doorH + 0.42, porchD * 0.52);
          canopy.rotation.x = 0.22;
          entrance.add(canopy);
        } else if (design.porchStyle === 'modern_canopy') {
          const awning = new THREE.Mesh(new THREE.BoxGeometry(porchW + 0.2, 0.12, porchD + 0.1), metalTrimMat);
          awning.position.set(0, sillY + doorH + 0.26, porchD * 0.46);
          entrance.add(awning);
        }
      }

      // Upper Balcony above main entrance on multi-story buildings
      if (design.addBalcony && wallH >= 4.6) {
        const balcY = wallH * 0.52;
        const balcW = 2.8;
        const balcD = 1.15;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(balcW, 0.14, balcD), trimMat);
        slab.position.set(0, balcY, balcD * 0.5);
        entrance.add(slab);

        const railTop = new THREE.Mesh(new THREE.BoxGeometry(balcW, 0.08, 0.08), metalTrimMat);
        railTop.position.set(0, balcY + 0.88, balcD - 0.06);
        entrance.add(railTop);

        for (let bi = -2; bi <= 2; bi++) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.88, 0.06), metalTrimMat);
          post.position.set(bi * 0.62, balcY + 0.44, balcD - 0.06);
          entrance.add(post);
        }
      }

      group.add(entrance);
    }

    // 6. Detailed Facade Windows (Rows x Pattern x Mullions x Shutters)
    if (design.addWindows && segments.length > 0 && frontSeg) {
      const rows = Math.max(1, Math.min(design.windowRows, Math.floor((wallH - plinthH) / 1.9)));
      const winW = Math.min(design.windowWidthM, Math.max(0.65, frontSeg.length * 0.3));
      const maxRowWinH = rows === 1 ? (wallH - plinthH) * 0.62 : (wallH - plinthH) * 0.34;
      const winH = Math.max(0.62, Math.min(design.windowHeightM, maxRowWinH));

      for (const seg of segments) {
        if (seg.length < 2.6) continue;
        const tx = -seg.normalZ;
        const tz = seg.normalX;
        const segCols =
          seg === frontSeg
            ? design.windowCols
            : Math.max(1, Math.round(design.windowCols * (seg.length / Math.max(4, frontSeg.length))));

        for (let row = 0; row < rows; row++) {
          const floorSpan = wallH - plinthH - 0.35;
          const wy =
            rows === 1
              ? plinthH + floorSpan * 0.52
              : plinthH + floorSpan * ((row + 0.56) / rows);

          const doorExclusion =
            row === 0 && seg === doorSeg && design.doorPlacement !== 'none'
              ? { center: doorTangentOffset, halfWidth: doorClearHalfWidth }
              : null;

          const offsets = computeFacadeWindowPositions(
            seg.length,
            segCols,
            design.windowPattern,
            winW,
            doorExclusion
          );

          for (const offsetT of offsets) {
            const wx = seg.midX + tx * offsetT + seg.normalX * 0.08;
            const wz = seg.midZ + tz * offsetT + seg.normalZ * 0.08;

            const winHolder = new THREE.Group();
            winHolder.position.set(wx, wy, wz);
            winHolder.rotation.y = seg.yaw;

            // Outer frame
            const outer = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.16, winH + 0.16, 0.1), frameMat);
            winHolder.add(outer);

            // Recessed glass pane
            const pane = new THREE.Mesh(new THREE.BoxGeometry(winW * 0.86, winH * 0.86, 0.13), glassMat);
            winHolder.add(pane);

            // Projecting sill & top header lintel
            const sill = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.28, 0.09, 0.18), trimMat);
            sill.position.y = -winH * 0.5 - 0.04;
            winHolder.add(sill);

            const lintel = new THREE.Mesh(new THREE.BoxGeometry(winW + 0.24, 0.1, 0.15), trimMat);
            lintel.position.y = winH * 0.5 + 0.05;
            winHolder.add(lintel);

            // Arched cap when windowStyle is 'arched'
            if (design.windowStyle === 'arched') {
              const arch = new THREE.Mesh(
                new THREE.CylinderGeometry(winW * 0.44, winW * 0.44, 0.11, 10, 1, false, 0, Math.PI),
                glassMat
              );
              arch.rotation.x = Math.PI / 2;
              arch.rotation.z = -Math.PI / 2;
              arch.position.set(0, winH * 0.5 - 0.02, 0.01);
              winHolder.add(arch);
            }

            // Window Mullion Bars
            if (design.windowMullions !== 'none') {
              const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, winH * 0.88, 0.15), frameMat);
              winHolder.add(vBar);

              if (design.windowMullions === 'cross') {
                const hBar = new THREE.Mesh(new THREE.BoxGeometry(winW * 0.88, 0.05, 0.15), frameMat);
                winHolder.add(hBar);
              } else if (design.windowMullions === 'six_pane') {
                for (const hy of [-winH * 0.16, winH * 0.16]) {
                  const hBar = new THREE.Mesh(new THREE.BoxGeometry(winW * 0.88, 0.045, 0.15), frameMat);
                  hBar.position.y = hy;
                  winHolder.add(hBar);
                }
              }
            }

            // Exterior flanking shutters
            if (design.addShutters) {
              const shW = Math.min(0.42, winW * 0.42);
              for (const side of [-1, 1]) {
                const shutter = new THREE.Mesh(new THREE.BoxGeometry(shW, winH + 0.04, 0.08), shutterMat);
                shutter.position.set(side * (winW * 0.5 + shW * 0.5 + 0.1), 0, 0.03);
                winHolder.add(shutter);
              }
            }

            group.add(winHolder);
          }
        }
      }
    }

    // 7. Attic Gable-End Window / Oculus
    if (
      design.addGableWindow &&
      (design.roofStyle === 'steep_gable' || design.roofStyle === 'gambrel') &&
      roofH >= 1.5
    ) {
      const localPts: [number, number][] = ring.map(([rx, rz]) => [rx - entry.cx, rz - entry.cz]);
      const gable = computeGableRidgePlan(localPts, 1.0);
      if (gable) {
        for (const [endPts] of [
          [gable.eaveEndA],
          [gable.eaveEndB],
        ] as [[[number, number], [number, number]]][]) {
          const [p0, p1] = endPts;
          const mx = (p0[0] + p1[0]) * 0.5;
          const mz = (p0[1] + p1[1]) * 0.5;
          const dx = p1[0] - p0[0];
          const dz = p1[1] - p0[1];
          const len = Math.hypot(dx, dz) || 1;
          let nx = dz / len;
          let nz = -dx / len;
          if (mx * nx + mz * nz < 0) {
            nx = -nx;
            nz = -nz;
          }
          const gWin = new THREE.Group();
          gWin.position.set(mx + nx * 0.08, wallH + roofH * 0.44, mz + nz * 0.08);
          gWin.rotation.y = Math.atan2(nx, nz);

          const gFrame = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.86, 0.1), frameMat);
          const gGlass = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.68, 0.13), glassMat);
          const gBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.15), frameMat);
          gWin.add(gFrame, gGlass, gBar);
          group.add(gWin);
        }
      }
    }

    // 8. Multi-Chimneys (brick_stack, plastered_cap, metal_flue)
    if (design.addChimney && design.chimneyCount > 0) {
      const obb = computePrimaryAxisAndBounds(ring);
      const ca = Math.cos(obb.angle);
      const sa = Math.sin(obb.angle);
      const count = Math.min(2, Math.max(1, design.chimneyCount));
      const chimneyWallMat =
        design.chimneyStyle === 'plastered_cap'
          ? trimMat
          : design.chimneyStyle === 'metal_flue'
            ? metalTrimMat
            : archMats?.brickChimneyMat ?? new THREE.MeshStandardMaterial({ color: 0x8a412f, roughness: 0.86 });

      for (let ci = 0; ci < count; ci++) {
        const uOff = count === 1 ? obb.lengthU * 0.16 : (ci === 0 ? -0.24 : 0.24) * obb.lengthU;
        const cxLocal = ca * uOff;
        const czLocal = sa * uOff;

        if (design.chimneyStyle === 'metal_flue') {
          const pipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.2, roofH + 1.55, 10),
            chimneyWallMat
          );
          pipe.position.set(cxLocal, wallH + roofH * 0.62, czLocal);
          group.add(pipe);
          const cowl = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.22, 10), chimneyWallMat);
          cowl.position.set(cxLocal, wallH + roofH + 0.55, czLocal);
          group.add(cowl);
        } else {
          const stack = new THREE.Mesh(
            applyMetricTriplanarUvAndUv2(new THREE.BoxGeometry(0.76, roofH + 1.5, 0.76), BUILDING_UV_METER_SCALE),
            chimneyWallMat
          );
          stack.position.set(cxLocal, wallH + roofH * 0.58, czLocal);
          group.add(stack);

          const cap = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.16, 0.96), archMats?.chimneyCapMat ?? metalTrimMat);
          cap.position.set(cxLocal, wallH + roofH + 0.55, czLocal);
          group.add(cap);
        }
      }
    }

    // 9. Multi-Dormers along primary roof slope
    if (design.addDormers && design.dormerCount > 0 && design.roofStyle !== 'flat_modern' && frontSeg) {
      const dCount = Math.min(4, Math.max(1, design.dormerCount));
      const tx = -frontSeg.normalZ;
      const tz = frontSeg.normalX;
      const span = Math.max(2, frontSeg.length - 3.6);
      const isTwoSlope = design.roofStyle === 'gambrel' || design.roofStyle === 'mansard';
      const dormerOutFactor = isTwoSlope ? 0.66 : 0.58;
      const dormerY = wallH + (isTwoSlope ? roofH * 0.52 : roofH * 0.36);
      for (let di = 0; di < dCount; di++) {
        const t = dCount === 1 ? 0 : (di / (dCount - 1) - 0.5) * span;
        const dormer = new THREE.Group();
        dormer.position.set(
          frontSeg.midX * dormerOutFactor + tx * t,
          dormerY,
          frontSeg.midZ * dormerOutFactor + tz * t
        );
        dormer.rotation.y = frontSeg.yaw;

        const dBox = new THREE.Mesh(new THREE.BoxGeometry(1.32, 1.02, 1.38), trimMat);
        dormer.add(dBox);
        const dGlass = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.64, 0.14), glassMat);
        dGlass.position.set(0, 0.05, 0.68);
        dormer.add(dGlass);
        const dMull = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.66, 0.16), frameMat);
        dMull.position.set(0, 0.05, 0.69);
        dormer.add(dMull);
        const dRoof = new THREE.Mesh(new THREE.ConeGeometry(1.02, 0.62, 4), roofMat);
        dRoof.position.y = 0.8;
        dRoof.rotation.y = Math.PI / 4;
        dormer.add(dRoof);

        group.add(dormer);
      }
    }

    return group;
  }

  public async importGlbFile(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const loader = new GLTFLoader();
    await new Promise<void>((resolve, reject) => {
      loader.parse(
        buffer,
        '',
        (gltf) => {
          if (this.importedGroup) {
            this.scene.remove(this.importedGroup);
          }
          const model = gltf.scene;
          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = !this.isSoftwareGl;
              child.receiveShadow = true;
            }
          });
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          // Auto-normalize oversized/tiny meshes to ~10m house scale
          const baseScale = maxDim > 60 || maxDim < 2 ? 10 / maxDim : 1;
          model.position.sub(center);
          model.position.y += (size.y * 0.5);

          const wrapper = new THREE.Group();
          wrapper.add(model);

          const target = this.selectedBuildingId ? this.buildingMap.get(this.selectedBuildingId) : null;
          const placeX = target ? target.cx : this.playerX + 12;
          const placeZ = target ? target.cz : this.playerZ + 12;
          const py = groundHeightAt(WORLD, placeX, placeZ);
          wrapper.position.set(placeX, py, placeZ);
          wrapper.scale.setScalar(baseScale);
          this.scene.add(wrapper);

          this.importedGroup = wrapper;
          this.importedState = {
            name: file.name,
            x: +placeX.toFixed(1),
            z: +placeZ.toFixed(1),
            scale: +baseScale.toFixed(2),
            rotationDeg: 0,
          };
          this.showBanner('3D Model Placed', `${file.name} imported into Renda`);
          this.emitHud(true);
          resolve();
        },
        reject
      );
    });
  }

  public updateImportedModel(patch: Partial<ImportedModelState>): void {
    if (!this.importedGroup || !this.importedState) return;
    this.importedState = { ...this.importedState, ...patch };
    const py = groundHeightAt(WORLD, this.importedState.x, this.importedState.z);
    this.importedGroup.position.set(this.importedState.x, py, this.importedState.z);
    this.importedGroup.scale.setScalar(this.importedState.scale);
    this.importedGroup.rotation.y = THREE.MathUtils.degToRad(this.importedState.rotationDeg);
    this.emitHud(true);
  }

  public toggleMute(): boolean {
    this.audio.muted = !this.audio.muted;
    return this.audio.muted;
  }

  public isMuted(): boolean {
    return this.audio.muted;
  }

  private showBanner(title: string, subtitle: string): void {
    this.activeBanner = { title, subtitle };
    window.clearTimeout(this.bannerTimeout);
    this.bannerTimeout = window.setTimeout(() => {
      this.activeBanner = null;
      this.emitHud(true);
    }, 3400);
    this.emitHud(true);
  }

  private updateMissionBeacon(): void {
    if (!this.activeMission) {
      this.missionBeacon.visible = false;
      return;
    }
    const y = groundHeightAt(WORLD, this.activeMission.targetX, this.activeMission.targetZ);
    this.missionBeacon.position.set(this.activeMission.targetX, y, this.activeMission.targetZ);
    this.missionBeacon.visible = this.phase === 'playing' && this.mode !== 'studio' && this.mode !== 'walk';
  }

  private syncActorTransforms(): void {
    this.explorerRig.group.position.set(this.playerX, this.playerY, this.playerZ);
    this.explorerRig.group.rotation.y = this.playerHeading;

    this.carRig.group.position.set(this.playerX, this.playerY, this.playerZ);
    this.carRig.group.rotation.y = this.playerHeading;

    this.canoeRig.group.position.set(this.playerX, this.playerY, this.playerZ);
    this.canoeRig.group.rotation.y = this.playerHeading;
  }

  private stepSimulation(dt: number, elapsed: number): void {
    this.tacticalVillage?.update(dt, elapsed);
    this.streetSurfaces?.update(dt, elapsed);
    this.battlefieldAtmosphere?.update(dt, elapsed, this.camera);
    this.bulletImpacts.update(dt);
    this.windTimeUniform.value = elapsed;
    if (this.waterTexture) {
      this.waterTexture.offset.y -= dt * 0.28;
    }
    if (this.waterBumpTexture) {
      this.waterBumpTexture.offset.x += dt * 0.14;
      this.waterBumpTexture.offset.y -= dt * 0.34;
    }
    if (this.waterfallTexture) {
      this.waterfallTexture.offset.y += dt * 1.45;
    }

    // Volumetric clouds drift smoothly in GLSL via uCloudTime = this.windTimeUniform

    // Rotate landmark diamonds gently
    for (let i = 0; i < this.landmarkDiamonds.length; i++) {
      const d = this.landmarkDiamonds[i];
      d.rotation.y = elapsed * 1.4 + i * 0.5;
    }

    if (this.phase === 'title') {
      this.titleAngle += dt * 0.065;
      const pose = computeTitleFlyoverPose(this.titleAngle, this.flyoverAnchors);
      this.camera.position.set(pose.camX, pose.camY, pose.camZ);
      this.camera.lookAt(pose.lookX, pose.lookY, pose.lookZ);
      this.updateDrawDistances(pose.camX, pose.camZ);
      const snapped = snapShadowCenter(pose.lookX, pose.lookZ, this.shadowHalfExtent, this.shadowMapRes);
      this.sunLight.target.position.set(snapped.x, pose.lookY - 8, snapped.z);
      this.sunLight.target.updateMatrixWorld();
      this.sunLight.position.copy(this.sunDirUniform.value).multiplyScalar(280).add(this.sunLight.target.position);
      this.updateParticles(dt);
      return;
    }

    if (this.phase !== 'playing') return;

    // Smooth tactile pop animation on freshly restyled buildings (works inside Studio too!)
    for (const [bId, t] of this.popAnims.entries()) {
      const nextT = Math.min(1, t + dt * 4.5);
      const entry = this.buildingMap.get(bId);
      const s = 0.92 + 0.08 * (1 - Math.pow(1 - nextT, 3));
      if (entry) {
        entry.wallMesh?.scale.set(1, s, 1);
        entry.roofMesh?.scale.set(1, s, 1);
        entry.detailGroup?.scale.set(1, s, 1);
      }
      if (nextT >= 1) this.popAnims.delete(bId);
      else this.popAnims.set(bId, nextT);
    }

    if (this.mode === 'studio') {
      if (!this.isSoftwareGl) this.controls.update();
      this.updateDrawDistances(this.camera.position.x, this.camera.position.z);
      return;
    }

    // Ambient particles: gentle Baltic rain streaks during overcast_rain or warm golden sun-motes
    this.ambientParticleTimer += dt;
    const isRaining = this.atmosphere === 'overcast_rain';
    if (this.ambientParticleTimer >= (isRaining ? 0.035 : 0.28)) {
      this.ambientParticleTimer = 0;
      if (isRaining) {
        const px = this.playerX + (Math.random() - 0.5) * 26;
        const pz = this.playerZ + (Math.random() - 0.5) * 26;
        const py = groundHeightAt(WORLD, px, pz) + 10 + Math.random() * 6;
        this.spawnParticle(px, py, pz, -0.4, -14.5, 0.2, 0.08, 0.85, 0xcfdce3);
      } else {
        const px = this.playerX + (Math.random() - 0.5) * 34;
        const pz = this.playerZ + (Math.random() - 0.5) * 34;
        const py = groundHeightAt(WORLD, px, pz) + 0.8 + Math.random() * 4.5;
        this.spawnParticle(
          px,
          py,
          pz,
          (Math.random() - 0.5) * 0.35,
          0.25 + Math.random() * 0.35,
          (Math.random() - 0.5) * 0.35,
          0.22,
          2.6,
          0xffe19c
        );
      }
    }

    // Advance FPS weapon timers & auto-fire
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
    this.boltKick = Math.max(0, this.boltKick - dt * 11);
    if (this.inspectTimer > 0) {
      this.inspectTimer = Math.max(0, this.inspectTimer - dt);
    }
    if (this.reloadTimer > 0) {
      this.reloadTimer = Math.max(0, this.reloadTimer - dt);
      if (this.reloadTimer === 0) {
        const needed = 30 - this.ammoInMag;
        const loaded = Math.min(needed, this.ammoReserve);
        this.ammoInMag += loaded;
        this.ammoReserve -= loaded;
        this.emitHud(true);
      }
    } else if (
      this.isFiringHeld &&
      this.fireMode === 'AUTO' &&
      this.mode === 'walk' &&
      this.cameraPerspective === 'first_person' &&
      this.shotCooldown <= 0
    ) {
      this.fireWeapon();
    }

    const kbFwd =
      (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const kbTurn =
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) -
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0);
    const kbRight = -kbTurn;

    const fwd = Math.abs(kbFwd) > 0.05 ? kbFwd : this.touchThrottle;
    const turn = Math.abs(kbTurn) > 0.05 ? kbTurn : this.touchTurn;

    const prevX = this.playerX;
    const prevZ = this.playerZ;
    this.prevSpeed = this.speed;
    let isWalkSprinting = false;

    if (this.mode === 'walk') {
      const strafeRight = Math.abs(kbRight) > 0.05 ? kbRight : -this.touchTurn;
      const moveVec = computeCameraRelativeMoveVector(strafeRight, fwd, this.camYaw);
      const wantSprint =
        (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchSprint) &&
        moveVec.magnitude > 0.12;
      const isFps = this.cameraPerspective === 'first_person';

      if (isFps) {
        isWalkSprinting = wantSprint && !this.isCrouching && !this.isAiming && this.stamina > 0.05 && this.staminaCooldown <= 0;
        if (isWalkSprinting) {
          this.stamina = Math.max(0, this.stamina - dt * 0.24);
          if (this.stamina <= 0.02) this.staminaCooldown = 1.1;
        } else {
          this.staminaCooldown = Math.max(0, this.staminaCooldown - dt);
          this.stamina = Math.min(1, this.stamina + dt * (moveVec.magnitude < 0.1 ? 0.34 : 0.16));
        }
        const maxSpd = computeFpsMoveSpeed(isWalkSprinting, this.isCrouching, this.fpsState.adsAlpha, this.stamina);
        const targetSpd = moveVec.magnitude * maxSpd;
        const accel = moveVec.magnitude > 0.05 ? 14 : 18;
        this.speed = THREE.MathUtils.damp(this.speed, targetSpd, accel, dt);
      } else {
        isWalkSprinting = wantSprint;
        const maxSpd = isWalkSprinting ? 13.8 : 8.2;
        const targetSpd = moveVec.magnitude * maxSpd;
        const accel = moveVec.magnitude > 0.05 ? 13 : 16;
        this.speed = THREE.MathUtils.damp(this.speed, targetSpd, accel, dt);
      }

      if (moveVec.magnitude > 0.05) {
        this.playerHeading = shortestAngleLerp(
          this.playerHeading,
          moveVec.targetHeading,
          1 - Math.exp(-14 * dt)
        );
        this.playerX += moveVec.moveX * this.speed * dt;
        this.playerZ += moveVec.moveZ * this.speed * dt;
      } else if (Math.abs(this.speed) > 0.05) {
        this.playerX += Math.sin(this.playerHeading) * this.speed * dt;
        this.playerZ += Math.cos(this.playerHeading) * this.speed * dt;
      }

      const resolved = this.resolveActorCollisions(this.playerX, this.playerZ, 0.85, 0.4);
      this.playerX = resolved.x;
      this.playerZ = resolved.z;

      const bounded = clampToPlayableBounds(WORLD, this.playerX, this.playerZ);
      this.playerX = bounded.x;
      this.playerZ = bounded.z;

      const groundY = this.getMovementGroundHeight(this.playerX, this.playerZ);
      const grounded = this.playerY <= groundY + 0.08 && this.playerVy <= 0.25;
      if (grounded) {
        this.coyoteTimer = 0.11;
      } else {
        this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
      }
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);

      if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
        this.playerVy = 6.9;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        this.squashY = 1.18;
        this.audio.playJump();
        for (let k = 0; k < 4; k++) {
          this.spawnParticle(
            this.playerX + (Math.random() - 0.5) * 0.6,
            groundY + 0.12,
            this.playerZ + (Math.random() - 0.5) * 0.6,
            (Math.random() - 0.5) * 1.8,
            0.5 + Math.random() * 0.8,
            (Math.random() - 0.5) * 1.8,
            0.42,
            0.45,
            0xd6c7a8
          );
        }
      }

      this.playerVy -= 19.5 * dt;
      this.playerY += this.playerVy * dt;
      if (this.playerY <= groundY) {
        if (!this.wasGrounded && this.playerVy < -3.2) {
          this.squashY = 0.78;
          this.audio.playLand();
          for (let k = 0; k < 6; k++) {
            this.spawnParticle(
              this.playerX + (Math.random() - 0.5) * 0.7,
              groundY + 0.1,
              this.playerZ + (Math.random() - 0.5) * 0.7,
              (Math.random() - 0.5) * 2.4,
              0.5 + Math.random() * 1.0,
              (Math.random() - 0.5) * 2.4,
              0.48,
              0.5,
              0xcfc0a3
            );
          }
        }
        this.playerY = groundY;
        this.playerVy = 0;
        this.wasGrounded = true;
      } else {
        this.wasGrounded = false;
      }
      this.squashY = THREE.MathUtils.damp(this.squashY, 1, 14, dt);

      // Full articulated gait + sprint lean + squash/stretch + subtle head turn
      const stepDelta = Math.hypot(this.playerX - prevX, this.playerZ - prevZ);
      this.stepAccum += stepDelta;
      const inAir = this.playerY > groundY + 0.16;
      const spdRatio = Math.min(1.4, Math.abs(this.speed) / 8.2);
      const phase = this.stepAccum * 1.38;
      const swingAmp = inAir ? 0.35 : 0.68 * Math.min(1.15, spdRatio);
      const swing = Math.abs(this.speed) > 0.25 || inAir ? Math.sin(phase) * swingAmp : 0;

      this.explorerRig.leftLeg.rotation.x = inAir ? 0.36 : swing;
      this.explorerRig.rightLeg.rotation.x = inAir ? -0.28 : -swing;
      this.explorerRig.leftArm.rotation.x = inAir ? -0.65 : -swing * 0.82;
      this.explorerRig.rightArm.rotation.x = inAir ? -0.65 : swing * 0.82;
      this.explorerRig.body.position.y = inAir ? 0 : Math.abs(Math.sin(phase)) * 0.085 * Math.min(1, spdRatio);
      this.explorerRig.body.rotation.x = THREE.MathUtils.damp(
        this.explorerRig.body.rotation.x,
        spdRatio * 0.11,
        10,
        dt
      );
      const xzSquash = 1 / Math.sqrt(Math.max(0.65, this.squashY));
      this.explorerRig.body.scale.set(xzSquash, this.squashY, xzSquash);
      this.explorerRig.head.rotation.y = THREE.MathUtils.damp(
        this.explorerRig.head.rotation.y,
        Math.sin(this.camYaw - this.playerHeading) * 0.22,
        8,
        dt
      );

      if (stepDelta > 0.05 && Math.floor((this.stepAccum - stepDelta) / 2.6) < Math.floor(this.stepAccum / 2.6)) {
        this.audio.playStep();
      }

      if (isWalkSprinting && !inAir) {
        this.trailParticleTimer += dt;
        if (this.trailParticleTimer >= 0.09) {
          this.trailParticleTimer = 0;
          this.spawnParticle(
            this.playerX - Math.sin(this.playerHeading) * 0.35 + (Math.random() - 0.5) * 0.3,
            groundY + 0.12,
            this.playerZ - Math.cos(this.playerHeading) * 0.35 + (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.6,
            0.35 + Math.random() * 0.4,
            (Math.random() - 0.5) * 0.6,
            0.36,
            0.42,
            0xd4c6a8
          );
        }
      }
    } else if (this.mode === 'drive') {
      const boost = this.touchSprint || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 1.25 : 1.0;
      const maxSpd = 24 * boost;
      const targetSpd = fwd > 0 ? maxSpd * fwd : fwd < 0 ? 9 * fwd : 0;
      this.speed = THREE.MathUtils.damp(this.speed, targetSpd, fwd !== 0 ? 3.4 : 2.3, dt);

      const steerStrength = Math.min(1, Math.abs(this.speed) / 4.5);
      const dirSign = this.speed >= -0.2 ? 1 : -1;
      this.playerHeading += turn * 1.95 * steerStrength * dirSign * dt;

      this.playerX += Math.sin(this.playerHeading) * this.speed * dt;
      this.playerZ += Math.cos(this.playerHeading) * this.speed * dt;

      const resolved = this.resolveActorCollisions(this.playerX, this.playerZ, 2.2, 1.0);
      if (resolved.collided) this.speed *= 0.4;
      this.playerX = resolved.x;
      this.playerZ = resolved.z;

      const bounded = clampToPlayableBounds(WORLD, this.playerX, this.playerZ);
      this.playerX = bounded.x;
      this.playerZ = bounded.z;
      this.playerY = this.getMovementGroundHeight(this.playerX, this.playerZ) + 0.08;

      // Wheel rotation, steering & dynamic suspension pitch/roll + reactive brake lights
      const wheelSpin = (this.speed * dt) / 0.37;
      for (const w of this.carRig.wheels) w.rotation.x += wheelSpin;
      const steerAngle = THREE.MathUtils.damp(this.carRig.frontLeftPivot.rotation.y, turn * 0.42, 11, dt);
      this.carRig.frontLeftPivot.rotation.y = steerAngle;
      this.carRig.frontRightPivot.rotation.y = steerAngle;

      const accelVal = (this.speed - this.prevSpeed) / Math.max(0.005, dt);
      const targetPitch = THREE.MathUtils.clamp(-accelVal * 0.0032, -0.065, 0.065);
      const targetRoll = THREE.MathUtils.clamp(
        turn * Math.min(1, Math.abs(this.speed) / 10) * 0.065,
        -0.07,
        0.07
      );
      this.carBodyPitch = THREE.MathUtils.damp(this.carBodyPitch, targetPitch, 10, dt);
      this.carBodyRoll = THREE.MathUtils.damp(this.carBodyRoll, targetRoll, 9, dt);
      this.carRig.bodyPivot.rotation.x = this.carBodyPitch;
      this.carRig.bodyPivot.rotation.z = this.carBodyRoll;

      const isBraking = (fwd < -0.1 && this.speed > 0.5) || (fwd < -0.05 && this.speed < -0.5);
      this.carRig.brakeLightMat.emissiveIntensity = isBraking ? 2.4 : 0.6;

      if (Math.abs(this.speed) > 4.5) {
        this.trailParticleTimer += dt;
        if (this.trailParticleTimer >= 0.065) {
          this.trailParticleTimer = 0;
          const sinH = Math.sin(this.playerHeading);
          const cosH = Math.cos(this.playerHeading);
          for (const side of [-0.9, 0.9]) {
            const wx = this.playerX - sinH * 1.45 - cosH * side;
            const wz = this.playerZ - cosH * 1.45 + sinH * side;
            this.spawnParticle(
              wx,
              this.playerY + 0.18,
              wz,
              (Math.random() - 0.5) * 1.0,
              0.45 + Math.random() * 0.5,
              (Math.random() - 0.5) * 1.0,
              0.68,
              0.65,
              0xc9bba1
            );
          }
        }
      }
    } else if (this.mode === 'canoe') {
      const maxSpd = 12.5;
      const targetSpd = fwd * maxSpd;
      this.speed = THREE.MathUtils.damp(this.speed, targetSpd, 4.0, dt);
      this.playerHeading += turn * 1.85 * dt;

      const candX = this.playerX + Math.sin(this.playerHeading) * this.speed * dt;
      const candZ = this.playerZ + Math.cos(this.playerHeading) * this.speed * dt;
      const riv = findNearestRiverPoint(WORLD.waterways, candX, candZ);
      if (riv && riv.distance <= riv.width * 1.15) {
        this.playerX = candX;
        this.playerZ = candZ;
      } else if (riv) {
        this.playerX = THREE.MathUtils.lerp(candX, riv.x, 0.35);
        this.playerZ = THREE.MathUtils.lerp(candZ, riv.z, 0.35);
      }

      const bounded = clampToPlayableBounds(WORLD, this.playerX, this.playerZ);
      this.playerX = bounded.x;
      this.playerZ = bounded.z;
      this.playerY = this.getWaterSurfaceY(this.playerX, this.playerZ) - 0.14 + Math.sin(elapsed * 2.6) * 0.04;

      this.canoeRig.group.rotation.z = THREE.MathUtils.damp(
        this.canoeRig.group.rotation.z,
        -turn * 0.09,
        7,
        dt
      );
      if (Math.abs(this.speed) > 0.5) {
        this.canoeRig.paddleGroup.rotation.z = Math.sin(elapsed * 6.5) * 0.38;
        this.canoeRig.paddleGroup.rotation.y = Math.cos(elapsed * 6.5) * 0.25;
        this.trailParticleTimer += dt;
        if (this.trailParticleTimer >= 0.09) {
          this.trailParticleTimer = 0;
          this.spawnParticle(
            this.playerX - Math.sin(this.playerHeading) * 2.1 + (Math.random() - 0.5) * 0.6,
            this.playerY + 0.18,
            this.playerZ - Math.cos(this.playerHeading) * 2.1 + (Math.random() - 0.5) * 0.6,
            (Math.random() - 0.5) * 1.2,
            0.6 + Math.random() * 0.7,
            (Math.random() - 0.5) * 1.2,
            0.35,
            0.48,
            0xd4f0f5
          );
        }
      }
    }

    const moved = Math.hypot(this.playerX - prevX, this.playerZ - prevZ);
    this.distanceTraveledM += moved;

    // Landmark discovery check
    const newlyFound = checkLandmarkDiscoveries(WORLD.landmarks, this.discoveredIds, this.playerX, this.playerZ, 48);
    if (newlyFound.length > 0) {
      for (const lm of newlyFound) {
        this.discoveredIds.push(lm.id);
        this.score += 100;
        this.audio.playDiscovery();
        this.showBanner(`Discovered: ${lm.name}`, `${lm.year} · ${lm.desc}`);
      }
      this.persistBestScore();
    }

    // Courier mission delivery check
    if (this.activeMission) {
      const dMission = Math.hypot(this.playerX - this.activeMission.targetX, this.playerZ - this.activeMission.targetZ);
      if (dMission <= 26) {
        this.deliveriesCompleted += 1;
        this.score += this.activeMission.rewardScore;
        this.persistBestScore();
        this.audio.playMissionComplete();
        this.showBanner(
          `Delivered to ${this.activeMission.targetName}`,
          `+${this.activeMission.rewardScore} pts · ${this.activeMission.cargoLabel}`
        );
        this.activeMission = createNextCourierMission(
          WORLD.landmarks,
          this.playerX,
          this.playerZ,
          this.deliveriesCompleted,
          this.activeMission.targetLandmarkId
        );
        this.updateMissionBeacon();
      }
    }

    this.syncActorTransforms();
    this.updateParticles(dt);

    // Update texel-snapped sun shadow frustum smoothly around player so crisp desktop shadows never swim
    const snapped = snapShadowCenter(this.playerX, this.playerZ, this.shadowHalfExtent, this.shadowMapRes);
    this.sunLight.target.position.set(snapped.x, this.playerY, snapped.z);
    this.sunLight.target.updateMatrixWorld();
    this.sunLight.position.copy(this.sunDirUniform.value).multiplyScalar(280).add(this.sunLight.target.position);

    // Inertial camera & first-person tactical weapon viewmodel rig
    const isFps = this.mode === 'walk' && this.cameraPerspective === 'first_person';
    if (!this.isDraggingCamera && !(isFps && this.pointerLocked)) {
      this.camYaw += this.camYawVel * dt;
      const pMin = isFps ? -1.18 : -0.08;
      const pMax = isFps ? 1.18 : 0.68;
      this.camPitch = Math.max(pMin, Math.min(pMax, this.camPitch + this.camPitchVel * dt));
      const decay = Math.exp(-9 * dt);
      this.camYawVel *= decay;
      this.camPitchVel *= decay;
      if ((this.mode === 'drive' || this.mode === 'canoe') && Math.abs(this.speed) > 1.2) {
        const diff = Math.atan2(
          Math.sin(this.playerHeading - this.camYaw),
          Math.cos(this.playerHeading - this.camYaw)
        );
        this.camYaw += diff * (1 - Math.exp(-2.6 * dt));
      }
    }

    if (isFps) {
      const fpsGround = this.getMovementGroundHeight(this.playerX, this.playerZ);
      this.fpsState = stepFpsWeaponPhysics(this.fpsState, dt, {
        aiming: this.isAiming && this.reloadTimer <= 0,
        crouching: this.isCrouching,
        leanInput: this.leanInput,
        speedMs: Math.abs(this.speed),
        grounded: this.playerY <= fpsGround + 0.12,
        lookDeltaX: this.lookDeltaFrameX,
        lookDeltaY: this.lookDeltaFrameY,
      });
      this.lookDeltaFrameX = 0;
      this.lookDeltaFrameY = 0;

      const reloadProg = this.reloadTimer > 0 ? 1 - this.reloadTimer / this.reloadDuration : 0;
      const inspectProg = this.inspectTimer > 0 ? 1 - this.inspectTimer / 1.6 : 0;
      this.weaponViewmodel.update(dt, elapsed, this.fpsState, {
        speedMs: Math.abs(this.speed),
        sprinting: isWalkSprinting,
        reloadProgress: reloadProg,
        inspectProgress: inspectProg,
        muzzleFlashTimer: this.muzzleFlashTimer,
        boltKick: this.boltKick,
      });

      this.updateFpsCameraTransform();
      const targetFpsFov = computeFpsCameraFov(this.fpsState.adsAlpha, isWalkSprinting, Math.abs(this.speed));
      if (Math.abs(this.camera.fov - targetFpsFov) > 0.05) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFpsFov, 10, dt);
        this.camera.updateProjectionMatrix();
      }
    } else {
      this.lookDeltaFrameX = 0;
      this.lookDeltaFrameY = 0;
      const baseTargetDist =
        this.mode === 'drive'
          ? 11.8 + Math.min(2.2, Math.abs(this.speed) * 0.08)
          : this.mode === 'canoe'
            ? 10.2
            : isWalkSprinting
              ? 7.3
              : 6.6;
      const targetDist = Math.max(3.6, baseTargetDist + this.camZoomOffset);
      this.camDistSmooth = THREE.MathUtils.damp(this.camDistSmooth, targetDist, 7, dt);

      const shoulderAmt = this.mode === 'walk' ? 0.55 : 0;
      const shoulderX = -Math.cos(this.camYaw) * shoulderAmt;
      const shoulderZ = Math.sin(this.camYaw) * shoulderAmt;
      const baseHeight = this.mode === 'drive' ? 2.8 : this.mode === 'canoe' ? 2.5 : 2.15;

      _camDesired.set(
        this.playerX + shoulderX - Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDistSmooth,
        this.playerY + baseHeight + Math.sin(this.camPitch) * this.camDistSmooth * 0.68,
        this.playerZ + shoulderZ - Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDistSmooth
      );
      const camGround = this.getMovementGroundHeight(_camDesired.x, _camDesired.z) + 1.4;
      if (_camDesired.y < camGround) _camDesired.y = camGround;

      const dampFactor = 1 - Math.exp(-12 * dt);
      this.camera.position.lerp(_camDesired, dampFactor);

      _lookDesired.set(
        this.playerX + shoulderX * 0.7,
        this.playerY + (this.mode === 'walk' ? 1.78 : 1.5),
        this.playerZ + shoulderZ * 0.7
      );
      if (!this.hasInitCamera) {
        this.lookTargetSmooth.copy(_lookDesired);
        this.hasInitCamera = true;
      } else {
        this.lookTargetSmooth.lerp(_lookDesired, 1 - Math.exp(-15 * dt));
      }
      this.camera.lookAt(this.lookTargetSmooth);

      const targetFov =
        this.mode === 'drive'
          ? 58 + Math.min(11, Math.abs(this.speed) * 0.42)
          : isWalkSprinting
            ? 62
            : 58;
      if (Math.abs(this.camera.fov - targetFov) > 0.05) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 6, dt);
        this.camera.updateProjectionMatrix();
      }
    }
    this.updateDrawDistances(this.camera.position.x, this.camera.position.z);
  }

  private updateDrawDistances(camX: number, camZ: number): void {
    this.treeSystem?.updateLod(camX, camZ);
    this.groundCoverSystem?.updateLod(camX, camZ);
    this.villagePropsSystem?.updateLod(camX, camZ);
  }

  private persistBestScore(): void {
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      try {
        localStorage.setItem('renda_3d_best_score', String(this.bestScore));
      } catch {
        // ignore
      }
    }
  }

  private emitHud(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastHudEmit < 140) return;
    this.lastHudEmit = now;

    const nearest = findNearestLandmark(WORLD.landmarks, this.playerX, this.playerZ);
    const selEntry = this.selectedBuildingId ? this.buildingMap.get(this.selectedBuildingId) : null;
    const selectedBuilding: SelectedBuildingInfo | null = selEntry
      ? {
          id: selEntry.id,
          name: selEntry.name,
          kind: selEntry.kind,
          levels: selEntry.levels,
          cx: selEntry.cx,
          cz: selEntry.cz,
          widthM: selEntry.widthM,
          depthM: selEntry.depthM,
          baseWallH: +selEntry.baseWallH.toFixed(1),
          baseRoofH: +selEntry.baseRoofH.toFixed(1),
          wallMaterialId: selEntry.wallMaterialId,
          roofMaterialId: selEntry.roofMaterialId,
          hasCustomDesign: selEntry.customDesign !== null,
          designSummary: selEntry.customDesign?.designSummary,
          customDesign: selEntry.customDesign,
        }
      : null;

    this.onHudUpdate({
      phase: this.phase,
      mode: this.mode,
      playerX: this.playerX,
      playerZ: this.playerZ,
      playerHeading: this.playerHeading,
      camYaw: this.camYaw,
      elevationM: +(WORLD.meta.baseElev + this.playerY).toFixed(1),
      speedKmh: Math.round(Math.abs(this.speed) * 3.6),
      distanceTraveledM: Math.round(this.distanceTraveledM),
      discoveredIds: [...this.discoveredIds],
      totalLandmarks: WORLD.landmarks.length,
      nearestLandmark: nearest
        ? {
            id: nearest.landmark.id,
            name: nearest.landmark.name,
            distanceM: Math.round(nearest.distanceM),
          }
        : null,
      activeMission: this.activeMission,
      deliveriesCompleted: this.deliveriesCompleted,
      score: this.score,
      bestScore: this.bestScore,
      activeBanner: this.activeBanner,
      selectedBuilding,
      importedModel: this.importedState,
      cameraPerspective: this.cameraPerspective,
      atmosphere: this.atmosphere,
      compassBearingDeg: Math.round(computeCompassBearingDeg(this.camYaw)),
      adsAlpha: +this.fpsState.adsAlpha.toFixed(2),
      ammoInMag: this.ammoInMag,
      ammoReserve: this.ammoReserve,
      isReloading: this.reloadTimer > 0,
      fireMode: this.fireMode,
      stamina: +this.stamina.toFixed(2),
      crouching: this.isCrouching,
      leaning: this.leanInput,
      pointerLocked: this.pointerLocked,
    });
  }

  private getMaxTexAnisotropy(): number {
    return this.isSoftwareGl ? 1 : this.renderer.capabilities.getMaxAnisotropy();
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.isDisposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 16);
      } else {
        if (sync) gl.deleteSync(sync);
        document.body.dataset.frameCount = String(this.frameCount);
        this.frameId = window.setTimeout(cb, 16);
      }
    };
    this.frameId = window.setTimeout(poll, 16);
  }

  private renderNow(): void {
    if (!this.readyToRender || !this.initialAssetsReady) return;
    if (this.colorGradePass?.uniforms['uTime']) {
      this.colorGradePass.uniforms['uTime'].value = performance.now() / 1000;
    }
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private loop = (): void => {
    if (this.isDisposed) return;
    if (!this.initialAssetsReady) {
      this.frameId = window.setTimeout(this.loop, 100);
      return;
    }
    if (this.isSoftwareGl && document.body.dataset.pauseLoop === '1') {
      this.frameId = window.setTimeout(this.loop, 180);
      return;
    }
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(rawDt, 0.05);

    this.stepSimulation(dt, now / 1000);
    this.renderNow();
    this.emitHud(false);
    this.frameCount++;
    if (this.isSoftwareGl) {
      this.afterDraw(this.loop);
    } else {
      this.frameId = requestAnimationFrame(this.loop);
    }
  };

  public dispose(): void {
    this.isDisposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    clearTimeout(this.bannerTimeout);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleBlur);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.handlePointerDown);
    el.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    el.removeEventListener('contextmenu', this.preventContext);

    this.treeSystem?.dispose();
    this.groundCoverSystem?.dispose();
    this.villagePropsSystem?.dispose();
    this.controls.dispose();
    for (const pass of this.composer?.passes ?? []) pass.dispose();
    this.composer?.dispose();
    this.composerRenderTarget?.dispose();
    this.weaponViewmodel.dispose();
    this.bulletImpacts.dispose();
    this.tacticalVillage?.dispose();
    this.streetSurfaces?.dispose();
    this.buildingArt?.dispose();
    this.battlefieldAtmosphere?.dispose();
    this.staticScenery?.dispose();
    this.envRenderTarget?.dispose();
    for (const target of this.outdoorEnvironments.values()) target.dispose();
    this.outdoorEnvironments.clear();
    for (const texture of this.skyPanoramas.values()) texture.dispose();
    this.skyPanoramas.clear();
    this.materialLib.dispose();
    if (this.archMaterials) {
      for (const m of this.archMaterials.materials) m.dispose();
      for (const t of this.archMaterials.textures) t.dispose();
      this.archMaterials = null;
    }
    this.cloudDome?.geometry.dispose();
    (this.cloudDome?.material as THREE.Material | undefined)?.dispose();
    this.waterTexture?.dispose();
    this.waterBumpTexture?.dispose();
    this.waterfallTexture?.dispose();
    this.terrainTexture?.dispose();
    for (const tex of this.extraTextures) tex.dispose();
    this.extraTextures = [];
    this.audio.dispose();
    this.renderer.dispose();
    if (el.parentElement === this.container) {
      this.container.removeChild(el);
    }
  }
}
