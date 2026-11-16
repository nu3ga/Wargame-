import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { RendaWorldDataset } from './types';
import {
  applyFpsRecoilImpulse,
  buildBuildingColliders,
  checkLandmarkDiscoveries,
  clampToPlayableBounds,
  computeCameraRelativeMoveVector,
  computeCompassBearingDeg,
  computeCompassTicks,
  computeFacadeWindowPositions,
  computeFpsCameraFov,
  computeFpsMoveSpeed,
  computeGableRidgePlan,
  computeInsetPolygon,
  computeMetricRoofQuadUvs,
  computePolygonCentroid,
  computePrimaryAxisAndBounds,
  computeRoadEdgeDisplacement,
  computeSignedAngleDiffDeg,
  computeTerrainSlope,
  computeTitleFlyoverPose,
  computeTouchStickVector,
  computeTriplanarBoxUv,
  computeVergeWeedDensity,
  computeWallSegments,
  computeWaterwayFlowAtPoint,
  createInitialFpsWeaponState,
  createNextCourierMission,
  deterministicSpatialNoise2D,
  evaluateMoodColorProfile,
  findNearestLandmark,
  findNearestRiverPoint,
  formatLatLon,
  groundHeightAt,
  normalizeBuildingDesign,
  pointInPolygon,
  resolveBuildingCollisions,
  scaleFootprintRingAlongAxes,
  shortestAngleLerp,
  snapShadowCenter,
  stepFpsWeaponPhysics,
} from './rendaMath';
import * as THREE from 'three';
import {
  computeSpeciesCanopyCardLayout,
  createCurvedGrassClusterGeometry,
  createKurzemeEzTreeOptions,
  createOrganicTreeSkeletonGeometry,
  createVolumetricCanopyGeometry,
  normalizeEzTreeGeometry,
  partitionTreeInstancesByDistance,
  type FoliageSpecies,
  type TreeSpecies,
} from './foliageOverhaul';
import {
  collectCellCoordsInRadius,
  computeDrawDistanceFade,
  computePropTierRule,
  filterInstancesByDrawDistance,
  partitionTreeInstancesByDistance3Tier,
} from './drawDistance';

const world = JSON.parse(
  fs.readFileSync(new URL('../data/rendaWorld.json', import.meta.url), 'utf8')
) as RendaWorldDataset;

test('groundHeightAt returns finite elevation inside Renda bounds', () => {
  const spawnY = groundHeightAt(world, world.meta.spawnX, world.meta.spawnZ);
  assert.ok(Number.isFinite(spawnY));
  assert.ok(spawnY >= 0 && spawnY <= 60);

  // Clamping outside bounds never yields NaN
  const clampedEdge = groundHeightAt(world, 99999, -99999);
  assert.ok(Number.isFinite(clampedEdge));
});

test('spawn position is clear of building colliders and faces Renda Lutheran Church', () => {
  const colliders = buildBuildingColliders(world.buildings);
  assert.equal(colliders.length, world.buildings.length);

  const check = resolveBuildingCollisions(world.meta.spawnX, world.meta.spawnZ, 1.2, colliders);
  assert.equal(check.collided, false);

  const nearest = findNearestLandmark(world.landmarks, world.meta.spawnX, world.meta.spawnZ);
  assert.ok(nearest);
  assert.equal(nearest.landmark.id, 'church');
  assert.ok(nearest.distanceM > 30 && nearest.distanceM < 120);
});

test('resolveBuildingCollisions pushes actor cleanly out of building footprint', () => {
  const rect: [number, number][] = [
    [10, 10],
    [20, 10],
    [20, 20],
    [10, 20],
  ];
  const centroid = computePolygonCentroid(rect);
  assert.equal(centroid.cx, 15);
  assert.equal(centroid.cz, 15);

  const colliders = buildBuildingColliders([
    { id: 1, name: 'Test House', kind: 'house', levels: 1, roof: 'gabled', ring: rect },
  ]);
  const res = resolveBuildingCollisions(10.2, 15, 1.0, colliders, 0.5);
  assert.equal(res.collided, true);
  assert.ok(res.x <= 8.5001);
});

test('checkLandmarkDiscoveries detects nearby landmarks once', () => {
  const church = world.landmarks.find((l) => l.id === 'church')!;
  const found1 = checkLandmarkDiscoveries(world.landmarks, [], church.x + 12, church.z - 5, 48);
  assert.equal(found1.length, 1);
  assert.equal(found1[0].id, 'church');

  const found2 = checkLandmarkDiscoveries(world.landmarks, ['church'], church.x + 12, church.z - 5, 48);
  assert.equal(found2.length, 0);
});

test('createNextCourierMission picks distant landmark and scales reward', () => {
  const mission = createNextCourierMission(
    world.landmarks,
    world.meta.spawnX,
    world.meta.spawnZ,
    0,
    'church'
  );
  assert.notEqual(mission.targetLandmarkId, 'church');
  assert.ok(mission.distanceMeters >= 150);
  assert.ok(mission.rewardScore >= 150);
});

test('findNearestRiverPoint locates Abava or Ivande river', () => {
  const pier = world.landmarks.find((l) => l.id === 'abava_boats')!;
  const riverPt = findNearestRiverPoint(world.waterways, pier.x, pier.z);
  assert.ok(riverPt);
  assert.ok(riverPt.distance < 120);
  assert.ok(riverPt.riverName.length > 0);
});

test('clampToPlayableBounds and formatLatLon preserve Renda geographic coordinates', () => {
  const clamped = clampToPlayableBounds(world, 5000, -5000, 35);
  assert.equal(clamped.x, world.meta.halfW - 35);
  assert.equal(clamped.z, -(world.meta.halfH - 35));

  const coords = formatLatLon(world, 0, 0);
  assert.ok(Math.abs(coords.lat - world.meta.centerLat) < 0.001);
  assert.ok(Math.abs(coords.lon - world.meta.centerLon) < 0.001);
});

