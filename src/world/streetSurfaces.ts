import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { computeRoadEdgeDisplacement, groundHeightAt, type BuildingCollider } from './rendaMath';
import type { AtmospherePreset, RendaWorldDataset, RoadData } from './types';

export interface StreetSurfaceHandle {
  impactTargets: THREE.Mesh[];
  setAtmosphere: (preset: AtmospherePreset) => void;
  update: (dt: number, elapsed: number) => void;
  dispose: () => void;
}

interface RoadSegment {
  road: RoadData;
  ax: number; az: number; bx: number; bz: number;
  dx: number; dz: number; nx: number; nz: number;
  length: number; ya: number; yb: number; width: number;
}
interface Pose {
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  yaw: number; pitch?: number; roll?: number;
  tint?: THREE.Color;
}

function seededRandom(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function asphaltRoad(road: RoadData): boolean {
  return road.id === 124755771 || road.surface === 'asphalt' || road.surface === 'paved'
    || road.kind === 'primary' || road.kind === 'living_street';
}

/** Matches the existing road ribbon, which deliberately sits above its surrounding DTM. */
function ribbonNodeHeight(world: RendaWorldDataset, road: RoadData, i: number): number {
  const p = road.pts[i];
  const prev = road.pts[Math.max(0, i - 1)];
  const next = road.pts[Math.min(road.pts.length - 1, i + 1)];
  const len = Math.hypot(next[0] - prev[0], next[1] - prev[1]) || 1;
  const dx = (next[0] - prev[0]) / len;
  const dz = (next[1] - prev[1]) / len;
  const kind = asphaltRoad(road) ? 'asphalt' : 'gravel';
  const halfW = road.width * 0.5;
  const lw = Math.max(0.32, halfW + computeRoadEdgeDisplacement(p[0], p[1], -1, halfW, kind));
  const rw = Math.max(0.32, halfW + computeRoadEdgeDisplacement(p[0], p[1], 1, halfW, kind));
  const leftY = groundHeightAt(world, p[0] + dz * lw, p[1] - dx * lw);
  const rightY = groundHeightAt(world, p[0] - dz * rw, p[1] + dx * rw);
  const offset = road.kind === 'primary' ? 0.22 : asphaltRoad(road) ? 0.19 : 0.14;
  return groundHeightAt(world, p[0], p[1]) * 0.65 + Math.min(leftY, rightY) * 0.35 + offset;
}

function roadHeight(segment: RoadSegment, x: number, z: number): number {
  const along = THREE.MathUtils.clamp(((x - segment.ax) * segment.dx + (z - segment.az) * segment.dz) / segment.length, 0, 1);
  return THREE.MathUtils.lerp(segment.ya, segment.yb, along);
}

function roadPoint(segment: RoadSegment, along: number, lateral: number): [number, number, number] {
  const x = segment.ax + segment.dx * along + segment.nx * lateral;
  const z = segment.az + segment.dz * along + segment.nz * lateral;
  return [x, roadHeight(segment, x, z), z];
}

function shoulderWidth(segment: RoadSegment, along: number, side: number): number {
  const x = segment.ax + segment.dx * along, z = segment.az + segment.dz * along;
  return .82 + .12 * Math.sin(x * .43 + z * .23 + side * 3.2) + .08 * Math.sin(x * 1.14 - z * .9);
}

function shoulderHeight(world: RendaWorldDataset, segment: RoadSegment, along: number, lateral: number): number {
  const [x, y, z] = roadPoint(segment, along, lateral);
  const extra = Math.max(0, Math.abs(lateral) - (segment.width * .5 - .07));
  const t = Math.min(1, extra / shoulderWidth(segment, along, Math.sign(lateral) || 1));
  return THREE.MathUtils.lerp(y + .004, groundHeightAt(world, x, z) + .036, t);
}

function geometryFromArrays(positions: number[], uvs: number[], colors: number[], indices: number[], opacity?: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('surfaceOpacity', new THREE.Float32BufferAttribute(opacity ?? new Array(positions.length / 3).fill(1), 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function featheredSurface(material: THREE.MeshStandardMaterial): void {
  material.transparent = true;
  material.depthWrite = false;
  material.alphaTest = .005;
  material.customProgramCacheKey = () => 'street-feathered-surface-v1';
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float surfaceOpacity;\nvarying float vSurfaceOpacity;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurfaceOpacity = surfaceOpacity;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSurfaceOpacity;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vSurfaceOpacity;');
  };
}

/** Small irregular repair outlines; world-space UVs retain the photographed aggregate scale. */
function surfacePatch(
  segment: RoadSegment, x: number, z: number, rx: number, rz: number,
  offset: number, random: () => number, tint: number, edgeTint = tint
): THREE.BufferGeometry {
  const points = 14;
  const positions = [x, roadHeight(segment, x, z) + offset, z];
  const uvs = [x * 0.65, z * 0.65];
  const colors = [tint, tint, tint];
  const opacity = [1];
  const indices: number[] = [];
  const radii = Array.from({ length: points }, () => .74 + random() * .28);
  for (const outer of [false, true]) {
    for (let i = 0; i < points; i++) {
      const a = i / points * Math.PI * 2;
      const irregularity = radii[i] * (outer ? 1 : .77);
      const lx = Math.cos(a) * rx * irregularity;
      const lz = Math.sin(a) * rz * irregularity;
      const px = x + segment.nx * lx + segment.dx * lz;
      const pz = z + segment.nz * lx + segment.dz * lz;
      positions.push(px, roadHeight(segment, px, pz) + offset, pz);
      uvs.push(px * 0.65, pz * 0.65);
      colors.push(edgeTint, edgeTint, edgeTint);
      opacity.push(outer ? 0 : 1);
      if (!outer) indices.push(0, 1 + (i + 1) % points, 1 + i);
      else {
        const inner = 1 + i, innerNext = 1 + (i + 1) % points;
        const edge = 1 + points + i, edgeNext = 1 + points + (i + 1) % points;
        indices.push(inner, innerNext, edge, edge, innerNext, edgeNext);
      }
    }
  }
  return geometryFromArrays(positions, uvs, colors, indices, opacity);
}

function curledLeafGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions = [0, .008, -.075, -.036, .014, -.026, -.043, .023, .022, -.023, .029, .067,
    0, .012, .105, .025, .018, .063, .042, .009, .016, .031, .003, -.03, 0, 0, .016];
  const uv = positions.flatMap((_, i, values) => i % 3 === 0 ? [(values[i] + .05) * 10, (values[i + 2] + .075) * 5] : []);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex([8, 1, 0, 8, 2, 1, 8, 3, 2, 8, 4, 3, 8, 5, 4, 8, 6, 5, 8, 7, 6, 8, 0, 7]);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Close-range environmental art, intentionally bounded to the village instead of
 * scattering expensive decorative models over the entire geographic dataset.
 */
export function createStreetSurfaces(
  scene: THREE.Scene,
  world: RendaWorldDataset,
  existingColliders: BuildingCollider[],
  maxAnisotropy = 8,
): StreetSurfaceHandle {
  const group = new THREE.Group();
  group.name = 'village-street-surface-detail';
  scene.add(group);
  const random = seededRandom(577021);
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const impactTargets: THREE.Mesh[] = [];
  let disposed = false;
  const loader = new THREE.TextureLoader();
  const load = (folder: string, filename: string, color: boolean): THREE.Texture => {
    const texture: THREE.Texture<HTMLImageElement | HTMLCanvasElement> = loader.load(`/assets/textures/${folder}/${filename}`, undefined, undefined, () => {
      if (disposed) return;
      // Preserve a usable neutral material if an optional detail texture is unavailable.
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = filename.startsWith('nor') ? '#8080ff' : '#ffffff';
      ctx.fillRect(0, 0, 1, 1); texture.source.data = canvas; texture.needsUpdate = true;
    });
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, maxAnisotropy);
    textures.push(texture);
    return texture;
  };
  const gravelMap = load('gravel_road', 'diff.jpg', true);
  const gravelNormal = load('gravel_road', 'nor_gl.jpg', false);
  const gravelRough = load('gravel_road', 'rough.jpg', false);
  const asphaltMap = load('asphalt_02', 'diff.jpg', true);
  const asphaltNormal = load('asphalt_02', 'nor_gl.jpg', false);
  const asphaltRough = load('asphalt_02', 'rough.jpg', false);
  const gravel = new THREE.MeshStandardMaterial({ map: gravelMap, normalMap: gravelNormal,
    roughnessMap: gravelRough, color: 0xaaa08b, roughness: .96, metalness: 0,
    normalScale: new THREE.Vector2(.48, .48), vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const asphalt = new THREE.MeshStandardMaterial({ map: asphaltMap, normalMap: asphaltNormal,
    roughnessMap: asphaltRough, color: 0x9c9d96, roughness: .94, metalness: 0,
    normalScale: new THREE.Vector2(.65, .65), vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const darkAggregate = asphalt.clone(); darkAggregate.color.setHex(0x686b60); darkAggregate.roughness = .92;
  const concrete = new THREE.MeshStandardMaterial({ map: gravelMap, normalMap: gravelNormal,
    roughnessMap: gravelRough, color: 0x9a9c91, roughness: .94, metalness: 0, normalScale: new THREE.Vector2(.18, .18) });
  const iron = new THREE.MeshStandardMaterial({ color: 0x31342e, roughness: .67, metalness: .68 });
  const drainDark = new THREE.MeshStandardMaterial({ color: 0x101612, roughness: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x20241f, roughness: .88, metalness: 0 });
  const oldPaint = new THREE.MeshStandardMaterial({ color: 0xb6b3a0, roughness: .96, metalness: 0 });
  const stoneMaterial = new THREE.MeshStandardMaterial({ map: gravelMap, normalMap: gravelNormal,
    roughnessMap: gravelRough, color: 0xb1ac9d, roughness: .97, normalScale: new THREE.Vector2(.2, .2) });
  const leafMaterial = new THREE.MeshStandardMaterial({ map: gravelMap, color: 0x8e7854,
    roughness: 1, metalness: 0, side: THREE.DoubleSide });
  const puddleMaterial = new THREE.MeshPhysicalMaterial({ color: 0x565b52, roughness: .15,
    metalness: 0, ior: 1.333, clearcoat: 1, clearcoatRoughness: .1, normalMap: asphaltNormal,
    normalScale: new THREE.Vector2(.025, .025), transparent: true, opacity: .55,
    depthWrite: false, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  materials.push(gravel, asphalt, darkAggregate, concrete, iron, drainDark, rubber, oldPaint, stoneMaterial, leafMaterial, puddleMaterial);
  for (const material of [gravel, asphalt, darkAggregate, puddleMaterial]) featheredSurface(material);

  const blocked = (x: number, z: number, margin = .1): boolean => existingColliders.some(c =>
    x > c.minX - margin && x < c.maxX + margin && z > c.minZ - margin && z < c.maxZ + margin);
  const segments: RoadSegment[] = [];
  for (const road of world.roads) {
    if (road.bridge || road.width < 2.2 || !['primary', 'residential', 'service', 'unclassified', 'living_street'].includes(road.kind)) continue;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [ax, az] = road.pts[i]; const [bx, bz] = road.pts[i + 1];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < .3) continue;
      const dx = (bx - ax) / length; const dz = (bz - az) / length;
      const projected = (175 - ax) * dx + (72 - az) * dz;
      const perpendicularSq = Math.max(0, (175 - ax) ** 2 + (72 - az) ** 2 - projected ** 2);
      if (perpendicularSq > 145 ** 2) continue;
      const halfChord = Math.sqrt(145 ** 2 - perpendicularSq);
      const start = Math.max(0, projected - halfChord), end = Math.min(length, projected + halfChord);
      if (end - start < .3) continue;
      const ya = ribbonNodeHeight(world, road, i), yb = ribbonNodeHeight(world, road, i + 1);
      segments.push({ road, ax: ax + dx * start, az: az + dz * start,
        bx: ax + dx * end, bz: az + dz * end, dx, dz, nx: dz, nz: -dx, length: end - start,
        ya: THREE.MathUtils.lerp(ya, yb, start / length), yb: THREE.MathUtils.lerp(ya, yb, end / length), width: road.width });
    }
  }
  // Spend the finite patch/debris budget in the actual approach view first.
  segments.sort((a, b) => {
    const heroDifference = Number(b.road.id === 124755771) - Number(a.road.id === 124755771);
    if (heroDifference) return heroDifference;
    return Math.hypot((a.ax + a.bx) * .5 - 168, (a.az + a.bz) * .5 - 66)
      - Math.hypot((b.ax + b.bx) * .5 - 168, (b.az + b.bz) * .5 - 66);
  });

  const shoulderGeos: THREE.BufferGeometry[] = [];
  const repairGeos: THREE.BufferGeometry[] = [];
  const holeGeos: THREE.BufferGeometry[] = [];
  const puddleGeos: THREE.BufferGeometry[] = [];
  const curbPoses: Pose[] = [];
  const pebblePoses: Pose[] = [];
  const leafPoses: Pose[] = [];
  const paintPoses: Pose[] = [];
  const grateRims: Pose[] = [];
  const grateBars: Pose[] = [];
  const grateBacks: Pose[] = [];
  const cableGeos: THREE.BufferGeometry[] = [];
  let detailDistance = 0;

  for (const segment of segments) {
    const steps = Math.max(1, Math.ceil(segment.length / 1.1));
    const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [], opacity: number[] = [];
    // A tapered aggregate shoulder bridges the elevated road edge back into its terrain.
    for (const side of [-1, 1]) {
      const base = positions.length / 3;
      for (let i = 0; i <= steps; i++) {
        const along = segment.length * i / steps;
        const width = shoulderWidth(segment, along, side);
        for (const outer of [false, true]) {
          const lateral = side * (segment.width * .5 - .07 + (outer ? width : 0));
          const [x, yRoad, z] = roadPoint(segment, along, lateral);
          const y = outer ? groundHeightAt(world, x, z) + .036 : yRoad + .004;
          positions.push(x, y, z); uvs.push(x * .95, z * .95);
          const tone = outer ? .54 + random() * .16 : .75 + random() * .16;
          colors.push(tone, tone, tone);
          opacity.push(outer ? 0 : .95);
        }
        if (i > 0) {
          const a = base + (i - 1) * 2;
          if (side < 0) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          else indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
    }
    const shoulder = geometryFromArrays(positions, uvs, colors, indices, opacity);
    shoulderGeos.push(shoulder);

    for (let along = 1.2; along < segment.length - .4; along += 1.3) {
      const [cx, cy, cz] = roadPoint(segment, along, 0);
      if (Math.hypot(cx - 175, cz - 72) > 140 || blocked(cx, cz)) continue;
      const yaw = Math.atan2(segment.dx, segment.dz);
      const slope = Math.atan2(segment.yb - segment.ya, segment.length);
      const heroRoad = segment.road.id === 124755771;
      detailDistance += 1.3;
      for (const side of [-1, 1]) {
        const edge = side * (segment.width * .5 + .04);
        const [ex, ey, ez] = roadPoint(segment, along, edge);
        if (blocked(ex, ez, .25)) continue;
        // Short, broken curb runs describe the occupied village. Rural outer roads
        // retain irregular gravel margins instead of becoming an urban pavement.
        if (heroRoad && cz > 42 && cz < 122 && random() > .16) {
          curbPoses.push({ x: ex, y: ey + .059, z: ez, sx: .17, sy: .14, sz: 1.19,
            yaw, pitch: -slope, roll: (random() - .5) * .045,
            tint: new THREE.Color().setHSL(.12, .035, .7 + random() * .2) });
        }
        for (let k = 0; k < 6; k++) {
          const lat = side * (segment.width * .5 + (random() - .18) * 1.04);
          const scatterAlong = along + (random() - .5) * 1.2;
          const [px, , pz] = roadPoint(segment, scatterAlong, lat);
          if (blocked(px, pz)) continue;
          const h = shoulderHeight(world, segment, scatterAlong, lat);
          const size = .025 + Math.pow(random(), 2) * .085;
          pebblePoses.push({ x: px, y: h + size * .22, z: pz, sx: size * (1 + random()), sy: size * .6,
            sz: size * (.6 + random()), yaw: random() * Math.PI * 2, roll: random() * .5,
            tint: new THREE.Color().setHSL(.1 + random() * .06, .055, .62 + random() * .28) });
          if (k < 3 && random() > .2) leafPoses.push({ x: px, y: h + .008, z: pz, sx: .65 + random() * 1.25,
            sy: .6 + random(), sz: .6 + random() * 1.6, yaw: random() * Math.PI * 2,
            tint: new THREE.Color().setHSL(.08 + random() * .08, .22 + random() * .12, .48 + random() * .24) });
        }
        if (heroRoad && random() > .47) {
          const [px, py, pz] = roadPoint(segment, along, side * (segment.width * .5 - .32));
          paintPoses.push({ x: px, y: py + .012, z: pz, sx: .075 + random() * .025, sy: .002,
            sz: .13 + random() * .42, yaw, pitch: -slope,
            tint: new THREE.Color().setScalar(.58 + random() * .38) });
        }
      }
      if (asphaltRoad(segment.road) && random() > .81 && repairGeos.length < 56) {
        const [px, , pz] = roadPoint(segment, along, (random() - .5) * segment.width * .6);
        const rx = .27 + random() * .53; const rz = .35 + random() * .95;
        repairGeos.push(surfacePatch(segment, px, pz, rx, rz, .009, random, .64 + random() * .25, .73));
        if (random() > .6) holeGeos.push(surfacePatch(segment, px + .02, pz, rx * .63, rz * .68, .014, random, .6, .78));
        if (random() > .44) puddleGeos.push(surfacePatch(segment, px, pz, rx * .57, rz * .59, .019, random, .68, .82));
      } else if (heroRoad && random() > .79) {
        const [px, , pz] = roadPoint(segment, along, (random() > .5 ? 1 : -1) * segment.width * .38);
        puddleGeos.push(surfacePatch(segment, px, pz, .16 + random() * .2, .35 + random() * .65, .017, random, .64, .8));
      }

      if (heroRoad && Math.floor(detailDistance) % 18 === 0 && grateRims.length < 20) {
        const [x, y, z] = roadPoint(segment, along, -segment.width * .5 + .24);
        if (!blocked(x, z, .4)) {
          const base = { x, y: y + .018, z, yaw, pitch: -slope };
          grateBacks.push({ ...base, sx: .38, sy: .012, sz: .65 });
          for (const side of [-1, 1]) grateRims.push({ ...base, x: x + segment.nx * side * .195,
            z: z + segment.nz * side * .195, sx: .028, sy: .024, sz: .72 });
          for (let b = -4; b <= 4; b++) grateBars.push({ ...base,
            x: x + segment.dx * b * .073, z: z + segment.dz * b * .073, y: y + .031,
            sx: .4, sy: .018, sz: .024 });
        }
      }
    }
  }
  const mergeLayer = (parts: THREE.BufferGeometry[], material: THREE.Material, name: string,
    castShadow = false, target = false): THREE.Mesh | null => {
    if (parts.length === 0) return null;
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!merged) return null;
    geometries.add(merged);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material); mesh.name = name;
    mesh.castShadow = castShadow; mesh.receiveShadow = true;
    group.add(mesh); if (target) impactTargets.push(mesh); return mesh;
  };
  mergeLayer(shoulderGeos, gravel, 'graded-gravel-road-shoulders', false, true);
  mergeLayer(repairGeos, asphalt, 'irregular-asphalt-repair-patches', false, true);
  mergeLayer(holeGeos, darkAggregate, 'shallow-spalled-road-depressions');
  const puddles = mergeLayer(puddleGeos, puddleMaterial, 'broken-roadside-puddles');
  if (puddles) puddles.renderOrder = 2;

  const box = new THREE.BoxGeometry(1, 1, 1);
  // Uniform metre-scale aggregate on narrow kerbs, rather than a whole texture
  // squeezed across the thin side of every concrete block.
  for (let i = 0; i < box.attributes.uv.count; i++) box.attributes.uv.setXY(i,
    box.attributes.uv.getX(i) * 2, box.attributes.uv.getY(i) * 2);
  const stone = new THREE.DodecahedronGeometry(1, 0);
  const leaf = curledLeafGeometry();
  geometries.add(box); geometries.add(stone); geometries.add(leaf);
  const dummy = new THREE.Object3D();
  const instances = (geometry: THREE.BufferGeometry, material: THREE.Material, poses: Pose[], name: string,
    castShadow = false, target = false): void => {
    if (poses.length === 0) return;
    const mesh = new THREE.InstancedMesh(geometry, material, poses.length); mesh.name = name;
    poses.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.pitch ?? 0, p.yaw, p.roll ?? 0, 'YXZ');
      dummy.scale.set(p.sx, p.sy, p.sz); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, p.tint ?? new THREE.Color(0xffffff));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); mesh.castShadow = castShadow; mesh.receiveShadow = true;
    group.add(mesh); if (target) impactTargets.push(mesh);
  };
  instances(box, concrete, curbPoses, 'chipped-village-kerb-segments', true, true);
  instances(stone, stoneMaterial, pebblePoses, 'road-aggregate-and-spalled-stones');
  instances(leaf, leafMaterial, leafPoses, 'curled-autumn-road-leaf-litter');
  instances(box, oldPaint, paintPoses, 'broken-worn-road-edge-paint');
  instances(box, drainDark, grateBacks, 'recessed-drain-openings');
  instances(box, iron, grateRims, 'drain-cast-iron-rims', false, true);
  instances(box, iron, grateBars, 'drain-cast-iron-bars', false, true);

  // A few heavy field cables curl along the occupied shoulder and terminate in
  // the supply yard; none cross the clear three-metre vehicle corridor.
  for (const side of [-1, 1]) {
    const road = segments.find(s => s.road.id === 124755771 && s.az <= 61 && s.bz >= 56);
    if (!road) continue;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 14; i++) {
      const along = THREE.MathUtils.clamp(road.length * .15 + i * .59, .2, road.length - .3);
      const lateral = side * (road.width * .5 + .26 + Math.sin(i * .75) * .2);
      const [x, y, z] = roadPoint(road, along, lateral);
      points.push(new THREE.Vector3(x, Math.max(groundHeightAt(world, x, z) + .045, y - .02), z));
    }
    const cable = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, .013, 5, false);
    cableGeos.push(cable);
  }
  const cables = mergeLayer(cableGeos, rubber, 'field-power-cables');
  if (cables) cables.castShadow = true;

  const setAtmosphere = (preset: AtmospherePreset) => {
    const wetness = preset === 'overcast_rain' ? 1 : preset === 'morning' ? .63 : preset === 'twilight' ? .7 : preset === 'golden' ? .48 : .12;
    puddleMaterial.opacity = .25 + wetness * .4;
    puddleMaterial.roughness = .24 - wetness * .13;
    if (puddles) puddles.visible = wetness > .2;
    asphalt.roughness = .95 - wetness * .25;
    darkAggregate.roughness = .94 - wetness * .17;
    gravel.roughness = .98 - wetness * .13;
    gravel.color.setHex(wetness > .8 ? 0x8d887b : 0xaaa08b);
  };
  setAtmosphere('golden');
  group.userData.surfaceDetailCounts = { segments: segments.length, kerbs: curbPoses.length,
    pebbles: pebblePoses.length, leaves: leafPoses.length, repairs: repairGeos.length,
    puddles: puddleGeos.length, drawCalls: group.children.length };
  return {
    impactTargets,
    setAtmosphere,
    update: () => { /* Static, batched detail; no per-frame scatter or geometry allocation. */ },
    dispose: () => {
      if (disposed) return; disposed = true; group.removeFromParent();
      group.traverse((object) => { if ((object as THREE.InstancedMesh).isInstancedMesh) (object as THREE.InstancedMesh).dispose(); });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };
}
