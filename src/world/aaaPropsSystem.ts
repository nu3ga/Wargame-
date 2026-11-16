import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeightAt } from './rendaMath';
import {
  computePropTierRule,
  filterInstancesByDrawDistance,
  type PropDistanceCategory,
} from './drawDistance';
import type { RendaWorldDataset } from './types';

export interface PropPose {
  x: number;
  z: number;
  yaw: number;
  scale?: number;
  yOffset?: number;
  pitch?: number;
  roll?: number;
}

export interface AaaPropsConfig {
  // Original 12 village props
  benches: PropPose[];
  lamps: PropPose[];
  picnicTables: PropPose[];
  utilityBoxes: PropPose[];
  hydrants: PropPose[];
  trashCans: PropPose[];
  wineBarrels: PropPose[];
  crates: PropPose[];
  buckets: PropPose[];
  planters: PropPose[];
  firePits: PropPose[];
  ammoBoxes: PropPose[];
  // 29 new Poly Haven 1K PBR non-vegetation props
  cafeSets?: PropPose[];
  chalkboards?: PropPose[];
  wallLamps?: PropPose[];
  woodenChairs?: PropPose[];
  woodenTables?: PropPose[];
  lifebuoys?: PropPose[];
  riverBuoys?: PropPose[];
  cargoCrates?: PropPose[];
  wickerBaskets?: PropPose[];
  ladders?: PropPose[];
  axes?: PropPose[];
  cooperBuckets?: PropPose[];
  wateringCans?: PropPose[];
  spades?: PropPose[];
  lanterns?: PropPose[];
  roadBarriers?: PropPose[];
  manholeCovers?: PropPose[];
  modernUtilBoxes?: PropPose[];
  floralPlanters?: PropPose[];
  clayPots?: PropPose[];
  manorGates?: PropPose[];
  horseStatues?: PropPose[];
  militaryCrates?: PropPose[];
  jerrycans?: PropPose[];
  steelDrums?: PropPose[];
  handTrucks?: PropPose[];
  compostBags?: PropPose[];
  oldTyres?: PropPose[];
  parkedCars?: PropPose[];
}

export interface AaaVillagePropsHandle {
  updateLod: (camX: number, camZ: number, force?: boolean) => void;
  dispose: () => void;
}

interface ManagedPropLayer {
  im: THREE.InstancedMesh;
  coords: { x: number; z: number }[];
  matrices: THREE.Matrix4[];
  category: PropDistanceCategory;
  baseCastShadow: boolean;
}

function buildMergedPbrProp(
  root: THREE.Object3D,
  options: {
    targetHeightM?: number;
    targetWidthM?: number;
    sinkY?: number;
    maxAnisotropy: number;
    filter?: (meshName: string) => boolean;
    doubleSided?: boolean;
  }
): { geometry: THREE.BufferGeometry; materials: THREE.MeshStandardMaterial[] } | null {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const m = obj as THREE.Mesh;
      if (!options.filter || options.filter(m.name || '')) {
        meshes.push(m);
      }
    }
  });
  if (meshes.length === 0) return null;

  const partGeos: THREE.BufferGeometry[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];

  for (const m of meshes) {
    const raw = m.geometry.clone();
    raw.applyMatrix4(m.matrixWorld);
    if (!raw.attributes.normal) raw.computeVertexNormals();
    if (!raw.attributes.uv) {
      const count = raw.attributes.position.count;
      raw.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    for (const key of Object.keys(raw.attributes)) {
      if (key !== 'position' && key !== 'normal' && key !== 'uv') {
        raw.deleteAttribute(key);
      }
    }
    const nonIdx = raw.index ? raw.toNonIndexed() : raw;
    if (nonIdx !== raw) raw.dispose();
    partGeos.push(nonIdx);

    const srcMat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    const mat = srcMat.clone();
    mat.side = options.doubleSided ? THREE.DoubleSide : THREE.FrontSide;
    mat.transparent = false;
    if (mat.map) {
      mat.color.setHex(0xe8e5dd);
      mat.map.anisotropy = options.maxAnisotropy;
    }
    if (mat.metalness < 0.7) {
      mat.roughness = Math.max(0.32, mat.roughness);
    }
    if (mat.normalMap) mat.normalMap.anisotropy = options.maxAnisotropy;
    if (mat.roughnessMap) mat.roughnessMap.anisotropy = options.maxAnisotropy;
    materials.push(mat);
  }

  const merged = mergeGeometries(partGeos, true);
  for (const g of partGeos) g.dispose();
  if (!merged) return null;

  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  const h = Math.max(0.04, bb.max.y - bb.min.y);
  const spanXZ = Math.max(0.04, bb.max.x - bb.min.x, bb.max.z - bb.min.z);
  const cx = (bb.min.x + bb.max.x) * 0.5;
  const cz = (bb.min.z + bb.max.z) * 0.5;
  merged.translate(-cx, -bb.min.y, -cz);

  const scale =
    options.targetWidthM !== undefined
      ? options.targetWidthM / spanXZ
      : (options.targetHeightM ?? h) / h;
  merged.scale(scale, scale, scale);
  merged.translate(0, options.sinkY ?? -0.02, 0);
  merged.computeBoundingSphere();

  return { geometry: merged, materials };
}