test('computeWallSegments yields outward-facing normals for building footprints', () => {
  const rect: [number, number][] = [
    [-5, -4],
    [5, -4],
    [5, 4],
    [-5, 4],
  ];
  const segments = computeWallSegments(rect, 0, 0);
  assert.equal(segments.length, 4);
  for (const s of segments) {
    // Dot product of midpoint with outward normal must be positive
    assert.ok(s.midX * s.normalX + s.midZ * s.normalZ > 0);
    assert.ok(s.length >= 8);
  }
});

test('computeTouchStickVector respects deadzone, radial clamp, and direction sign', () => {
  const tiny = computeTouchStickVector(2, -3, 44, 0.14);
  assert.equal(tiny.turn, 0);
  assert.equal(tiny.throttle, 0);

  const forwardLeft = computeTouchStickVector(-40, -40, 44, 0.14);
  assert.ok(forwardLeft.turn > 0.5);
  assert.ok(forwardLeft.throttle > 0.5);
  assert.ok(Math.hypot(forwardLeft.clampedX, forwardLeft.clampedY) <= 44.001);
});

test('Renda dataset includes P120 primary highway, bridges, and realistic street widths', () => {
  const primaryRoads = world.roads.filter((r) => r.kind === 'primary');
  assert.ok(primaryRoads.length >= 4);
  assert.ok(primaryRoads.some((r) => r.bridge === true));

  const avgWidth = (kind: string) => {
    const list = world.roads.filter((r) => r.kind === kind);
    return list.reduce((s, r) => s + r.width, 0) / list.length;
  };
  assert.ok(avgWidth('primary') > avgWidth('residential'));
  assert.ok(avgWidth('residential') > avgWidth('service'));
  assert.ok(avgWidth('service') > avgWidth('footway'));
});

test('Renda Lutheran Church matches East-West OSM orientation with west belltower', () => {
  const church = world.buildings.find((b) => b.kind === 'church')!;
  assert.ok(church);
  const obb = computePrimaryAxisAndBounds(church.ring);
  // Real church runs roughly East-West (~-4.5 deg), ~36m long x 16m wide
  assert.ok(Math.abs(obb.angle) < 0.2);
  assert.ok(obb.lengthU > 32 && obb.lengthU < 42);
  assert.ok(obb.widthV > 13 && obb.widthV < 20);
  assert.ok(church.towerXZ && church.towerXZ[0] < obb.centerX);

  // Belltower OSM way 1372184084 must not be duplicated as a separate generic house
  assert.equal(world.buildings.some((b) => b.id === 1372184084), false);
});

test('High-res DEM grid captures Renda terrace relief & multi-wing roofs inset cleanly', () => {
  assert.ok(world.meta.gridX >= 150 && world.meta.gridZ >= 120);
  const manor = world.landmarks.find((l) => l.id === 'manor')!;
  const church = world.landmarks.find((l) => l.id === 'church')!;
  const riverPier = world.landmarks.find((l) => l.id === 'abava_boats')!;
  const ivandeRumba = world.landmarks.find((l) => l.id === 'ivande_rumba')!;
  const valdatuRumba = world.landmarks.find((l) => l.id === 'valdatu_rumba')!;

  const manorY = groundHeightAt(world, manor.x, manor.z);
  const churchY = groundHeightAt(world, church.x, church.z);
  const riverY = groundHeightAt(world, riverPier.x, riverPier.z);
  assert.ok(manorY - churchY >= 10, `Expected Lielrenda Manor (${manorY}m) above Church Hill (${churchY}m)`);
  assert.ok(churchY - riverY >= 10, `Expected Church Hill (${churchY}m) above Abava River (${riverY}m)`);
  assert.ok(
    groundHeightAt(world, valdatuRumba.x, valdatuRumba.z) >
      groundHeightAt(world, ivandeRumba.x, ivandeRumba.z)
  );

  // Complex buildings (Lielrenda Manor & Vigneri Culture House) yield clean inset roof skirts
  const manorBuilding = world.buildings.find((b) => b.kind === 'manor')!;
  const c = computePolygonCentroid(manorBuilding.ring);
  const local = manorBuilding.ring.map(([x, z]) => [x - c.cx, z - c.cz] as [number, number]);
  const inset = computeInsetPolygon(local, 2.2);
  assert.ok(inset !== null && inset.inset.length === inset.outer.length);
});

test('pointInPolygon handles wood outer rings and inner clearings accurately', () => {
  const outer: [number, number][] = [
    [-20, -20],
    [20, -20],
    [20, 20],
    [-20, 20],
  ];
  const clearing: [number, number][] = [
    [-5, -5],
    [5, -5],
    [5, 5],
    [-5, 5],
  ];
  assert.equal(pointInPolygon(12, 12, outer, [clearing]), true);
  assert.equal(pointInPolygon(0, 0, outer, [clearing]), false);
  assert.equal(pointInPolygon(25, 0, outer, [clearing]), false);
});

