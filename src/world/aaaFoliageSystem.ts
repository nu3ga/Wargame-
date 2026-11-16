import * as THREE from 'three';
import { Tree } from '@dgreenheck/ez-tree';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  computeVergeWeedDensity,
  deterministicSpatialNoise2D,
  findNearestRiverPoint,
  groundHeightAt,
} from './rendaMath';
import type { BuildingCollider } from './rendaMath';
import {
  createCurvedGrassClusterGeometry,
  createKurzemeEzTreeOptions,
  createOverhaulLeafDepthMaterial,
  enhanceBarkMaterial,
  enhanceOverhaulFoliageMaterial,
  normalizeEzTreeGeometry,
  type TreeSpecies,
} from './foliageOverhaul';
import {
  collectCellCoordsInRadius,
  computeDrawDistanceFade,
  DEFAULT_GRASS_STREAM_INNER_M,
  DEFAULT_GRASS_STREAM_OUTER_M,
  DEFAULT_TREE_MAX_DRAW_M,
  DEFAULT_TREE_NEAR_M,
  filterInstancesByDrawDistance,
  partitionTreeInstancesByDistance3Tier,
} from './drawDistance';
import type { RendaWorldDataset } from './types';

export interface TreeInstanceRecord {
  species: TreeSpecies;
  variant: 0 | 1;
  matrix: THREE.Matrix4;
  canopyColor: THREE.Color;
  barkColor: THREE.Color;
  x: number;
  z: number;
}

export interface AaaTreeSystemHandle {
  updateLod: (camX: number, camZ: number, force?: boolean) => void;
  dispose: () => void;
}

export interface AaaGroundCoverHandle {
  updateLod: (camX: number, camZ: number, force?: boolean) => void;
  dispose: () => void;
}

function makeSeededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashCellCoords(cx: number, cz: number): number {
  let h = (Math.imul(cx, 374761393) + Math.imul(cz, 668265263) + 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Loads a photographic leaf PNG from /assets/foliage/leaves/ and runs a fast 2-pass RGB edge dilation
 * so alpha-tested silhouettes have zero black/white mipmap fringes, with optional botanical hue shift
 * (e.g. turning autumn aspen yellow leaves into fresh Baltic summer Silver Birch green).
 */
function loadProcessedLeafTexture(
  loader: THREE.TextureLoader,
  url: string,
  mode: 'natural' | 'birch_green' | 'birch_late_summer' | 'spruce_deep' | 'ash_green',
  maxAnisotropy: number,
  extraTextures: THREE.Texture[]
): THREE.Texture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = false;
  tex.anisotropy = maxAnisotropy;
  extraTextures.push(tex);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);

    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;

      if (mode === 'spruce_deep') {
        r *= 0.66;
        g *= 0.78;
        b *= 0.80;
      } else if (mode === 'ash_green') {
        r *= 0.78;
        g *= 0.86;
        b *= 0.74;
      } else if (mode === 'natural') {
        // Ground raw bright studio leaf atlases slightly so sunlit crowns keep rich botanical depth
        r *= 0.84;
        g *= 0.86;
        b *= 0.82;
      } else {
        // Shift golden-yellow aspen leaf blades into Silver Birch greens while keeping brown twigs intact
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        if (d > 0.08 && r > 0.25 && g > 0.22 && r > b * 1.18) {
          const yellowMask = Math.min(1, Math.max(0, (r + g - 2 * b) * 1.35));
          if (mode === 'birch_green') {
            const targetR = r * 0.50;
            const targetG = Math.min(1, g * 0.94 + 0.02);
            const targetB = b * 0.76 + g * 0.10;
            r = r + (targetR - r) * yellowMask;
            g = g + (targetG - g) * yellowMask;
            b = b + (targetB - b) * yellowMask;
          } else {
            const targetR = r * 0.76;
            const targetG = Math.min(1, g * 0.92 + 0.01);
            const targetB = b * 0.84 + g * 0.05;
            r = r + (targetR - r) * yellowMask * 0.7;
            g = g + (targetG - g) * yellowMask * 0.7;
            b = b + (targetB - b) * yellowMask * 0.7;
          }
        }
      }
      data[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
    }

    // 2-pass RGB edge dilation into transparent pixels to prevent black/white mipmap halos
    const copy = new Uint8ClampedArray(data.length);
    const stride = size * 4;
    for (let pass = 0; pass < 2; pass++) {
      copy.set(data);
      for (let y = 1; y < size - 1; y++) {
        let idx = (y * size + 1) * 4;
        for (let x = 1; x < size - 1; x++, idx += 4) {
          if (copy[idx + 3] > 20) continue;
          let sr = 0;
          let sg = 0;
          let sb = 0;
          let hits = 0;
          if (copy[idx - 1] > 20) {
            sr += copy[idx - 4];
            sg += copy[idx - 3];
            sb += copy[idx - 2];
            hits++;
          }
          if (copy[idx + 7] > 20) {
            sr += copy[idx + 4];
            sg += copy[idx + 5];
            sb += copy[idx + 6];
            hits++;
          }
          if (copy[idx - stride + 3] > 20) {
            sr += copy[idx - stride];
            sg += copy[idx - stride + 1];
            sb += copy[idx - stride + 2];
            hits++;
          }
          if (copy[idx + stride + 3] > 20) {
            sr += copy[idx + stride];
            sg += copy[idx + stride + 1];
            sb += copy[idx + stride + 2];
            hits++;
          }
          if (hits > 0) {
            data[idx] = (sr / hits) | 0;
            data[idx + 1] = (sg / hits) | 0;
            data[idx + 2] = (sb / hits) | 0;
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    tex.needsUpdate = true;
  };
  img.src = url;
  void loader;
  return tex;
}

function loadBarkPbrSet(
  loader: THREE.TextureLoader,
  barkId: 'pine' | 'willow' | 'birch' | 'oak',
  repeatY: number,
  maxAnisotropy: number,
  extraTextures: THREE.Texture[]
): {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap: THREE.Texture;
} {
  const prep = (file: string, isColor: boolean) => {
    const t = loader.load(`/assets/foliage/bark/${barkId}_${file}_1k.jpg`);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, repeatY);
    t.anisotropy = maxAnisotropy;
    if (isColor) t.colorSpace = THREE.SRGBColorSpace;
    extraTextures.push(t);
    return t;
  };
  return {
    map: prep('color', true),
    normalMap: prep('normal', false),
    roughnessMap: prep('roughness', false),
    aoMap: prep('ao', false),
  };
}

/**
 * Generates @dgreenheck/ez-tree 2-variant x 2-LOD hierarchical tree geometries & PBR materials,
 * and manages 3-tier camera-proximity LOD + beyond-fog distance culling across all trees & saplings in Renda.
 */
export function buildAaaTreeSystem(
  scene: THREE.Scene,
  records: TreeInstanceRecord[],
  windTimeUniform: { value: number },
  sunDirUniform: { value: THREE.Vector3 },
  sunColorUniform: { value: THREE.Color },
  isSoftwareGl: boolean,
  maxAnisotropy: number
): { handle: AaaTreeSystemHandle; textures: THREE.Texture[] } {
  const textures: THREE.Texture[] = [];
  const texLoader = new THREE.TextureLoader();

  const pineBarkPbr = loadBarkPbrSet(texLoader, 'pine', 1.2, maxAnisotropy, textures);
  const spruceBarkPbr = loadBarkPbrSet(texLoader, 'willow', 1.1, maxAnisotropy, textures);
  const birchBarkPbr = loadBarkPbrSet(texLoader, 'birch', 1.25, maxAnisotropy, textures);
  const oakBarkPbr = loadBarkPbrSet(texLoader, 'oak', 1.2, maxAnisotropy, textures);

  const pineLeafTex = loadProcessedLeafTexture(
    texLoader,
    '/assets/foliage/leaves/pine_color.png',
    'natural',
    maxAnisotropy,
    textures
  );
  const spruceLeafTex = loadProcessedLeafTexture(
    texLoader,
    '/assets/foliage/leaves/pine_color.png',
    'spruce_deep',
    maxAnisotropy,
    textures
  );
  const birchGreenTex = loadProcessedLeafTexture(
    texLoader,
    '/assets/foliage/leaves/aspen_color.png',
    'birch_green',
    maxAnisotropy,
    textures
  );
  const birchGoldTex = loadProcessedLeafTexture(
    texLoader,
    '/assets/foliage/leaves/aspen_color.png',
    'birch_late_summer',
    maxAnisotropy,
    textures
  );
  const oakLeafTex = loadProcessedLeafTexture(
    texLoader,
    '/assets/foliage/leaves/oak_color.png',
    'natural',
    maxAnisotropy,
    textures
  );
  const ashLeafTex = loadProcessedLeafTexture(
    texLoader,
    '/assets/foliage/leaves/ash_color.png',
    'ash_green',
    maxAnisotropy,
    textures
  );

  const makeBarkMat = (pbr: ReturnType<typeof loadBarkPbrSet>, roughness = 0.88) => {
    const mat = new THREE.MeshStandardMaterial({
      map: pbr.map,
      normalMap: pbr.normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: pbr.roughnessMap,
      roughness,
      metalness: 0.0,
      vertexColors: true,
    });
    enhanceBarkMaterial(mat, windTimeUniform);
    return mat;
  };

  const makeLeafMat = (tex: THREE.Texture, roughness = 0.76) => {
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      alphaTest: 0.36,
      alphaToCoverage: !isSoftwareGl,
      side: THREE.DoubleSide,
      roughness,
      metalness: 0.0,
      vertexColors: true,
    });
    enhanceOverhaulFoliageMaterial(mat, windTimeUniform, sunDirUniform, sunColorUniform);
    return mat;
  };

  const barkMats: Record<TreeSpecies, THREE.MeshStandardMaterial> = {
    pine: makeBarkMat(pineBarkPbr, 0.9),
    spruce: makeBarkMat(spruceBarkPbr, 0.92),
    birch: makeBarkMat(birchBarkPbr, 0.78),
    oak: makeBarkMat(oakBarkPbr, 0.9),
  };

  const leafMats: Record<string, THREE.MeshStandardMaterial> = {
    pine_0: makeLeafMat(pineLeafTex, 0.82),
    pine_1: makeLeafMat(pineLeafTex, 0.82),
    spruce_0: makeLeafMat(spruceLeafTex, 0.84),
    spruce_1: makeLeafMat(spruceLeafTex, 0.84),
    birch_0: makeLeafMat(birchGreenTex, 0.72),
    birch_1: makeLeafMat(birchGoldTex, 0.72),
    oak_0: makeLeafMat(oakLeafTex, 0.76),
    oak_1: makeLeafMat(ashLeafTex, 0.75),
  };

  const depthMats: Record<string, THREE.MeshDepthMaterial> = {
    pine: createOverhaulLeafDepthMaterial(pineLeafTex, windTimeUniform, 0.36),
    spruce: createOverhaulLeafDepthMaterial(spruceLeafTex, windTimeUniform, 0.36),
    birch_0: createOverhaulLeafDepthMaterial(birchGreenTex, windTimeUniform, 0.36),
    birch_1: createOverhaulLeafDepthMaterial(birchGoldTex, windTimeUniform, 0.36),
    oak_0: createOverhaulLeafDepthMaterial(oakLeafTex, windTimeUniform, 0.36),
    oak_1: createOverhaulLeafDepthMaterial(ashLeafTex, windTimeUniform, 0.36),
  };

  interface Bucket {
    species: TreeSpecies;
    variant: 0 | 1;
    items: TreeInstanceRecord[];
    positions: { x: number; z: number }[];
    nearTrunk: THREE.InstancedMesh;
    nearLeaf: THREE.InstancedMesh;
    farTrunk: THREE.InstancedMesh;
    farLeaf: THREE.InstancedMesh;
  }

  const buckets: Bucket[] = [];
  const bucketGeometries: THREE.BufferGeometry[] = [];

  for (const species of ['pine', 'spruce', 'birch', 'oak'] as TreeSpecies[]) {
    for (const variant of [0, 1] as (0 | 1)[]) {
      const items = records.filter((r) => r.species === species && r.variant === variant);
      if (items.length === 0) continue;

      const nearTree = new Tree();
      nearTree.loadFromJson(createKurzemeEzTreeOptions(species, variant, 'near') as never);
      const nearB = nearTree.branchesMesh.geometry;
      const nearL = nearTree.leavesMesh.geometry;
      normalizeEzTreeGeometry(nearB, nearL, species, 10.5);
      nearTree.branchesMesh.material = barkMats[species];
      (nearTree.leavesMesh.material as THREE.Material).dispose();

      const farTree = new Tree();
      farTree.loadFromJson(createKurzemeEzTreeOptions(species, variant, 'far') as never);
      const farB = farTree.branchesMesh.geometry;
      const farL = farTree.leavesMesh.geometry;
      normalizeEzTreeGeometry(farB, farL, species, 10.5);
      (farTree.branchesMesh.material as THREE.Material).dispose();
      (farTree.leavesMesh.material as THREE.Material).dispose();

      bucketGeometries.push(nearB, nearL, farB, farL);

      const leafKey = `${species}_${variant}`;
      const leafMat = leafMats[leafKey];
      const depthMat = species === 'birch' || species === 'oak' ? depthMats[leafKey] : depthMats[species];

      const nearCap = Math.min(items.length, isSoftwareGl ? 56 : 200);
      const farCap = items.length;

      const nearTrunk = new THREE.InstancedMesh(nearB, barkMats[species], nearCap);
      const nearLeaf = new THREE.InstancedMesh(nearL, leafMat, nearCap);
      const farTrunk = new THREE.InstancedMesh(farB, barkMats[species], farCap);
      const farLeaf = new THREE.InstancedMesh(farL, leafMat, farCap);

      nearLeaf.customDepthMaterial = depthMat;
      farLeaf.customDepthMaterial = depthMat;

      for (const im of [nearTrunk, farTrunk]) {
        im.castShadow = !isSoftwareGl;
        im.receiveShadow = true;
        im.frustumCulled = false;
      }
      nearLeaf.castShadow = !isSoftwareGl;
      nearLeaf.receiveShadow = !isSoftwareGl;
      nearLeaf.frustumCulled = false;
      farLeaf.castShadow = !isSoftwareGl;
      farLeaf.receiveShadow = false;
      farLeaf.frustumCulled = false;

      nearTrunk.count = 0;
      nearLeaf.count = 0;
      farTrunk.count = 0;
      farLeaf.count = 0;

      scene.add(nearTrunk, nearLeaf, farTrunk, farLeaf);
      buckets.push({
        species,
        variant,
        items,
        positions: items.map((it) => ({ x: it.x, z: it.z })),
        nearTrunk,
        nearLeaf,
        farTrunk,
        farLeaf,
      });
    }
  }

  let lastLodX = Number.NaN;
  let lastLodZ = Number.NaN;

  const updateLod = (camX: number, camZ: number, force = false) => {
    if (!force && Number.isFinite(lastLodX)) {
      const dx = camX - lastLodX;
      const dz = camZ - lastLodZ;
      if (dx * dx + dz * dz < 144) return;
    }
    lastLodX = camX;
    lastLodZ = camZ;

    for (const b of buckets) {
      const { nearIndices, farIndices } = partitionTreeInstancesByDistance3Tier(
        b.positions,
        camX,
        camZ,
        DEFAULT_TREE_NEAR_M,
        DEFAULT_TREE_MAX_DRAW_M
      );
      let nCount = 0;
      let fCount = 0;
      const nearMax = b.nearTrunk.instanceMatrix.count;

      for (let k = 0; k < nearIndices.length; k++) {
        const rec = b.items[nearIndices[k]];
        if (nCount < nearMax) {
          b.nearTrunk.setMatrixAt(nCount, rec.matrix);
          b.nearLeaf.setMatrixAt(nCount, rec.matrix);
          b.nearTrunk.setColorAt(nCount, rec.barkColor);
          b.nearLeaf.setColorAt(nCount, rec.canopyColor);
          nCount++;
        } else {
          b.farTrunk.setMatrixAt(fCount, rec.matrix);
          b.farLeaf.setMatrixAt(fCount, rec.matrix);
          b.farTrunk.setColorAt(fCount, rec.barkColor);
          b.farLeaf.setColorAt(fCount, rec.canopyColor);
          fCount++;
        }
      }

      for (let k = 0; k < farIndices.length; k++) {
        const rec = b.items[farIndices[k]];
        b.farTrunk.setMatrixAt(fCount, rec.matrix);
        b.farLeaf.setMatrixAt(fCount, rec.matrix);
        b.farTrunk.setColorAt(fCount, rec.barkColor);
        b.farLeaf.setColorAt(fCount, rec.canopyColor);
        fCount++;
      }

      b.nearTrunk.count = nCount;
      b.nearLeaf.count = nCount;
      b.nearTrunk.visible = nCount > 0;
      b.nearLeaf.visible = nCount > 0;
      b.farTrunk.count = fCount;
      b.farLeaf.count = fCount;
      b.farTrunk.visible = fCount > 0;
      b.farLeaf.visible = fCount > 0;

      if (nCount > 0) {
        b.nearTrunk.instanceMatrix.needsUpdate = true;
        b.nearLeaf.instanceMatrix.needsUpdate = true;
        if (b.nearTrunk.instanceColor) b.nearTrunk.instanceColor.needsUpdate = true;
        if (b.nearLeaf.instanceColor) b.nearLeaf.instanceColor.needsUpdate = true;
      }
      if (fCount > 0) {
        b.farTrunk.instanceMatrix.needsUpdate = true;
        b.farLeaf.instanceMatrix.needsUpdate = true;
        if (b.farTrunk.instanceColor) b.farTrunk.instanceColor.needsUpdate = true;
        if (b.farLeaf.instanceColor) b.farLeaf.instanceColor.needsUpdate = true;
      }
    }
  };

  updateLod(168, 38.5, true);

  return {
    handle: {
      updateLod,
      dispose: () => {
        for (const g of bucketGeometries) g.dispose();
        for (const m of Object.values(barkMats)) m.dispose();
        for (const m of Object.values(leafMats)) m.dispose();
        for (const m of Object.values(depthMats)) m.dispose();
      },
    },
    textures,
  };
}