/**
 * Asynchronously loads and instances 41 Poly Haven 1K PBR non-vegetation 3D props across Renda Valley
 * with per-category draw-distance culling, shadow distance cutoffs, and smooth boundary fading.
 */
export async function loadAaaVillageProps(
  scene: THREE.Scene,
  world: RendaWorldDataset,
  config: AaaPropsConfig,
  isSoftwareGl: boolean,
  maxAnisotropy: number
): Promise<AaaVillagePropsHandle> {
  const loader = new GLTFLoader();
  const disposables: { dispose: () => void }[] = [];
  const managedLayers: ManagedPropLayer[] = [];
  const dummy = new THREE.Object3D();
  const scratchMat = new THREE.Matrix4();
  const scratchScale = new THREE.Matrix4();

  const [
    lampGltf,
    benchGltf,
    picnicGltf,
    utilBoxGltf,
    hydrantGltf,
    trashGltf,
    barrelGltf,
    crateGltf,
    bucketGltf,
    planterGltf,
    firePitGltf,
    ammoGltf,
    // 29 new props
    cafeSetGltf,
    chalkboardGltf,
    lamp02Gltf,
    chair01Gltf,
    table01Gltf,
    lifebuoyGltf,
    oceanBuoyGltf,
    crate02Gltf,
    wickerGltf,
    ladderGltf,
    axeGltf,
    bucket02Gltf,
    wateringCanGltf,
    spadeGltf,
    lanternGltf,
    barrierGltf,
    manholeGltf,
    utilBox02Gltf,
    planter02Gltf,
    clayPotGltf,
    ironGateGltf,
    horseStatueGltf,
    milCrateGltf,
    jerrycanGltf,
    barrel03Gltf,
    handTruckGltf,
    compostGltf,
    oldTyreGltf,
    coveredCarGltf,
  ] = await Promise.all([
    loader.loadAsync('/assets/props/street_lamp_01/street_lamp_01_1k.gltf'),
    loader.loadAsync('/assets/props/painted_wooden_bench/painted_wooden_bench_1k.gltf'),
    loader.loadAsync('/assets/props/wooden_picnic_table/wooden_picnic_table_1k.gltf'),
    loader.loadAsync('/assets/props/utility_box_01/utility_box_01_1k.gltf'),
    loader.loadAsync('/assets/props/fire_hydrant/fire_hydrant_1k.gltf'),
    loader.loadAsync('/assets/props/metal_trash_can/metal_trash_can_1k.gltf'),
    loader.loadAsync('/assets/props/wine_barrel_01/wine_barrel_01_1k.gltf'),
    loader.loadAsync('/assets/props/wooden_crate_01/wooden_crate_01_1k.gltf'),
    loader.loadAsync('/assets/props/wooden_bucket_01/wooden_bucket_01_1k.gltf'),
    loader.loadAsync('/assets/props/planter_box_01/planter_box_01_1k.gltf'),
    loader.loadAsync('/assets/props/stone_fire_pit/stone_fire_pit_1k.gltf'),
    loader.loadAsync('/assets/props/ammo_box/ammo_box_1k.gltf'),
    loader.loadAsync('/assets/props/outdoor_table_chair_set_01/outdoor_table_chair_set_01_1k.gltf'),
    loader.loadAsync('/assets/props/standing_chalkboard_01/standing_chalkboard_01_1k.gltf'),
    loader.loadAsync('/assets/props/street_lamp_02/street_lamp_02_1k.gltf'),
    loader.loadAsync('/assets/props/painted_wooden_chair_01/painted_wooden_chair_01_1k.gltf'),
    loader.loadAsync('/assets/props/painted_wooden_table/painted_wooden_table_1k.gltf'),
    loader.loadAsync('/assets/props/lifebuoy/lifebuoy_1k.gltf'),
    loader.loadAsync('/assets/props/ocean_buoy/ocean_buoy_1k.gltf'),
    loader.loadAsync('/assets/props/wooden_crate_02/wooden_crate_02_1k.gltf'),
    loader.loadAsync('/assets/props/wicker_basket_01/wicker_basket_01_1k.gltf'),
    loader.loadAsync('/assets/props/wooden_ladder/wooden_ladder_1k.gltf'),
    loader.loadAsync('/assets/props/wooden_axe_02/wooden_axe_02_1k.gltf'),
    loader.loadAsync('/assets/props/wooden_bucket_02/wooden_bucket_02_1k.gltf'),
    loader.loadAsync('/assets/props/watering_can_metal_01/watering_can_metal_01_1k.gltf'),
    loader.loadAsync('/assets/props/rusted_spade_01/rusted_spade_01_1k.gltf'),
    loader.loadAsync('/assets/props/wooden_lantern_01/wooden_lantern_01_1k.gltf'),
    loader.loadAsync('/assets/props/concrete_road_barrier_02/concrete_road_barrier_02_1k.gltf'),
    loader.loadAsync('/assets/props/water_manhole_cover/water_manhole_cover_1k.gltf'),
    loader.loadAsync('/assets/props/utility_box_02/utility_box_02_1k.gltf'),
    loader.loadAsync('/assets/props/planter_box_02/planter_box_02_1k.gltf'),
    loader.loadAsync('/assets/props/planter_pot_clay/planter_pot_clay_1k.gltf'),
    loader.loadAsync('/assets/props/large_iron_gate/large_iron_gate_1k.gltf'),
    loader.loadAsync('/assets/props/horse_statue_01/horse_statue_01_1k.gltf'),
    loader.loadAsync('/assets/props/old_military_crate/old_military_crate_1k.gltf'),
    loader.loadAsync('/assets/props/metal_jerrycan_green/metal_jerrycan_green_1k.gltf'),
    loader.loadAsync('/assets/props/barrel_03/barrel_03_1k.gltf'),
    loader.loadAsync('/assets/props/hand_truck/hand_truck_1k.gltf'),
    loader.loadAsync('/assets/props/compost_bags/compost_bags_1k.gltf'),
    loader.loadAsync('/assets/props/old_tyre/old_tyre_1k.gltf'),
    loader.loadAsync('/assets/props/covered_car/covered_car_1k.gltf'),
  ]);

  const placeProp = (
    built: { geometry: THREE.BufferGeometry; materials: THREE.MeshStandardMaterial[] } | null,
    poses: PropPose[] | undefined,
    category: PropDistanceCategory,
    castShadow = true
  ) => {
    if (!built || !poses || poses.length === 0) return;
    disposables.push(built.geometry, ...built.materials);
    const matOrArr = built.materials.length === 1 ? built.materials[0] : built.materials;
    const im = new THREE.InstancedMesh(built.geometry, matOrArr, poses.length);
    im.frustumCulled = false;

    const matrices: THREE.Matrix4[] = [];
    const coords: { x: number; z: number }[] = [];

    for (let i = 0; i < poses.length; i++) {
      const p = poses[i];
      const gy = groundHeightAt(world, p.x, p.z) + (p.yOffset ?? 0);
      dummy.position.set(p.x, gy, p.z);
      dummy.rotation.set(p.pitch ?? 0, p.yaw, p.roll ?? 0, 'YXZ');
      dummy.scale.setScalar(p.scale ?? 1.0);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
      coords.push({ x: p.x, z: p.z });
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = castShadow && !isSoftwareGl;
    im.receiveShadow = true;
    scene.add(im);

    managedLayers.push({
      im,
      coords,
      matrices,
      category,
      baseCastShadow: castShadow,
    });
  };

  // 1. Cast-iron heritage streetlamps (4.35m) + warm glowing lantern bulbs
  placeProp(
    buildMergedPbrProp(lampGltf.scene, { targetHeightM: 4.35, sinkY: -0.04, maxAnisotropy }),
    config.lamps,
    'large',
    true
  );
  if (config.lamps.length > 0) {
    const bulbGeo = new THREE.SphereGeometry(0.11, 10, 8);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xffe4ad,
      emissive: 0xffb85c,
      emissiveIntensity: 1.8,
      roughness: 0.25,
    });
    disposables.push(bulbGeo, bulbMat);
    const bulbIm = new THREE.InstancedMesh(bulbGeo, bulbMat, config.lamps.length);
    bulbIm.frustumCulled = false;
    const matrices: THREE.Matrix4[] = [];
    const coords: { x: number; z: number }[] = [];
    for (let i = 0; i < config.lamps.length; i++) {
      const l = config.lamps[i];
      const ly = groundHeightAt(world, l.x, l.z);
      dummy.position.set(l.x, ly + 4.02, l.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(l.scale ?? 1.0);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
      coords.push({ x: l.x, z: l.z });
      bulbIm.setMatrixAt(i, dummy.matrix);
    }
    bulbIm.instanceMatrix.needsUpdate = true;
    scene.add(bulbIm);
    managedLayers.push({ im: bulbIm, coords, matrices, category: 'large', baseCastShadow: false });
  }

  // 2-12. Original village props
  placeProp(
    buildMergedPbrProp(benchGltf.scene, { targetWidthM: 1.55, sinkY: -0.025, maxAnisotropy }),
    config.benches,
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(picnicGltf.scene, { targetWidthM: 2.35, sinkY: -0.03, maxAnisotropy }),
    config.picnicTables,
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(utilBoxGltf.scene, { targetHeightM: 1.22, sinkY: -0.03, maxAnisotropy }),
    config.utilityBoxes,
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(hydrantGltf.scene, {
      targetHeightM: 0.84,
      sinkY: -0.03,
      maxAnisotropy,
      filter: (name) => name.includes('_aged'),
    }),
    config.hydrants,
    'furniture',
    true
  );
  const midTrash = Math.ceil(config.trashCans.length / 2);
  placeProp(
    buildMergedPbrProp(trashGltf.scene, {
      targetHeightM: 0.92,
      sinkY: -0.02,
      maxAnisotropy,
      filter: (name) => !name.includes('_rust'),
    }),
    config.trashCans.slice(0, midTrash),
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(trashGltf.scene, {
      targetHeightM: 0.92,
      sinkY: -0.02,
      maxAnisotropy,
      filter: (name) => name.includes('_rust'),
    }),
    config.trashCans.slice(midTrash),
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(barrelGltf.scene, { targetHeightM: 0.92, sinkY: -0.02, maxAnisotropy }),
    config.wineBarrels,
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(crateGltf.scene, { targetWidthM: 0.95, sinkY: -0.02, maxAnisotropy }),
    config.crates,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(bucketGltf.scene, { targetHeightM: 0.48, sinkY: -0.015, maxAnisotropy }),
    config.buckets,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(planterGltf.scene, { targetWidthM: 1.25, sinkY: -0.02, maxAnisotropy }),
    config.planters,
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(firePitGltf.scene, { targetWidthM: 1.55, sinkY: -0.05, maxAnisotropy }),
    config.firePits,
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(ammoGltf.scene, { targetWidthM: 0.42, sinkY: -0.01, maxAnisotropy }),
    config.ammoBoxes,
    'detail',
    true
  );

  // =========================================================================
  // 13-41. 29 NEW POLY HAVEN 1K PBR NON-VEGETATION VILLAGE & LANDMARK PROPS
  // =========================================================================
  // Cafe terrace & village furniture
  placeProp(
    buildMergedPbrProp(cafeSetGltf.scene, { targetWidthM: 1.95, sinkY: -0.025, maxAnisotropy }),
    config.cafeSets,
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(chalkboardGltf.scene, { targetHeightM: 1.22, sinkY: -0.02, maxAnisotropy }),
    config.chalkboards,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(lamp02Gltf.scene, { targetHeightM: 1.05, sinkY: 0, maxAnisotropy }),
    config.wallLamps,
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(chair01Gltf.scene, { targetHeightM: 0.88, sinkY: -0.02, maxAnisotropy }),
    config.woodenChairs,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(table01Gltf.scene, { targetWidthM: 1.45, sinkY: -0.02, maxAnisotropy }),
    config.woodenTables,
    'furniture',
    true
  );

  // River pier & maritime safety
  placeProp(
    buildMergedPbrProp(lifebuoyGltf.scene, { targetWidthM: 0.72, sinkY: -0.01, maxAnisotropy }),
    config.lifebuoys,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(oceanBuoyGltf.scene, { targetHeightM: 1.45, sinkY: -0.45, maxAnisotropy }),
    config.riverBuoys,
    'furniture',
    true
  );

  // Market, orchard, farmstead & craft clutter
  placeProp(
    buildMergedPbrProp(crate02Gltf.scene, { targetWidthM: 1.05, sinkY: -0.02, maxAnisotropy }),
    config.cargoCrates,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(wickerGltf.scene, { targetWidthM: 0.56, sinkY: -0.015, maxAnisotropy }),
    config.wickerBaskets,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(ladderGltf.scene, { targetHeightM: 2.75, sinkY: -0.03, maxAnisotropy }),
    config.ladders,
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(axeGltf.scene, { targetHeightM: 0.86, sinkY: -0.02, maxAnisotropy }),
    config.axes,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(bucket02Gltf.scene, { targetHeightM: 0.5, sinkY: -0.015, maxAnisotropy }),
    config.cooperBuckets,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(wateringCanGltf.scene, { targetHeightM: 0.38, sinkY: -0.01, maxAnisotropy }),
    config.wateringCans,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(spadeGltf.scene, { targetHeightM: 1.08, sinkY: -0.03, maxAnisotropy }),
    config.spades,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(lanternGltf.scene, { targetHeightM: 0.42, sinkY: -0.01, maxAnisotropy }),
    config.lanterns,
    'detail',
    false
  );

  // P120 road infrastructure & village street utilities
  placeProp(
    buildMergedPbrProp(barrierGltf.scene, { targetWidthM: 2.05, sinkY: -0.03, maxAnisotropy }),
    config.roadBarriers,
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(manholeGltf.scene, { targetWidthM: 0.82, sinkY: 0.015, maxAnisotropy }),
    config.manholeCovers,
    'detail',
    false
  );
  placeProp(
    buildMergedPbrProp(utilBox02Gltf.scene, { targetHeightM: 1.32, sinkY: -0.03, maxAnisotropy }),
    config.modernUtilBoxes,
    'furniture',
    true
  );

  // Heritage planters, manor gate & estate sculpture
  placeProp(
    buildMergedPbrProp(planter02Gltf.scene, { targetWidthM: 1.4, sinkY: -0.025, maxAnisotropy }),
    config.floralPlanters,
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(clayPotGltf.scene, { targetHeightM: 0.54, sinkY: -0.015, maxAnisotropy }),
    config.clayPots,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(ironGateGltf.scene, {
      targetWidthM: 5.6,
      sinkY: -0.05,
      maxAnisotropy,
      doubleSided: true,
    }),
    config.manorGates,
    'large',
    true
  );
  placeProp(
    buildMergedPbrProp(horseStatueGltf.scene, { targetHeightM: 2.55, sinkY: -0.04, maxAnisotropy }),
    config.horseStatues,
    'large',
    true
  );

  // Hunting lodge, garage & industrial yard props
  placeProp(
    buildMergedPbrProp(milCrateGltf.scene, {
      targetWidthM: 1.1,
      sinkY: -0.02,
      maxAnisotropy,
      filter: (name) => name.endsWith('_a'),
    }),
    config.militaryCrates,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(jerrycanGltf.scene, { targetHeightM: 0.5, sinkY: -0.01, maxAnisotropy }),
    config.jerrycans,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(barrel03Gltf.scene, { targetHeightM: 0.92, sinkY: -0.02, maxAnisotropy }),
    config.steelDrums,
    'furniture',
    true
  );
  placeProp(
    buildMergedPbrProp(handTruckGltf.scene, { targetHeightM: 1.24, sinkY: -0.02, maxAnisotropy }),
    config.handTrucks,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(compostGltf.scene, { targetWidthM: 1.45, sinkY: -0.02, maxAnisotropy }),
    config.compostBags,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(oldTyreGltf.scene, { targetWidthM: 0.72, sinkY: -0.02, maxAnisotropy }),
    config.oldTyres,
    'detail',
    true
  );
  placeProp(
    buildMergedPbrProp(coveredCarGltf.scene, { targetWidthM: 4.35, sinkY: -0.03, maxAnisotropy }),
    config.parkedCars,
    'large',
    true
  );

  // Per-category draw distance, shadow cutoff & smooth boundary fade
  let lastPropX = Number.NaN;
  let lastPropZ = Number.NaN;

  const updateLod = (camX: number, camZ: number, force = false) => {
    if (!force && Number.isFinite(lastPropX)) {
      const dx = camX - lastPropX;
      const dz = camZ - lastPropZ;
      if (dx * dx + dz * dz < 64) return; // Update every 8m
    }
    lastPropX = camX;
    lastPropZ = camZ;

    for (let li = 0; li < managedLayers.length; li++) {
      const layer = managedLayers[li];
      const rule = computePropTierRule(layer.category);
      const visible = filterInstancesByDrawDistance(
        layer.coords,
        camX,
        camZ,
        rule.maxDrawDistM,
        rule.fadeStartM / rule.maxDrawDistM
      );

      const im = layer.im;
      let outIdx = 0;
      let minDistSq = Infinity;

      for (let k = 0; k < visible.length; k++) {
        const item = visible[k];
        const c = layer.coords[item.index];
        const d2 = (c.x - camX) * (c.x - camX) + (c.z - camZ) * (c.z - camZ);
        if (d2 < minDistSq) minDistSq = d2;

        if (item.fadeScale < 0.995) {
          scratchScale.makeScale(item.fadeScale, item.fadeScale, item.fadeScale);
          scratchMat.multiplyMatrices(layer.matrices[item.index], scratchScale);
          im.setMatrixAt(outIdx, scratchMat);
        } else {
          im.setMatrixAt(outIdx, layer.matrices[item.index]);
        }
        outIdx++;
      }

      im.count = outIdx;
      im.visible = outIdx > 0;
      im.castShadow =
        layer.baseCastShadow && !isSoftwareGl && outIdx > 0 && minDistSq <= rule.shadowDistM * rule.shadowDistM;
      if (outIdx > 0) {
        im.instanceMatrix.needsUpdate = true;
      }
    }
  };

  updateLod(world.meta.spawnX, world.meta.spawnZ, true);

  return {
    updateLod,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