test('Renda v3 buildings carry aerial-sampled roof tones and local reference assets exist', () => {
  const manor = world.buildings.find((b) => b.kind === 'manor')!;
  const church = world.buildings.find((b) => b.kind === 'church')!;
  assert.equal(manor.roofTone, 'crimson');
  assert.equal(manor.roofHex, '#8b2f31');
  assert.equal(church.roofTone, 'clay');
  assert.equal(church.roofHex, '#9a4530');

  const roofed = world.buildings.filter((b) => b.kind !== 'ruins');
  const withTones = roofed.filter((b) => Boolean(b.roofTone && b.roofHex));
  assert.equal(withTones.length, roofed.length);

  const distinctTones = new Set(withTones.map((b) => b.roofTone));
  assert.ok(distinctTones.size >= 3);

  const requiredAssets = [
    '../../public/assets/renda_aerial_ground.jpg',
    '../../public/assets/refs/church.jpg',
    '../../public/assets/refs/manor.jpg',
    '../../public/assets/refs/water_tower.jpg',
    '../../public/assets/refs/bridge_p120.jpg',
    '../../public/assets/refs/ivande_rumba.jpg',
    '../../public/assets/refs/panorama.jpg',
  ];
  for (const rel of requiredAssets) {
    const stat = fs.statSync(new URL(rel, import.meta.url));
    assert.ok(stat.size > 10000, `Expected non-empty asset ${rel}`);
  }
});

test('LGIA LiDAR dataset provides high-res 360x300 DTM, real building heights, river elevs, and CHM trees', () => {
  assert.ok(world.meta.gridX >= 300 && world.meta.gridZ >= 250);
  assert.equal(world.heights.length, world.meta.gridX * world.meta.gridZ);
  assert.ok((world.meta.churchSpireH ?? 0) > 22 && (world.meta.churchSpireH ?? 0) < 32);
  assert.ok((world.meta.waterTowerH ?? 0) > 24 && (world.meta.waterTowerH ?? 0) < 32);

  const trees = world.trees ?? [];
  assert.ok(trees.length >= 2500, `Expected >= 2500 LiDAR CHM trees, got ${trees.length}`);
  for (const [tx, tz, h, sp] of trees.slice(0, 100)) {
    assert.ok(Math.abs(tx) <= world.meta.halfW && Math.abs(tz) <= world.meta.halfH);
    assert.ok(h >= 3 && h <= 38);
    assert.ok(sp >= 0 && sp <= 3);
  }

  const lidarBuildings = world.buildings.filter((b) => typeof b.wallH === 'number' && typeof b.roofH === 'number');
  assert.ok(lidarBuildings.length >= 240);

  const riversWithElevs = world.waterways.filter((w) => Array.isArray(w.elevs) && w.elevs.length === w.pts.length);
  assert.equal(riversWithElevs.length, world.waterways.length);
});

test('computeTerrainSlope and computeWaterwayFlowAtPoint capture gorge slopes and waterfall drops', () => {
  const spawnSlope = computeTerrainSlope(world, world.meta.spawnX, world.meta.spawnZ);
  assert.ok(Number.isFinite(spawnSlope) && spawnSlope >= 0 && spawnSlope < 0.4);

  const ivande = world.landmarks.find((l) => l.id === 'ivande_rumba')!;
  const valdatu = world.landmarks.find((l) => l.id === 'valdatu_rumba')!;
  const f1 = computeWaterwayFlowAtPoint(world, ivande.x, ivande.z);
  const f2 = computeWaterwayFlowAtPoint(world, valdatu.x, valdatu.z);

  assert.ok(f1 && f1.dropM >= 0.8, `Expected Ivandes Rumba LiDAR drop >= 0.8m, got ${f1?.dropM}`);
  assert.ok(f2 && f2.dropM >= 0.8, `Expected Valdatu Rumba LiDAR drop >= 0.8m, got ${f2?.dropM}`);
  assert.ok(f1.upstreamElev > f1.downstreamElev);
  assert.ok(f2.upstreamElev > f2.downstreamElev);
});

test('computeGableRidgePlan handles rectangular and 5-corner near-rectangular rings accurately', () => {
  const rect: [number, number][] = [
    [-6, -4],
    [6, -4],
    [6, 4],
    [-6, 4],
  ];
  const plan = computeGableRidgePlan(rect, 1.0);
  assert.ok(plan);
  assert.equal(plan.ptsCCW.length, 4);
  assert.ok(Math.abs(Math.abs(plan.ridgeA[0]) - 6) < 0.01);
  assert.ok(Math.abs(Math.abs(plan.ridgeB[0]) - 6) < 0.01);
  assert.ok(Math.abs(plan.ridgeA[1]) < 0.01 && Math.abs(plan.ridgeB[1]) < 0.01);

  // 5-corner ring with an extra midpoint along one long wall still simplifies cleanly
  const fiveGon: [number, number][] = [
    [-6, -4],
    [0, -4],
    [6, -4],
    [6, 4],
    [-6, 4],
  ];
  const plan5 = computeGableRidgePlan(fiveGon, 1.0);
  assert.ok(plan5);
  assert.equal(plan5.ptsCCW.length, 4);
});

test('computeCameraRelativeMoveVector, shortestAngleLerp, and computeCompassBearingDeg align with world axes', () => {
  // Looking North (camYaw = PI => forward = (0, -1), right = (+1, 0))
  const northWalk = computeCameraRelativeMoveVector(0, 1, Math.PI);
  assert.ok(Math.abs(northWalk.moveX) < 1e-6);
  assert.ok(northWalk.moveZ < -0.99);
  assert.equal(Math.round(computeCompassBearingDeg(Math.PI)), 0);

  const eastStrafe = computeCameraRelativeMoveVector(1, 0, Math.PI);
  assert.ok(eastStrafe.moveX > 0.99);
  assert.ok(Math.abs(eastStrafe.moveZ) < 1e-6);

  // Diagonal input clamps magnitude cleanly to <= 1
  const diag = computeCameraRelativeMoveVector(1, 1, 0);
  assert.ok(Math.hypot(diag.moveX, diag.moveZ) <= 1.0001);

  // Shortest angle wrap across +-PI boundary
  const wrapped = shortestAngleLerp(Math.PI * 0.95, -Math.PI * 0.95, 0.5);
  assert.ok(Math.abs(Math.abs(wrapped) - Math.PI) < 0.05);

  // Looking East (+X) => yaw = PI/2 => 90 deg bearing
  assert.equal(Math.round(computeCompassBearingDeg(Math.PI * 0.5)), 90);
});