function groundAndScaleMeshGeo(mesh: THREE.Mesh, targetHeightM = 1.0, sinkY = -0.02): THREE.BufferGeometry {
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const h = Math.max(0.03, bb.max.y - bb.min.y);
  const cx = (bb.min.x + bb.max.x) * 0.5;
  const cz = (bb.min.z + bb.max.z) * 0.5;
  geo.translate(-cx, -bb.min.y, -cz);
  const s = targetHeightM / h;
  geo.scale(s, s, s);
  geo.translate(0, sinkY, 0);
  geo.computeBoundingSphere();
  return geo;
}

function groundAndScaleByFootprintGeo(mesh: THREE.Mesh, targetWidthM = 0.9, sinkY = -0.02): THREE.BufferGeometry {
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const spanX = bb.max.x - bb.min.x;
  const spanY = bb.max.y - bb.min.y;
  const spanZ = bb.max.z - bb.min.z;
  const maxSpan = Math.max(0.03, spanX, spanY, spanZ);
  const cx = (bb.min.x + bb.max.x) * 0.5;
  const cz = (bb.min.z + bb.max.z) * 0.5;
  geo.translate(-cx, -bb.min.y, -cz);
  const s = targetWidthM / maxSpan;
  geo.scale(s, s, s);
  geo.translate(0, sinkY, 0);
  geo.computeBoundingSphere();
  return geo;
}

function buildMergedMultiMaterialFlower(
  root: THREE.Object3D,
  targetHeightM = 0.44,
  sinkY = -0.015,
  maxAnisotropy = 4,
  windTimeUniform: { value: number }
): { geometry: THREE.BufferGeometry; materials: THREE.MeshStandardMaterial[] } | null {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
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
    mat.side = THREE.DoubleSide;
    mat.roughness = Math.max(0.55, mat.roughness ?? 0.72);
    if (mat.map) {
      mat.alphaTest = 0.35;
      mat.transparent = false;
      mat.map.anisotropy = maxAnisotropy;
    }
    applyGroundSwayShader(mat, windTimeUniform, 0.24, 'v5_flower_sway');
    materials.push(mat);
  }

  const merged = mergeGeometries(partGeos, true);
  for (const g of partGeos) g.dispose();
  if (!merged) return null;

  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  const h = Math.max(0.05, bb.max.y - bb.min.y);
  const cx = (bb.min.x + bb.max.x) * 0.5;
  const cz = (bb.min.z + bb.max.z) * 0.5;
  merged.translate(-cx, -bb.min.y, -cz);
  const s = targetHeightM / h;
  merged.scale(s, s, s);
  merged.translate(0, sinkY, 0);
  merged.computeBoundingSphere();

  return { geometry: merged, materials };
}

function applyGroundSwayShader(
  mat: THREE.MeshStandardMaterial,
  windTimeUniform: { value: number },
  ampScale = 0.24,
  cacheKey = 'v5_ground_sway'
): void {
  mat.customProgramCacheKey = () => cacheKey;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTimeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float gPhase = uWindTime * 2.25 + instanceMatrix[3].x * 0.29 + instanceMatrix[3].z * 0.23;
  float hMask = clamp(max(0.0, transformed.y), 0.0, 2.0);
  float gBend = hMask * ${ampScale.toFixed(3)};
  transformed.x += sin(gPhase) * gBend;
  transformed.z += cos(gPhase * 0.86) * gBend * 0.68;
#endif`
      );
  };
}

/**
 * Traveling gust wind-wave + backlit tip translucency shader for zero-overdraw 3D grass blades.
 */
function applyAaaGrassBladeShader(
  mat: THREE.MeshStandardMaterial,
  windTimeUniform: { value: number },
  sunDirUniform: { value: THREE.Vector3 },
  sunColorUniform: { value: THREE.Color }
): void {
  mat.customProgramCacheKey = () => 'v7_aaa_grass_blade';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTimeUniform;
    shader.uniforms.uSunDir = sunDirUniform;
    shader.uniforms.uSunColor = sunColorUniform;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWindTime;
varying vec3 vGrassWorldPos;
varying float vGrassHeightFrac;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
float gHeightFrac = clamp(transformed.y / 0.54, 0.0, 1.0);
vGrassHeightFrac = gHeightFrac;
#ifdef USE_INSTANCING
  float wx = instanceMatrix[3].x;
  float wz = instanceMatrix[3].z;
  float gustWave = sin(uWindTime * 2.15 + wx * 0.14 + wz * 0.11) * 0.65
                 + sin(uWindTime * 3.70 + wx * 0.31 - wz * 0.27) * 0.35;
  float tipFlutter = sin(uWindTime * 5.2 + transformed.x * 4.5 + transformed.z * 4.5 + wx * 0.7) * 0.025;
  float bendMask = gHeightFrac * gHeightFrac;
  transformed.x += (gustWave * 0.14 + 0.03) * bendMask + tipFlutter * gHeightFrac;
  transformed.z += (gustWave * 0.09) * bendMask + tipFlutter * 0.6 * gHeightFrac;
  transformed.y -= abs(gustWave) * 0.035 * bendMask;
#endif`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
#ifdef USE_INSTANCING
  vGrassWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vGrassWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vGrassWorldPos;
varying float vGrassHeightFrac;`
      )
      .replace(
        '#include <opaque_fragment>',
        `vec3 viewDirG = normalize(cameraPosition - vGrassWorldPos);
vec3 sDirG = normalize(uSunDir);
float backG = pow(clamp(dot(viewDirG, -sDirG), 0.0, 1.0), 3.0);
float tipGlow = smoothstep(0.32, 1.0, vGrassHeightFrac);
outgoingLight += diffuseColor.rgb * uSunColor * (backG * 0.16 + 0.022) * tipGlow;
#include <opaque_fragment>`
      );
  };
}

