import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeightAt, type BuildingCollider } from './rendaMath';
import type { AtmospherePreset, RendaWorldDataset } from './types';

export interface TacticalVillageHandle {
  colliders: BuildingCollider[];
  impactTargets: THREE.Mesh[];
  update: (dt: number, elapsed: number) => void;
  setAtmosphere: (preset: AtmospherePreset) => void;
  dispose: () => void;
}

interface Pose { x: number; z: number; yaw?: number; lift?: number; scale?: number }
interface StaticBatch { material: THREE.Material; geometries: THREE.BufferGeometry[]; castShadow: boolean }

/**
 * A deliberately composed, player-scale checkpoint on the church approach.
 * Core structures and collision bounds exist synchronously. Optional local scans
 * dress those structures without changing the road corridor or adding late traps.
 */
export function createTacticalVillage(
  scene: THREE.Scene,
  world: RendaWorldDataset,
  existingColliders: BuildingCollider[],
  maxAnisotropy: number
): TacticalVillageHandle {
  const root = new THREE.Group();
  root.name = 'Abava field checkpoint';
  scene.add(root);
  const colliders: BuildingCollider[] = [];
  const impactTargets: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const batches = new Map<THREE.Material, StaticBatch>();
  const loader = new THREE.TextureLoader();
  const textureSources = new Map<string, THREE.Texture>();
  const gltfLoader = new GLTFLoader();
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const work = new THREE.Vector3();
  const wetMaterials: { material: THREE.MeshStandardMaterial; roughness: number; color: THREE.Color }[] = [];
  const practicalLights: THREE.SpotLight[] = [];
  const practicalFaces: THREE.MeshStandardMaterial[] = [];
  const flags: { geometry: THREE.PlaneGeometry; original: Float32Array; phase: number }[] = [];
  let disposed = false;
  let colliderId = -970000;

  let seed = 51407;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const yAt = (x: number, z: number) => groundHeightAt(world, x, z);
  const ownMaterial = <T extends THREE.Material>(material: T): T => { materials.add(material); return material; };
  const ownGeometry = <T extends THREE.BufferGeometry>(geometry: T): T => { geometries.add(geometry); return geometry; };

  const imageTexture = (url: string, color: boolean, rx = 1, ry = 1) => {
    const key = `${url}/${color}`;
    let source = textureSources.get(key);
    if (!source) {
      source = loader.load(url);
      source.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      source.wrapS = source.wrapT = THREE.RepeatWrapping;
      source.anisotropy = maxAnisotropy;
      textureSources.set(key, source);
      textures.add(source);
    }
    // Clones share decoded image/GPU storage, with independent UV transforms.
    const tex = source.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    tex.anisotropy = maxAnisotropy;
    textures.add(tex);
    return tex;
  };
  const pbr = (folder: string, color: number, roughness: number, rx = 1, ry = 1, metalness = 0) => {
    const mat = ownMaterial(new THREE.MeshStandardMaterial({
      color,
      map: imageTexture(`/assets/textures/${folder}/diff.jpg`, true, rx, ry),
      normalMap: imageTexture(`/assets/textures/${folder}/nor_gl.jpg`, false, rx, ry),
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: imageTexture(`/assets/textures/${folder}/rough.jpg`, false, rx, ry),
      roughness,
      metalness,
    }));
    wetMaterials.push({ material: mat, roughness, color: mat.color.clone() });
    return mat;
  };
  const steel = pbr('corrugated_iron', 0x58604d, 0.76, 1.5, 1, 0.23);
  const darkSteel = ownMaterial(new THREE.MeshStandardMaterial({ color: 0x272e2b, metalness: 0.65, roughness: 0.65 }));
  const galvanized = ownMaterial(new THREE.MeshStandardMaterial({ color: 0x838b87, metalness: 0.72, roughness: 0.57 }));
  const rustySteel = pbr('corrugated_iron', 0x796354, 0.88, 1, 1, 0.18);
  const concrete = pbr('beige_wall_002', 0x8a8879, 0.98, 2, 1);
  const timber = pbr('weathered_brown_planks', 0x8d8770, 0.95, 1.2, 1);
  const rubber = ownMaterial(new THREE.MeshStandardMaterial({ color: 0x1e2321, roughness: 0.94 }));
  const glass = ownMaterial(new THREE.MeshPhysicalMaterial({ color: 0x50636a, roughness: 0.22, metalness: 0.28, clearcoat: 0.7 }));
  const amber = ownMaterial(new THREE.MeshStandardMaterial({ color: 0xf4bc69, emissive: 0xffb24e, emissiveIntensity: 2.0, roughness: 0.3 }));
  const redLens = ownMaterial(new THREE.MeshStandardMaterial({ color: 0x8a2c20, emissive: 0xe8451f, emissiveIntensity: 1.4, roughness: 0.3 }));

  const canvasTexture = (paint: (ctx: CanvasRenderingContext2D, size: number) => void, size = 512) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    paint(canvas.getContext('2d')!, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    textures.add(tex);
    return tex;
  };
  const fabricTexture = canvasTexture((ctx, size) => {
    ctx.fillStyle = '#8a8060'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size; i += 2) {
      ctx.strokeStyle = i % 4 ? '#6b654e' : '#a99c74'; ctx.globalAlpha = 0.26;
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }
    for (let i = 0; i < 7000; i++) {
      ctx.globalAlpha = 0.05 + rand() * 0.1; ctx.fillStyle = rand() > 0.5 ? '#292a22' : '#c1b28a';
      ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 6, 1 + rand() * 3);
    }
    // Broad soil stains survive texture minification; weave provides close detail.
    for (let i = 0; i < 42; i++) {
      const x = rand() * size, y = rand() * size, radius = 12 + rand() * 65;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(40,43,29,0.34)'); gradient.addColorStop(1, 'rgba(40,43,29,0)');
      ctx.globalAlpha = 0.6; ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#c2b896'; ctx.lineWidth = 3;
    for (const y of [15, size - 15]) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
      for (let x = 0; x < size; x += 10) { ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y + 4); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  });
  fabricTexture.repeat.set(2.2, 1);
  const weaveHeight = canvasTexture((ctx, size) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size; i += 4) {
      ctx.fillStyle = '#8b8b8b'; ctx.fillRect(i, 0, 1, size);
      ctx.fillStyle = '#747474'; ctx.fillRect(0, i + 2, size, 1);
    }
  });
  weaveHeight.colorSpace = THREE.NoColorSpace; weaveHeight.repeat.copy(fabricTexture.repeat);
  const sandbagMaterial = ownMaterial(new THREE.MeshStandardMaterial({ map: fabricTexture, bumpMap: weaveHeight, bumpScale: 0.0025, color: 0xaba68f, roughness: 0.98 }));
  wetMaterials.push({ material: sandbagMaterial, roughness: 0.98, color: sandbagMaterial.color.clone() });
  const seamMaterial = ownMaterial(new THREE.MeshStandardMaterial({ color: 0x4b493a, roughness: 1 }));
  const camoTexture = canvasTexture((ctx, size) => {
    ctx.fillStyle = '#5d6350'; ctx.fillRect(0, 0, size, size);
    const colors = ['#323d34', '#6f7258', '#85806a', '#494b3b'];
    for (let i = 0; i < 170; i++) {
      const x = rand() * size, y = rand() * size;
      ctx.fillStyle = colors[i % colors.length]; ctx.beginPath();
      for (let v = 0; v < 12; v++) {
        const a = v * Math.PI / 6, r = 8 + rand() * 32;
        const px = x + Math.cos(a) * r * 1.8, py = y + Math.sin(a) * r;
        if (v === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 0.1; ctx.strokeStyle = '#ddd1b0';
    for (let i = 0; i < size; i += 3) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  camoTexture.repeat.set(2.5, 2);
  const canvasMaterial = ownMaterial(new THREE.MeshStandardMaterial({ map: camoTexture, roughness: 0.96, side: THREE.DoubleSide, color: 0xc2c0a9 }));
  wetMaterials.push({ material: canvasMaterial, roughness: 0.96, color: canvasMaterial.color.clone() });

  const transform = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    return dummy.matrix.clone();
  };
  const batch = (geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, castShadow = true) => {
    let entry = batches.get(material);
    if (!entry) { entry = { material, geometries: [], castShadow }; batches.set(material, entry); }
    entry.castShadow ||= castShadow;
    const copy = geometry.clone().applyMatrix4(matrix);
    for (const name of Object.keys(copy.attributes)) if (!['position', 'normal', 'uv'].includes(name)) copy.deleteAttribute(name);
    entry.geometries.push(copy.index ? copy.toNonIndexed() : copy);
    if (copy.index) copy.dispose();
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, yaw = 0, bevel = 0) => {
    const geo = bevel ? new RoundedBoxGeometry(w, h, d, 1, bevel) : new THREE.BoxGeometry(w, h, d);
    batch(geo, mat, transform(x, y, z, 0, yaw)); geo.dispose();
  };
  const pole = (a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material, sides = 7) => {
    const delta = work.copy(b).sub(a), length = delta.length();
    dummy.position.copy(a).add(b).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(up, delta.normalize()); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
    const geo = new THREE.CylinderGeometry(radius, radius, length, sides);
    batch(geo, mat, dummy.matrix); geo.dispose();
  };
  const cable = (points: THREE.Vector3[], radius = 0.015, mat: THREE.Material = rubber) => {
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(8, points.length * 4), radius, 4, false);
    batch(geo, mat, new THREE.Matrix4(), false); geo.dispose();
  };
  const reserveBox = (x: number, z: number, w: number, d: number): boolean => {
    const bounds = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
    if (existingColliders.some((b) => bounds.maxX > b.minX - 0.15 && bounds.minX < b.maxX + 0.15 && bounds.maxZ > b.minZ - 0.15 && bounds.minZ < b.maxZ + 0.15)) return false;
    colliders.push({ id: colliderId--, cx: x, cz: z, radius: Math.hypot(w, d) / 2, ...bounds });
    return true;
  };
  const label = (text: string[], color = '#e0d8bc', background = '#333e34', warning = false) => {
    const tex = canvasTexture((ctx, size) => {
      ctx.fillStyle = background; ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.strokeRect(14, 14, size - 28, size - 28);
      ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${text.length > 2 ? 54 : 74}px Arial`;
      text.forEach((line, index) => ctx.fillText(line, size / 2, size * (index + 1) / (text.length + 1), size - 60));
      if (warning) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, size - 54, size, 54); ctx.clip();
        ctx.fillStyle = '#b8a05b'; ctx.fillRect(0, size - 54, size, 54); ctx.fillStyle = '#242b27';
        for (let x = -50; x < size + 70; x += 80) { ctx.beginPath(); ctx.moveTo(x, size); ctx.lineTo(x + 36, size); ctx.lineTo(x + 90, size - 54); ctx.lineTo(x + 54, size - 54); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      for (let i = 0; i < 900; i++) { ctx.globalAlpha = rand() * 0.13; ctx.fillStyle = '#111916'; ctx.fillRect(rand() * size, rand() * size, rand() * 12, rand() * 2 + 1); }
      ctx.globalAlpha = 1;
    });
    return ownMaterial(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.12 }));
  };
  const sign = (x: number, y: number, z: number, w: number, h: number, mat: THREE.Material, yaw = 0) => {
    box(w + 0.05, h + 0.05, 0.055, x, y, z + 0.025, darkSteel, yaw);
    const geo = new THREE.PlaneGeometry(w, h);
    batch(geo, mat, transform(x, y, z - 0.008, 0, Math.PI + yaw)); geo.dispose();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const bolt = new THREE.SphereGeometry(0.016, 5, 3);
      batch(bolt, galvanized, transform(x + sx * (w / 2 - 0.045), y + sy * (h / 2 - 0.045), z - 0.019)); bolt.dispose();
    }
  };

  // Earth-filled, stitched textile defenses; instanced bags retain curved silhouettes.
  const bagGeo = ownGeometry(new RoundedBoxGeometry(0.73, 0.27, 0.40, 2, 0.09));
  const bagVertices = bagGeo.attributes.position;
  for (let i = 0; i < bagVertices.count; i++) {
    const x = bagVertices.getX(i), y = bagVertices.getY(i), z = bagVertices.getZ(i);
    const end = Math.pow(Math.abs(x) / 0.365, 3);
    bagVertices.setXYZ(i, x, y * (1 - end * 0.30) + Math.sin(x * 18 + z * 12) * 0.008, z * (1 - end * 0.20));
  }
  bagGeo.computeVertexNormals();
  const bagPoses: THREE.Matrix4[] = [];
  const stitchPoses: THREE.Matrix4[] = [];
  const bagWall = (x: number, z: number, length: number, yaw: number, rows = 4) => {
    const count = Math.ceil(length / 0.67);
    const width = Math.abs(Math.cos(yaw)) * length + Math.abs(Math.sin(yaw)) * 0.44;
    const depth = Math.abs(Math.sin(yaw)) * length + Math.abs(Math.cos(yaw)) * 0.44;
    if (!reserveBox(x, z, width, depth)) return;
    for (let row = 0; row < rows; row++) for (let col = 0; col < count; col++) {
      const along = (col - (count - 1) / 2) * 0.65 + (row % 2 ? 0.19 : -0.07);
      const bx = x + Math.cos(yaw) * along, bz = z - Math.sin(yaw) * along;
      const by = yAt(bx, bz) + 0.12 + row * 0.235;
      const matrix = transform(bx, by, bz, (rand() - 0.5) * 0.07, yaw + (rand() - 0.5) * 0.11, (rand() - 0.5) * 0.07);
      matrix.scale(new THREE.Vector3(0.94 + rand() * 0.10, 0.91 + rand() * 0.13, 0.94 + rand() * 0.12));
      bagPoses.push(matrix);
      stitchPoses.push(matrix.clone());
    }
  };
  bagWall(161.0, 49.0, 5.0, 0, 4);
  bagWall(158.7, 52.2, 6.0, Math.PI / 2, 4);
  bagWall(161.1, 55.1, 4.9, 0, 3);
  bagWall(175.5, 51.5, 3.1, -0.08, 4);
  bagWall(178.2, 70.8, 4.8, 0, 3);
  const bags = new THREE.InstancedMesh(bagGeo, sandbagMaterial, bagPoses.length);
  const bagColor = new THREE.Color();
  bagPoses.forEach((matrix, index) => { bags.setMatrixAt(index, matrix); bags.setColorAt(index, bagColor.setScalar(0.82 + rand() * 0.24)); });
  bags.castShadow = bags.receiveShadow = true; bags.name = 'Staggered stitched sandbag defenses'; bags.computeBoundingSphere(); root.add(bags); impactTargets.push(bags);
  const seamGeo = ownGeometry(new THREE.TorusGeometry(0.1, 0.004, 3, 18));
  // Flatten a loop into the tied mouth of each bag, rather than a floating label.
  const seams = new THREE.InstancedMesh(seamGeo, seamMaterial, stitchPoses.length);
  const seamOffset = new THREE.Matrix4().compose(new THREE.Vector3(0.30, 0.01, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1.3, 0.72, 1));
  stitchPoses.forEach((matrix, index) => seams.setMatrixAt(index, matrix.clone().multiply(seamOffset)));
  seams.computeBoundingSphere(); root.add(seams);

  // Open observation position: enough room to walk under its sagging fabric roof.
  const canopyX = 161.1, canopyZ = 52.0, canopyY = Math.max(yAt(158.6, 49.8), yAt(163.6, 54.2)) + 2.45;
  const tarpGeo = ownGeometry(new THREE.PlaneGeometry(5.4, 5.2, 20, 18));
  const tarpPos = tarpGeo.attributes.position;
  for (let i = 0; i < tarpPos.count; i++) {
    const x = tarpPos.getX(i), z = tarpPos.getY(i);
    const sag = -0.30 * (1 - Math.pow(x / 2.7, 2)) * (1 - Math.pow(z / 2.6, 2));
    tarpPos.setXYZ(i, x, sag + Math.sin(x * 5.4 + z * 1.8) * 0.027, z);
  }
  tarpGeo.computeVertexNormals();
  const tarp = new THREE.Mesh(tarpGeo, canvasMaterial); tarp.position.set(canopyX, canopyY, canopyZ); tarp.castShadow = tarp.receiveShadow = true; root.add(tarp); impactTargets.push(tarp);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = canopyX + sx * 2.6, z = canopyZ + sz * 2.5;
    pole(new THREE.Vector3(x, yAt(x, z) - 0.03, z), new THREE.Vector3(x, canopyY + 0.03, z), 0.035, galvanized);
    // Guylines remain outside the accessible center of the position.
    const ax = x + sx * 0.6, az = z + sz * 0.75;
    cable([new THREE.Vector3(x, canopyY, z), new THREE.Vector3(ax, yAt(ax, az) + 0.07, az)], 0.007, seamMaterial);
    pole(new THREE.Vector3(ax, yAt(ax, az) - 0.1, az), new THREE.Vector3(ax + 0.03, yAt(ax, az) + 0.18, az), 0.018, rustySteel, 5);
  }
  // Rough workbench, radio and a battery pack under the shelter.
  const tableY = yAt(160.8, 53.6) + 0.83;
  box(2.0, 0.09, 0.7, 160.8, tableY, 53.6, timber, 0, 0.025);
  for (const x of [160.0, 161.6]) for (const z of [53.35, 53.85]) pole(new THREE.Vector3(x, yAt(x, z), z), new THREE.Vector3(x, tableY - 0.05, z), 0.028, darkSteel);
  box(0.45, 0.22, 0.28, 160.3, tableY + 0.16, 53.6, steel, 0.07, 0.025);
  sign(160.3, tableY + 0.18, 53.448, 0.27, 0.085, label(['HF / 043'], '#bdc6ad', '#202c28'));
  pole(new THREE.Vector3(160.16, tableY + 0.22, 53.67), new THREE.Vector3(160.12, tableY + 0.80, 53.67), 0.006, darkSteel, 4);
  box(0.42, 0.31, 0.3, 161.4, tableY - 0.55, 53.5, darkSteel, -0.1, 0.025);

  // The command container is a real corrugated shell, not a single smooth cube.
  const cx = 179.0, cz = 56.5, cw = 6.2, cd = 2.8;
  const baseY = Math.max(...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => yAt(cx + sx * cw / 2, cz + sz * cd / 2)))) + 0.16;
  if (reserveBox(cx, cz, cw, cd)) {
    box(cw, 0.22, cd, cx, baseY + 0.02, cz, darkSteel);
    box(cw - 0.12, 2.52, cd - 0.10, cx, baseY + 1.36, cz, steel, 0, 0.045);
    box(cw + 0.12, 0.13, cd + 0.14, cx, baseY + 2.67, cz, rustySteel, 0, 0.035);
    // Folded vertical steel ribs create grazing-light highlights and narrow shadows.
    for (let i = 0; i < 29; i++) {
      const x = cx - cw / 2 + 0.12 + i * (cw - 0.24) / 28;
      for (const side of [-1, 1]) {
        box(0.052, 2.35, 0.045, x, baseY + 1.37, cz + side * cd / 2, steel);
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = cx + sx * (cw / 2 - 0.08), z = cz + sz * (cd / 2 - 0.04);
      box(0.15, 2.78, 0.14, x, baseY + 1.35, z, galvanized);
      box(0.27, 0.15, 0.24, x, baseY + 0.08, z, rustySteel, 0, 0.018);
      box(0.27, 0.15, 0.24, x, baseY + 2.62, z, rustySteel, 0, 0.018);
      const gy = yAt(x, z);
      box(0.45, Math.max(0.12, baseY - gy), 0.45, x, (baseY + gy) / 2 - 0.05, z, concrete);
    }
    const frontZ = cz - cd / 2 - 0.06;
    box(1.08, 2.08, 0.075, cx - 1.95, baseY + 1.19, frontZ, darkSteel, 0, 0.025);
    box(0.92, 1.95, 0.055, cx - 1.95, baseY + 1.19, frontZ - 0.06, steel, 0, 0.012);
    box(0.34, 0.38, 0.025, cx - 1.95, baseY + 1.65, frontZ - 0.097, glass, 0, 0.01);
    pole(new THREE.Vector3(cx - 1.65, baseY + 1.0, frontZ - 0.14), new THREE.Vector3(cx - 1.65, baseY + 1.15, frontZ - 0.14), 0.014, galvanized, 6);
    for (const offset of [-0.6, 0.6]) box(0.07, 0.15, 0.10, cx - 2.38, baseY + 1.2 + offset, frontZ - 0.09, galvanized);
    // Raised window with folded rain hood, reveal and external security grilles.
    box(1.7, 1.03, 0.10, cx + 0.55, baseY + 1.65, frontZ - 0.035, darkSteel, 0, 0.025);
    box(1.52, 0.86, 0.025, cx + 0.55, baseY + 1.65, frontZ - 0.10, glass);
    box(1.82, 0.08, 0.35, cx + 0.55, baseY + 2.22, frontZ - 0.10, rustySteel);
    for (let i = 0; i < 6; i++) box(0.023, 0.93, 0.035, cx - 0.12 + i * 0.27, baseY + 1.65, frontZ - 0.14, galvanized);
    box(1.60, 0.04, 0.08, cx + 0.55, baseY + 1.65, frontZ - 0.14, galvanized);
    sign(cx + 0.75, baseY + 0.62, frontZ - 0.026, 1.15, 0.31, label(['FIELD OPERATIONS', 'ABAVA / 04'], '#d5d0af', '#3a4438'));
    sign(cx - 2.04, baseY + 2.40, frontZ - 0.03, 1.35, 0.25, label(['COMMAND'], '#d9d2b6', '#333d32'));
    // Power and air-conditioning equipment fixed to the visible east end.
    box(0.33, 0.82, 0.95, cx + cw / 2 + 0.14, baseY + 1.07, cz - 0.1, steel, 0, 0.03);
    for (let i = 0; i < 9; i++) box(0.025, 0.025, 0.74, cx + cw / 2 + 0.32, baseY + 0.76 + i * 0.065, cz - 0.10, darkSteel);
    for (let i = 0; i < 3; i++) {
      const z = frontZ - 0.27 - i * 0.24;
      const ground = yAt(cx - 1.95, z), top = baseY + 0.20 - i * 0.08;
      box(1.22, Math.max(0.07, top - ground), 0.28, cx - 1.95, (top + ground) / 2, z, rustySteel);
    }
    // Rainwater pipe and outlet do not disappear into the wall.
    const drainX = cx + 2.75, drainZ = frontZ - 0.03;
    pole(new THREE.Vector3(drainX, baseY + 0.18, drainZ), new THREE.Vector3(drainX, baseY + 2.58, drainZ), 0.031, galvanized);
    cable([new THREE.Vector3(drainX, baseY + 0.25, drainZ), new THREE.Vector3(drainX, baseY + 0.12, drainZ - 0.12), new THREE.Vector3(drainX, baseY + 0.08, drainZ - 0.34)], 0.031, galvanized);
    // Roof antenna and folded service ladder add a useful broken silhouette.
    for (const x of [cx + 2.35, cx + 2.75]) pole(new THREE.Vector3(x, baseY + 0.22, cz + cd / 2 + 0.09), new THREE.Vector3(x, baseY + 2.92, cz + cd / 2 + 0.09), 0.021, galvanized);
    for (let i = 0; i < 9; i++) pole(new THREE.Vector3(cx + 2.35, baseY + 0.40 + i * 0.29, cz + cd / 2 + 0.09), new THREE.Vector3(cx + 2.75, baseY + 0.40 + i * 0.29, cz + cd / 2 + 0.09), 0.016, galvanized);
  }

  // A proper vehicle-height gantry frames the church approach, leaving >5m road width.
  const gateZ = 66.5, gateLeft = 162.8, gateRight = 174.8;
  const gateY = Math.max(yAt(gateLeft, gateZ), yAt(gateRight, gateZ)) + 4.90;
  for (const x of [gateLeft, gateRight]) {
    reserveBox(x, gateZ, 0.55, 0.55);
    pole(new THREE.Vector3(x, yAt(x, gateZ), gateZ), new THREE.Vector3(x, gateY + 0.08, gateZ), 0.095, steel, 9);
    box(0.55, 0.27, 0.55, x, yAt(x, gateZ) + 0.12, gateZ, concrete, 0, 0.035);
    box(0.29, 1.4, 0.14, x, yAt(x, gateZ) + 1.0, gateZ - 0.09, rustySteel);
  }
  pole(new THREE.Vector3(gateLeft, gateY, gateZ), new THREE.Vector3(gateRight, gateY, gateZ), 0.09, steel, 9);
  pole(new THREE.Vector3(gateLeft, gateY - 0.42, gateZ), new THREE.Vector3(gateRight, gateY - 0.42, gateZ), 0.038, darkSteel, 6);
  for (let i = 0; i < 12; i++) pole(new THREE.Vector3(gateLeft + i, gateY, gateZ), new THREE.Vector3(gateLeft + i + 0.5, gateY - 0.42, gateZ), 0.018, galvanized, 5);
  sign(168.8, gateY - 0.30, gateZ - 0.15, 3.0, 0.75, label(['RENDA', 'CONTROL POINT 04'], '#dfdcc3', '#394337', true));
  sign(163.15, yAt(163.15, 47.6) + 1.25, 47.6, 0.82, 0.92, label(['SLOW', 'CHECKPOINT'], '#ddd7c0', '#363d32', true));
  pole(new THREE.Vector3(163.15, yAt(163.15, 47.6), 47.65), new THREE.Vector3(163.15, yAt(163.15, 47.6) + 1.75, 47.65), 0.028, galvanized);

  // Wire perimeter: alpha-cut steel weave, real posts/top rail and concertina coils.
  const chainMap = canvasTexture((ctx, size) => {
    ctx.clearRect(0, 0, size, size); ctx.strokeStyle = '#adb4aa'; ctx.lineWidth = 2.5;
    for (let i = -size; i < size * 2; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - size, size); ctx.stroke();
    }
  }, 128);
  chainMap.repeat.set(2.6, 1.7);
  const chainMat = ownMaterial(new THREE.MeshStandardMaterial({ map: chainMap, alphaTest: 0.22, side: THREE.DoubleSide, metalness: 0.68, roughness: 0.66, color: 0xa3aaa0 }));
  const fence = (ax: number, az: number, bx: number, bz: number) => {
    const length = Math.hypot(bx - ax, bz - az), segments = Math.ceil(length / 2.8);
    const along = new THREE.Vector3((bx - ax) / length, 0, (bz - az) / length);
    const perp = new THREE.Vector3(-along.z, 0, along.x);
    for (let i = 0; i <= segments; i++) {
      const x = ax + (bx - ax) * i / segments, z = az + (bz - az) * i / segments, gy = yAt(x, z);
      pole(new THREE.Vector3(x, gy - 0.05, z), new THREE.Vector3(x, gy + 2.15, z), 0.032, galvanized, 6);
      pole(new THREE.Vector3(x, gy + 2.05, z), new THREE.Vector3(x + perp.x * 0.30, gy + 2.42, z + perp.z * 0.30), 0.022, galvanized, 5);
      if (i < segments) {
        const nx = ax + (bx - ax) * (i + 1) / segments, nz = az + (bz - az) * (i + 1) / segments;
        const midX = (x + nx) / 2, midZ = (z + nz) / 2, panelY = yAt(midX, midZ) + 1.02;
        const geo = new THREE.PlaneGeometry(length / segments, 1.90);
        const angle = -Math.atan2(bz - az, bx - ax);
        batch(geo, chainMat, transform(midX, panelY, midZ, 0, angle), false); geo.dispose();
        pole(new THREE.Vector3(x, gy + 2.03, z), new THREE.Vector3(nx, yAt(nx, nz) + 2.03, nz), 0.021, galvanized, 5);
        reserveBox(midX, midZ, Math.abs(nx - x) + 0.08, Math.abs(nz - z) + 0.08);
      }
    }
    const coil: THREE.Vector3[] = [];
    const turns = length / 0.42, samples = Math.ceil(turns * 10);
    for (let i = 0; i <= samples; i++) {
      const t = i / samples, a = turns * Math.PI * 2 * t;
      const x = ax + (bx - ax) * t + perp.x * Math.cos(a) * 0.22;
      const z = az + (bz - az) * t + perp.z * Math.cos(a) * 0.22;
      coil.push(new THREE.Vector3(x, yAt(x, z) + 2.28 + Math.sin(a) * 0.22, z));
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), samples, 0.010, 3, false);
    batch(geo, galvanized, new THREE.Matrix4(), false); geo.dispose();
  };
  fence(183.0, 64.0, 183.0, 73.8);
  fence(176.0, 73.8, 183.0, 73.8);
  fence(155.9, 49.0, 155.9, 62.0);

  // A guyed communications mast and antenna arrays break up the roof line.
  const mastX = 180.7, mastZ = 68.2, mastY = yAt(mastX, mastZ);
  reserveBox(mastX, mastZ, 0.45, 0.45);
  pole(new THREE.Vector3(mastX, mastY, mastZ), new THREE.Vector3(mastX, mastY + 7.8, mastZ), 0.065, galvanized, 8);
  for (let i = 0; i < 3; i++) {
    const y = mastY + 5.2 + i * 0.8;
    pole(new THREE.Vector3(mastX - 0.80, y, mastZ), new THREE.Vector3(mastX + 0.80, y, mastZ), 0.020, darkSteel, 5);
    for (let j = -2; j <= 2; j++) pole(new THREE.Vector3(mastX + j * 0.29, y, mastZ - 0.29), new THREE.Vector3(mastX + j * 0.29, y, mastZ + 0.29), 0.009, galvanized, 4);
  }
  for (const [dx, dz] of [[-2, 2], [1.5, 2.5], [1.4, -2]]) {
    const x = mastX + dx, z = mastZ + dz;
    cable([new THREE.Vector3(mastX, mastY + 5.6, mastZ), new THREE.Vector3(x, yAt(x, z) + 0.08, z)], 0.008, galvanized);
  }
  const beaconGeo = ownGeometry(new THREE.CylinderGeometry(0.075, 0.075, 0.15, 8));
  const beacon = new THREE.Mesh(beaconGeo, redLens); beacon.position.set(mastX, mastY + 7.88, mastZ); root.add(beacon);

  // Portable floodlights use actual warm spot illumination, not decorative HUD glow.
  const floodlight = (x: number, z: number, height: number, targetX: number, targetZ: number) => {
    const gy = yAt(x, z);
    pole(new THREE.Vector3(x, gy, z), new THREE.Vector3(x, gy + height, z), 0.039, galvanized, 7);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      pole(new THREE.Vector3(x, gy + 0.58, z), new THREE.Vector3(x + Math.cos(a) * 0.62, yAt(x + Math.cos(a) * 0.62, z + Math.sin(a) * 0.62) + 0.025, z + Math.sin(a) * 0.62), 0.025, darkSteel, 6);
    }
    pole(new THREE.Vector3(x - 0.47, gy + height, z), new THREE.Vector3(x + 0.47, gy + height, z), 0.028, darkSteel, 6);
    const face = ownMaterial(new THREE.MeshStandardMaterial({ color: 0xfce6bd, emissive: 0xffc88b, emissiveIntensity: 4.2, roughness: 0.22 })); practicalFaces.push(face);
    for (const side of [-1, 1]) {
      const px = x + side * 0.31;
      const headPosition = new THREE.Vector3(px, gy + height + 0.02, z);
      const direction = new THREE.Vector3(targetX, yAt(targetX, targetZ), targetZ).sub(headPosition).normalize();
      const headMatrix = new THREE.Matrix4().compose(headPosition, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction), new THREE.Vector3(1, 1, 1));
      const headPart = (w: number, h: number, d: number, ox: number, oy: number, oz: number, material: THREE.Material, bevel = 0) => {
        const geo = bevel ? new RoundedBoxGeometry(w, h, d, 1, bevel) : new THREE.BoxGeometry(w, h, d);
        batch(geo, material, headMatrix.clone().multiply(new THREE.Matrix4().makeTranslation(ox, oy, oz))); geo.dispose();
      };
      headPart(0.42, 0.31, 0.16, 0, 0, 0, darkSteel, 0.028);
      headPart(0.35, 0.24, 0.012, 0, 0, -0.091, face, 0.005);
      for (let i = 0; i < 4; i++) headPart(0.37, 0.012, 0.025, 0, -0.08 + i * 0.06, -0.108, galvanized);
    }
    const light = new THREE.SpotLight(0xffd4a2, 150, 24, 0.72, 0.65, 2);
    light.position.set(x, gy + height - 0.02, z - 0.15);
    light.target.position.set(targetX, yAt(targetX, targetZ) + 0.15, targetZ);
    light.castShadow = false; root.add(light, light.target); practicalLights.push(light);
    cable([new THREE.Vector3(x, gy + height - 0.2, z + 0.04), new THREE.Vector3(x + 0.07, gy + 0.1, z + 0.04), new THREE.Vector3(x + 0.45, gy + 0.03, z + 0.35)], 0.014);
  };
  floodlight(174.1, 52.7, 4.65, 168.3, 48.0);
  floodlight(160.5, 57.4, 4.10, 162.0, 51.5);

  // Pallets are assembled from individual boards and blocks, with open fork pockets.
  const pallet = (x: number, z: number, yaw = 0, lift = 0) => {
    const gy = yAt(x, z) + lift;
    const local = (px: number, pz: number) => [x + Math.cos(yaw) * px + Math.sin(yaw) * pz, z - Math.sin(yaw) * px + Math.cos(yaw) * pz];
    for (const pz of [-0.45, 0, 0.45]) {
      const [bx, bz] = local(0, pz); box(1.2, 0.075, 0.13, bx, gy + 0.045, bz, timber, yaw);
      for (const px of [-0.47, 0, 0.47]) { const [sx, sz] = local(px, pz); box(0.16, 0.12, 0.14, sx, gy + 0.12, sz, timber, yaw); }
    }
    for (let i = 0; i < 6; i++) { const [bx, bz] = local(-0.5 + i * 0.2, 0); box(0.15, 0.075, 1.04, bx, gy + 0.21, bz, timber, yaw); }
  };
  pallet(176.1, 62.4, 0.10); pallet(176.1, 62.4, 0.10, 0.25); pallet(179.0, 64.0, -0.12); pallet(177.7, 66.2, 0.10);
  // A covered supply stack with a creased, asymmetric canvas surface and straps.
  const coverGeo = ownGeometry(new THREE.PlaneGeometry(2.2, 2.2, 16, 16));
  const coverPos = coverGeo.attributes.position;
  for (let i = 0; i < coverPos.count; i++) {
    const x = coverPos.getX(i), z = coverPos.getY(i);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    coverPos.setXYZ(i, x, 1.0 - Math.max(0, edge - 0.65) * 1.6 + Math.sin(x * 11 + z * 4) * 0.025, z);
  }
  coverGeo.computeVertexNormals(); const cover = new THREE.Mesh(coverGeo, canvasMaterial);
  cover.position.set(177.7, yAt(177.7, 66.2) + 0.25, 66.2); cover.castShadow = cover.receiveShadow = true; root.add(cover); impactTargets.push(cover); reserveBox(177.7, 66.2, 1.9, 1.9);
  for (const x of [177.1, 178.3]) cable([new THREE.Vector3(x, yAt(x, 65.3) + 0.30, 65.3), new THREE.Vector3(x, cover.position.y + 1.02, 65.8), new THREE.Vector3(x, cover.position.y + 1.02, 66.6), new THREE.Vector3(x, yAt(x, 67.1) + 0.30, 67.1)], 0.021, seamMaterial);

  // Cable drum, winding, side flanges and the lead running to the shelter.
  const reelX = 173.7, reelZ = 60.0, reelY = yAt(reelX, reelZ) + 0.38;
  for (const side of [-1, 1]) {
    const geo = new THREE.CylinderGeometry(0.43, 0.43, 0.045, 16);
    batch(geo, timber, transform(reelX + side * 0.25, reelY, reelZ, 0, 0, Math.PI / 2)); geo.dispose();
  }
  const wound = new THREE.CylinderGeometry(0.29, 0.29, 0.46, 16);
  batch(wound, rubber, transform(reelX, reelY, reelZ, 0, 0, Math.PI / 2)); wound.dispose();
  for (let i = 0; i < 14; i++) {
    const geo = new THREE.TorusGeometry(0.295, 0.011, 3, 24);
    batch(geo, rubber, transform(reelX - 0.22 + i * 0.034, reelY, reelZ, 0, Math.PI / 2)); geo.dispose();
  }
  cable([new THREE.Vector3(reelX, reelY - 0.20, reelZ + 0.20), new THREE.Vector3(173.4, yAt(173.4, 59.2) + 0.025, 59.2), new THREE.Vector3(174.1, yAt(174.1, 57.9) + 0.025, 57.9), new THREE.Vector3(174.7, yAt(174.7, 56.6) + 0.025, 56.6), new THREE.Vector3(176.1, baseY + 0.22, 56.2)], 0.023);

  // Small windswept identification pennant; motion is limited to cloth vertices.
  const flagGeo = ownGeometry(new THREE.PlaneGeometry(0.95, 0.55, 12, 6));
  flagGeo.translate(0.48, 0, 0);
  const flag = new THREE.Mesh(flagGeo, canvasMaterial); flag.position.set(mastX, mastY + 5.0, mastZ); flag.rotation.y = 0.4; root.add(flag);
  flags.push({ geometry: flagGeo, original: new Float32Array(flagGeo.attributes.position.array), phase: 0.4 });

  // Small controlled debris groups: broken pallet fragments, cable ties, stones.
  for (const [x, z] of [[173.5, 62.0], [163.1, 57.8], [181.9, 71.1]]) {
    for (let i = 0; i < 7; i++) {
      const px = x + (rand() - 0.5) * 1.7, pz = z + (rand() - 0.5) * 1.3;
      box(0.2 + rand() * 0.5, 0.025 + rand() * 0.025, 0.08 + rand() * 0.08, px, yAt(px, pz) + 0.035, pz, i % 3 ? timber : rustySteel, rand() * Math.PI);
    }
  }

  // Flush compatible static parts once; fine detail does not become hundreds of draws.
  for (const entry of batches.values()) {
    const geo = mergeGeometries(entry.geometries, false);
    entry.geometries.forEach((part) => part.dispose());
    if (!geo) continue;
    ownGeometry(geo);
    const mesh = new THREE.Mesh(geo, entry.material); mesh.name = `Checkpoint / ${entry.material.type}`;
    mesh.castShadow = entry.castShadow; mesh.receiveShadow = true; root.add(mesh);
    if (!(entry.material as THREE.MeshStandardMaterial).alphaTest) impactTargets.push(mesh);
  }
  batches.clear();

  // Local scanned PBR props. The military crate file contains two variants;
  // only the A components are selected, preserving one correctly proportioned crate.
  const loadScan = async (model: string, poses: Pose[], height: number, width?: number, filter?: (name: string) => boolean, rotateX = 0) => {
    try {
      const gltf = await gltfLoader.loadAsync(`/assets/props/${model}/${model}_1k.gltf`);
      const ownedTextures = new Set<THREE.Texture>();
      gltf.scene.traverse((object) => {
        if (!(object as THREE.Mesh).isMesh) return;
        const mesh = object as THREE.Mesh;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) ownedTextures.add(value);
        }
      });
      if (disposed) {
        gltf.scene.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.isMesh) { mesh.geometry.dispose(); (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose()); } });
        ownedTextures.forEach((texture) => texture.dispose()); return;
      }
      ownedTextures.forEach((texture) => { texture.anisotropy = maxAnisotropy; textures.add(texture); });
      gltf.scene.rotation.x += rotateX;
      gltf.scene.updateMatrixWorld(true);
      const sources: THREE.Mesh[] = [];
      gltf.scene.traverse((object) => { if ((object as THREE.Mesh).isMesh && (!filter || filter(object.name))) sources.push(object as THREE.Mesh); });
      const bounds = new THREE.Box3(); sources.forEach((mesh) => bounds.union(new THREE.Box3().setFromObject(mesh)));
      const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const scale = width ? width / Math.max(size.x, size.z, 0.01) : height / Math.max(size.y, 0.01);
      const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
      sources.forEach((mesh) => {
        const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        geo.translate(-center.x, -bounds.min.y, -center.z); geo.scale(scale, scale, scale);
        for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
        let list = parts.get(material); if (!list) { list = []; parts.set(material, list); }
        list.push(geo.index ? geo.toNonIndexed() : geo); if (geo.index) geo.dispose();
      });
      for (const [sourceMaterial, list] of parts) {
        const geometry = mergeGeometries(list, false); list.forEach((geo) => geo.dispose()); if (!geometry) continue;
        ownGeometry(geometry);
        const material = ownMaterial(sourceMaterial.clone()) as THREE.MeshStandardMaterial;
        material.color.multiplyScalar(0.95); material.roughness = Math.max(material.roughness, 0.56); material.envMapIntensity = 0.8;
        const mesh = new THREE.InstancedMesh(geometry, material, poses.length); mesh.name = `Checkpoint scanned ${model}`;
        poses.forEach((pose, index) => {
          dummy.position.set(pose.x, yAt(pose.x, pose.z) + (pose.lift ?? 0), pose.z); dummy.rotation.set(0, pose.yaw ?? 0, 0); dummy.scale.setScalar(pose.scale ?? 1); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
        });
        mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); root.add(mesh); impactTargets.push(mesh);
      }
      gltf.scene.traverse((object) => { const mesh = object as THREE.Mesh; if (mesh.isMesh) { mesh.geometry.dispose(); (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose()); } });
    } catch {
      // Core checkpoint remains complete when optional local props cannot load.
    }
  };
  const barrierPoses: Pose[] = [{ x: 162.8, z: 46.1, yaw: 0.04 }, { x: 164.2, z: 46.1, yaw: 0.04 }, { x: 172.8, z: 48.6, yaw: -0.06 }, { x: 174.2, z: 48.6, yaw: -0.06 }];
  barrierPoses.forEach((pose) => reserveBox(pose.x, pose.z, 1.5, 0.45));
  void loadScan('concrete_road_barrier_02', barrierPoses, 1.0);
  void loadScan('old_military_crate', [{ x: 176.1, z: 62.4, lift: 0.49, yaw: 0.1 }, { x: 179.1, z: 64.0, lift: 0.25, yaw: -0.1 }, { x: 179.1, z: 64.0, lift: 0.93, yaw: 0.05 }, { x: 161.7, z: 50.8, yaw: 0.2 }], 0.65, undefined, (name) => !name.endsWith('_b'));
  void loadScan('wooden_crate_02', [{ x: 180.4, z: 62.0, yaw: -0.09 }, { x: 181.2, z: 62.4, yaw: 0.07 }, { x: 181.0, z: 62.3, lift: 0.6, yaw: -0.08 }], 0.61);
  void loadScan('metal_jerrycan_green', [{ x: 176.3, z: 54.1, yaw: -0.2 }, { x: 176.65, z: 54.15, yaw: 0.04 }, { x: 160.9, z: 50.1, yaw: 0.3 }], 0.49);
  void loadScan('ammo_box', [{ x: 160.8, z: 53.55, lift: tableY - yAt(160.8, 53.55) + 0.05, yaw: -0.1 }, { x: 162.1, z: 54.2, yaw: 0.1 }, { x: 162.1, z: 54.2, lift: 0.23, yaw: -0.2 }, { x: 176.6, z: 62.2, lift: 1.15, yaw: 0.1 }], 0.23);
  void loadScan('barrel_03', [{ x: 181.5, z: 69.1 }, { x: 182.1, z: 69.7, yaw: 0.5 }, { x: 181.4, z: 70.0, yaw: -0.2 }], 0.88);
  void loadScan('old_tyre', [{ x: 173.2, z: 61.9, yaw: 0.2 }, { x: 173.2, z: 61.9, lift: 0.25, yaw: -0.1 }, { x: 173.3, z: 61.9, lift: 0.50, yaw: 0.1 }, { x: 182.1, z: 68.2, yaw: -0.3 }], 0.26, 0.72, undefined, Math.PI / 2);
  if (reserveBox(153, 68, 2.4, 4.8)) {
    void loadScan('covered_car', [{ x: 153, z: 68, yaw: 0.15 }], 1.48, 4.45);
  }
  reserveBox(176.1, 62.4, 1.35, 1.2); reserveBox(179.1, 64.0, 1.35, 1.2); reserveBox(180.8, 62.2, 1.8, 1.1); reserveBox(181.7, 69.6, 1.4, 1.5);

  const setAtmosphere = (preset: AtmospherePreset) => {
    const wet = preset === 'overcast_rain';
    const practical = preset === 'noon' ? 8 : preset === 'golden' ? 25 : preset === 'morning' ? 65 : preset === 'twilight' ? 180 : 45;
    practicalLights.forEach((light, index) => { light.intensity = practical * (index === 0 ? 1 : 0.75); });
    practicalFaces.forEach((material) => { material.emissiveIntensity = preset === 'noon' ? 1.1 : preset === 'twilight' ? 6 : 4.5; });
    wetMaterials.forEach(({ material, roughness, color }) => {
      material.roughness = wet ? Math.max(0.35, roughness - (material.metalness > 0.1 ? 0.24 : 0.1)) : roughness;
      material.color.copy(color).multiplyScalar(wet ? 0.90 : 1);
    });
  };
  setAtmosphere('golden');

  return {
    colliders,
    impactTargets,
    update: (_dt, elapsed) => {
      if (disposed) return;
      redLens.emissiveIntensity = 0.7 + Math.pow(Math.max(0, Math.sin(elapsed * 2.4)), 8) * 2.3;
      flags.forEach(({ geometry, original, phase }) => {
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
          const x = original[i * 3], y = original[i * 3 + 1];
          position.setXYZ(i, x, y + Math.sin(elapsed * 2.2 + x * 5 + phase) * 0.04 * x, Math.sin(elapsed * 2.9 + x * 7 + phase) * 0.10 * x);
        }
        position.needsUpdate = true;
      });
    },
    setAtmosphere,
    dispose: () => {
      if (disposed) return; disposed = true; scene.remove(root);
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      practicalLights.forEach((light) => light.dispose());
      impactTargets.length = 0;
    },
  };
}