test('scaleFootprintRingAlongAxes preserves rotated OBB orientation while scaling width and depth independently', () => {
  const angle = Math.PI / 6; // 30 deg rotated 12m x 6m building centered at (100, -40)
  const cx = 100;
  const cz = -40;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const toWorld = (u: number, v: number): [number, number] => [cx + u * ca - v * sa, cz + u * sa + v * ca];
  const rect = [toWorld(-6, -3), toWorld(6, -3), toWorld(6, 3), toWorld(-6, 3)];

  const scaled = scaleFootprintRingAlongAxes(rect, cx, cz, 1.5, 0.75);
  const obb = computePrimaryAxisAndBounds(scaled);
  assert.ok(Math.abs(obb.lengthU - 18) < 0.05, `Expected width 18m, got ${obb.lengthU}`);
  assert.ok(Math.abs(obb.widthV - 4.5) < 0.05, `Expected depth 4.5m, got ${obb.widthV}`);
  assert.ok(Math.abs(obb.centerX - cx) < 0.05 && Math.abs(obb.centerZ - cz) < 0.05);
  assert.ok(Math.abs(obb.angle - angle) < 0.02);
});

test('computeFacadeWindowPositions arranges uniform, paired, and ribbon layouts inside wall bounds and avoids door center', () => {
  const segLen = 14;
  const winW = 1.0;

  const uniform = computeFacadeWindowPositions(segLen, 5, 'uniform', winW);
  assert.equal(uniform.length, 5);
  for (const x of uniform) {
    assert.ok(Math.abs(x) <= segLen * 0.5 - winW * 0.5);
  }

  const paired = computeFacadeWindowPositions(segLen, 4, 'paired', winW);
  assert.equal(paired.length, 4);
  // Distance within a pair should be noticeably tighter than gap between pairs
  const pairInternal = Math.abs(paired[1] - paired[0]);
  const pairBetween = Math.abs(paired[2] - paired[1]);
  assert.ok(pairInternal < pairBetween, `Expected pair gap (${pairInternal}) < bay gap (${pairBetween})`);

  const withDoorGap = computeFacadeWindowPositions(segLen, 5, 'uniform', winW, { center: 0, halfWidth: 0.9 });
  assert.ok(withDoorGap.every((x) => Math.abs(x) >= 0.9 + winW * 0.52));
});

test('normalizeBuildingDesign safely fills and clamps missing Precise Mode fields', () => {
  const minimal = {
    id: 'test_1',
    designName: 'Manor Test',
    architecturalStyle: 'manor_classic' as const,
    heightScale: 1.3,
    roofStyle: 'mansard' as const,
    roofPitch: 1.2,
    overhangScale: 1.1,
    addWindows: true,
    windowStyle: 'arched' as const,
    windowFrameHex: '#ffffff',
    windowGlowHex: '#ffd588',
    addChimney: true,
    addPorch: true,
    addDormers: true,
    addTrim: true,
    trimHex: '#efe5d0',
    wallRecipe: {
      id: 'w',
      name: 'W',
      pattern: 'plaster' as const,
      primaryHex: '#d9c598',
      secondaryHex: '#b9a578',
      accentHex: '#8d7a55',
      roughness: 0.8,
      metalness: 0,
      bumpScale: 0.04,
      repeatX: 2,
      repeatY: 2,
      weathering: 0.2,
      grain: 0.3,
    },
    roofRecipe: {
      id: 'r',
      name: 'R',
      pattern: 'roof_tile' as const,
      primaryHex: '#8b2f31',
      secondaryHex: '#5e1f20',
      accentHex: '#4f5d43',
      roughness: 0.6,
      metalness: 0.1,
      bumpScale: 0.07,
      repeatX: 3,
      repeatY: 3,
      weathering: 0.2,
      grain: 0.3,
    },
    designSummary: 'Test manor summary',
  };

  const norm = normalizeBuildingDesign(minimal, 2);
  assert.equal(norm.windowPattern, 'grouped_bays');
  assert.equal(norm.trimStyle, 'pilasters');
  assert.equal(norm.porchStyle, 'column_portico');
  assert.equal(norm.chimneyCount, 2);
  assert.equal(norm.dormerCount, 2);
  assert.equal(norm.addPlinth, true);
  assert.equal(norm.widthScale, 1);
  assert.equal(norm.depthScale, 1);
});

test('snapShadowCenter quantizes world position to exact shadow texel increments', () => {
  const halfExtent = 115;
  const mapSize = 2048;
  const texelWorld = (halfExtent * 2) / mapSize;

  const s1 = snapShadowCenter(12.345, -48.912, halfExtent, mapSize);
  const s2 = snapShadowCenter(12.345 + texelWorld * 0.12, -48.912 - texelWorld * 0.1, halfExtent, mapSize);
  // Small sub-texel jitter snaps to identical texel grid point to stop shadow shimmering
  assert.equal(s1.x, s2.x);
  assert.equal(s1.z, s2.z);
  assert.ok(Math.abs(s1.x - 12.345) <= texelWorld * 0.5001);
  assert.ok(Math.abs(s1.z - -48.912) <= texelWorld * 0.5001);
});