export interface ShrubPlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  tint: THREE.Color;
}

export interface BoulderPlacement {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  rz: number;
  tint: THREE.Color;
}

export interface ReedPlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  tint: THREE.Color;
}

interface SpotItem {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  tiltX?: number;
  tiltZ?: number;
  tint: THREE.Color;
}

interface StaticCulledLayer {
  im: THREE.InstancedMesh;
  coords: { x: number; z: number }[];
  matrices: THREE.Matrix4[];
  colors: THREE.Color[] | null;
  maxDrawDistM: number;
  fadeStartRatio: number;
  shadowDistM: number;
  baseCastShadow: boolean;
}

interface StreamedItemPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
  r: number;
  g: number;
  b: number;
  variant: number;
  layer: 'blade' | 'short' | 'grass' | 'med' | 'bermuda' | 'dandelion' | 'periwinkle' | 'celandine' | 'nettle' | 'weed' | 'flower';
}

interface CellCacheEntry {
  key: string;
  points: StreamedItemPoint[];
}

interface SegmentBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  ax: number;
  az: number;
  vx: number;
  vz: number;
  l2: number;
  halfR: number;
}

/**
 * Asynchronously loads 23 photoreal Poly Haven & CC0 GLTF/GLB botanical assets from /public/assets/foliage/
 * plus custom 3D curved grass-blade clusters, and operates a 24m x 24m camera-centered dense carpet streamer
 * and distance-culled static woodland/hedgerow/tree-base undergrowth flora.
 */
