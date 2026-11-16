import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { applyMetricTriplanarUvAndUv2 } from './architecturalDetails';
import { computeGableRidgePlan, computePolygonCentroid, computePrimaryAxisAndBounds, computeWallSegments, groundHeightAt, type BuildingCollider } from './rendaMath';
import type { AtmospherePreset, RendaWorldDataset } from './types';

export interface BuildingArtHandle {
  impactTargets: THREE.Mesh[];
  colliders: BuildingCollider[];
  /** The workshop's level floor and the short entrance ramp; null outside them. */
  groundHeightAt: (x: number, z: number) => number | null;
  /** Hide original-footprint facade art while the corresponding building is restyled. */
  setBuildingCustomized: (id: number, customized: boolean) => void;
  setAtmosphere: (preset: AtmospherePreset) => void;
  dispose: () => void;
}

const ANNEX_X = 195;
const ANNEX_Z = 59;
const ANNEX_YAW = -Math.PI / 2;

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Architectural wear and a walkable maintenance workshop, authored at human scale. */
export function createBuildingArt(scene: THREE.Scene, world: RendaWorldDataset, maxAnisotropy = 8): BuildingArtHandle {
  const root = new THREE.Group();
  root.name = 'village-building-art';
  scene.add(root);
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const impactTargets: THREE.Mesh[] = [];
  const colliders: BuildingCollider[] = [];
  const batches = new Map<string, { material: THREE.Material; pieces: THREE.BufferGeometry[]; solid: boolean; casts: boolean }>();
  const ownerRanges = new Map<number, { position: THREE.BufferAttribute; start: number; original: Float32Array }[]>();
  const customizedBuildings = new Set<number>();
  let currentBuildingId: number | null = null;
  const loader = new THREE.TextureLoader();
  const dummy = new THREE.Object3D();
  const localY = new THREE.Vector3(0, 1, 0);
  const localZ = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion();
  const qRoll = new THREE.Quaternion();
  const matId = new Map<THREE.Material, number>();

  const ownMaterial = <T extends THREE.Material>(material: T): T => { materials.push(material); matId.set(material, matId.size); return material; };
  const photo = (folder: string, sourceColor: number, color: number, roughness: number, metalness = 0) => {
    let source: THREE.MeshStandardMaterial | undefined;
    scene.traverse((object) => {
      if (source) return;
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const candidate of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const material = candidate as THREE.MeshStandardMaterial;
        if (material.isMeshStandardMaterial && material.map && material.normalMap && material.color.getHex() === sourceColor) source = material;
      }
    });
    const material = ownMaterial(source?.clone() ?? new THREE.MeshStandardMaterial());
    // Reuse the world's photographic maps whenever available instead of duplicating GPU textures.
    if (source) {
      // A cloned texture keeps the shared image/Source and GPU storage, but owns its metric tiling.
      // Original facades use recipe repeats that would otherwise shrink these bricks to toy scale.
      for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap'] as const) {
        const original = source[key];
        if (!original) continue;
        const texture = original.clone(); texture.repeat.set(1, 1); texture.needsUpdate = true;
        material[key] = texture; textures.push(texture);
      }
    }
    if (!source) {
      const load = (file: string, colorMap: boolean) => {
        const texture = loader.load(`/assets/textures/${folder}/${file}`);
        texture.colorSpace = colorMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = maxAnisotropy;
        textures.push(texture);
        return texture;
      };
      material.map = load('diff.jpg', true);
      material.normalMap = load('nor_gl.jpg', false);
      material.roughnessMap = load('rough.jpg', false);
    }
    material.name = `building-art-${folder}`;
    material.color.setHex(color);
    material.roughness = roughness;
    material.metalness = metalness;
    material.normalScale.set(0.65, 0.65);
    material.envMapIntensity = 0.65;
    return material;
  };
  const brick = photo('red_brick_03', 0xe6beb0, 0xc6b4a4, 0.94);
  const plaster = photo('white_plaster_rough_02', 0xf4eee0, 0xb4b4a3, 0.93);
  const wood = photo('weathered_brown_planks', 0x9b8064, 0xada18b, 0.93);
  const metalSheet = photo('corrugated_iron', 0x5d6e78, 0x7b8279, 0.78, 0.22);
  const clay = photo('clay_roof_tiles_02', 0xe0aa94, 0xa38d7c, 0.88);
  const stone = photo('rustic_stone_wall_02', 0xd8d3c9, 0x9a9a8d, 0.98);
  const concrete = ownMaterial(plaster.clone()); concrete.color.setHex(0x858b80); concrete.normalScale.set(0.23, 0.23);
  const steel = ownMaterial(new THREE.MeshStandardMaterial({ color: 0x515b57, metalness: 0.62, roughness: 0.53 }));
  const rust = ownMaterial(new THREE.MeshStandardMaterial({ color: 0x745b41, metalness: 0.12, roughness: 0.94 }));
  const black = ownMaterial(new THREE.MeshStandardMaterial({ color: 0x202623, roughness: 0.9, metalness: 0.08 }));
  const darkInterior = ownMaterial(new THREE.MeshStandardMaterial({ color: 0x494b40, roughness: 0.94 }));
  const glass = ownMaterial(new THREE.MeshPhysicalMaterial({ color: 0x293a39, metalness: 0, roughness: 0.17, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 0.95 }));
  const warm = ownMaterial(new THREE.MeshStandardMaterial({ color: 0xd7ceac, emissive: 0xffbf6b, emissiveIntensity: 2.4, roughness: 0.46 }));

  const addGeometry = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, yaw = 0, roll = 0, solid = true, casts = true) => {
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    applyMetricTriplanarUvAndUv2(geometry, 0.5);
    q.setFromAxisAngle(localY, yaw); qRoll.setFromAxisAngle(localZ, roll); q.multiply(qRoll);
    dummy.position.set(x, y, z); dummy.quaternion.copy(q); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    geometry.applyMatrix4(dummy.matrix);
    const unindexed = geometry.index ? geometry.toNonIndexed() : geometry;
    if (unindexed !== geometry) geometry.dispose();
    unindexed.userData.buildingArtOwnerId = currentBuildingId;
    const key = `${Math.floor(x / 64)}:${Math.floor(z / 64)}:${matId.get(material)}:${Number(solid)}:${Number(casts)}`;
    let batch = batches.get(key);
    if (!batch) { batch = { material, pieces: [], solid, casts }; batches.set(key, batch); }
    batch.pieces.push(unindexed);
  };
  const box = (material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, yaw = 0, roll = 0, casts = true) => {
    addGeometry(new THREE.BoxGeometry(w, h, d), material, x, y, z, yaw, roll, true, casts);
  };
  const tube = (points: THREE.Vector3[], radius: number, material: THREE.Material, segments = 6) => {
    if (points.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    addGeometry(new THREE.TubeGeometry(curve, Math.max(2, (points.length - 1) * 3), radius, segments, false), material, 0, 0, 0);
  };
  const at = (cx: number, cy: number, cz: number, yaw: number, u: number, y: number, out: number) =>
    new THREE.Vector3(cx + Math.cos(yaw) * u + Math.sin(yaw) * out, cy + y, cz - Math.sin(yaw) * u + Math.cos(yaw) * out);

  const streakCanvas = document.createElement('canvas'); streakCanvas.width = 256; streakCanvas.height = 512;
  const ctx = streakCanvas.getContext('2d')!;
  const rand = seeded(85921);
  for (let i = 0; i < 220; i++) {
    const x = rand() * 256, y = rand() * 180, width = 1 + rand() * 10, height = 80 + rand() * 360;
    const gradient = ctx.createLinearGradient(0, y, 0, y + height);
    gradient.addColorStop(0, `rgba(36,41,31,${0.025 + rand() * 0.09})`); gradient.addColorStop(1, 'rgba(36,41,31,0)');
    ctx.fillStyle = gradient; ctx.fillRect(x, y, width, height);
  }
  const streakTexture = new THREE.CanvasTexture(streakCanvas); streakTexture.colorSpace = THREE.SRGBColorSpace; textures.push(streakTexture);
  const grime = ownMaterial(new THREE.MeshStandardMaterial({ map: streakTexture, color: 0x898574, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const addDecal = (width: number, height: number, x: number, y: number, z: number, yaw: number, material = grime) => {
    const geometry = new THREE.PlaneGeometry(width, height);
    // Preserve texture UVs for these authored weathering maps.
    q.setFromAxisAngle(localY, yaw); dummy.position.set(x, y, z); dummy.quaternion.copy(q); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); geometry.applyMatrix4(dummy.matrix);
    const key = `decal:${Math.floor(x / 64)}:${Math.floor(z / 64)}:${matId.get(material)}`;
    let batch = batches.get(key);
    if (!batch) { batch = { material, pieces: [], solid: false, casts: false }; batches.set(key, batch); }
    const geo = geometry.toNonIndexed(); geometry.dispose();
    geo.userData.buildingArtOwnerId = currentBuildingId;
    geo.setAttribute('uv2', geo.getAttribute('uv').clone()); batch.pieces.push(geo);
  };

  // Existing residential facades retain their original trim. Services and wear add depth between it.
  const nearBuildings = world.buildings.filter((building) => {
    const c = computePolygonCentroid(building.ring);
    return Math.hypot(c.cx - world.meta.spawnX, c.cz - world.meta.spawnZ) < 152
      && !['church', 'manor', 'gate', 'shelter', 'ruins'].includes(building.kind) && building.roof !== 'none';
  });
  for (const building of nearBuildings) {
    currentBuildingId = building.id;
    const c = computePolygonCentroid(building.ring), y = groundHeightAt(world, c.cx, c.cz);
    const wallH = building.wallH && building.wallH >= 2.1 ? Math.min(14, building.wallH) : Math.max(2.5, building.levels * 2.95);
    const faces = computeWallSegments(building.ring, c.cx, c.cz);
    const hasHeroGutters = [790959825, 790959820, 790959832].includes(building.id);
    faces.forEach((face, faceIndex) => {
      if (face.length < 2.7) return;
      const fx = c.cx + face.midX, fz = c.cz + face.midZ, yaw = face.yaw;
      const place = (u: number, h: number, out: number) => at(fx, y, fz, yaw, u, h, out);
      if (!hasHeroGutters) {
        const gutterY = wallH - 0.04;
        const start = place(-face.length * 0.5 - 0.15, gutterY, 0.22), end = place(face.length * 0.5 + 0.15, gutterY, 0.22);
        tube([start, end], 0.065, steel, 7);
        for (let u = -face.length * 0.5 + 0.6; u < face.length * 0.5; u += 1.4) {
          const p = place(u, gutterY - 0.05, 0.19); box(rust, 0.03, 0.18, 0.2, p.x, p.y, p.z, yaw);
        }
        if (faceIndex % 2 === 0) {
          const u = face.length * 0.5 - 0.18;
          tube([place(u, gutterY, 0.23), place(u, gutterY - 0.23, 0.22), place(u, gutterY - 0.42, 0.13), place(u, 0.25, 0.13), place(u, 0.13, 0.4)], 0.05, steel, 7);
          for (let h = 0.55; h < wallH; h += 1.7) { const p = place(u, h, 0.12); box(rust, 0.14, 0.035, 0.14, p.x, p.y, p.z, yaw); }
          const p = place(u, wallH * 0.5, 0.022); addDecal(0.7, wallH, p.x, p.y, p.z, yaw);
        }
      }
      const stain = place(0, 0.7, 0.023); addDecal(face.length * 0.92, 1.35, stain.x, stain.y, stain.z, yaw);
      if (faceIndex === building.id % faces.length || faceIndex === 0) {
        const u = Math.max(-face.length * 0.35, -3.5), p = place(u, 1.22, 0.16);
        box(steel, 0.46, 0.63, 0.23, p.x, p.y, p.z, yaw);
        const cover = place(u, 1.22, 0.29); box(metalSheet, 0.39, 0.54, 0.025, cover.x, cover.y, cover.z, yaw);
        const lock = place(u + 0.1, 1.1, 0.32); box(black, 0.025, 0.075, 0.02, lock.x, lock.y, lock.z, yaw);
        tube([place(u, 1.54, 0.16), place(u, wallH + 0.25, 0.16), place(u + 0.21, wallH + 0.48, 0.22)], 0.018, black, 5);
        tube([place(u - 0.1, 0.12, 0.14), place(u - 0.1, 0.72, 0.14), place(u, 0.85, 0.17)], 0.023, steel, 6);
      }
      // Board one existing bay, not every house/window. Other windows stay visually quiet.
      if (!hasHeroGutters && face.length >= 6 && faceIndex === 1 && building.id % 3 === 0) {
        const stories = wallH >= 5.3 ? 2 : 1;
        const wy = stories === 1 ? wallH * 0.54 : wallH * 0.34;
        const cols = Math.min(5, Math.max(1, Math.floor((face.length - 1.4) / 3.1)));
        const u = cols === 1 ? 0 : (face.length - 2.6) * 0.5;
        for (let row = 0; row < 4; row++) {
          const p = place(u, wy - 0.43 + row * 0.27, 0.18 + row % 2 * 0.008);
          box(wood, 1.28 + row % 2 * 0.11, 0.21, 0.045, p.x, p.y, p.z, yaw, (row - 1.5) * 0.018);
          for (const side of [-1, 1]) { const nail = place(u + side * 0.48, wy - 0.43 + row * 0.27, 0.21); box(rust, 0.018, 0.018, 0.014, nail.x, nail.y, nail.z, yaw); }
        }
        const diagonal = place(u, wy, 0.24); box(wood, 1.52, 0.14, 0.045, diagonal.x, diagonal.y, diagonal.z, yaw, 0.64);
      }
    });
    // Small roof vents and actual flashing add varied rooftop silhouette to plain houses.
    if (!hasHeroGutters && !['barn', 'shed', 'garage'].includes(building.kind) && building.roofShape !== 'flat' && building.roof !== 'flat' && building.roofShape !== 'hipped' && building.roofShape !== 'low_hip') {
      const obb = computePrimaryAxisAndBounds(building.ring);
      const roofH = Math.min(5.6, Math.max(1.6, building.roofH ?? obb.widthV * 0.26));
      const vx = obb.centerX + Math.cos(obb.angle) * obb.lengthU * -0.21;
      const vz = obb.centerZ + Math.sin(obb.angle) * obb.lengthU * -0.21;
      const vy = y + wallH + roofH + 0.12;
      box(steel, 0.7, 0.05, 0.7, vx, vy - 0.1, vz, -obb.angle);
      tube([new THREE.Vector3(vx, vy, vz), new THREE.Vector3(vx, vy + 0.48, vz)], 0.115, steel, 8);
      addGeometry(new THREE.ConeGeometry(0.22, 0.09, 10), steel, vx, vy + 0.54, vz);
      const plan = computeGableRidgePlan(building.ring.map(([x, z]) => [(x - c.cx) * 1.06, (z - c.cz) * 1.06]), 1);
      if (plan) {
        const isMetal = ['zinc', 'slate', 'crimson'].includes(building.roofTone ?? '') || (!building.roofTone && building.id % 3 === 0);
        if (isMetal) {
          for (let side = 0; side < 4; side++) {
            const e0 = plan.ptsCCW[side], e1 = plan.ptsCCW[(side + 1) % 4];
            const closest = (p: [number, number]) => Math.hypot(p[0] - plan.ridgeA[0], p[1] - plan.ridgeA[1]) < Math.hypot(p[0] - plan.ridgeB[0], p[1] - plan.ridgeB[1]) ? plan.ridgeA : plan.ridgeB;
            const r0 = closest(e0), r1 = closest(e1);
            if (r0 === r1) continue;
            const width = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]);
            const seams = Math.max(2, Math.floor(width / .53));
            for (let seam = 0; seam <= seams; seam++) {
              const t = seam / seams;
              tube([
                new THREE.Vector3(c.cx + THREE.MathUtils.lerp(e0[0], e1[0], t), y + wallH + .025, c.cz + THREE.MathUtils.lerp(e0[1], e1[1], t)),
                new THREE.Vector3(c.cx + THREE.MathUtils.lerp(r0[0], r1[0], t), y + wallH + roofH + .025, c.cz + THREE.MathUtils.lerp(r0[1], r1[1], t)),
              ], .018, steel, 5);
            }
          }
        } else {
          const [ra, rb] = [plan.ridgeA, plan.ridgeB];
          const ridgeLength = Math.hypot(rb[0] - ra[0], rb[1] - ra[1]);
          const caps = Math.max(1, Math.floor(ridgeLength / .32));
          const ridgeYaw = Math.atan2(rb[0] - ra[0], rb[1] - ra[1]);
          for (let cap = 0; cap < caps; cap++) {
            const t = (cap + .5) / caps;
            const x = c.cx + THREE.MathUtils.lerp(ra[0], rb[0], t), z = c.cz + THREE.MathUtils.lerp(ra[1], rb[1], t);
            const chimneyX = obb.centerX + Math.cos(obb.angle) * obb.lengthU * .16, chimneyZ = obb.centerZ + Math.sin(obb.angle) * obb.lengthU * .16;
            if (Math.hypot(x - chimneyX, z - chimneyZ) < .68) continue;
            const capGeometry = new THREE.CylinderGeometry(.18, .19, ridgeLength / caps - .012, 7, 1);
            capGeometry.rotateX(Math.PI / 2);
            addGeometry(capGeometry, clay, x, y + wallH + roofH + .085, z, ridgeYaw);
          }
        }
      }
    }
  }
  // The workshop is authored independently and must never disappear when an original house is edited.
  currentBuildingId = null;

  // The hero workshop is a fully modeled shell, rather than a box with a door painted on it.
  const ax = ANNEX_X, az = ANNEX_Z, yaw = ANNEX_YAW;
  const floorY = Math.max(...[-3.5, 3.5].flatMap(u => [-2.5, 2.5].map(v => {
    const p = at(ax, 0, az, yaw, u, 0, v); return groundHeightAt(world, p.x, p.z);
  }))) + 0.055;
  const a = (u: number, h: number, v: number) => at(ax, floorY, az, yaw, u, h, v);
  const aBox = (material: THREE.Material, w: number, h: number, d: number, u: number, vY: number, v: number, roll = 0) => {
    const p = a(u, vY, v); box(material, w, h, d, p.x, p.y, p.z, yaw, roll);
  };
  const aTube = (points: [number, number, number][], radius: number, material: THREE.Material, segments = 7) => tube(points.map(([u, h, v]) => a(u, h, v)), radius, material, segments);
  const addCollider = (u: number, v: number, w: number, d: number) => {
    const p = a(u, 0, v), hw = d * 0.5, hd = w * 0.5;
    colliders.push({ id: -950000 - colliders.length, cx: p.x, cz: p.z, radius: Math.hypot(hw, hd), minX: p.x - hw, maxX: p.x + hw, minZ: p.z - hd, maxZ: p.z + hd });
  };
  // Foundation, three walls, and a front wall cut into real piers around the window and entrance.
  aBox(stone, 7.1, 0.4, 5.1, 0, -0.2, 0);
  aBox(concrete, 6.7, 0.055, 4.7, 0, 0.027, 0);
  for (const u of [-3.36, 3.36]) {
    const sideWall = new THREE.BoxGeometry(.28, 1, 5);
    const positions = sideWall.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) positions.setY(i, positions.getY(i) > 0 ? 3.23 + (2.72 - positions.getZ(i)) * .105 - .07 : 0);
    sideWall.computeVertexNormals();
    const p = a(u, 0, 0); addGeometry(sideWall, brick, p.x, p.y, p.z, yaw);
    addCollider(u, 0, .28, 5);
  }
  aBox(brick, 6.75, 3.68, 0.28, 0, 1.84, -2.36); addCollider(0, -2.36, 6.75, 0.28);
  aBox(brick, 0.42, 3.08, 0.34, -3.29, 1.54, 2.36); addCollider(-3.29, 2.36, 0.42, 0.34);
  aBox(brick, 0.42, 3.08, 0.34, -0.62, 1.54, 2.36); addCollider(-0.62, 2.36, 0.42, 0.34);
  aBox(brick, 0.42, 3.08, 0.34, 3.29, 1.54, 2.36); addCollider(3.29, 2.36, 0.42, 0.34);
  aBox(brick, 2.3, 1.05, 0.34, -1.96, 0.525, 2.36);
  aBox(brick, 2.3, 0.75, 0.34, -1.96, 2.715, 2.36);
  addCollider(-1.96, 2.36, 2.3, 0.34);
  aBox(steel, 4.08, 0.22, 0.28, 1.34, 2.99, 2.39);
  aBox(metalSheet, 7.08, .16, .16, 0, 3.14, 2.53);
  aBox(steel, 0.105, 2.8, 0.16, -0.35, 1.4, 2.57);
  aBox(steel, 0.105, 2.8, 0.16, 3.04, 1.4, 2.57);
  aBox(metalSheet, 3.3, 0.67, 0.045, 1.34, 2.61, 2.59);
  for (let r = 0; r < 8; r++) aBox(steel, 3.31, 0.025, 0.03, 1.34, 2.31 + r * 0.08, 2.625);
  // Deep four-pane window: reveal boards, sill, transoms, real individual reflective panes.
  aBox(wood, 1.76, 0.09, 0.28, -1.96, 1.04, 2.4);
  aBox(wood, 1.76, 0.09, 0.28, -1.96, 2.32, 2.4);
  for (const u of [-2.8, -1.12]) aBox(wood, 0.085, 1.35, 0.28, u, 1.68, 2.4);
  aBox(stone, 1.92, 0.105, 0.49, -1.96, 1.0, 2.54);
  aBox(steel, 0.038, 1.24, 0.07, -1.96, 1.68, 2.52);
  aBox(steel, 1.63, 0.035, 0.07, -1.96, 1.68, 2.52);
  for (const u of [-2.37, -1.55]) for (const h of [1.37, 1.99]) aBox(glass, 0.78, 0.58, 0.016, u, h, 2.33);
  aBox(wood, 1.87, 0.125, 0.05, -1.96, 1.6, 2.61, -0.37);
  // Broken render exposes brickwork; individual chips project from ragged patch edges.
  const patchRand = seeded(8713);
  for (const [u, h, width, height] of [[-3.01, 1.44, .28, 2.1], [-1.96, .53, 2.15, .7], [-1.96, 2.75, 2.2, .45], [3.28, 1.56, .25, 2.6]] as number[][]) {
    aBox(plaster, width, height, 0.025, u, h, 2.55);
    const chips = Math.max(3, Math.floor(width / .2));
    for (let i = 0; i < chips; i++) {
      const ch = .035 + patchRand() * .09;
      aBox(plaster, .1 + patchRand() * .16, ch, .036, u - width * .45 + width * .9 * (i / Math.max(1, chips - 1)), h - height * .5 - ch * .25, 2.56, (patchRand() - .5) * .22);
    }
  }
  // Interior shelf, bins, worktop, drawers, pipework and task fixtures remain visible through the opening.
  for (const u of [-2.5, -1.6, -0.7]) aBox(steel, 0.045, 2.35, 0.045, u, 1.2, -1.78);
  for (const h of [.35, 1.05, 1.75, 2.4]) aBox(wood, 2.7, .07, .65, -1.6, h, -1.75);
  for (let i = 0; i < 9; i++) {
    const u = -2.65 + i % 3 * .83, h = .58 + Math.floor(i / 3) * .7;
    aBox(i % 3 ? darkInterior : wood, .56, .4, .43, u, h, -1.71);
    aBox(steel, .18, .04, .025, u, h + .03, -1.48);
  }
  aBox(wood, 2.65, .12, .8, 1.26, 1.0, -1.65);
  for (const u of [.08, 2.44]) for (const v of [-1.35, -1.99]) aBox(steel, .065, 1.0, .065, u, .5, v);
  aBox(darkInterior, 1.05, .78, .66, 1.65, .5, -1.65);
  for (const h of [.28, .52, .77]) { aBox(steel, .92, .02, .035, 1.65, h, -1.29); aBox(black, .29, .04, .04, 1.65, h + .08, -1.26); }
  aBox(steel, .3, .19, .27, .27, 1.17, -1.56);
  aBox(steel, .48, .05, .08, .27, 1.3, -1.56);
  aTube([[.27, 1.18, -1.4], [.27, 1.18, -.99]], .025, rust);
  // Switchboard and exposed conduit on the outside flank.
  aBox(steel, .3, .75, .55, 3.54, 1.2, -.6);
  aTube([[3.57, .2, -.6], [3.57, 1.0, -.6], [3.57, 1.6, -.6], [3.57, 3.6, -.6]], .025, black);
  for (let r = 0; r < 8; r++) aBox(steel, .035, .025, .34, 3.71, 1.03 + r * .055, -.6);
  // Physically corrugated, pitched metal roof with closed edge flashing.
  const roofPositions: number[] = [], roofUvs: number[] = [], roofIndices: number[] = [];
  const roofColumns = 224, roofRows = 3;
  for (let j = 0; j <= roofRows; j++) for (let i = 0; i <= roofColumns; i++) {
    const u = -3.72 + i / roofColumns * 7.44, v = -2.72 + j / roofRows * 5.44;
    const h = 3.23 + (2.72 - v) * .105 + Math.cos(u / .165 * Math.PI * 2) * .025;
    const p = a(u, h, v); roofPositions.push(p.x, p.y, p.z); roofUvs.push(u * .5, v * .5);
  }
  for (let j = 0; j < roofRows; j++) for (let i = 0; i < roofColumns; i++) {
    const k = j * (roofColumns + 1) + i;
    roofIndices.push(k, k + roofColumns + 1, k + 1, k + 1, k + roofColumns + 1, k + roofColumns + 2);
  }
  const roofGeo = new THREE.BufferGeometry(); roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofPositions, 3)); roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roofUvs, 2)); roofGeo.setIndex(roofIndices); roofGeo.computeVertexNormals();
  addGeometry(roofGeo, metalSheet, 0, 0, 0);
  for (const u of [-3.73, 3.73]) {
    aTube([[u, 3.22, 2.74], [u, 3.8, -2.74]], .055, rust, 5);
    for (let v = -2.4; v <= 2.4; v += 1.2) aBox(steel, .14, .035, .17, u, 3.23 + (2.72 - v) * .105, v);
  }
  aTube([[-3.78, 3.17, 2.78], [3.78, 3.17, 2.78]], .083, steel, 8);
  aTube([[3.57, 3.17, 2.79], [3.57, 2.95, 2.79], [3.57, 2.73, 2.66], [3.57, .18, 2.66], [3.57, .1, 2.98]], .058, steel, 8);
  // Interior rafters, hanging cable and warm task light establish depth in the open doorway.
  for (const v of [-1.9, 0, 1.9]) aBox(wood, 6.6, .17, .13, 0, 3.1 + (2.6 - v) * .105, v);
  aTube([[-2.8, 3.1, -1.5], [0, 2.9, -1.5], [2.8, 3.1, -1.5]], .009, black, 4);
  aBox(steel, 1.04, .1, .23, .7, 2.95, -.6);
  aBox(warm, .85, .025, .14, .7, 2.89, -.6);
  const lamp = new THREE.PointLight(0xffcb8d, 22, 8.5, 2);
  lamp.position.copy(a(.7, 2.7, -.6)); root.add(lamp);
  // Practical maintenance signs use restrained stencils, chips and mounting screws.
  const signCanvas = document.createElement('canvas'); signCanvas.width = 1024; signCanvas.height = 256;
  const sc = signCanvas.getContext('2d')!;
  sc.fillStyle = '#343d37'; sc.fillRect(0, 0, 1024, 256); sc.strokeStyle = '#b0b59a'; sc.lineWidth = 6; sc.strokeRect(14, 14, 996, 228);
  sc.fillStyle = '#dad7bf'; sc.font = 'bold 94px monospace'; sc.fillText('RENDA / APKOPE', 42, 127);
  sc.fillStyle = '#aeb09a'; sc.font = '33px monospace'; sc.fillText('MAINTENANCE STORES     04', 47, 199);
  for (let i = 0; i < 450; i++) { sc.fillStyle = i % 3 ? '#343d37' : '#777b68'; sc.fillRect(patchRand() * 1024, patchRand() * 256, 1 + patchRand() * 11, 1 + patchRand() * 3); }
  const signTexture = new THREE.CanvasTexture(signCanvas); signTexture.colorSpace = THREE.SRGBColorSpace; signTexture.anisotropy = maxAnisotropy; textures.push(signTexture);
  const signMat = ownMaterial(new THREE.MeshStandardMaterial({ map: signTexture, roughness: .91, metalness: .08 }));
  const signPos = a(-1.91, 2.81, 2.61); addDecal(2.2, .55, signPos.x, signPos.y, signPos.z, yaw, signMat);
  for (const u of [-2.94, -.89]) for (const h of [2.59, 3.03]) aBox(steel, .025, .025, .017, u, h, 2.64);
  for (const [u, h, v, w, height] of [[-1.96, .62, 2.59, 2.2, 1], [3.39, 1.75, .1, .24, 3.2], [-3.39, 1.75, .1, .24, 3.2]] as number[][]) {
    const p = a(u, h, v); addDecal(w, height, p.x, p.y, p.z, yaw);
  }

  // A shallow entrance ramp follows the ground along the apron and joins the level slab.
  const rampPositions: number[] = [], rampUvs: number[] = [], rampIndices: number[] = [];
  for (let j = 0; j <= 4; j++) for (let i = 0; i <= 6; i++) {
    const u = -.28 + i / 6 * 3.3, v = 2.5 + j / 4 * 2.3;
    const p = a(u, 0, v), t = j / 4, terrain = groundHeightAt(world, p.x, p.z);
    p.y = THREE.MathUtils.lerp(floorY + .035, terrain + .035, t);
    rampPositions.push(p.x, p.y, p.z); rampUvs.push(u * .5, v * .5);
  }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) { const k = j * 7 + i; rampIndices.push(k, k + 7, k + 1, k + 1, k + 7, k + 8); }
  const ramp = new THREE.BufferGeometry(); ramp.setAttribute('position', new THREE.Float32BufferAttribute(rampPositions, 3)); ramp.setAttribute('uv', new THREE.Float32BufferAttribute(rampUvs, 2)); ramp.setIndex(rampIndices); ramp.computeVertexNormals(); addGeometry(ramp, concrete, 0, 0, 0);

  for (const [key, batch] of batches) {
    let vertexOffset = 0;
    const ownedPieces: { id: number; start: number; count: number }[] = [];
    for (const piece of batch.pieces) {
      const count = piece.getAttribute('position').count;
      const id = piece.userData.buildingArtOwnerId as number | null;
      if (id !== null && id !== undefined) ownedPieces.push({ id, start: vertexOffset, count });
      vertexOffset += count;
    }
    const geometry = mergeGeometries(batch.pieces, false);
    for (const piece of batch.pieces) piece.dispose();
    if (!geometry) continue;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (const piece of ownedPieces) {
      const original = new Float32Array(piece.count * 3);
      for (let i = 0; i < piece.count; i++) {
        original[i * 3] = position.getX(piece.start + i);
        original[i * 3 + 1] = position.getY(piece.start + i);
        original[i * 3 + 2] = position.getZ(piece.start + i);
      }
      const ranges = ownerRanges.get(piece.id) ?? [];
      ranges.push({ position, start: piece.start, original });
      ownerRanges.set(piece.id, ranges);
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, batch.material); mesh.name = `building-art-batch-${key}`;
    mesh.castShadow = batch.casts; mesh.receiveShadow = true;
    root.add(mesh); if (batch.solid) impactTargets.push(mesh);
  }
  root.userData.buildingCount = nearBuildings.length;
  root.userData.annexCenter = { x: ax, z: az, floorY };
  root.userData.renderMeshes = root.children.filter(child => (child as THREE.Mesh).isMesh).length;
  let disposed = false;
  return {
    impactTargets,
    colliders,
    groundHeightAt(x, z) {
      const dx = x - ax, dz = z - az;
      const u = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
      const v = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
      if (Math.abs(u) < 3.26 && Math.abs(v) < 2.34) return floorY + .055;
      if (u > -.28 && u < 3.02 && v >= 2.34 && v <= 4.8) {
        const t = THREE.MathUtils.clamp((v - 2.5) / 2.3, 0, 1);
        return THREE.MathUtils.lerp(floorY + .035, groundHeightAt(world, x, z) + .035, t);
      }
      return null;
    },
    setBuildingCustomized(id, customized) {
      if (disposed || customizedBuildings.has(id) === customized) return;
      const ranges = ownerRanges.get(id);
      if (!ranges) return;
      for (const { position, start, original } of ranges) {
        for (let i = 0; i < original.length / 3; i++) {
          position.setXYZ(start + i, original[i * 3], original[i * 3 + 1] - (customized ? 10000 : 0), original[i * 3 + 2]);
        }
        // Keep the original conservative bounds for any other visible owners in this batch.
        // Hidden art is beyond the world/camera/shadow clip ranges; no draw-call split is needed.
        position.needsUpdate = true;
      }
      if (customized) customizedBuildings.add(id);
      else customizedBuildings.delete(id);
    },
    setAtmosphere(preset) { lamp.intensity = preset === 'twilight' ? 32 : preset === 'noon' ? 12 : 22; },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      root.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.isMesh) mesh.geometry.dispose(); });
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      ownerRanges.clear(); customizedBuildings.clear();
    },
  };
}