test('computeTitleFlyoverPose smoothly interpolates across landmark anchors in a closed loop', () => {
  const anchors = [
    { x: 0, y: 18, z: 0, radius: 60, height: 32 },
    { x: 120, y: 8, z: -80, radius: 75, height: 40 },
    { x: -90, y: 24, z: 110, radius: 68, height: 36 },
  ];
  const p0 = computeTitleFlyoverPose(0, anchors);
  const pEnd = computeTitleFlyoverPose(Math.PI * 2, anchors);
  for (const val of [p0.camX, p0.camY, p0.camZ, p0.lookX, p0.lookY, p0.lookZ]) {
    assert.ok(Number.isFinite(val));
  }
  // Full 2*PI cycle closes cleanly back onto start pose
  assert.ok(Math.abs(p0.camX - pEnd.camX) < 1e-4);
  assert.ok(Math.abs(p0.camY - pEnd.camY) < 1e-4);
  assert.ok(Math.abs(p0.camZ - pEnd.camZ) < 1e-4);
  assert.ok(Math.abs(p0.lookX - pEnd.lookX) < 1e-4);
});

test('FPS tactical speed, ADS FOV, recoil impulse & spring recovery remain stable', () => {
  const walkSpd = computeFpsMoveSpeed(false, false, 0, 1);
  const sprintSpd = computeFpsMoveSpeed(true, false, 0, 1);
  const crouchSpd = computeFpsMoveSpeed(true, true, 0, 1);
  const adsWalkSpd = computeFpsMoveSpeed(true, false, 1, 1);
  assert.ok(sprintSpd > walkSpd && walkSpd > crouchSpd);
  assert.ok(adsWalkSpd < walkSpd);

  assert.ok(computeFpsCameraFov(1, false, 0) < computeFpsCameraFov(0, false, 0));
  assert.ok(computeFpsCameraFov(0, true, 8) > computeFpsCameraFov(0, false, 0));

  let state = createInitialFpsWeaponState();
  state = applyFpsRecoilImpulse(state, 0, 1.5);
  assert.ok(state.recoilPitchVel > 0.2);

  for (let i = 0; i < 12; i++) {
    state = stepFpsWeaponPhysics(state, 0.016, {
      aiming: true,
      crouching: false,
      leanInput: 1,
      speedMs: 3.5,
      grounded: true,
      lookDeltaX: 4,
      lookDeltaY: -2,
    });
  }
  assert.ok(state.adsAlpha > 0.65);
  assert.ok(state.leanAngle > 0.12);
  const peakPitch = state.recoilPitch;
  for (let i = 0; i < 60; i++) {
    state = stepFpsWeaponPhysics(state, 0.016, {
      aiming: true,
      crouching: false,
      leanInput: 0,
      speedMs: 0,
      grounded: true,
      lookDeltaX: 0,
      lookDeltaY: 0,
    });
  }
  assert.ok(Math.abs(state.recoilPitch) < Math.abs(peakPitch) + 0.02);
  assert.ok(Math.abs(state.leanAngle) < 0.02);
});

test('computeCompassTicks centers North across 0/360 wrap and projects signed target bearing', () => {
  const ticks = computeCompassTicks(355, 60);
  const north = ticks.find((t) => t.deg === 0);
  assert.ok(north && north.label === 'N');
  assert.equal(north.offsetDeg, 5);
  assert.equal(computeSignedAngleDiffDeg(350, 10), 20);
  assert.equal(computeSignedAngleDiffDeg(10, 350), -20);
});

test('foliageOverhaul generates grounded tree skeletons and volumetric canopies for all Renda species', () => {
  const treeSpecies: TreeSpecies[] = ['pine', 'spruce', 'birch', 'oak'];
  for (const sp of treeSpecies) {
    const skel = createOrganicTreeSkeletonGeometry(sp);
    skel.computeBoundingBox();
    const pos = skel.getAttribute('position');
    const col = skel.getAttribute('color');
    assert.ok(pos && pos.count > 100 && col && col.count === pos.count);
    // Root flare extends slightly below y=0 so hillside trunks never float
    assert.ok(skel.boundingBox && skel.boundingBox.min.y < 0, `Expected ${sp} root depth < 0`);
    assert.ok(skel.boundingBox && skel.boundingBox.max.y > 6.5, `Expected ${sp} height > 6.5m`);
    skel.dispose();
  }

  const allSpecies: FoliageSpecies[] = ['pine', 'spruce', 'birch', 'oak', 'shrub'];
  for (const sp of allSpecies) {
    const layout = computeSpeciesCanopyCardLayout(sp, 77);
    assert.ok(layout.length >= (sp === 'shrub' ? 12 : 28));
    for (const c of layout) {
      assert.ok(
        Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z) && c.width > 0 && c.height > 0 && c.ao > 0.3
      );
    }

    const canopy = createVolumetricCanopyGeometry(sp, 77);
    const pos = canopy.getAttribute('position');
    const nrm = canopy.getAttribute('normal');
    const col = canopy.getAttribute('color');
    assert.ok(pos && nrm && col);
    assert.equal(pos.count, layout.length * 6);
    assert.ok(canopy.index && canopy.index.count === layout.length * 12);
    for (let i = 0; i < pos.count; i++) {
      assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(nrm.getY(i)) && col.getX(i) > 0);
    }
    canopy.dispose();
  }
});