export async function loadAaaGroundCoverAndProps(
  scene: THREE.Scene,
  world: RendaWorldDataset,
  colliders: BuildingCollider[],
  shrubs: ShrubPlacement[],
  boulders: BoulderPlacement[],
  reeds: ReedPlacement[],
  windTimeUniform: { value: number },
  sunDirUniform: { value: THREE.Vector3 },
  sunColorUniform: { value: THREE.Color },
  isSoftwareGl: boolean,
  maxAnisotropy: number,
  flowerbeds: [number, number][] = [],
  treeAnchors: { x: number; z: number }[] = []
): Promise<AaaGroundCoverHandle> {
  const loader = new GLTFLoader();
  const disposables: { dispose: () => void }[] = [];
  const dummy = new THREE.Object3D();
  const scratchMat = new THREE.Matrix4();
  const scratchScale = new THREE.Matrix4();
  const scratchColor = new THREE.Color();
  const rand = makeSeededRand(8842);

  // Precompute fast spatial segment bounds for O(1)-ish cell blocking tests
  const roadSegs: SegmentBox[] = [];
  for (const r of world.roads) {
    if (r.pts.length < 2) continue;
    const halfR = r.width * 0.5 + 0.45;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      const [bx, bz] = r.pts[i + 1];
      const vx = bx - ax;
      const vz = bz - az;
      const l2 = vx * vx + vz * vz;
      if (l2 < 0.01) continue;
      roadSegs.push({
        minX: Math.min(ax, bx) - halfR,
        maxX: Math.max(ax, bx) + halfR,
        minZ: Math.min(az, bz) - halfR,
        maxZ: Math.max(az, bz) + halfR,
        ax,
        az,
        vx,
        vz,
        l2,
        halfR,
      });
    }
  }

  const riverSegs: SegmentBox[] = [];
  for (const ww of world.waterways) {
    if (ww.pts.length < 2) continue;
    const halfR = ww.width * 0.5 + 0.25;
    for (let i = 0; i < ww.pts.length - 1; i++) {
      const [ax, az] = ww.pts[i];
      const [bx, bz] = ww.pts[i + 1];
      const vx = bx - ax;
      const vz = bz - az;
      const l2 = vx * vx + vz * vz;
      if (l2 < 0.01) continue;
      riverSegs.push({
        minX: Math.min(ax, bx) - halfR,
        maxX: Math.max(ax, bx) + halfR,
        minZ: Math.min(az, bz) - halfR,
        maxZ: Math.max(az, bz) + halfR,
        ax,
        az,
        vx,
        vz,
        l2,
        halfR,
      });
    }
  }

  const isBlockedGlobal = (gx: number, gz: number, roadPad = 0.52) => {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (gx >= c.minX - 0.85 && gx <= c.maxX + 0.85 && gz >= c.minZ - 0.85 && gz <= c.maxZ + 0.85) {
        return true;
      }
    }
    for (let i = 0; i < roadSegs.length; i++) {
      const s = roadSegs[i];
      const pad = s.halfR + roadPad - 0.45;
      if (gx < s.minX - roadPad || gx > s.maxX + roadPad || gz < s.minZ - roadPad || gz > s.maxZ + roadPad) continue;
      const t = Math.max(0, Math.min(1, ((gx - s.ax) * s.vx + (gz - s.az) * s.vz) / s.l2));
      if (Math.hypot(gx - (s.ax + t * s.vx), gz - (s.az + t * s.vz)) < pad) return true;
    }
    for (let i = 0; i < riverSegs.length; i++) {
      const s = riverSegs[i];
      if (gx < s.minX || gx > s.maxX || gz < s.minZ || gz > s.maxZ) continue;
      const t = Math.max(0, Math.min(1, ((gx - s.ax) * s.vx + (gz - s.az) * s.vz) / s.l2));
      if (Math.hypot(gx - (s.ax + t * s.vx), gz - (s.az + t * s.vz)) < s.halfR) return true;
    }
    return false;
  };

  const [
    grassGltf,
    grassMedGltf,
    bermudaGltf,
    fernGltf,
    shrub02Gltf,
    shrub03Gltf,
    shrub04Gltf,
    sedgeGltf,
    nettleGltf,
    celandineGltf,
    weedGltf,
    dandelionGltf,
    periwinkleGltf,
    mossGltf,
    stumpGltf,
    branchesGltf,
    deadTrunkGltf,
    rockGltf,
    rock07Gltf,
    flWhiteGltf,
    flYellowGltf,
    flBlueGltf,
  ] = await Promise.all([
    loader.loadAsync('/assets/foliage/models/grass.glb'),
    loader.loadAsync('/assets/foliage/grass_medium_01/grass_medium_01_1k.gltf'),
    loader.loadAsync('/assets/foliage/grass_bermuda_01/grass_bermuda_01_1k.gltf'),
    loader.loadAsync('/assets/foliage/fern_02/fern_02_1k.gltf'),
    loader.loadAsync('/assets/foliage/shrub_02/shrub_02_1k.gltf'),
    loader.loadAsync('/assets/foliage/shrub_03/shrub_03_1k.gltf'),
    loader.loadAsync('/assets/foliage/shrub_04/shrub_04_1k.gltf'),
    loader.loadAsync('/assets/foliage/grass_medium_02/grass_medium_02_1k.gltf'),
    loader.loadAsync('/assets/foliage/nettle_plant/nettle_plant_1k.gltf'),
    loader.loadAsync('/assets/foliage/celandine_01/celandine_01_1k.gltf'),
    loader.loadAsync('/assets/foliage/weed_plant_02/weed_plant_02_1k.gltf'),
    loader.loadAsync('/assets/foliage/dandelion_01/dandelion_01_1k.gltf'),
    loader.loadAsync('/assets/foliage/periwinkle_plant/periwinkle_plant_1k.gltf'),
    loader.loadAsync('/assets/foliage/moss_01/moss_01_1k.gltf'),
    loader.loadAsync('/assets/foliage/tree_stump_01/tree_stump_01_1k.gltf'),
    loader.loadAsync('/assets/foliage/dry_branches_medium_01/dry_branches_medium_01_1k.gltf'),
    loader.loadAsync('/assets/foliage/dead_tree_trunk/dead_tree_trunk_1k.gltf'),
    loader.loadAsync('/assets/foliage/rock_moss_set_01/rock_moss_set_01_1k.gltf'),
    loader.loadAsync('/assets/foliage/rock_07/rock_07_1k.gltf'),
    loader.loadAsync('/assets/foliage/models/flower_white.glb'),
    loader.loadAsync('/assets/foliage/models/flower_yellow.glb'),
    loader.loadAsync('/assets/foliage/models/flower_blue.glb'),
  ]);

  const extractMeshes = (root: THREE.Object3D): THREE.Mesh[] => {
    root.updateMatrixWorld(true);
    const list: THREE.Mesh[] = [];
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) list.push(obj as THREE.Mesh);
    });
    return list;
  };

  // =========================================================================
  // 1. STREAMED CAMERA-CENTERED DENSE 3D GRASS BLADES & WILDFLOWER CARPET
  // =========================================================================
  const bladeGrassGeo = createCurvedGrassClusterGeometry(24, 0.72, 0.16, 0.50);
  const bladeGrassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  applyAaaGrassBladeShader(bladeGrassMat, windTimeUniform, sunDirUniform, sunColorUniform);
  disposables.push(bladeGrassGeo, bladeGrassMat);

  const MAX_BLADE_GRASS = isSoftwareGl ? 2800 : 22000;
  const bladeGrassIm = new THREE.InstancedMesh(bladeGrassGeo, bladeGrassMat, MAX_BLADE_GRASS);
  bladeGrassIm.frustumCulled = false;
  bladeGrassIm.receiveShadow = true;
  bladeGrassIm.setColorAt(0, new THREE.Color(1, 1, 1));
  if (bladeGrassIm.instanceColor) bladeGrassIm.instanceColor.needsUpdate = true;
  bladeGrassIm.count = 0;
  scene.add(bladeGrassIm);

  // Low-profile 3D short-cut turf clusters filling road verges, trimmed yards, and non-tall-grass zones
  const shortTurfGeo = createCurvedGrassClusterGeometry(10, 0.62, 0.06, 0.14);
  const MAX_SHORT_TURF = isSoftwareGl ? 2200 : 12000;
  const shortTurfIm = new THREE.InstancedMesh(shortTurfGeo, bladeGrassMat, MAX_SHORT_TURF);
  shortTurfIm.frustumCulled = false;
  shortTurfIm.receiveShadow = true;
  shortTurfIm.setColorAt(0, new THREE.Color(1, 1, 1));
  if (shortTurfIm.instanceColor) shortTurfIm.instanceColor.needsUpdate = true;
  shortTurfIm.count = 0;
  disposables.push(shortTurfGeo);
  scene.add(shortTurfIm);

  const grassSrc = extractMeshes(grassGltf.scene)[0];
  const grassGeo = groundAndScaleMeshGeo(grassSrc, 0.54, -0.025);
  const srcGrassMat = (Array.isArray(grassSrc.material) ? grassSrc.material[0] : grassSrc.material) as THREE.MeshStandardMaterial;
  if (srcGrassMat.map) srcGrassMat.map.anisotropy = maxAnisotropy;
  const grassMat = new THREE.MeshStandardMaterial({
    map: srcGrassMat.map,
    alphaTest: 0.38,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 0.88,
    metalness: 0.0,
    color: 0x8a9274,
  });
  applyGroundSwayShader(grassMat, windTimeUniform, 0.25, 'v6_grass_sway');
  disposables.push(grassGeo, grassMat);

  const MAX_GRASS_STREAM = isSoftwareGl ? 2800 : 12000;
  const grassIm = new THREE.InstancedMesh(grassGeo, grassMat, MAX_GRASS_STREAM);
  grassIm.frustumCulled = false;
  grassIm.receiveShadow = true;
  grassIm.setColorAt(0, new THREE.Color(1, 1, 1));
  if (grassIm.instanceColor) grassIm.instanceColor.needsUpdate = true;
  grassIm.count = 0;
  scene.add(grassIm);

  const createStreamVariantMeshes = (
    meshes: THREE.Mesh[],
    capacityPerVariant: number,
    opts: {
      heightM?: number;
      footprintM?: number;
      sinkY: number;
      alphaTest?: number;
      roughness?: number;
      tintHex?: number;
      swayAmp: number;
      swayKey: string;
    }
  ): THREE.InstancedMesh[] => {
    if (meshes.length === 0) return [];
    const baseMat = (Array.isArray(meshes[0].material) ? meshes[0].material[0] : meshes[0].material) as THREE.MeshStandardMaterial;
    const mat = baseMat.clone();
    mat.side = THREE.DoubleSide;
    mat.color.setHex(opts.tintHex ?? 0xffffff);
    if (opts.roughness !== undefined) mat.roughness = opts.roughness;
    if (opts.alphaTest !== undefined) {
      mat.alphaTest = opts.alphaTest;
      mat.transparent = false;
    }
    if (mat.map) mat.map.anisotropy = maxAnisotropy;
    if (opts.swayAmp > 0) applyGroundSwayShader(mat, windTimeUniform, opts.swayAmp, opts.swayKey);
    disposables.push(mat);

    const out: THREE.InstancedMesh[] = [];
    for (const m of meshes) {
      const geo =
        opts.footprintM !== undefined
          ? groundAndScaleByFootprintGeo(m, opts.footprintM, opts.sinkY)
          : groundAndScaleMeshGeo(m, opts.heightM ?? 0.5, opts.sinkY);
      disposables.push(geo);
      const im = new THREE.InstancedMesh(geo, mat, capacityPerVariant);
      im.frustumCulled = false;
      im.receiveShadow = true;
      im.setColorAt(0, new THREE.Color(1, 1, 1));
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.count = 0;
      scene.add(im);
      out.push(im);
    }
    return out;
  };

  const medGrassMeshes = extractMeshes(grassMedGltf.scene)
    .filter((m) => {
      const tris = (m.geometry.index?.count ?? 0) / 3;
      return tris >= 240 && tris <= 900;
    })
    .slice(0, 4);
  const medGrassIms = createStreamVariantMeshes(medGrassMeshes, isSoftwareGl ? 700 : 2400, {
    footprintM: 0.68,
    sinkY: -0.02,
    alphaTest: 0.34,
    roughness: 0.86,
    tintHex: 0x7e886c,
    swayAmp: 0.2,
    swayKey: 'v6_med_grass',
  });

  const bermudaMeshes = extractMeshes(bermudaGltf.scene)
    .filter((m) => {
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!;
      const dx = bb.max.x - bb.min.x;
      const dy = bb.max.y - bb.min.y;
      const dz = bb.max.z - bb.min.z;
      return Math.max(dx, dz) >= dy * 0.95;
    })
    .sort((a, b) => (b.geometry.index?.count ?? 0) - (a.geometry.index?.count ?? 0))
    .slice(0, 4);
  const bermudaIms = createStreamVariantMeshes(bermudaMeshes, isSoftwareGl ? 900 : 3000, {
    footprintM: 0.72,
    sinkY: -0.015,
    alphaTest: 0.32,
    roughness: 0.88,
    tintHex: 0x7c8769,
    swayAmp: 0.1,
    swayKey: 'v6_bermuda_grass',
  });

  const herbCap = isSoftwareGl ? 150 : 350;
  const dandelionMeshes = extractMeshes(dandelionGltf.scene)
    .sort((a, b) => (a.geometry.index?.count ?? 0) - (b.geometry.index?.count ?? 0))
    .slice(0, 3);
  const dandelionIms = createStreamVariantMeshes(dandelionMeshes, herbCap, {
    footprintM: 0.38,
    sinkY: -0.015,
    alphaTest: 0.34,
    roughness: 0.82,
    tintHex: 0xb6bfa6,
    swayAmp: 0.16,
    swayKey: 'v7_dandelion',
  });

  const periwinkleMeshes = extractMeshes(periwinkleGltf.scene)
    .sort((a, b) => (a.geometry.index?.count ?? 0) - (b.geometry.index?.count ?? 0))
    .slice(0, 3);
  const periwinkleIms = createStreamVariantMeshes(periwinkleMeshes, herbCap, {
    footprintM: 0.48,
    sinkY: -0.015,
    alphaTest: 0.34,
    roughness: 0.82,
    tintHex: 0xb4bea4,
    swayAmp: 0.14,
    swayKey: 'v7_periwinkle',
  });

  const celandineMeshes = extractMeshes(celandineGltf.scene)
    .sort((a, b) => (a.geometry.index?.count ?? 0) - (b.geometry.index?.count ?? 0))
    .slice(0, 3);
  const celandineIms = createStreamVariantMeshes(celandineMeshes, herbCap, {
    footprintM: 0.44,
    sinkY: -0.015,
    alphaTest: 0.34,
    roughness: 0.82,
    tintHex: 0xb6bfa6,
    swayAmp: 0.16,
    swayKey: 'v6_celandine',
  });

  const nettleMeshes = extractMeshes(nettleGltf.scene)
    .sort((a, b) => (a.geometry.index?.count ?? 0) - (b.geometry.index?.count ?? 0))
    .slice(0, 3);
  const nettleIms = createStreamVariantMeshes(nettleMeshes, herbCap, {
    heightM: 0.54,
    sinkY: -0.02,
    alphaTest: 0.34,
    roughness: 0.84,
    tintHex: 0xb0baa0,
    swayAmp: 0.18,
    swayKey: 'v6_nettle',
  });

  const weedMeshes = extractMeshes(weedGltf.scene)
    .sort((a, b) => (a.geometry.index?.count ?? 0) - (b.geometry.index?.count ?? 0))
    .slice(0, 3);
  const weedIms = createStreamVariantMeshes(weedMeshes, herbCap, {
    footprintM: 0.52,
    sinkY: -0.015,
    alphaTest: 0.34,
    roughness: 0.84,
    tintHex: 0xb0baa0,
    swayAmp: 0.14,
    swayKey: 'v6_weed',
  });

  const flowerPacks = [flWhiteGltf, flYellowGltf, flBlueGltf];
  const streamedFlowerIms: THREE.InstancedMesh[] = [];
  const staticFlowerCoords: { x: number; y: number; z: number; scale: number }[] = [];
  const fernCoords: { x: number; y: number; z: number; scale: number; tint: THREE.Color }[] = [];

  for (const [fx, fz] of flowerbeds) {
    const fy = groundHeightAt(world, fx, fz) + 0.32;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + rand() * 0.45;
      const r = 0.1 + rand() * 0.55;
      staticFlowerCoords.push({
        x: fx + Math.cos(a) * r,
        y: fy,
        z: fz + Math.sin(a) * r,
        scale: 0.72 + rand() * 0.42,
      });
    }
    for (let j = 0; j < 2; j++) {
      const a = j * Math.PI + rand() * 0.8;
      fernCoords.push({
        x: fx + Math.cos(a) * 0.26,
        y: fy - 0.03,
        z: fz + Math.sin(a) * 0.26,
        scale: 0.52 + rand() * 0.22,
        tint: new THREE.Color().setHSL(0.26, 0.28, 0.78),
      });
    }
  }

  for (let fi = 0; fi < flowerPacks.length; fi++) {
    const built = buildMergedMultiMaterialFlower(
      flowerPacks[fi].scene,
      0.46,
      -0.015,
      maxAnisotropy,
      windTimeUniform
    );
    if (!built) continue;
    for (const fm of built.materials) {
      if (fm instanceof THREE.MeshStandardMaterial) {
        if (fm.color.b > fm.color.g * 1.45 && fm.color.b > 0.35) {
          fm.color.lerp(new THREE.Color(0x4e5864), 0.46);
        }
        fm.color.multiplyScalar(0.36);
        fm.roughness = Math.max(0.88, fm.roughness);
      }
    }
    disposables.push(built.geometry, ...built.materials);

    // Streamed meadow wildflowers
    const streamIm = new THREE.InstancedMesh(built.geometry, built.materials, 750);
    streamIm.frustumCulled = false;
    streamIm.count = 0;
    scene.add(streamIm);
    streamedFlowerIms.push(streamIm);

    // Static planter wildflowers
    const planterSlice = staticFlowerCoords.filter((_, idx) => idx % flowerPacks.length === fi);
    if (planterSlice.length > 0) {
      const staticIm = new THREE.InstancedMesh(built.geometry, built.materials, planterSlice.length);
      for (let i = 0; i < planterSlice.length; i++) {
        const fl = planterSlice[i];
        dummy.position.set(fl.x, fl.y - 0.01, fl.z);
        dummy.rotation.set((rand() - 0.5) * 0.16, rand() * Math.PI * 2, (rand() - 0.5) * 0.16);
        dummy.scale.setScalar(fl.scale);
        dummy.updateMatrix();
        staticIm.setMatrixAt(i, dummy.matrix);
      }
      staticIm.instanceMatrix.needsUpdate = true;
      staticIm.computeBoundingSphere();
      scene.add(staticIm);
    }
  }

  // Lazy-cached 24m x 24m spatial cell generator for dense gapless grass & wildflowers
  const CELL_SIZE_M = 24;
  const MAX_CACHED_CELLS = 360;
  const cellCache = new Map<string, CellCacheEntry>();
  const worldMinX = -world.meta.halfW + 14;
  const worldMaxX = world.meta.halfW - 14;
  const worldMinZ = -world.meta.halfH + 14;
  const worldMaxZ = world.meta.halfH - 14;

  const getOrBuildCell = (cx: number, cz: number, key: string): StreamedItemPoint[] => {
    const cached = cellCache.get(key);
    if (cached) {
      cellCache.delete(key);
      cellCache.set(key, cached);
      return cached.points;
    }

    const minX = cx * CELL_SIZE_M;
    const maxX = minX + CELL_SIZE_M;
    const minZ = cz * CELL_SIZE_M;
    const maxZ = minZ + CELL_SIZE_M;

    const points: StreamedItemPoint[] = [];
    if (maxX >= worldMinX && minX <= worldMaxX && maxZ >= worldMinZ && minZ <= worldMaxZ) {
      // Pre-filter colliders, roads & waterways intersecting this 24m cell
      const cellCols: BuildingCollider[] = [];
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        if (c.maxX + 1.0 >= minX && c.minX - 1.0 <= maxX && c.maxZ + 1.0 >= minZ && c.minZ - 1.0 <= maxZ) {
          cellCols.push(c);
        }
      }
      const cellRoads: SegmentBox[] = [];
      for (let i = 0; i < roadSegs.length; i++) {
        const s = roadSegs[i];
        if (s.maxX >= minX && s.minX <= maxX && s.maxZ >= minZ && s.minZ <= maxZ) {
          cellRoads.push(s);
        }
      }
      const cellRivers: SegmentBox[] = [];
      for (let i = 0; i < riverSegs.length; i++) {
        const s = riverSegs[i];
        if (s.maxX >= minX && s.minX <= maxX && s.maxZ >= minZ && s.minZ <= maxZ) {
          cellRivers.push(s);
        }
      }

      const getRoadEdgeMargin = (gx: number, gz: number): number => {
        let minMargin = Infinity;
        for (let i = 0; i < cellRoads.length; i++) {
          const s = cellRoads[i];
          if (gx < s.minX - 2.5 || gx > s.maxX + 2.5 || gz < s.minZ - 2.5 || gz > s.maxZ + 2.5) continue;
          const t = Math.max(0, Math.min(1, ((gx - s.ax) * s.vx + (gz - s.az) * s.vz) / s.l2));
          const dist = Math.hypot(gx - (s.ax + t * s.vx), gz - (s.az + t * s.vz));
          const m = dist - (s.halfR - 0.45);
          if (m < minMargin) minMargin = m;
        }
        return minMargin;
      };

      const isCellBlocked = (gx: number, gz: number) => {
        for (let i = 0; i < cellCols.length; i++) {
          const c = cellCols[i];
          if (gx >= c.minX - 0.8 && gx <= c.maxX + 0.8 && gz >= c.minZ - 0.8 && gz <= c.maxZ + 0.8) {
            return true;
          }
        }
        for (let i = 0; i < cellRivers.length; i++) {
          const s = cellRivers[i];
          const t = Math.max(0, Math.min(1, ((gx - s.ax) * s.vx + (gz - s.az) * s.vz) / s.l2));
          if (Math.hypot(gx - (s.ax + t * s.vx), gz - (s.az + t * s.vz)) < s.halfR) return true;
        }
        return false;
      };

      const cellRand = makeSeededRand(hashCellCoords(cx, cz));
      const tmpC = new THREE.Color();

      // 16 x 16 jittered grid -> ~256 candidate micro-clusters (~1.5m spacing)
      const gridN = 16;
      const stepM = CELL_SIZE_M / gridN;
      for (let gzIdx = 0; gzIdx < gridN; gzIdx++) {
        for (let gxIdx = 0; gxIdx < gridN; gxIdx++) {
          const bx = minX + (gxIdx + 0.12 + cellRand() * 0.76) * stepM;
          const bz = minZ + (gzIdx + 0.12 + cellRand() * 0.76) * stepM;
          if (bx < worldMinX || bx > worldMaxX || bz < worldMinZ || bz > worldMaxZ) continue;
          if (isCellBlocked(bx, bz)) continue;
          const roadMargin = getRoadEdgeMargin(bx, bz);
          const vergeWeight = Number.isFinite(roadMargin) ? computeVergeWeedDensity(bx, bz, roadMargin) : 0;
          const inRoadInterior = roadMargin < -0.22;
          const inRoadShoulder = roadMargin < 0.15;
          if (inRoadInterior && vergeWeight < 0.25) continue;
          const by = groundHeightAt(world, bx, bz);
          if (by < 0.75) continue;

          // Patchy Baltic meadow tinting: warm olive-moss greens blended with subtle dry straw
          const macroPatch = deterministicSpatialNoise2D(bx * 0.068 + 11.3, bz * 0.068 - 5.9);
          const finePatch = deterministicSpatialNoise2D(bx * 0.27 - 3.1, bz * 0.27 + 9.4);
          const strawMix = Math.max(0, (macroPatch - 0.54) * 1.35);
          const baseHue = 0.222 - strawMix * 0.078 + (finePatch - 0.5) * 0.025;
          const baseSat = 0.32 - strawMix * 0.08;

          // Dense zero-overdraw 3D curved grass-blade carpet (3-4 overlapping clusters per 1.5m cell)
          const bladeCount = inRoadShoulder ? (vergeWeight > 0.25 ? 2 : 0) : 3 + (cellRand() < 0.65 ? 1 : 0);
          for (let k = 0; k < bladeCount; k++) {
            const spread = inRoadShoulder ? 0.54 : 1.44;
            const ox = k === 0 ? bx : bx + (cellRand() - 0.5) * spread;
            const oz = k === 0 ? bz : bz + (cellRand() - 0.5) * spread;
            if (k > 0 && getRoadEdgeMargin(ox, oz) < -0.18) continue;
            const oy = k === 0 ? by : groundHeightAt(world, ox, oz);
            const sc = (inRoadShoulder ? 0.65 : 0.90) + cellRand() * (inRoadShoulder ? 0.42 : 0.64);
            tmpC.setHSL(
              baseHue + (cellRand() - 0.5) * 0.028,
              baseSat + cellRand() * 0.09,
              0.145 + cellRand() * 0.07 + strawMix * 0.025
            );
            points.push({
              x: ox,
              y: oy,
              z: oz,
              yaw: cellRand() * Math.PI * 2,
              sx: sc * 1.12,
              sy: sc * (0.90 + cellRand() * 0.28),
              sz: sc * 1.12,
              r: tmpC.r,
              g: tmpC.g,
              b: tmpC.b,
              variant: 0,
              layer: 'blade',
            });
          }

          // Fine seedhead & tuft silhouette accents layered cleanly inside the 3D blade carpet
          const tufts = inRoadShoulder ? (vergeWeight > 0.34 ? 1 : 0) : 1 + (cellRand() < 0.58 ? 1 : 0);
          for (let k = 0; k < tufts; k++) {
            const spread = inRoadShoulder ? 0.55 : 1.45;
            const ox = bx + (cellRand() - 0.5) * spread;
            const oz = bz + (cellRand() - 0.5) * spread;
            if (getRoadEdgeMargin(ox, oz) < -0.18) continue;
            const oy = groundHeightAt(world, ox, oz);
            const sc = (inRoadShoulder ? 0.62 : 0.85) + cellRand() * (inRoadShoulder ? 0.42 : 0.72);
            tmpC.setHSL(
              baseHue + (cellRand() - 0.5) * 0.032,
              baseSat + cellRand() * 0.1,
              0.11 + cellRand() * 0.06 + strawMix * 0.02
            );
            points.push({
              x: ox,
              y: oy - 0.025,
              z: oz,
              yaw: cellRand() * Math.PI * 2,
              sx: sc * 1.62,
              sy: sc * 0.94,
              sz: sc * 1.62,
              r: tmpC.r,
              g: tmpC.g,
              b: tmpC.b,
              variant: 0,
              layer: 'grass',
            });
          }

          // Broad meadow clumps (matched olive-moss luminance band so zero chalky tufts stick out)
          if (!inRoadShoulder && cellRand() < 0.72) {
            const sc = 0.88 + cellRand() * 0.68;
            tmpC.setHSL(
              baseHue + (cellRand() - 0.5) * 0.028,
              0.28 + cellRand() * 0.08,
              0.135 + cellRand() * 0.055 + strawMix * 0.015
            );
            points.push({
              x: bx + (cellRand() - 0.5) * 1.0,
              y: by - 0.025,
              z: bz + (cellRand() - 0.5) * 1.0,
              yaw: cellRand() * Math.PI * 2,
              sx: sc * 1.24,
              sy: sc * 0.94,
              sz: sc * 1.24,
              r: tmpC.r,
              g: tmpC.g,
              b: tmpC.b,
              variant: (gxIdx + gzIdx) % Math.max(1, medGrassIms.length),
              layer: 'med',
            });
          }

          // Dense low-profile 3D short-cut turf clusters for verges, trimmed yards & short-grass areas
          const nearYard = !inRoadShoulder && Math.abs(roadMargin) < 4.5;
          const shortCount = inRoadShoulder ? (vergeWeight > 0.1 ? 2 : 1) : nearYard ? 2 : 1;
          for (let k = 0; k < shortCount; k++) {
            const ox = k === 0 && bladeCount === 0 ? bx : bx + (cellRand() - 0.5) * (inRoadShoulder ? 0.65 : 1.38);
            const oz = k === 0 && bladeCount === 0 ? bz : bz + (cellRand() - 0.5) * (inRoadShoulder ? 0.65 : 1.38);
            if (getRoadEdgeMargin(ox, oz) < -0.22) continue;
            const oy = groundHeightAt(world, ox, oz);
            const sc = 0.85 + cellRand() * 0.45;
            tmpC.setHSL(
              baseHue + (cellRand() - 0.5) * 0.025,
              baseSat + 0.04 + cellRand() * 0.08,
              0.15 + cellRand() * 0.06
            );
            points.push({
              x: ox,
              y: oy,
              z: oz,
              yaw: cellRand() * Math.PI * 2,
              sx: sc * 1.18,
              sy: sc,
              sz: sc * 1.18,
              r: tmpC.r,
              g: tmpC.g,
              b: tmpC.b,
              variant: 0,
              layer: 'short',
            });
          }

          // Low spreading creeping turf carpets (deep mossy olive lightness, creeping onto road edges)
          const bermudaChance = inRoadShoulder ? Math.max(0.45, vergeWeight * 0.94) : 0.94;
          if (cellRand() < bermudaChance) {
            const sc = (inRoadShoulder ? 0.76 : 0.96) + cellRand() * (inRoadShoulder ? 0.45 : 0.68);
            tmpC.setHSL(
              baseHue + (cellRand() - 0.5) * 0.03,
              0.28 + cellRand() * 0.08,
              0.135 + cellRand() * 0.055
            );
            points.push({
              x: bx + (cellRand() - 0.5) * (inRoadShoulder ? 0.45 : 1.05),
              y: by - 0.02,
              z: bz + (cellRand() - 0.5) * (inRoadShoulder ? 0.45 : 1.05),
              yaw: cellRand() * Math.PI * 2,
              sx: sc * 1.24,
              sy: sc * 0.86,
              sz: sc * 1.24,
              r: tmpC.r,
              g: tmpC.g,
              b: tmpC.b,
              variant: (gxIdx * 3 + gzIdx) % Math.max(1, bermudaIms.length),
              layer: 'bermuda',
            });
          }

          // Wild herbs, roadside weeds & meadow wildflowers (extra weed/nettle encroachment on road verges)
          const hRoll = cellRand();
          const weedBoost = vergeWeight > 0.25 ? 0.18 : 0;
          if (!inRoadShoulder && hRoll < 0.045) {
            const sc = 0.78 + cellRand() * 0.45;
            tmpC.setHSL(0.24, 0.14, 0.48 + cellRand() * 0.11);
            points.push({
              x: bx,
              y: by,
              z: bz,
              yaw: cellRand() * Math.PI * 2,
              sx: sc * 1.15,
              sy: sc,
              sz: sc * 1.15,
              r: tmpC.r,
              g: tmpC.g,
              b: tmpC.b,
              variant: (gxIdx + gzIdx) % Math.max(1, dandelionIms.length),
              layer: 'dandelion',
            });
          } else if (!inRoadShoulder && hRoll < 0.085) {
            const sc = 0.82 + cellRand() * 0.5;
            tmpC.setHSL(0.24, 0.14, 0.48 + cellRand() * 0.11);
            points.push({
              x: bx,
              y: by,
              z: bz,
              yaw: cellRand() * Math.PI * 2,
              sx: sc * 1.18,
              sy: sc,
              sz: sc * 1.18,
              r: tmpC.r,
              g: tmpC.g,
              b: tmpC.b,
              variant: (gxIdx + gzIdx) % Math.max(1, periwinkleIms.length),
              layer: 'periwinkle',
            });
          } else if (!inRoadShoulder && hRoll < 0.12) {
            const sc = 0.8 + cellRand() * 0.5;
            tmpC.setHSL(0.23, 0.14, 0.48 + cellRand() * 0.11);
            points.push({
              x: bx,
              y: by,
              z: bz,
              yaw: cellRand() * Math.PI * 2,
              sx: sc * 1.16,
              sy: sc,
              sz: sc * 1.16,
              r: tmpC.r,
              g: tmpC.g,
              b: tmpC.b,
              variant: (gxIdx + gzIdx) % Math.max(1, celandineIms.length),
              layer: 'celandine',
            });
          } else if (hRoll < 0.15 + weedBoost * 0.45 && (!inRoadInterior || vergeWeight > 0.42)) {
            const sc = 0.72 + cellRand() * 0.48;
            tmpC.setHSL(0.24, 0.15, 0.46 + cellRand() * 0.12);
            points.push({
              x: bx,
              y: by,
              z: bz,
              yaw: cellRand() * Math.PI * 2,
              sx: sc * 1.12,
              sy: sc * (inRoadShoulder ? 0.82 : 1.0),
              sz: sc * 1.12,
              r: tmpC.r,
              g: tmpC.g,
              b: tmpC.b,
              variant: (gxIdx + gzIdx) % Math.max(1, nettleIms.length),
              layer: 'nettle',
            });
          } else if (hRoll < 0.18 + weedBoost && (!inRoadInterior || vergeWeight > 0.35)) {
            const sc = 0.74 + cellRand() * 0.48;
            tmpC.setHSL(0.23, 0.15, 0.46 + cellRand() * 0.12);
            points.push({
              x: bx,
              y: by,
              z: bz,
              yaw: cellRand() * Math.PI * 2,
              sx: sc * 1.12,
              sy: sc * (inRoadShoulder ? 0.78 : 1.0),
              sz: sc * 1.12,
              r: tmpC.r,
              g: tmpC.g,
              b: tmpC.b,
              variant: (gxIdx + gzIdx) % Math.max(1, weedIms.length),
              layer: 'weed',
            });
          } else if (!inRoadShoulder && hRoll < 0.198) {
            const sc = 0.58 + cellRand() * 0.36;
            points.push({
              x: bx,
              y: by - 0.01,
              z: bz,
              yaw: cellRand() * Math.PI * 2,
              sx: sc,
              sy: sc,
              sz: sc,
              r: 0.78,
              g: 0.76,
              b: 0.68,
              variant: (gxIdx * 2 + gzIdx) % Math.max(1, streamedFlowerIms.length),
              layer: 'flower',
            });
          }
        }
      }
    }

    cellCache.set(key, { key, points });
    if (cellCache.size > MAX_CACHED_CELLS) {
      const oldestKey = cellCache.keys().next().value;
      if (oldestKey !== undefined) cellCache.delete(oldestKey);
    }
    return points;
  };

  // =========================================================================
  // 2. STATIC LANDMARK FLORA WITH PER-CATEGORY DRAW DISTANCE CULLING
  // =========================================================================
  const culledStaticLayers: StaticCulledLayer[] = [];

  const registerCulledStaticVariants = (
    meshes: THREE.Mesh[],
    items: SpotItem[],
    opts: {
      heightM?: number;
      footprintM?: number;
      sinkY: number;
      xzMult?: number;
      alphaTest?: number;
      roughness?: number;
      swayAmp?: number;
      swayKey?: string;
      useFoliageSubsurface?: boolean;
      castShadow?: boolean;
      maxDrawDistM: number;
      shadowDistM: number;
      fadeStartRatio?: number;
    }
  ) => {
    if (meshes.length === 0 || items.length === 0) return;
    const baseMat = (Array.isArray(meshes[0].material) ? meshes[0].material[0] : meshes[0].material) as THREE.MeshStandardMaterial;
    const mat = baseMat.clone();
    mat.side = THREE.DoubleSide;
    mat.color.setHex(0xffffff);
    if (opts.roughness !== undefined) mat.roughness = opts.roughness;
    if (opts.alphaTest !== undefined) {
      mat.alphaTest = opts.alphaTest;
      mat.transparent = false;
    }
    if (mat.map) mat.map.anisotropy = maxAnisotropy;
    if (opts.useFoliageSubsurface) {
      enhanceOverhaulFoliageMaterial(mat, windTimeUniform, sunDirUniform, sunColorUniform);
    } else if (opts.swayAmp && opts.swayAmp > 0) {
      applyGroundSwayShader(mat, windTimeUniform, opts.swayAmp, opts.swayKey ?? 'v6_sway');
    }
    disposables.push(mat);

    const perVar = Math.ceil(items.length / meshes.length);
    for (let vi = 0; vi < meshes.length; vi++) {
      const slice = items.slice(vi * perVar, (vi + 1) * perVar);
      if (slice.length === 0) continue;
      const geo =
        opts.footprintM !== undefined
          ? groundAndScaleByFootprintGeo(meshes[vi], opts.footprintM, opts.sinkY)
          : groundAndScaleMeshGeo(meshes[vi], opts.heightM ?? 0.5, opts.sinkY);
      disposables.push(geo);

      const im = new THREE.InstancedMesh(geo, mat, slice.length);
      im.frustumCulled = false;
      const xzM = opts.xzMult ?? 1.0;
      const matrices: THREE.Matrix4[] = [];
      const colors: THREE.Color[] = [];
      const coords: { x: number; z: number }[] = [];

      for (let i = 0; i < slice.length; i++) {
        const it = slice[i];
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(it.tiltX ?? 0, it.yaw, it.tiltZ ?? 0);
        dummy.scale.set(it.scale * xzM, it.scale, it.scale * xzM);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
        colors.push(it.tint);
        coords.push({ x: it.x, z: it.z });
        im.setMatrixAt(i, dummy.matrix);
        im.setColorAt(i, it.tint);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = Boolean(opts.castShadow) && !isSoftwareGl;
      im.receiveShadow = true;
      scene.add(im);

      culledStaticLayers.push({
        im,
        coords,
        matrices,
        colors,
        maxDrawDistM: opts.maxDrawDistM,
        fadeStartRatio: opts.fadeStartRatio ?? 0.82,
        shadowDistM: opts.shadowDistM,
        baseCastShadow: Boolean(opts.castShadow),
      });
    }
  };

  // Landmark meadow anchors for static woodland ferns, moss cushions, stumps, branches & fallen logs
  const landmarkZones: [number, number, number][] = [
    [168, 42, 46],
    [186, 68, 46],
    [206, 98, 52],
    [182, 16, 52],
    [243, -32, 48],
    [252, -86, 50],
    [238, -149, 58],
    [264, -166, 46],
    [212, -128, 44],
    [-122, -660, 62],
    [-122, -692, 56],
    [-104, -561, 50],
    [-881, -111, 56],
    [405, 117, 52],
    [310, 60, 42],
    [-467, -197, 48],
    [80, -35, 50],
  ];

  // Woodland & gorge ferns + tree-base root-collar undergrowth halos
  const mossCoords: SpotItem[] = [];
  for (let ti = 0; ti < treeAnchors.length && ti < 450; ti++) {
    const ta = treeAnchors[ti];
    const fCount = 1 + (ti % 2);
    for (let k = 0; k < fCount; k++) {
      const ang = rand() * Math.PI * 2;
      const dist = 1.05 + rand() * 2.35;
      const fx = ta.x + Math.cos(ang) * dist;
      const fz = ta.z + Math.sin(ang) * dist;
      if (isBlockedGlobal(fx, fz, 0.7)) continue;
      fernCoords.push({
        x: fx,
        y: groundHeightAt(world, fx, fz),
        z: fz,
        scale: 0.72 + rand() * 0.65,
        tint: new THREE.Color().setHSL(0.26 + (rand() - 0.5) * 0.04, 0.24, 0.68 + rand() * 0.18),
      });
    }
    const mAng = rand() * Math.PI * 2;
    const mDist = 0.75 + rand() * 1.55;
    const mx = ta.x + Math.cos(mAng) * mDist;
    const mz = ta.z + Math.sin(mAng) * mDist;
    if (!isBlockedGlobal(mx, mz, 0.5)) {
      mossCoords.push({
        x: mx,
        y: groundHeightAt(world, mx, mz),
        z: mz,
        scale: 0.85 + rand() * 0.85,
        yaw: rand() * Math.PI * 2,
        tint: new THREE.Color().setHSL(0.26 + (rand() - 0.5) * 0.04, 0.24, 0.74 + rand() * 0.16),
      });
    }
  }
  for (let i = 0; i < 3600 && fernCoords.length < 1550; i++) {
    const [zx, zz, zr] = landmarkZones[i % landmarkZones.length];
    const ang = rand() * Math.PI * 2;
    const dist = 4 + rand() * zr;
    const fx = zx + Math.cos(ang) * dist;
    const fz = zz + Math.sin(ang) * dist;
    if (isBlockedGlobal(fx, fz)) continue;
    const riv = findNearestRiverPoint(world.waterways, fx, fz);
    const nearIvande = Math.hypot(fx - 405, fz - 117) < 64;
    if (nearIvande || (riv && riv.distance < 52) || rand() < 0.34) {
      fernCoords.push({
        x: fx,
        y: groundHeightAt(world, fx, fz),
        z: fz,
        scale: 0.8 + rand() * 0.72,
        tint: new THREE.Color().setHSL(0.26 + (rand() - 0.5) * 0.04, 0.24, 0.72 + rand() * 0.18),
      });
    }
  }
  const fernMeshes = extractMeshes(fernGltf.scene)
    .sort((a, b) => (a.geometry.index?.count ?? 0) - (b.geometry.index?.count ?? 0))
    .slice(0, 2);
  registerCulledStaticVariants(
    fernMeshes,
    fernCoords.map((f) => ({
      x: f.x,
      y: f.y - 0.02,
      z: f.z,
      scale: f.scale,
      yaw: rand() * Math.PI * 2,
      tiltX: (rand() - 0.5) * 0.14,
      tiltZ: (rand() - 0.5) * 0.14,
      tint: f.tint,
    })),
    {
      heightM: 0.76,
      sinkY: -0.02,
      alphaTest: 0.36,
      useFoliageSubsurface: true,
      castShadow: true,
      maxDrawDistM: 220,
      shadowDistM: 90,
    }
  );

  // Moss cushions around boulders & forest clearings
  for (const b of boulders) {
    for (let m = 0; m < 4 && mossCoords.length < 2200; m++) {
      const ang = rand() * Math.PI * 2;
      const r = 0.45 + rand() * 0.95;
      const mx = b.x + Math.cos(ang) * r;
      const mz = b.z + Math.sin(ang) * r;
      mossCoords.push({
        x: mx,
        y: groundHeightAt(world, mx, mz),
        z: mz,
        scale: 0.9 + rand() * 0.8,
        yaw: rand() * Math.PI * 2,
        tint: new THREE.Color().setHSL(0.26 + (rand() - 0.5) * 0.04, 0.22, 0.78 + rand() * 0.16),
      });
    }
  }
  for (let i = 0; i < 1400 && mossCoords.length < 2200; i++) {
    const [zx, zz, zr] = landmarkZones[i % landmarkZones.length];
    const ang = rand() * Math.PI * 2;
    const dist = rand() * zr;
    const mx = zx + Math.cos(ang) * dist;
    const mz = zz + Math.sin(ang) * dist;
    if (isBlockedGlobal(mx, mz)) continue;
    mossCoords.push({
      x: mx,
      y: groundHeightAt(world, mx, mz),
      z: mz,
      scale: 0.95 + rand() * 0.95,
      yaw: rand() * Math.PI * 2,
      tint: new THREE.Color().setHSL(0.26 + (rand() - 0.5) * 0.04, 0.2, 0.8 + rand() * 0.16),
    });
  }
  const mossMeshes = extractMeshes(mossGltf.scene).slice(0, 5);
  registerCulledStaticVariants(mossMeshes, mossCoords, {
    footprintM: 0.55,
    sinkY: -0.01,
    xzMult: 1.35,
    alphaTest: 0.3,
    roughness: 0.9,
    swayAmp: 0,
    maxDrawDistM: 165,
    shadowDistM: 0,
  });

  // Woodland tree stumps, dry fallen branches & mossy dead fallen tree trunks (dead_tree_trunk_1k)
  const stumpCoords: SpotItem[] = [];
  const stumpAnchors: [number, number][] = [
    [156, 36], [198, 86], [232, -138], [262, -158], [394, 124], [418, 108],
    [-112, -570], [-95, -552], [-148, -650], [-872, -98], [306, 68], [248, -44],
    [144, 62], [220, 114], [-892, -124], [274, -172], [-134, -674], [388, 108],
  ];
  for (const [sx0, sz0] of stumpAnchors) {
    const sx = sx0 + (rand() - 0.5) * 4;
    const sz = sz0 + (rand() - 0.5) * 4;
    if (isBlockedGlobal(sx, sz, 1.2)) continue;
    stumpCoords.push({
      x: sx,
      y: groundHeightAt(world, sx, sz),
      z: sz,
      scale: 0.85 + rand() * 0.45,
      yaw: rand() * Math.PI * 2,
      tint: new THREE.Color(0xffffff),
    });
  }
  registerCulledStaticVariants(extractMeshes(stumpGltf.scene), stumpCoords, {
    heightM: 0.68,
    sinkY: -0.08,
    roughness: 0.92,
    swayAmp: 0,
    castShadow: true,
    maxDrawDistM: isSoftwareGl ? 130 : 250,
    shadowDistM: 100,
  });

  const branchCoords: SpotItem[] = [];
  for (let i = 0; i < 240 && branchCoords.length < 96; i++) {
    const [zx, zz, zr] = landmarkZones[i % landmarkZones.length];
    const ang = rand() * Math.PI * 2;
    const dist = 6 + rand() * zr;
    const bx = zx + Math.cos(ang) * dist;
    const bz = zz + Math.sin(ang) * dist;
    if (isBlockedGlobal(bx, bz, 1.4)) continue;
    branchCoords.push({
      x: bx,
      y: groundHeightAt(world, bx, bz),
      z: bz,
      scale: 0.85 + rand() * 0.65,
      yaw: rand() * Math.PI * 2,
      tiltX: (rand() - 0.5) * 0.14,
      tiltZ: (rand() - 0.5) * 0.14,
      tint: new THREE.Color().setHSL(0.08, 0.1, 0.88 + rand() * 0.14),
    });
  }
  registerCulledStaticVariants(extractMeshes(branchesGltf.scene), branchCoords, {
    footprintM: 1.9,
    sinkY: -0.03,
    roughness: 0.92,
    swayAmp: 0,
    castShadow: true,
    maxDrawDistM: isSoftwareGl ? 120 : 185,
    shadowDistM: 80,
  });

  // Fallen mossy tree trunks along Ivandes Rumba, Manor forest & Abava banks
  const trunkCoords: SpotItem[] = [];
  const trunkAnchors: [number, number][] = [
    [396, 128], [414, 114], [304, 64], [-138, -688], [-108, -696], [-98, -554],
    [224, -142], [268, -162], [-876, -104], [150, 74], [216, 118], [254, -92],
  ];
  for (const [tx0, tz0] of trunkAnchors) {
    const tx = tx0 + (rand() - 0.5) * 5;
    const tz = tz0 + (rand() - 0.5) * 5;
    if (isBlockedGlobal(tx, tz, 1.6)) continue;
    trunkCoords.push({
      x: tx,
      y: groundHeightAt(world, tx, tz),
      z: tz,
      scale: 0.88 + rand() * 0.45,
      yaw: rand() * Math.PI * 2,
      tiltX: (rand() - 0.5) * 0.08,
      tiltZ: (rand() - 0.5) * 0.08,
      tint: new THREE.Color().setHSL(0.09, 0.08, 0.86 + rand() * 0.14),
    });
  }
  registerCulledStaticVariants(extractMeshes(deadTrunkGltf.scene).slice(0, 2), trunkCoords, {
    footprintM: 3.6,
    sinkY: -0.14,
    roughness: 0.92,
    swayAmp: 0,
    castShadow: true,
    maxDrawDistM: isSoftwareGl ? 130 : 300,
    shadowDistM: 120,
  });

  // 3. Photoscanned Broadleaf Shrubs combining optimized shrub_03 (60%), shrub_02 (30%) & hero shrub_04 (10%)
  const shrubMeshes02 = extractMeshes(shrub02Gltf.scene);
  const shrubMeshes03 = extractMeshes(shrub03Gltf.scene);
  const shrubMeshes04 = extractMeshes(shrub04Gltf.scene);
  const sSplit1 = Math.ceil(shrubs.length * 0.6);
  const sSplit2 = Math.ceil(shrubs.length * 0.9);
  registerCulledStaticVariants(
    shrubMeshes03,
    shrubs.slice(0, sSplit1).map((s) => ({ x: s.x, y: s.y - 0.04, z: s.z, scale: s.scale, yaw: s.yaw, tint: s.tint })),
    {
      heightM: 2.1,
      sinkY: -0.06,
      xzMult: 1.15,
      alphaTest: 0.4,
      useFoliageSubsurface: true,
      castShadow: true,
      maxDrawDistM: isSoftwareGl ? 200 : 380,
      shadowDistM: 125,
    }
  );
  registerCulledStaticVariants(
    shrubMeshes02,
    shrubs.slice(sSplit1, sSplit2).map((s) => ({ x: s.x, y: s.y - 0.04, z: s.z, scale: s.scale, yaw: s.yaw, tint: s.tint })),
    {
      heightM: 2.25,
      sinkY: -0.06,
      xzMult: 1.15,
      alphaTest: 0.38,
      useFoliageSubsurface: true,
      castShadow: true,
      maxDrawDistM: isSoftwareGl ? 115 : 300,
      shadowDistM: 120,
    }
  );
  registerCulledStaticVariants(
    shrubMeshes04,
    shrubs.slice(sSplit2).map((s) => ({ x: s.x, y: s.y - 0.04, z: s.z, scale: s.scale, yaw: s.yaw, tint: s.tint })),
    {
      footprintM: 2.35,
      sinkY: -0.06,
      xzMult: 1.1,
      alphaTest: 0.38,
      useFoliageSubsurface: true,
      castShadow: true,
      maxDrawDistM: isSoftwareGl ? 60 : 140,
      shadowDistM: 80,
    }
  );

  // 4. Riverbank & Verge Sedges (grass_medium_02_1k.gltf)
  const sedgeMeshes = extractMeshes(sedgeGltf.scene)
    .sort((a, b) => (a.geometry.index?.count ?? 0) - (b.geometry.index?.count ?? 0))
    .slice(0, 3);
  registerCulledStaticVariants(
    sedgeMeshes,
    reeds.map((rd) => ({ x: rd.x, y: rd.y - 0.04, z: rd.z, scale: rd.scale, yaw: rd.yaw, tint: rd.tint })),
    {
      heightM: 1.18,
      sinkY: -0.04,
      xzMult: 1.15,
      alphaTest: 0.36,
      swayAmp: 0.22,
      swayKey: 'v6_sedge_sway',
      maxDrawDistM: 260,
      shadowDistM: 0,
    }
  );

  // 5. Photoscanned Mossy River & Gorge Dolomite Boulders combining rock_moss_set_01 & rock_07
  const rockMeshes = [
    ...extractMeshes(rockGltf.scene)
      .sort((a, b) => (a.geometry.index?.count ?? 0) - (b.geometry.index?.count ?? 0))
      .slice(0, 2),
    ...extractMeshes(rock07Gltf.scene).slice(0, 2),
  ];
  if (rockMeshes.length > 0 && boulders.length > 0) {
    const perVar = Math.ceil(boulders.length / rockMeshes.length);
    for (let vi = 0; vi < rockMeshes.length; vi++) {
      const m = rockMeshes[vi];
      const baseRockMat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
      const rockMat = baseRockMat.clone();
      rockMat.roughness = 0.92;
      if (rockMat.map) rockMat.map.anisotropy = maxAnisotropy;
      disposables.push(rockMat);

      const bGeo = groundAndScaleMeshGeo(m, 1.0, -0.44);
      disposables.push(bGeo);
      const slice = boulders.slice(vi * perVar, (vi + 1) * perVar);
      if (slice.length === 0) continue;

      const im = new THREE.InstancedMesh(bGeo, rockMat, slice.length);
      im.frustumCulled = false;
      const matrices: THREE.Matrix4[] = [];
      const colors: THREE.Color[] = [];
      const coords: { x: number; z: number }[] = [];

      for (let i = 0; i < slice.length; i++) {
        const b = slice[i];
        dummy.position.set(b.x, b.y, b.z);
        dummy.rotation.set(b.rx * 0.35, b.ry, b.rz * 0.35);
        dummy.scale.set(b.sx * 1.15, b.sy * 0.95, b.sz * 1.15);
        dummy.updateMatrix();
        matrices.push(dummy.matrix.clone());
        colors.push(b.tint);
        coords.push({ x: b.x, z: b.z });
        im.setMatrixAt(i, dummy.matrix);
        im.setColorAt(i, b.tint);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = !isSoftwareGl;
      im.receiveShadow = true;
      scene.add(im);

      culledStaticLayers.push({
        im,
        coords,
        matrices,
        colors,
        maxDrawDistM: 400,
        fadeStartRatio: 0.85,
        shadowDistM: 130,
        baseCastShadow: true,
      });
    }
  }

  // 6. Small 3D roadside gravel & verge stones along primary/gravel road shoulders
  const pebbleMeshes = extractMeshes(rock07Gltf.scene).slice(0, 2);
  if (pebbleMeshes.length > 0) {
    const pebbleSpots: SpotItem[] = [];
    for (const r of world.roads) {
      if (r.bridge || r.pts.length < 2) continue;
      if (r.kind !== 'primary' && r.kind !== 'residential' && r.kind !== 'unclassified' && r.kind !== 'service') continue;
      for (let i = 0; i < r.pts.length - 1 && pebbleSpots.length < (isSoftwareGl ? 180 : 420); i++) {
        const [ax, az] = r.pts[i];
        const [bx, bz] = r.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 3) continue;
        // Focus pebble scatter within active village & landmark zones for high visual density where explored
        if (Math.hypot(ax - world.meta.centerX, az - world.meta.centerZ) > 360) continue;
        const nx = -(bz - az) / len;
        const nz = (bx - ax) / len;
        for (const side of [-1, 1]) {
          if (rand() > 0.55) continue;
          const t = rand();
          const lat = side * (r.width * 0.5 + (rand() - 0.35) * 0.72);
          const px = ax + (bx - ax) * t + nx * lat;
          const pz = az + (bz - az) * t + nz * lat;
          const py = groundHeightAt(world, px, pz);
          pebbleSpots.push({
            x: px,
            y: py + 0.02,
            z: pz,
            scale: 0.22 + rand() * 0.34,
            yaw: rand() * Math.PI * 2,
            tiltX: (rand() - 0.5) * 0.4,
            tiltZ: (rand() - 0.5) * 0.4,
            tint: new THREE.Color().setHSL(0.09, 0.08, 0.68 + rand() * 0.22),
          });
        }
      }
    }
    registerCulledStaticVariants(pebbleMeshes, pebbleSpots, {
      heightM: 0.45,
      sinkY: -0.14,
      xzMult: 1.45,
      roughness: 0.94,
      swayAmp: 0,
      castShadow: false,
      maxDrawDistM: isSoftwareGl ? 70 : 125,
      shadowDistM: 0,
    });
  }

  // =========================================================================
  // 3. UNIFIED SPATIAL GRASS STREAMING + DISTANCE CULLING UPDATE
  // =========================================================================
  let lastGrassX = Number.NaN;
  let lastGrassZ = Number.NaN;
  let lastStaticX = Number.NaN;
  let lastStaticZ = Number.NaN;

  const medCounts = new Int32Array(Math.max(1, medGrassIms.length));
  const bermudaCounts = new Int32Array(Math.max(1, bermudaIms.length));
  const dandCounts = new Int32Array(Math.max(1, dandelionIms.length));
  const periCounts = new Int32Array(Math.max(1, periwinkleIms.length));
  const celCounts = new Int32Array(Math.max(1, celandineIms.length));
  const nettleCounts = new Int32Array(Math.max(1, nettleIms.length));
  const weedCounts = new Int32Array(Math.max(1, weedIms.length));
  const flowerCounts = new Int32Array(Math.max(1, streamedFlowerIms.length));

  const updateLod = (camX: number, camZ: number, force = false) => {
    const movedGrass =
      force || !Number.isFinite(lastGrassX) || Math.hypot(camX - lastGrassX, camZ - lastGrassZ) >= 5.0;
    if (movedGrass) {
      lastGrassX = camX;
      lastGrassZ = camZ;

      const outerRadius = isSoftwareGl ? 68 : DEFAULT_GRASS_STREAM_OUTER_M;
      const cells = collectCellCoordsInRadius(camX, camZ, CELL_SIZE_M, outerRadius);
      let bladeIdx = 0;
      let shortIdx = 0;
      let grassIdx = 0;
      medCounts.fill(0);
      bermudaCounts.fill(0);
      dandCounts.fill(0);
      periCounts.fill(0);
      celCounts.fill(0);
      nettleCounts.fill(0);
      weedCounts.fill(0);
      flowerCounts.fill(0);

      const innerBladeCut = isSoftwareGl ? 28 : 36;
      const innerBladeCutSq = innerBladeCut * innerBladeCut;
      const innerGrassCut = isSoftwareGl ? 40 : 52;
      const innerGrassCutSq = innerGrassCut * innerGrassCut;
      const herbCutSq = (isSoftwareGl ? 44 : 66) * (isSoftwareGl ? 44 : 66);
      const outerMaxSq = outerRadius * outerRadius;

      for (let ci = 0; ci < cells.length; ci++) {
        const cell = cells[ci];
        const pts = getOrBuildCell(cell.cx, cell.cz, cell.key);
        for (let pi = 0; pi < pts.length; pi++) {
          const p = pts[pi];
          const dx = p.x - camX;
          const dz = p.z - camZ;
          const d2 = dx * dx + dz * dz;
          if (d2 > outerMaxSq) continue;

          if (p.layer === 'blade') {
            if (d2 > innerBladeCutSq || bladeIdx >= MAX_BLADE_GRASS) continue;
            const dist = Math.sqrt(d2);
            const fade = computeDrawDistanceFade(dist, innerBladeCut - 9, innerBladeCut);
            if (fade <= 0.04) continue;
            dummy.position.set(p.x, p.y, p.z);
            dummy.rotation.set(0, p.yaw, 0);
            dummy.scale.set(p.sx, p.sy * fade, p.sz);
            dummy.updateMatrix();
            bladeGrassIm.setMatrixAt(bladeIdx, dummy.matrix);
            bladeGrassIm.setColorAt(bladeIdx, scratchColor.setRGB(p.r, p.g, p.b));
            bladeIdx++;
          } else if (p.layer === 'short') {
            if (d2 > innerGrassCutSq || shortIdx >= MAX_SHORT_TURF) continue;
            const dist = Math.sqrt(d2);
            const fade = computeDrawDistanceFade(dist, innerGrassCut - 10, innerGrassCut);
            if (fade <= 0.04) continue;
            dummy.position.set(p.x, p.y, p.z);
            dummy.rotation.set(0, p.yaw, 0);
            dummy.scale.set(p.sx, p.sy * fade, p.sz);
            dummy.updateMatrix();
            shortTurfIm.setMatrixAt(shortIdx, dummy.matrix);
            shortTurfIm.setColorAt(shortIdx, scratchColor.setRGB(p.r, p.g, p.b));
            shortIdx++;
          } else if (p.layer === 'grass') {
            if (d2 > innerGrassCutSq || grassIdx >= MAX_GRASS_STREAM) continue;
            const dist = Math.sqrt(d2);
            const fade = computeDrawDistanceFade(dist, innerGrassCut - 12, innerGrassCut);
            if (fade <= 0.04) continue;
            dummy.position.set(p.x, p.y, p.z);
            dummy.rotation.set(0, p.yaw, 0);
            dummy.scale.set(p.sx, p.sy * fade, p.sz);
            dummy.updateMatrix();
            grassIm.setMatrixAt(grassIdx, dummy.matrix);
            grassIm.setColorAt(grassIdx, scratchColor.setRGB(p.r, p.g, p.b));
            grassIdx++;
          } else if (p.layer === 'med') {
            const im = medGrassIms[p.variant];
            if (!im) continue;
            const idx = medCounts[p.variant];
            if (idx >= im.instanceMatrix.count) continue;
            const dist = Math.sqrt(d2);
            const fade = computeDrawDistanceFade(dist, 76, DEFAULT_GRASS_STREAM_OUTER_M);
            if (fade <= 0.04) continue;
            dummy.position.set(p.x, p.y, p.z);
            dummy.rotation.set(0, p.yaw, 0);
            dummy.scale.set(p.sx * fade, p.sy * fade, p.sz * fade);
            dummy.updateMatrix();
            im.setMatrixAt(idx, dummy.matrix);
            im.setColorAt(idx, scratchColor.setRGB(p.r, p.g, p.b));
            medCounts[p.variant] = idx + 1;
          } else if (p.layer === 'bermuda') {
            const im = bermudaIms[p.variant];
            if (!im) continue;
            const idx = bermudaCounts[p.variant];
            if (idx >= im.instanceMatrix.count) continue;
            const dist = Math.sqrt(d2);
            const fade = computeDrawDistanceFade(dist, 74, DEFAULT_GRASS_STREAM_OUTER_M);
            if (fade <= 0.04) continue;
            dummy.position.set(p.x, p.y, p.z);
            dummy.rotation.set(0, p.yaw, 0);
            dummy.scale.set(p.sx * fade, p.sy * fade, p.sz * fade);
            dummy.updateMatrix();
            im.setMatrixAt(idx, dummy.matrix);
            im.setColorAt(idx, scratchColor.setRGB(p.r, p.g, p.b));
            bermudaCounts[p.variant] = idx + 1;
          } else if (d2 <= herbCutSq) {
            const dist = Math.sqrt(d2);
            const fade = computeDrawDistanceFade(dist, 46, 66);
            if (fade <= 0.05) continue;

            let im: THREE.InstancedMesh | undefined;
            let countArr: Int32Array | undefined;
            let isTinted = true;
            if (p.layer === 'dandelion') {
              im = dandelionIms[p.variant];
              countArr = dandCounts;
            } else if (p.layer === 'periwinkle') {
              im = periwinkleIms[p.variant];
              countArr = periCounts;
            } else if (p.layer === 'celandine') {
              im = celandineIms[p.variant];
              countArr = celCounts;
            } else if (p.layer === 'nettle') {
              im = nettleIms[p.variant];
              countArr = nettleCounts;
            } else if (p.layer === 'weed') {
              im = weedIms[p.variant];
              countArr = weedCounts;
            } else if (p.layer === 'flower') {
              im = streamedFlowerIms[p.variant];
              countArr = flowerCounts;
              isTinted = false;
            }
            if (!im || !countArr) continue;
            const idx = countArr[p.variant];
            if (idx >= im.instanceMatrix.count) continue;
            dummy.position.set(p.x, p.y, p.z);
            dummy.rotation.set(0, p.yaw, 0);
            dummy.scale.set(p.sx * fade, p.sy * fade, p.sz * fade);
            dummy.updateMatrix();
            im.setMatrixAt(idx, dummy.matrix);
            if (isTinted && im.instanceColor) {
              im.setColorAt(idx, scratchColor.setRGB(p.r, p.g, p.b));
            }
            countArr[p.variant] = idx + 1;
          }
        }
      }

      bladeGrassIm.count = bladeIdx;
      bladeGrassIm.visible = bladeIdx > 0;
      if (bladeIdx > 0) {
        bladeGrassIm.instanceMatrix.needsUpdate = true;
        if (bladeGrassIm.instanceColor) bladeGrassIm.instanceColor.needsUpdate = true;
      }

      shortTurfIm.count = shortIdx;
      shortTurfIm.visible = shortIdx > 0;
      if (shortIdx > 0) {
        shortTurfIm.instanceMatrix.needsUpdate = true;
        if (shortTurfIm.instanceColor) shortTurfIm.instanceColor.needsUpdate = true;
      }

      grassIm.count = grassIdx;
      grassIm.visible = grassIdx > 0;
      if (grassIdx > 0) {
        grassIm.instanceMatrix.needsUpdate = true;
        if (grassIm.instanceColor) grassIm.instanceColor.needsUpdate = true;
      }

      const commitStreamGroup = (ims: THREE.InstancedMesh[], counts: Int32Array, hasTint = true) => {
        for (let vi = 0; vi < ims.length; vi++) {
          const im = ims[vi];
          const cnt = counts[vi];
          im.count = cnt;
          im.visible = cnt > 0;
          if (cnt > 0) {
            im.instanceMatrix.needsUpdate = true;
            if (hasTint && im.instanceColor) im.instanceColor.needsUpdate = true;
          }
        }
      };

      commitStreamGroup(medGrassIms, medCounts, true);
      commitStreamGroup(bermudaIms, bermudaCounts, true);
      commitStreamGroup(dandelionIms, dandCounts, true);
      commitStreamGroup(periwinkleIms, periCounts, true);
      commitStreamGroup(celandineIms, celCounts, true);
      commitStreamGroup(nettleIms, nettleCounts, true);
      commitStreamGroup(weedIms, weedCounts, true);
      commitStreamGroup(streamedFlowerIms, flowerCounts, false);

      if (typeof document !== 'undefined') {
        const sampleMat = new THREE.Matrix4();
        const samplePos = new THREE.Vector3();
        if (bladeIdx > 0) {
          bladeGrassIm.getMatrixAt(0, sampleMat);
          samplePos.setFromMatrixPosition(sampleMat);
        }
        document.body.dataset.grassStats = JSON.stringify({
          bladeIdx,
          shortIdx,
          grassIdx,
          med0: medCounts[0] || 0,
          berm0: bermudaCounts[0] || 0,
          camX: Math.round(camX),
          camZ: Math.round(camZ),
          bladeVis: bladeGrassIm.visible,
          bladeCnt: bladeGrassIm.count,
          inScene: bladeGrassIm.parent === scene,
          hasColor: Boolean(bladeGrassIm.instanceColor),
          sample0: [+samplePos.x.toFixed(1), +samplePos.y.toFixed(2), +samplePos.z.toFixed(1)],
        });
      }
    }

    const movedStatic =
      force || !Number.isFinite(lastStaticX) || Math.hypot(camX - lastStaticX, camZ - lastStaticZ) >= 9.0;
    if (movedStatic) {
      lastStaticX = camX;
      lastStaticZ = camZ;

      for (let li = 0; li < culledStaticLayers.length; li++) {
        const layer = culledStaticLayers[li];
        const visible = filterInstancesByDrawDistance(
          layer.coords,
          camX,
          camZ,
          layer.maxDrawDistM,
          layer.fadeStartRatio
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
          if (layer.colors && im.instanceColor) {
            im.setColorAt(outIdx, layer.colors[item.index]);
          }
          outIdx++;
        }

        im.count = outIdx;
        im.visible = outIdx > 0;
        im.castShadow =
          layer.baseCastShadow && !isSoftwareGl && outIdx > 0 && minDistSq <= layer.shadowDistM * layer.shadowDistM;
        if (outIdx > 0) {
          im.instanceMatrix.needsUpdate = true;
          if (layer.colors && im.instanceColor) im.instanceColor.needsUpdate = true;
        }
      }
    }
  };

  // Initialize dense grass & culled static flora immediately around Renda spawn
  updateLod(world.meta.spawnX, world.meta.spawnZ, true);

  return {
    updateLod,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}