test('AAA ez-tree options, geometry normalization, distance LOD partitioning, and hosted foliage assets are valid', () => {
  const species: TreeSpecies[] = ['pine', 'spruce', 'birch', 'oak'];
  for (const sp of species) {
    const nearOpt = createKurzemeEzTreeOptions(sp, 0, 'near');
    const farOpt = createKurzemeEzTreeOptions(sp, 1, 'far');
    assert.ok(nearOpt.seed !== farOpt.seed);
    assert.ok(nearOpt.branch.sections[0] >= farOpt.branch.sections[0]);
    assert.ok(nearOpt.leaves.size > 0 && farOpt.leaves.size >= nearOpt.leaves.size);

    // Synthetic branch & leaf cylinders to exercise normalizeEzTreeGeometry cleanly in Node
    const branchGeo = new THREE.CylinderGeometry(0.1, 0.3, 20, 6, 4);
    branchGeo.translate(0, 10, 0);
    const leafGeo = new THREE.BoxGeometry(8, 12, 8);
    leafGeo.translate(0, 14, 0);

    normalizeEzTreeGeometry(branchGeo, leafGeo, sp, 10.5);
    branchGeo.computeBoundingBox();
    const bCol = branchGeo.getAttribute('color');
    const lCol = leafGeo.getAttribute('color');
    assert.ok(bCol && lCol);
    assert.ok(branchGeo.boundingBox!.min.y < 0);
    assert.ok(branchGeo.boundingBox!.max.y <= 10.6);

    branchGeo.dispose();
    leafGeo.dispose();
  }

  const pts = [
    { x: 0, z: 0 },
    { x: 50, z: 50 },
    { x: 180, z: 0 },
    { x: -130, z: 40 },
  ];
  const { nearIndices, farIndices } = partitionTreeInstancesByDistance(pts, 0, 0, 120);
  assert.deepEqual(nearIndices, [0, 1]);
  assert.deepEqual(farIndices, [2, 3]);

  const hostedFoliageAssets = [
    '../../public/assets/foliage/bark/birch_color_1k.jpg',
    '../../public/assets/foliage/bark/pine_color_1k.jpg',
    '../../public/assets/foliage/bark/oak_color_1k.jpg',
    '../../public/assets/foliage/bark/willow_color_1k.jpg',
    '../../public/assets/foliage/leaves/pine_color.png',
    '../../public/assets/foliage/leaves/aspen_color.png',
    '../../public/assets/foliage/leaves/oak_color.png',
    '../../public/assets/foliage/models/grass.glb',
    '../../public/assets/foliage/models/flower_white.glb',
    '../../public/assets/foliage/models/flower_yellow.glb',
    '../../public/assets/foliage/models/flower_blue.glb',
    '../../public/assets/foliage/fern_02/fern_02_1k.gltf',
    '../../public/assets/foliage/shrub_03/shrub_03_1k.gltf',
    '../../public/assets/foliage/grass_medium_02/grass_medium_02_1k.gltf',
    '../../public/assets/foliage/rock_moss_set_01/rock_moss_set_01_1k.gltf',
  ];
  for (const rel of hostedFoliageAssets) {
    const st = fs.statSync(new URL(rel, import.meta.url));
    assert.ok(st.size > 1000, `Expected non-empty foliage asset ${rel}`);
  }
});

test('drawDistance spatial cell streaming, 3-tier tree LOD culling, prop tiers, and all new hosted PBR assets are valid', () => {
  const detailRule = computePropTierRule('detail');
  const furnitureRule = computePropTierRule('furniture');
  const largeRule = computePropTierRule('large');
  assert.ok(detailRule.maxDrawDistM < furnitureRule.maxDrawDistM);
  assert.ok(furnitureRule.maxDrawDistM < largeRule.maxDrawDistM);
  assert.ok(detailRule.shadowDistM < detailRule.maxDrawDistM);

  assert.equal(computeDrawDistanceFade(10, 50, 100), 1);
  assert.equal(computeDrawDistanceFade(110, 50, 100), 0);
  const midFade = computeDrawDistanceFade(75, 50, 100);
  assert.ok(midFade > 0.45 && midFade < 0.55);

  const treePart = partitionTreeInstancesByDistance3Tier(
    [
      { x: 10, z: 0 },
      { x: 300, z: 0 },
      { x: 1200, z: 0 },
    ],
    0,
    0,
    135,
    940
  );
  assert.deepEqual(treePart.nearIndices, [0]);
  assert.deepEqual(treePart.farIndices, [1]);
  assert.equal(treePart.culledCount, 1);

  const cells = collectCellCoordsInRadius(168, 38.5, 24, 114);
  assert.ok(cells.length > 40);
  for (let i = 1; i < cells.length; i++) {
    assert.ok(cells[i].distSq >= cells[i - 1].distSq);
  }

  const filtered = filterInstancesByDrawDistance(
    [
      { x: 0, z: 0 },
      { x: 90, z: 0 },
      { x: 250, z: 0 },
    ],
    0,
    0,
    100,
    0.8
  );
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].index, 0);
  assert.equal(filtered[0].fadeScale, 1);
  assert.ok(filtered[1].fadeScale > 0.1 && filtered[1].fadeScale < 0.9);

  // Verify dense foliage overhaul: near trees have lush multi-leaf branch sprays along every secondary limb
  for (const sp of ['pine', 'spruce', 'birch', 'oak'] as const) {
    const nearOpt = createKurzemeEzTreeOptions(sp, 0, 'near');
    assert.ok(nearOpt.branch.levels >= 2, `Expected multi-level branching on ${sp}`);
    assert.ok(nearOpt.branch.children[1] >= 6, `Expected dense secondary limbs on ${sp}`);
    assert.ok(nearOpt.leaves.count >= 14, `Expected dense leaf sprays on ${sp}`);
    assert.ok(nearOpt.leaves.size >= 3.0 && nearOpt.leaves.size <= 4.0, `Expected full-crown spray size on ${sp}`);
  }

  // Verify all 29 new prop GLTFs, 5 new foliage GLTFs, and 12 PBR texture sets exist & are non-empty
  const newAssets = [
    '../../public/assets/props/outdoor_table_chair_set_01/outdoor_table_chair_set_01_1k.gltf',
    '../../public/assets/props/standing_chalkboard_01/standing_chalkboard_01_1k.gltf',
    '../../public/assets/props/street_lamp_02/street_lamp_02_1k.gltf',
    '../../public/assets/props/painted_wooden_chair_01/painted_wooden_chair_01_1k.gltf',
    '../../public/assets/props/painted_wooden_table/painted_wooden_table_1k.gltf',
    '../../public/assets/props/lifebuoy/lifebuoy_1k.gltf',
    '../../public/assets/props/ocean_buoy/ocean_buoy_1k.gltf',
    '../../public/assets/props/wooden_crate_02/wooden_crate_02_1k.gltf',
    '../../public/assets/props/wicker_basket_01/wicker_basket_01_1k.gltf',
    '../../public/assets/props/wooden_ladder/wooden_ladder_1k.gltf',
    '../../public/assets/props/wooden_axe_02/wooden_axe_02_1k.gltf',
    '../../public/assets/props/wooden_bucket_02/wooden_bucket_02_1k.gltf',
    '../../public/assets/props/watering_can_metal_01/watering_can_metal_01_1k.gltf',
    '../../public/assets/props/rusted_spade_01/rusted_spade_01_1k.gltf',
    '../../public/assets/props/wooden_lantern_01/wooden_lantern_01_1k.gltf',
    '../../public/assets/props/concrete_road_barrier_02/concrete_road_barrier_02_1k.gltf',
    '../../public/assets/props/water_manhole_cover/water_manhole_cover_1k.gltf',
    '../../public/assets/props/utility_box_02/utility_box_02_1k.gltf',
    '../../public/assets/props/planter_box_02/planter_box_02_1k.gltf',
    '../../public/assets/props/planter_pot_clay/planter_pot_clay_1k.gltf',
    '../../public/assets/props/large_iron_gate/large_iron_gate_1k.gltf',
    '../../public/assets/props/horse_statue_01/horse_statue_01_1k.gltf',
    '../../public/assets/props/old_military_crate/old_military_crate_1k.gltf',
    '../../public/assets/props/metal_jerrycan_green/metal_jerrycan_green_1k.gltf',
    '../../public/assets/props/barrel_03/barrel_03_1k.gltf',
    '../../public/assets/props/hand_truck/hand_truck_1k.gltf',
    '../../public/assets/props/compost_bags/compost_bags_1k.gltf',
    '../../public/assets/props/old_tyre/old_tyre_1k.gltf',
    '../../public/assets/props/covered_car/covered_car_1k.gltf',
    '../../public/assets/foliage/shrub_04/shrub_04_1k.gltf',
    '../../public/assets/foliage/dandelion_01/dandelion_01_1k.gltf',
    '../../public/assets/foliage/periwinkle_plant/periwinkle_plant_1k.gltf',
    '../../public/assets/foliage/rock_07/rock_07_1k.gltf',
    '../../public/assets/foliage/dead_tree_trunk/dead_tree_trunk_1k.gltf',
    '../../public/assets/textures/weathered_brown_planks/diff.jpg',
    '../../public/assets/textures/white_plaster_rough_02/diff.jpg',
    '../../public/assets/textures/beige_wall_002/diff.jpg',
    '../../public/assets/textures/red_brick_03/diff.jpg',
    '../../public/assets/textures/rustic_stone_wall_02/diff.jpg',
    '../../public/assets/textures/clay_roof_tiles_02/diff.jpg',
    '../../public/assets/textures/corrugated_iron/diff.jpg',
    '../../public/assets/textures/roof_slates_03/diff.jpg',
    '../../public/assets/textures/asphalt_02/diff.jpg',
    '../../public/assets/textures/gravel_road/diff.jpg',
    '../../public/assets/textures/leafy_grass/diff.jpg',
    '../../public/assets/textures/forest_ground_04/diff.jpg',
  ];
  for (const rel of newAssets) {
    const st = fs.statSync(new URL(rel, import.meta.url));
    assert.ok(st.size > 1000, `Expected non-empty asset ${rel}`);
  }
});

test('road edge imperfection, verge weed encroachment, and mood color grading profiles behave deterministically', () => {
  const n1 = deterministicSpatialNoise2D(168.4, 38.2);
  const n2 = deterministicSpatialNoise2D(168.4, 38.2);
  assert.equal(n1, n2);
  assert.ok(n1 >= 0 && n1 <= 1);

  const asphaltOffsets: number[] = [];
  const trailOffsets: number[] = [];
  for (let i = 0; i < 20; i++) {
    const x = 160 + i * 3.1;
    const z = 25 + i * 2.7;
    asphaltOffsets.push(computeRoadEdgeDisplacement(x, z, -1, 3.5, 'asphalt'));
    trailOffsets.push(computeRoadEdgeDisplacement(x, z, 1, 0.9, 'trail'));
  }
  // Organic displacement should vary meaningfully without blowing past road half-width limits
  assert.ok(Math.max(...asphaltOffsets) - Math.min(...asphaltOffsets) > 0.08);
  assert.ok(asphaltOffsets.every((v) => Math.abs(v) <= 0.45));
  assert.ok(trailOffsets.every((v) => Math.abs(v) <= 0.45));

  // Verge weeds encroach near the edge and fall off cleanly both deep inside asphalt and far out in meadow
  assert.equal(computeVergeWeedDensity(168, 38, -0.6), 0);
  assert.equal(computeVergeWeedDensity(168, 38, 3.2), 0);
  const nearEdge = computeVergeWeedDensity(168, 38, 0.05);
  assert.ok(nearEdge > 0 && nearEdge <= 1);

  for (const preset of ['morning', 'overcast_rain', 'noon', 'golden', 'twilight'] as const) {
    const p = evaluateMoodColorProfile(preset);
    assert.ok(p.sunInt > 0 && p.hemiInt > 0 && p.hemiInt < p.sunInt);
    assert.ok(p.exposure >= 0.8 && p.exposure <= 1.05);
    assert.ok(p.contrast > 0.1 && p.contrast < 0.35);
    assert.ok(p.saturation >= 0.7 && p.saturation <= 0.95);
    assert.ok(p.vignette > 0.15 && p.vignette < 0.45);
    assert.equal(p.grain, 0, `Film grain should be disabled for crisp rendering on ${preset}`);
  }
});

test('curved 3D grass cluster geometry, 3-level near tree branching, and extra foliage assets are valid', () => {
  const cluster = createCurvedGrassClusterGeometry(16, 0.66, 0.24, 0.52);
  const pos = cluster.getAttribute('position') as THREE.BufferAttribute;
  const nrm = cluster.getAttribute('normal') as THREE.BufferAttribute;
  const col = cluster.getAttribute('color') as THREE.BufferAttribute;
  assert.equal(pos.count, 16 * 5);
  assert.ok(cluster.index && cluster.index.count === 16 * 9);

  let minY = Infinity;
  let maxY = -Infinity;
  let minLum = Infinity;
  let maxLum = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = nrm.getY(i);
    const r = col.getX(i);
    const g = col.getY(i);
    const b = col.getZ(i);
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
    assert.ok(Number.isFinite(ny) && ny > 0.5);
    assert.ok(Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) && g > 0);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    const lum = (r + g + b) / 3;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }
  assert.ok(minY <= 0, 'Grass roots must sink slightly below y=0 to anchor cleanly on slopes');
  assert.ok(maxY >= 0.3 && maxY <= 0.62, `Unexpected grass blade cluster height ${maxY}`);
  assert.ok(minLum < 0.4 && maxLum > 0.75, 'Expected deep root AO to sunlit tip gradient');
  cluster.dispose();

  const denseCluster = createCurvedGrassClusterGeometry(24, 0.72, 0.16, 0.50);
  const dPos = denseCluster.getAttribute('position') as THREE.BufferAttribute;
  assert.equal(dPos.count, 24 * 5);
  assert.ok(denseCluster.index && denseCluster.index.count === 24 * 9);
  denseCluster.dispose();

  for (const sp of ['pine', 'spruce', 'birch', 'oak'] as const) {
    const nearOpt = createKurzemeEzTreeOptions(sp, 0, 'near');
    assert.equal(nearOpt.branch.levels, 3);
    assert.ok(nearOpt.leaves.count >= 15);
    assert.ok(nearOpt.leaves.size >= 3.0 && nearOpt.leaves.size <= 3.3);
  }

  const ashStat = fs.statSync(new URL('../../public/assets/foliage/leaves/ash_color.png', import.meta.url));
  assert.ok(ashStat.size > 1000, 'Expected non-empty extra ash leaf atlas asset');
});

test('metric building roof/wall UV projection prevents texture stretching and 2K Poly Haven assets exist', () => {
  // 12m long eave, 4m horizontal run, 3m vertical rise => 5m true slope length
  const q = computeMetricRoofQuadUvs(-6, 4, 6, 4, -6, 0, 6, 0, 0, 3, 0.25);
  assert.equal(q.b0[0], 0);
  assert.equal(q.b0[1], 0);
  assert.ok(Math.abs(q.b1[0] - 3.0) < 1e-6); // 12 * 0.25
  assert.ok(Math.abs(q.t0[1] - 1.25) < 1e-6); // 5 * 0.25 (3-4-5 triangle)
  assert.ok(Math.abs(q.t1[0] - 3.0) < 1e-6);
  assert.ok(Math.abs(q.t1[1] - 1.25) < 1e-6);

  const uvWall = computeTriplanarBoxUv(2, 4, 6, 0, 0, 1, 0.25);
  assert.deepEqual(uvWall, [0.5, 1.0]);
  const uvRoof = computeTriplanarBoxUv(2, 4, 6, 0, 1, 0, 0.25);
  assert.deepEqual(uvRoof, [0.5, 1.5]);

  const aaa2kAssets = [
    '../../public/assets/textures/grass_ground/diff.jpg',
    '../../public/assets/textures/grass_ground/nor_gl.jpg',
    '../../public/assets/textures/grass_ground/rough.jpg',
    '../../public/assets/textures/sparse_grass/diff.jpg',
    '../../public/assets/textures/sparse_grass/nor_gl.jpg',
    '../../public/assets/textures/sparse_grass/rough.jpg',
    '../../public/assets/textures/forrest_ground_03/diff.jpg',
    '../../public/assets/textures/forrest_ground_03/nor_gl.jpg',
    '../../public/assets/textures/aerial_grass_rock/diff.jpg',
    '../../public/assets/textures/aerial_grass_rock/nor_gl.jpg',
    '../../public/assets/textures/brown_planks_03/diff.jpg',
    '../../public/assets/textures/brown_planks_03/nor_gl.jpg',
    '../../public/assets/textures/painted_plaster_wall/diff.jpg',
    '../../public/assets/textures/painted_plaster_wall/nor_gl.jpg',
    '../../public/assets/textures/medieval_blocks_05/diff.jpg',
    '../../public/assets/textures/medieval_blocks_05/nor_gl.jpg',
    '../../public/assets/textures/roof_07/diff.jpg',
    '../../public/assets/textures/roof_07/nor_gl.jpg',
  ];
  for (const rel of aaa2kAssets) {
    const st = fs.statSync(new URL(rel, import.meta.url));
    assert.ok(st.size > 150_000, `Expected high-res 2K asset ${rel}, got ${st.size} bytes`);
  }
});

