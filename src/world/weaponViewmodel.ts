import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FpsWeaponSpringState } from './rendaMath';

// Small machined edge radii catch the environment lighting without increasing draw calls.
function machinedBox(width: number, height: number, depth: number): THREE.BufferGeometry {
  return new RoundedBoxGeometry(width, height, depth, 2, Math.min(width, height, depth) * 0.16);
}

function roundedRect(path: THREE.Shape | THREE.Path, x: number, y: number, w: number, h: number, r: number): void {
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
}

/** A beveled side silhouette, extruded across the width of the weapon. */
function receiverProfile(points: Array<[number, number]>, width: number, bevel = 0.0015, cutout?: Array<[number, number]>): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => i === 0 ? shape.moveTo(-z, y) : shape.lineTo(-z, y));
  shape.closePath();
  if (cutout) {
    const hole = new THREE.Path();
    cutout.forEach(([z, y], i) => i === 0 ? hole.moveTo(-z, y) : hole.lineTo(-z, y));
    hole.closePath();
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width, bevelEnabled: true, bevelSize: bevel,
    bevelThickness: bevel, bevelSegments: 2, curveSegments: 5,
  });
  geometry.translate(0, 0, -width * 0.5);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

function createVentedHandguard(): THREE.BufferGeometry {
  const panels: THREE.BufferGeometry[] = [];
  for (let side = 0; side < 8; side++) {
    const shape = new THREE.Shape();
    roundedRect(shape, -0.166, -0.0106, 0.332, 0.0212, 0.0015);
    for (let slot = 0; slot < 5; slot++) {
      const hole = new THREE.Path();
      roundedRect(hole, -0.137 + slot * 0.058, -0.0045, 0.036, 0.009, 0.004);
      shape.holes.push(hole);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.0018, bevelEnabled: true, bevelSize: 0.00045,
      bevelThickness: 0.0004, bevelSegments: 1, curveSegments: 3,
    });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(0.025, 0, 0);
    geometry.rotateZ(side * Math.PI / 4);
    geometry.translate(0, 0.032, -0.265);
    panels.push(geometry);
  }
  const geometry = mergeGeometries(panels, false)!;
  for (const panel of panels) panel.dispose();
  return geometry;
}

function makeSurfaceNormal(texture: THREE.CanvasTexture, strength: number): THREE.CanvasTexture {
  const image = texture.image as HTMLCanvasElement;
  const source = image.getContext('2d')!.getImageData(0, 0, image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  const output = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const height = (sx: number, sy: number) => source.data[((sy + canvas.height) % canvas.height * canvas.width + (sx + canvas.width) % canvas.width) * 4] / 255;
      const nx = (height(x - 1, y) - height(x + 1, y)) * strength;
      const ny = (height(x, y - 1) - height(x, y + 1)) * strength;
      const inverseLength = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const index = (y * canvas.width + x) * 4;
      output.data[index] = (nx * inverseLength * 0.5 + 0.5) * 255;
      output.data[index + 1] = (ny * inverseLength * 0.5 + 0.5) * 255;
      output.data[index + 2] = (inverseLength * 0.5 + 0.5) * 255;
      output.data[index + 3] = 255;
    }
  }
  ctx.putImageData(output, 0, 0);
  const normal = new THREE.CanvasTexture(canvas);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.copy(texture.repeat);
  normal.anisotropy = 4;
  return normal;
}

function createAnodizedFinish(texture: THREE.CanvasTexture): THREE.CanvasTexture {
  const source = texture.image as HTMLCanvasElement;
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = '#888880';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.copy(texture.repeat);
  return map;
}

/** Tailored fabric volume with an elliptical forearm, cuff gathering and asymmetric folds. */
function createSleeve(length: number, elbowRadius: number, wristRadius: number): THREE.BufferGeometry {
  const rings = 28;
  const sides = 24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rings; row++) {
    const t = row / rings;
    const envelope = Math.sin(t * Math.PI);
    const radius = THREE.MathUtils.lerp(elbowRadius, wristRadius, t) + envelope * 0.006;
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const cuff = Math.exp(-Math.pow((t - 0.82) / 0.19, 2));
      const fold = (Math.sin(t * 39 + Math.cos(angle * 2) * 2.5) * 0.0035 * cuff
        + Math.sin(t * 20 + angle * 2) * 0.0025 * envelope);
      const r = radius + fold;
      positions.push(Math.cos(angle) * r * 0.93 + Math.sin(t * Math.PI) * 0.006,
        t * length, Math.sin(angle) * r * 1.08 - Math.sin(t * Math.PI) * 0.006);
      uvs.push(side / sides, t);
      if (row < rings && side < sides) {
        const a = row * (sides + 1) + side;
        indices.push(a, a + sides + 1, a + 1, a + 1, a + sides + 1, a + sides + 2);
      }
    }
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, 0, 0, 0, length, 0);
  uvs.push(0.5, 0, 0.5, 1);
  for (let side = 0; side < sides; side++) {
    indices.push(bottomCenter, side, side + 1);
    const top = rings * (sides + 1) + side;
    indices.push(bottomCenter + 1, top + 1, top);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  const seamNormal = new THREE.Vector3();
  for (let row = 0; row <= rings; row++) {
    const first = row * (sides + 1);
    const last = first + sides;
    seamNormal.set(normals.getX(first) + normals.getX(last), normals.getY(first) + normals.getY(last), normals.getZ(first) + normals.getZ(last)).normalize();
    normals.setXYZ(first, seamNormal.x, seamNormal.y, seamNormal.z);
    normals.setXYZ(last, seamNormal.x, seamNormal.y, seamNormal.z);
  }
  return geometry;
}

function boneSegment(a: THREE.Vector3, b: THREE.Vector3, radius: number): THREE.BufferGeometry {
  const delta = new THREE.Vector3().subVectors(b, a);
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.001, delta.length() - radius * 2), 3, 8);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  geometry.translate((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
  return geometry;
}

function createWeaponMarkingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c8c8bb';
  ctx.textBaseline = 'top';
  ctx.font = '500 52px monospace';
  ctx.fillText('MOD. 04 / 5.56 × 45', 24, 30);
  ctx.font = '32px monospace';
  ctx.fillText('FIELD CARBINE   NO. 08219', 24, 104);
  ctx.fillStyle = '#b9b6a3';
  ctx.fillRect(24, 178, 280, 3);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createMuzzleFlashTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
  glow.addColorStop(0, 'rgba(255,255,238,1)');
  glow.addColorStop(0.13, 'rgba(255,233,167,.95)');
  glow.addColorStop(0.35, 'rgba(255,169,67,.4)');
  glow.addColorStop(1, 'rgba(255,94,14,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createWatchFaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#121b18';
  ctx.fillRect(0, 0, 256, 256);
  ctx.translate(128, 128);
  ctx.strokeStyle = '#a6b7a6';
  for (let i = 0; i < 60; i++) {
    const angle = i * Math.PI / 30;
    const inner = i % 5 === 0 ? 83 : 94;
    ctx.lineWidth = i % 5 === 0 ? 5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.sin(angle) * inner, -Math.cos(angle) * inner);
    ctx.lineTo(Math.sin(angle) * 103, -Math.cos(angle) * 103);
    ctx.stroke();
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-39, -27);
  ctx.lineTo(0, 0);
  ctx.lineTo(63, -42);
  ctx.stroke();
  ctx.strokeStyle = '#b68c60';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.lineTo(0, -92);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface WeaponViewmodelRig {
  root: THREE.Group;
  weaponPivot: THREE.Group;
  magazineGroup: THREE.Group;
  boltCarrier: THREE.Mesh;
  muzzleFlashGroup: THREE.Group;
  muzzleFlashLight: THREE.PointLight;
  muzzleWorldAnchor: THREE.Object3D;
  reticleMesh: THREE.Mesh;
  textures: THREE.Texture[];
  update: (
    dt: number,
    elapsed: number,
    spring: FpsWeaponSpringState,
    opts: {
      speedMs: number;
      sprinting: boolean;
      reloadProgress: number; // 0 = idle, 0..1 during reload
      inspectProgress: number; // 0 = idle, 0..1 during inspect
      muzzleFlashTimer: number;
      boltKick: number;
    }
  ) => void;
  dispose: () => void;
}

function createGunMetalTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 512;
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = size;
  diffCanvas.height = size;
  const dCtx = diffCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  dCtx.fillStyle = '#4b4e4b';
  dCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#c2c2c2';
  rCtx.fillRect(0, 0, size, size);

  let s = 1337;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // Gun-oil & carbon handling patina patches
  for (let i = 0; i < 160; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 12 + rand() * 44;
    const grad = dCtx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() > 0.45;
    grad.addColorStop(0, dark ? 'rgba(18,19,21,0.22)' : 'rgba(56,60,66,0.16)');
    grad.addColorStop(1, 'rgba(75,78,75,0)');
    dCtx.fillStyle = grad;
    dCtx.beginPath();
    dCtx.arc(x, y, r, 0, Math.PI * 2);
    dCtx.fill();
  }

  // Brushed anodized aluminum striations + silver edge-wear scratches
  for (let i = 0; i < 1200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 8 + rand() * 52;
    const isWear = rand() > 0.88;
    dCtx.strokeStyle = isWear ? '#707680' : rand() > 0.5 ? '#35393f' : '#1e2024';
    dCtx.globalAlpha = isWear ? 0.34 : 0.24;
    dCtx.lineWidth = isWear ? 1.1 : 0.8;
    dCtx.beginPath();
    dCtx.moveTo(x, y);
    dCtx.lineTo(x + len, y + (rand() - 0.5) * 4);
    dCtx.stroke();

    bCtx.strokeStyle = isWear ? '#a6a6a6' : rand() > 0.5 ? '#909090' : '#6c6c6c';
    bCtx.globalAlpha = 0.26;
    bCtx.lineWidth = 1;
    bCtx.beginPath();
    bCtx.moveTo(x, y);
    bCtx.lineTo(x + len, y + (rand() - 0.5) * 3);
    bCtx.stroke();

    rCtx.strokeStyle = isWear ? '#8c8c8c' : rand() > 0.45 ? '#cecece' : '#ababab';
    rCtx.globalAlpha = 0.3;
    rCtx.beginPath();
    rCtx.moveTo(x, y);
    rCtx.lineTo(x + len, y);
    rCtx.stroke();
  }
  dCtx.globalAlpha = 1;
  bCtx.globalAlpha = 1;
  rCtx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(diffCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 3);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(3, 3);

  return { map, bumpMap, roughnessMap };
}

function createTacticalSleeveTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 512;
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = size;
  diffCanvas.height = size;
  const dCtx = diffCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  dCtx.fillStyle = '#3d4532';
  dCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#cfcfcf';
  rCtx.fillRect(0, 0, size, size);

  let s = 4209;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };

  // Multi-tone ranger olive field mottling & fabric wear/dust
  for (let i = 0; i < 180; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 18 + rand() * 64;
    const grad = dCtx.createRadialGradient(x, y, 0, x, y, r);
    const tone = rand();
    grad.addColorStop(
      0,
      tone < 0.35
        ? 'rgba(42,49,34,0.28)'
        : tone < 0.72
          ? 'rgba(72,79,57,0.24)'
          : 'rgba(84,76,58,0.18)'
    );
    grad.addColorStop(1, 'rgba(61,69,50,0)');
    dCtx.fillStyle = grad;
    dCtx.beginPath();
    dCtx.arc(x, y, r, 0, Math.PI * 2);
    dCtx.fill();
  }

  // Broad shading comes from the sleeve geometry, keeping the weave free of baked lighting.
  // Fine tactical ripstop cross-hatch weave
  for (let y = 0; y < size; y += 4) {
    const major = y % 24 === 0;
    dCtx.fillStyle = major ? 'rgba(26,30,20,0.35)' : 'rgba(255,255,255,0.04)';
    dCtx.fillRect(0, y, size, major ? 1.5 : 1);
    bCtx.fillStyle = major ? '#a2a2a2' : y % 8 === 0 ? '#8e8e8e' : '#727272';
    bCtx.fillRect(0, y, size, major ? 1.6 : 1);
  }
  for (let x = 0; x < size; x += 4) {
    const major = x % 24 === 0;
    dCtx.fillStyle = major ? 'rgba(26,30,20,0.32)' : 'rgba(255,255,255,0.03)';
    dCtx.fillRect(x, 0, major ? 1.5 : 1, size);
    bCtx.fillStyle = major ? 'rgba(190,190,190,0.45)' : 'rgba(255,255,255,0.08)';
    bCtx.fillRect(x, 0, major ? 1.5 : 1, size);
  }

  // Double-row cuff stitching accent line
  dCtx.strokeStyle = 'rgba(104, 112, 86, 0.55)';
  dCtx.setLineDash([5, 3]);
  dCtx.lineWidth = 1.4;
  dCtx.beginPath();
  dCtx.moveTo(0, 32);
  dCtx.lineTo(size, 32);
  dCtx.moveTo(0, 38);
  dCtx.lineTo(size, 38);
  dCtx.stroke();
  dCtx.setLineDash([]);

  const map = new THREE.CanvasTexture(diffCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 3);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(3, 3);

  return { map, bumpMap, roughnessMap };
}

function createHolographicReticleTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const cx = size * 0.5;
  const cy = size * 0.5;

  // Soft outer red-amber holographic bloom halo
  const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 78);
  grad.addColorStop(0, 'rgba(255, 84, 38, 0.32)');
  grad.addColorStop(0.5, 'rgba(255, 62, 24, 0.14)');
  grad.addColorStop(1, 'rgba(255, 40, 16, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 78, 0, Math.PI * 2);
  ctx.fill();

  // EOTech 68-MOA segmented ring
  ctx.strokeStyle = 'rgba(255, 76, 36, 0.96)';
  ctx.lineWidth = 4;
  const r = 46;
  for (let q = 0; q < 4; q++) {
    const a0 = q * (Math.PI / 2) + 0.18;
    const a1 = (q + 1) * (Math.PI / 2) - 0.18;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.stroke();
  }

  // 4 cardinal hash ticks
  for (let q = 0; q < 4; q++) {
    const a = q * (Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
    ctx.lineTo(cx + Math.cos(a) * (r + 14), cy + Math.sin(a) * (r + 14));
    ctx.stroke();
  }

  // Crisp 1-MOA center dot
  ctx.fillStyle = '#ff6d3d';
  ctx.beginPath();
  ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd5b8';
  ctx.beginPath();
  ctx.arc(cx, cy, 2.0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds the first-person tactical carbine & gloved operator arms viewmodel rig
 * with ripstop field sleeve, armored gloves, wristwatch, rail light/PEQ, and EOTech holo optic.
 */
export function createWeaponViewmodelRig(): WeaponViewmodelRig {
  const root = new THREE.Group();
  const weaponPivot = new THREE.Group();
  // Scaled to fit cleanly in front of camera.near = 0.12 and well within collider radius
  weaponPivot.scale.setScalar(0.56);
  root.add(weaponPivot);

  const { map: metalMap, bumpMap: metalBump, roughnessMap: metalRough } = createGunMetalTextures();
  const { map: sleeveMap, bumpMap: fabricBump, roughnessMap: sleeveRough } = createTacticalSleeveTextures();
  const metalNormal = makeSurfaceNormal(metalBump, 0.65);
  const fabricNormal = makeSurfaceNormal(fabricBump, 0.9);
  const anodizedMap = createAnodizedFinish(metalMap);
  const reticleTex = createHolographicReticleTexture();
  const markingTex = createWeaponMarkingTexture();
  const flashTex = createMuzzleFlashTexture();
  const watchTex = createWatchFaceTexture();
  const textures: THREE.Texture[] = [
    metalMap,
    metalBump,
    metalRough,
    sleeveMap,
    fabricBump,
    sleeveRough,
    reticleTex,
    markingTex,
    flashTex,
    watchTex,
    metalNormal,
    fabricNormal,
    anodizedMap,
  ];
  for (const texture of textures) texture.anisotropy = 4;

  const receiverMetalMat = new THREE.MeshStandardMaterial({
    color: 0xa9afaa,
    map: metalMap,
    roughness: 0.65,
    metalness: 0.78,
    bumpMap: metalBump,
    bumpScale: 0.00016,
    roughnessMap: metalRough,
    normalMap: metalNormal,
    normalScale: new THREE.Vector2(0.3, 0.3),
  });
  const darkGunmetalMat = new THREE.MeshStandardMaterial({
    color: 0x737c76,
    map: metalMap,
    roughness: 0.84,
    metalness: 0.68,
    bumpMap: metalBump,
    bumpScale: 0.00012,
    roughnessMap: metalRough,
    normalMap: metalNormal,
    normalScale: new THREE.Vector2(0.25, 0.25),
  });
  const bronzeHandguardMat = new THREE.MeshStandardMaterial({
    color: 0xa28a65, map: anodizedMap, roughness: 0.74, metalness: 0.62,
    roughnessMap: metalRough, normalMap: metalNormal,
    normalScale: new THREE.Vector2(0.24, 0.24),
  });
  const fieldPolymerMat = new THREE.MeshStandardMaterial({
    color: 0x68634c, roughness: 0.86, metalness: 0,
    normalMap: fabricNormal, normalScale: new THREE.Vector2(0.15, 0.15),
  });
  const mattePolymerMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c1f,
    roughness: 0.8,
    metalness: 0.08,
    bumpMap: fabricBump,
    bumpScale: 0.0002,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x4b5059,
    roughness: 0.28,
    metalness: 0.9,
    bumpMap: metalBump,
    bumpScale: 0.0001,
  });
  const recessMat = new THREE.MeshStandardMaterial({ color: 0x090c0b, roughness: 0.93, metalness: 0.12 });
  const dustMat = new THREE.MeshStandardMaterial({ color: 0x393e34, roughness: 0.92, metalness: 0.05 });
  const oliveSleeveMat = new THREE.MeshStandardMaterial({
    color: 0xe6e4da,
    map: sleeveMap,
    roughness: 0.96,
    metalness: 0.01,
    bumpMap: fabricBump,
    bumpScale: 0.00055,
    roughnessMap: sleeveRough,
    normalMap: fabricNormal,
    normalScale: new THREE.Vector2(0.52, 0.52),
  });
  const gloveFabricMat = new THREE.MeshStandardMaterial({
    color: 0x5f5842,
    map: anodizedMap,
    roughness: 0.96,
    metalness: 0,
    bumpMap: fabricBump,
    bumpScale: 0.00035,
    normalMap: fabricNormal,
    normalScale: new THREE.Vector2(0.38, 0.38),
  });
  const knuckleArmorMat = new THREE.MeshStandardMaterial({
    color: 0x242820,
    roughness: 0.68,
    metalness: 0.02,
    bumpMap: metalBump,
    bumpScale: 0.00015,
  });
  const watchDialMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: watchTex,
    emissive: 0x2d6e44,
    emissiveIntensity: 0.07,
    roughness: 0.12,
    metalness: 0.2,
  });
  const opticGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x8cb8ad,
    transparent: true,
    opacity: 0.08,
    roughness: 0.025,
    metalness: 0,
    reflectivity: 0.9,
    clearcoat: 1.0,
    depthWrite: false,
  });

  // Optic centerline height in weapon-local space = +0.086 (used to align ADS dead-center)
  const OPTIC_Y = 0.086;

  // Separate forged upper, contoured lower and an open trigger guard avoid a solid slab silhouette.
  const recShape = new THREE.Shape();
  recShape.moveTo(-0.022, 0.012);
  recShape.lineTo(0.022, 0.012);
  recShape.lineTo(0.024, 0.048);
  recShape.lineTo(0.016, 0.058);
  recShape.lineTo(-0.016, 0.058);
  recShape.lineTo(-0.024, 0.048);
  recShape.lineTo(-0.024, 0.022);
  recShape.closePath();
  const recGeo = new THREE.ExtrudeGeometry(recShape, {
    depth: 0.21,
    bevelEnabled: true,
    bevelThickness: 0.0025,
    bevelSize: 0.002,
    bevelSegments: 2,
  });
  recGeo.translate(0, 0, -0.095);
  const receiverMesh = new THREE.Mesh(recGeo, receiverMetalMat);
  weaponPivot.add(receiverMesh);
  const lowerReceiver = new THREE.Mesh(receiverProfile([
    [0.114, 0.016], [-0.094, 0.016], [-0.103, -0.039], [-0.034, -0.049],
    [-0.019, -0.014], [0.077, -0.014], [0.092, -0.029], [0.113, -0.014],
  ], 0.042), darkGunmetalMat);
  weaponPivot.add(lowerReceiver);
  const magwellLip = new THREE.Mesh(receiverProfile([
    [-0.104, -0.035], [-0.108, -0.046], [-0.031, -0.058], [-0.028, -0.047],
  ], 0.048, 0.001), bronzeHandguardMat);
  weaponPivot.add(magwellLip);
  const receiverRidge = new THREE.Mesh(receiverProfile([
    [-0.085, 0.015], [-0.075, 0.008], [0.07, 0.008], [0.085, 0.017],
  ], 0.045, 0.0007), receiverMetalMat);
  weaponPivot.add(receiverRidge);

  // Brass deflector, ejection port recess, dust cover & forward assist
  const deflector = new THREE.Mesh(machinedBox(0.014, 0.024, 0.03), darkGunmetalMat);
  deflector.position.set(0.024, 0.038, 0.035);
  weaponPivot.add(deflector);

  const forwardAssist = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.032, 10), steelMat);
  forwardAssist.rotation.x = Math.PI / 2;
  forwardAssist.rotation.z = -0.35;
  forwardAssist.position.set(0.027, 0.031, 0.068);
  weaponPivot.add(forwardAssist);

  const boltCarrier = new THREE.Mesh(machinedBox(0.006, 0.018, 0.072), steelMat);
  boltCarrier.position.set(0.023, 0.038, -0.012);
  weaponPivot.add(boltCarrier);

  const ejectionPort = new THREE.Mesh(machinedBox(0.004, 0.024, 0.086), recessMat);
  ejectionPort.position.set(0.023, 0.038, -0.012);
  weaponPivot.add(ejectionPort);
  const dustCoverHinge = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.084, 8), steelMat);
  dustCoverHinge.rotation.x = Math.PI / 2;
  dustCoverHinge.position.set(0.028, 0.025, -0.012);
  weaponPivot.add(dustCoverHinge);

  // Subtle laser etching sits on the receiver, rather than glowing over the material.
  const markingMat = new THREE.MeshStandardMaterial({
    map: markingTex, transparent: true, opacity: 0.52, roughness: 1,
    metalness: 0.12, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  });
  for (const side of [-1, 1]) {
    const markings = new THREE.Mesh(new THREE.PlaneGeometry(0.084, 0.021), markingMat);
    markings.rotation.y = side * Math.PI / 2;
    markings.position.set(side * 0.0265, 0.003, 0.04);
    weaponPivot.add(markings);
  }

  const pins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.0015, 12), steelMat, 8);
  const pinTransform = new THREE.Object3D();
  let pinIndex = 0;
  for (const side of [-1, 1]) {
    for (const [y, z] of [[-0.012, 0.075], [0.018, -0.072], [0.036, 0.088], [0.018, 0.016]]) {
      pinTransform.position.set(side * 0.026, y, z);
      pinTransform.rotation.z = Math.PI / 2;
      pinTransform.updateMatrix();
      pins.setMatrixAt(pinIndex++, pinTransform.matrix);
    }
  }
  weaponPivot.add(pins);

  // Charging handle T-latch
  const chargingHandle = new THREE.Mesh(machinedBox(0.042, 0.011, 0.026), receiverMetalMat);
  chargingHandle.position.set(0, 0.054, 0.118);
  weaponPivot.add(chargingHandle);

  const triggerGuard = new THREE.Mesh(receiverProfile([
    [-0.016, -0.012], [0.078, -0.012], [0.09, -0.043], [0.071, -0.055], [0.004, -0.052], [-0.018, -0.032],
  ], 0.012, 0.0012, [
    [-0.005, -0.021], [0.068, -0.021], [0.076, -0.04], [0.066, -0.044], [0.007, -0.043], [-0.007, -0.031],
  ]), receiverMetalMat);
  weaponPivot.add(triggerGuard);
  const trigger = new THREE.Mesh(receiverProfile([[0.043, -0.014], [0.038, -0.034], [0.047, -0.04], [0.044, -0.03], [0.05, -0.014]], 0.006, 0.0006), steelMat);
  weaponPivot.add(trigger);

  const pistolGrip = new THREE.Mesh(receiverProfile([
    [0.082, -0.018], [0.062, -0.039], [0.067, -0.067], [0.075, -0.086],
    [0.081, -0.119], [0.092, -0.148], [0.132, -0.142], [0.137, -0.12], [0.115, -0.033],
  ], 0.032, 0.003), mattePolymerMat);
  weaponPivot.add(pistolGrip);

  // Buffer tube, castle nut & adjustable buttstock
  const castleNut = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12), steelMat);
  castleNut.rotation.x = Math.PI / 2;
  castleNut.position.set(0, 0.028, 0.128);
  weaponPivot.add(castleNut);

  const bufferTube = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.19, 12), receiverMetalMat);
  bufferTube.rotation.x = Math.PI / 2;
  bufferTube.position.set(0, 0.028, 0.22);
  weaponPivot.add(bufferTube);

  const stockBody = new THREE.Mesh(receiverProfile([
    [0.185, 0.041], [0.343, 0.04], [0.355, 0.016], [0.355, -0.054], [0.329, -0.06],
    [0.241, -0.027], [0.21, -0.024],
  ], 0.04, 0.002, [[0.234, 0.01], [0.329, 0.009], [0.331, -0.026], [0.258, -0.012]]), fieldPolymerMat);
  weaponPivot.add(stockBody);
  const shoulderPad = new THREE.Mesh(machinedBox(0.045, 0.098, 0.013), knuckleArmorMat);
  shoulderPad.position.set(0, -0.007, 0.355);
  shoulderPad.rotation.x = -0.08;
  weaponPivot.add(shoulderPad);

  // Curved 30-round PMAG magazine with textured rib bands
  const magazineGroup = new THREE.Group();
  magazineGroup.position.set(0, -0.055, -0.052);
  const magBody = new THREE.Mesh(receiverProfile([
    [0.03, 0.041], [-0.031, 0.041], [-0.035, -0.038], [-0.053, -0.094],
    [-0.046, -0.112], [0.013, -0.112], [0.025, -0.064], [0.029, -0.016],
  ], 0.027, 0.002), mattePolymerMat);
  magazineGroup.add(magBody);
  const magBaseplate = new THREE.Mesh(machinedBox(0.033, 0.011, 0.066), knuckleArmorMat);
  magBaseplate.position.set(0, -0.112, -0.017);
  magBaseplate.rotation.x = 0.2;
  magazineGroup.add(magBaseplate);
  weaponPivot.add(magazineGroup);
  const magazineRibs = new THREE.InstancedMesh(machinedBox(0.0025, 0.004, 0.05), dustMat, 14);
  const ribTransform = new THREE.Object3D();
  for (let i = 0; i < 14; i++) {
    const row = i % 7;
    ribTransform.position.set(i < 7 ? -0.015 : 0.015, 0.022 - row * 0.018, -row * 0.0025);
    ribTransform.rotation.x = 0.12 + row * 0.02;
    ribTransform.updateMatrix();
    magazineRibs.setMatrixAt(i, ribTransform.matrix);
  }
  magazineGroup.add(magazineRibs);
  weaponPivot.add(magazineGroup);

  // 2. Free-float M-LOK Vented Handguard & Fluted Barrel + Compensator
  const handguard = new THREE.Mesh(createVentedHandguard(), bronzeHandguardMat);
  weaponPivot.add(handguard);
  const barrelNut = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 24), steelMat);
  barrelNut.rotation.x = Math.PI / 2;
  barrelNut.position.set(0, 0.032, -0.105);
  weaponPivot.add(barrelNut);
  const innerBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.012, 0.36, 16), steelMat);
  innerBarrel.rotation.x = Math.PI / 2;
  innerBarrel.position.set(0, 0.032, -0.26);
  weaponPivot.add(innerBarrel);

  // Top full-length Picatinny rail spine + individual notched teeth
  const railSpine = new THREE.Mesh(machinedBox(0.022, 0.01, 0.56), receiverMetalMat);
  railSpine.position.set(0, 0.062, -0.155);
  weaponPivot.add(railSpine);

  const railTooth = new THREE.Shape();
  railTooth.moveTo(-0.009, 0);
  railTooth.lineTo(0.009, 0);
  railTooth.lineTo(0.0125, 0.0035);
  railTooth.lineTo(0.01, 0.006);
  railTooth.lineTo(-0.01, 0.006);
  railTooth.lineTo(-0.0125, 0.0035);
  railTooth.closePath();
  const toothGeo = new THREE.ExtrudeGeometry(railTooth, {
    depth: 0.007, bevelEnabled: true, bevelThickness: 0.0004,
    bevelSize: 0.0004, bevelSegments: 1,
  });
  toothGeo.translate(0, -0.003, -0.0035);
  const toothCount = 34;
  const railTeeth = new THREE.InstancedMesh(toothGeo, receiverMetalMat, toothCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < toothCount; i++) {
    dummy.position.set(0, 0.068, 0.105 - i * 0.016);
    dummy.updateMatrix();
    railTeeth.setMatrixAt(i, dummy.matrix);
  }
  railTeeth.instanceMatrix.needsUpdate = true;
  weaponPivot.add(railTeeth);

  // Angled M-LOK handstop + side tactical weapon light + top PEQ laser module
  const handstop = new THREE.Mesh(machinedBox(0.024, 0.028, 0.064), mattePolymerMat);
  handstop.position.set(0, -0.002, -0.258);
  handstop.rotation.x = 0.24;
  weaponPivot.add(handstop);

  const tacLightMount = new THREE.Mesh(machinedBox(0.016, 0.014, 0.028), receiverMetalMat);
  tacLightMount.position.set(0.026, 0.035, -0.35);
  weaponPivot.add(tacLightMount);

  const tacLightBody = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.098, 12), darkGunmetalMat);
  tacLightBody.rotation.x = Math.PI / 2;
  tacLightBody.position.set(0.037, 0.035, -0.362);
  weaponPivot.add(tacLightBody);

  const tacLightBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.012, 0.022, 12), steelMat);
  tacLightBezel.rotation.x = Math.PI / 2;
  tacLightBezel.position.set(0.037, 0.035, -0.415);
  weaponPivot.add(tacLightBezel);

  const tacLightLens = new THREE.Mesh(
    new THREE.CircleGeometry(0.0105, 12),
    new THREE.MeshBasicMaterial({ color: 0xaabcc8 })
  );
  tacLightLens.rotation.y = Math.PI;
  tacLightLens.position.set(0.037, 0.035, -0.427);
  weaponPivot.add(tacLightLens);

  const peqBody = new THREE.Mesh(machinedBox(0.038, 0.016, 0.068), mattePolymerMat);
  peqBody.position.set(0.011, 0.074, -0.31);
  weaponPivot.add(peqBody);
  const peqSwitch = new THREE.Mesh(machinedBox(0.018, 0.004, 0.038), knuckleArmorMat);
  peqSwitch.position.set(0, 0.072, -0.225);
  weaponPivot.add(peqSwitch);

  // Barrel & Compensator shroud
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.19, 10), steelMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.032, -0.49);
  weaponPivot.add(barrel);

  const compensator = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.085, 12), darkGunmetalMat);
  compensator.rotation.x = Math.PI / 2;
  compensator.position.set(0, 0.032, -0.57);
  weaponPivot.add(compensator);
  const muzzleBore = new THREE.Mesh(new THREE.CircleGeometry(0.009, 16), recessMat);
  muzzleBore.rotation.y = Math.PI;
  muzzleBore.position.set(0, 0.032, -0.613);
  weaponPivot.add(muzzleBore);

  // Flip-up front & rear backup iron sights
  const frontSightBase = new THREE.Mesh(machinedBox(0.022, 0.016, 0.026), mattePolymerMat);
  frontSightBase.position.set(0, 0.075, -0.415);
  weaponPivot.add(frontSightBase);
  const frontPost = new THREE.Mesh(machinedBox(0.004, 0.014, 0.006), steelMat);
  frontPost.position.set(0, 0.087, -0.418);
  weaponPivot.add(frontPost);

  const rearSight = new THREE.Mesh(machinedBox(0.026, 0.014, 0.028), mattePolymerMat);
  rearSight.position.set(0, 0.074, 0.082);
  weaponPivot.add(rearSight);

  // 3. EOTech-Style Holographic Optic (Hood + Base + Glass + Glowing Red Reticle)
  const opticGroup = new THREE.Group();
  opticGroup.position.set(0, OPTIC_Y, -0.02);

  const opticBase = new THREE.Mesh(machinedBox(0.038, 0.014, 0.092), darkGunmetalMat);
  opticBase.position.set(0, -0.014, 0);
  opticGroup.add(opticBase);

  const hoodShape = new THREE.Shape();
  roundedRect(hoodShape, -0.024, -0.016, 0.048, 0.055, 0.009);
  const hoodAperture = new THREE.Path();
  roundedRect(hoodAperture, -0.017, -0.006, 0.034, 0.036, 0.006);
  hoodShape.holes.push(hoodAperture);
  const hoodGeometry = new THREE.ExtrudeGeometry(hoodShape, {
    depth: 0.055, bevelEnabled: true, bevelSize: 0.0012,
    bevelThickness: 0.0012, bevelSegments: 2, curveSegments: 5,
  });
  hoodGeometry.translate(0, 0, -0.032);
  const opticHood = new THREE.Mesh(hoodGeometry, bronzeHandguardMat);
  opticGroup.add(opticHood);
  const gasketShape = new THREE.Shape();
  roundedRect(gasketShape, -0.018, -0.007, 0.036, 0.038, 0.007);
  const gasketHole = new THREE.Path();
  roundedRect(gasketHole, -0.016, -0.005, 0.032, 0.034, 0.005);
  gasketShape.holes.push(gasketHole);
  const lensGasket = new THREE.Mesh(new THREE.ShapeGeometry(gasketShape, 5), knuckleArmorMat);
  lensGasket.position.z = 0.0243;
  opticGroup.add(lensGasket);
  const hoodBolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0017, 0.0017, 0.001, 8), steelMat, 2);
  for (let i = 0; i < 2; i++) {
    dummy.position.set(i === 0 ? -0.021 : 0.021, -0.011, 0.025);
    dummy.rotation.set(Math.PI / 2, 0, 0);
    dummy.updateMatrix();
    hoodBolts.setMatrixAt(i, dummy.matrix);
  }
  opticGroup.add(hoodBolts);

  const batteryHood = new THREE.Mesh(machinedBox(0.035, 0.024, 0.044), fieldPolymerMat);
  batteryHood.position.set(0, -0.002, -0.046);
  opticGroup.add(batteryHood);

  const windageDial = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 10), steelMat);
  windageDial.rotation.z = Math.PI / 2;
  windageDial.position.set(0.023, 0.008, -0.01);
  opticGroup.add(windageDial);

  const lensShape = new THREE.Shape();
  roundedRect(lensShape, -0.016, -0.005, 0.032, 0.034, 0.005);
  const opticGlass = new THREE.Mesh(new THREE.ShapeGeometry(lensShape, 5), opticGlassMat);
  opticGlass.position.z = 0.015;
  opticGroup.add(opticGlass);

  const reticleMat = new THREE.MeshBasicMaterial({
    map: reticleTex,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  const reticleMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.034), reticleMat);
  reticleMesh.position.set(0, 0.012, 0.016);
  opticGroup.add(reticleMesh);
  weaponPivot.add(opticGroup);

  // Tailored forearms and articulated glove silhouettes; fingers physically wrap the rail.
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const leftElbow = new THREE.Vector3(-0.215, -0.16, 0.085);
  const leftWrist = new THREE.Vector3(-0.047, 0.004, -0.231);
  const leftSpan = leftElbow.distanceTo(leftWrist);
  const leftForearmPivot = new THREE.Group();
  leftForearmPivot.position.copy(leftElbow);
  leftForearmPivot.quaternion.setFromUnitVectors(Y_AXIS, new THREE.Vector3().subVectors(leftWrist, leftElbow).normalize());
  leftForearmPivot.add(new THREE.Mesh(createSleeve(leftSpan, 0.054, 0.033), oliveSleeveMat));
  weaponPivot.add(leftForearmPivot);
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x737961, roughness: 1 });
  const seamPoints = Array.from({ length: 12 }, (_, i) => {
    const t = i / 11;
    return new THREE.Vector3(THREE.MathUtils.lerp(0.054, 0.033, t) * 0.93 + Math.sin(t * Math.PI) * 0.006,
      t * leftSpan, -Math.sin(t * Math.PI) * 0.006);
  });
  const sleeveSeam = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seamPoints), 18, 0.0007, 4, false), seamMat);
  leftForearmPivot.add(sleeveSeam);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.026, 20), oliveSleeveMat);
  cuff.position.y = leftSpan - 0.01;
  leftForearmPivot.add(cuff);
  const cuffBinding = new THREE.Mesh(new THREE.CylinderGeometry(0.0347, 0.0347, 0.006, 20), seamMat);
  cuffBinding.position.y = leftSpan + 0.002;
  leftForearmPivot.add(cuffBinding);

  const watchBand = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.018, 20), knuckleArmorMat);
  watchBand.position.y = leftSpan - 0.015;
  leftForearmPivot.add(watchBand);
  const watchCase = new THREE.Mesh(machinedBox(0.029, 0.032, 0.012), steelMat);
  watchCase.position.set(0, leftSpan - 0.015, 0.034);
  leftForearmPivot.add(watchCase);
  const watchFace = new THREE.Mesh(new THREE.PlaneGeometry(0.023, 0.025), watchDialMat);
  watchFace.position.set(0, leftSpan - 0.015, 0.0405);
  leftForearmPivot.add(watchFace);

  const leftHandGroup = new THREE.Group();
  leftHandGroup.position.copy(leftWrist);
  weaponPivot.add(leftHandGroup);
  const handPoint = (x: number, y: number, z: number) => new THREE.Vector3(x - leftWrist.x, y - leftWrist.y, z - leftWrist.z);
  const leftPalmGeometry = new THREE.SphereGeometry(1, 18, 12);
  leftPalmGeometry.scale(0.018, 0.026, 0.043);
  const leftPalm = new THREE.Mesh(leftPalmGeometry, gloveFabricMat);
  leftPalm.position.copy(handPoint(-0.039, 0.018, -0.267));
  leftPalm.rotation.z = -0.15;
  leftHandGroup.add(leftPalm);
  const palmPanel = new THREE.Mesh(machinedBox(0.007, 0.032, 0.061), knuckleArmorMat);
  palmPanel.position.copy(handPoint(-0.054, 0.022, -0.266));
  palmPanel.rotation.z = -0.15;
  leftHandGroup.add(palmPanel);
  const wristGloveGeometry = new THREE.SphereGeometry(1, 16, 10);
  wristGloveGeometry.scale(0.024, 0.019, 0.026);
  const wristGlove = new THREE.Mesh(wristGloveGeometry, gloveFabricMat);
  wristGlove.position.copy(handPoint(-0.045, 0.006, -0.229));
  wristGlove.rotation.x = -0.35;
  leftHandGroup.add(wristGlove);
  const wristCinch = new THREE.Mesh(machinedBox(0.0475, 0.009, 0.039), knuckleArmorMat);
  wristCinch.position.copy(handPoint(-0.046, 0.023, -0.226));
  wristCinch.rotation.x = -0.35;
  leftHandGroup.add(wristCinch);

  const fingerPieces: THREE.BufferGeometry[] = [];
  const armorPieces: THREE.BufferGeometry[] = [];
  for (let finger = 0; finger < 4; finger++) {
    const z = -0.236 - finger * 0.018;
    const joints = [handPoint(-0.049, 0.013, z), handPoint(-0.029, -0.012, z - 0.002),
      handPoint(0.001, -0.014, z - 0.004), handPoint(0.016, 0.006, z - 0.005)];
    for (let joint = 0; joint < 3; joint++) fingerPieces.push(boneSegment(joints[joint], joints[joint + 1], 0.0075 - joint * 0.0005));
    const knuckle = new THREE.SphereGeometry(1, 10, 8);
    knuckle.scale(0.006, 0.0115, 0.008);
    const point = handPoint(-0.054, 0.017, z);
    knuckle.translate(point.x, point.y, point.z);
    armorPieces.push(knuckle);
  }
  const thumbJoints = [handPoint(-0.049, 0.035, -0.233), handPoint(-0.027, 0.059, -0.239), handPoint(0.006, 0.059, -0.25)];
  fingerPieces.push(boneSegment(thumbJoints[0], thumbJoints[1], 0.009), boneSegment(thumbJoints[1], thumbJoints[2], 0.008));
  const fingerGeometry = mergeGeometries(fingerPieces, false)!;
  for (const piece of fingerPieces) piece.dispose();
  leftHandGroup.add(new THREE.Mesh(fingerGeometry, gloveFabricMat));
  const armorGeometry = mergeGeometries(armorPieces, false)!;
  for (const piece of armorPieces) piece.dispose();
  leftHandGroup.add(new THREE.Mesh(armorGeometry, knuckleArmorMat));

  // The firing hand has a contoured palm and individual wrapped fingers, including a trigger finger.
  const rightPalmGeometry = new THREE.SphereGeometry(1, 18, 12);
  rightPalmGeometry.scale(0.024, 0.037, 0.026);
  const rightPalm = new THREE.Mesh(rightPalmGeometry, gloveFabricMat);
  rightPalm.position.set(-0.005, -0.075, 0.116);
  rightPalm.rotation.x = -0.33;
  weaponPivot.add(rightPalm);
  const rightGlovePadGeometry = new THREE.SphereGeometry(1, 16, 10);
  rightGlovePadGeometry.scale(0.019, 0.021, 0.0045);
  const rightGlovePad = new THREE.Mesh(rightGlovePadGeometry, knuckleArmorMat);
  rightGlovePad.position.set(-0.005, -0.063, 0.139);
  rightGlovePad.rotation.x = -0.33;
  weaponPivot.add(rightGlovePad);
  const rightFingers: THREE.BufferGeometry[] = [];
  for (let finger = 0; finger < 3; finger++) {
    const y = -0.064 - finger * 0.019;
    const joints = [new THREE.Vector3(0.029, y, 0.118), new THREE.Vector3(0.025, y - 0.002, 0.078),
      new THREE.Vector3(0.006, y, 0.063), new THREE.Vector3(-0.013, y + 0.003, 0.082)];
    for (let joint = 0; joint < 3; joint++) rightFingers.push(boneSegment(joints[joint], joints[joint + 1], 0.0075));
  }
  rightFingers.push(boneSegment(new THREE.Vector3(0.027, -0.035, 0.097), new THREE.Vector3(0.022, -0.027, 0.055), 0.0075));
  rightFingers.push(boneSegment(new THREE.Vector3(0.022, -0.027, 0.055), new THREE.Vector3(0.003, -0.033, 0.045), 0.0065));
  rightFingers.push(boneSegment(new THREE.Vector3(-0.003, -0.052, 0.13), new THREE.Vector3(0.018, -0.035, 0.13), 0.011));
  rightFingers.push(boneSegment(new THREE.Vector3(0.026, -0.037, 0.137), new THREE.Vector3(-0.008, -0.033, 0.123), 0.008));
  const rightFingerGeometry = mergeGeometries(rightFingers, false)!;
  for (const piece of rightFingers) piece.dispose();
  weaponPivot.add(new THREE.Mesh(rightFingerGeometry, gloveFabricMat));
  const rightElbow = new THREE.Vector3(0.17, -0.225, 0.355);
  const rightWrist = new THREE.Vector3(0.038, -0.108, 0.152);
  const rightSpan = rightElbow.distanceTo(rightWrist);
  const rightForearm = new THREE.Mesh(createSleeve(rightSpan, 0.052, 0.033), oliveSleeveMat);
  rightForearm.position.copy(rightElbow);
  rightForearm.quaternion.setFromUnitVectors(Y_AXIS, new THREE.Vector3().subVectors(rightWrist, rightElbow).normalize());
  weaponPivot.add(rightForearm);
  const rightCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.024, 18), oliveSleeveMat);
  rightCuff.position.copy(rightWrist);
  rightCuff.quaternion.copy(rightForearm.quaternion);
  weaponPivot.add(rightCuff);

  const reloadWrist = new THREE.Vector3();
  const reloadElbow = new THREE.Vector3();
  const reloadArmDirection = new THREE.Vector3();
  const eyeInWeapon = new THREE.Vector3();
  const inverseWeaponRotation = new THREE.Quaternion();
  const spareMagazine = magazineGroup.clone(true);
  spareMagazine.name = 'reload-spare-magazine';
  spareMagazine.visible = false;
  weaponPivot.add(spareMagazine);
  const gripWristOffset = new THREE.Vector3(-0.035, -0.055, 0.025);
  const handTarget = new THREE.Vector3();

  // 6. Muzzle Flash & Anchor
  const muzzleWorldAnchor = new THREE.Object3D();
  muzzleWorldAnchor.position.set(0, 0.032, -0.625);
  weaponPivot.add(muzzleWorldAnchor);

  const muzzleFlashGroup = new THREE.Group();
  muzzleFlashGroup.position.copy(muzzleWorldAnchor.position);
  muzzleFlashGroup.visible = false;
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffe5b5,
    map: flashTex,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const flashGeometry = new THREE.PlaneGeometry(0.068, 0.15);
  flashGeometry.rotateX(Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(flashGeometry, flashMat);
    fin.rotation.z = (i / 3) * Math.PI;
    fin.position.z = -0.045;
    muzzleFlashGroup.add(fin);
  }
  const flashCore = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), flashMat);
  muzzleFlashGroup.add(flashCore);
  weaponPivot.add(muzzleFlashGroup);

  const muzzleFlashLight = new THREE.PointLight(0xffb454, 0, 12, 2);
  muzzleFlashLight.position.set(0, 0.04, -0.66);
  weaponPivot.add(muzzleFlashLight);

  // Base hipfire pose (bottom-right tactical hold matching reference photos 1–3)
  const HIP_POS = new THREE.Vector3(0.15, -0.151, -0.265);
  const HIP_ROT = new THREE.Euler(0.025, -0.065, 0.025);

  // ADS pose: centers optic reticle (0, OPTIC_Y, ...) directly along camera forward ray
  const ADS_POS = new THREE.Vector3(0, -(OPTIC_Y + 0.012) * 0.56, -0.235);
  const ADS_ROT = new THREE.Euler(0, 0, 0);
  let sprintBlend = 0;

  return {
    root,
    weaponPivot,
    magazineGroup,
    boltCarrier,
    muzzleFlashGroup,
    muzzleFlashLight,
    muzzleWorldAnchor,
    reticleMesh,
    textures,
    update: (dt, elapsed, spring, opts) => {
      const a = spring.adsAlpha;
      const moveIntensity = Math.min(1.2, opts.speedMs / 5.0);
      const bobMult = (1 - a * 0.9) * (opts.speedMs > 0.25 ? moveIntensity : 0.14);

      const bobX = Math.cos(spring.bobPhase * 0.5) * 0.011 * bobMult;
      const bobY = Math.abs(Math.sin(spring.bobPhase)) * 0.007 * bobMult + Math.sin(elapsed * 1.45) * 0.0014 * (1 - a * 0.5);

      const px = THREE.MathUtils.lerp(HIP_POS.x, ADS_POS.x, a) + bobX + spring.swayX;
      const py = THREE.MathUtils.lerp(HIP_POS.y, ADS_POS.y, a) - bobY + spring.swayY;
      const pz = THREE.MathUtils.lerp(HIP_POS.z, ADS_POS.z, a) + spring.recoilKickZ * 0.45;

      let rx = THREE.MathUtils.lerp(HIP_ROT.x, ADS_ROT.x, a) + spring.recoilPitch * 0.52;
      let ry = THREE.MathUtils.lerp(HIP_ROT.y, ADS_ROT.y, a) + spring.recoilYaw * 0.35;
      let rz = THREE.MathUtils.lerp(HIP_ROT.z, ADS_ROT.z, a) - spring.swayX * 1.1;

      // Tactical low-ready sprint cant
      const sprintTarget = opts.sprinting && a < 0.2 && opts.reloadProgress <= 0 ? 1 : 0;
      sprintBlend = THREE.MathUtils.damp(sprintBlend, sprintTarget, 10, Math.min(dt, 0.1));
      const sx = -0.035 * sprintBlend;
      const sy = -0.04 * sprintBlend;
      rx -= 0.22 * sprintBlend;
      ry += 0.5 * sprintBlend;
      rz += 0.32 * sprintBlend;

      // Reload animation (tilt weapon & drop/swap magazine)
      let magDropY = 0;
      if (opts.reloadProgress > 0) {
        const p = opts.reloadProgress;
        const cant = Math.sin(p * Math.PI);
        rx += cant * 0.28;
        ry += cant * 0.32;
        rz -= cant * 0.42;
        if (p < 0.4) magDropY = -0.26 * THREE.MathUtils.smoothstep(p, 0.24, 0.4);
      }

      // Inspect showcase animation ([I])
      if (opts.inspectProgress > 0) {
        const p = opts.inspectProgress;
        const wave = Math.sin(p * Math.PI);
        ry += wave * 0.65;
        rz += wave * 0.28;
        rx += wave * 0.08;
      }

      const reloadLift = opts.reloadProgress > 0 ? Math.sin(opts.reloadProgress * Math.PI) : 0;
      weaponPivot.position.set(px + sx - reloadLift * 0.045, py + sy + reloadLift * 0.1, pz - reloadLift * 0.018);
      weaponPivot.rotation.set(rx, ry, rz);
      // The shoulder-mounted stock sits behind the eye during a cheek weld. Hide it before it
      // enters the near plane instead of exposing clipped interior polygons through the sight.
      const showStock = a < 0.22 || opts.inspectProgress > 0;
      stockBody.visible = showStock;
      shoulderPad.visible = showStock;
      bufferTube.visible = showStock;
      magazineGroup.position.y = -0.055 + magDropY;
      const reload = opts.reloadProgress;
      const swapping = reload >= 0.4 && reload < 0.75;
      magazineGroup.visible = !swapping;
      spareMagazine.visible = swapping;
      const insertion = THREE.MathUtils.smoothstep(reload, 0.4, 0.75);
      spareMagazine.position.set(-0.035 * Math.sin(insertion * Math.PI),
        THREE.MathUtils.lerp(-0.315, -0.055, insertion), -0.052 + Math.sin(insertion * Math.PI) * 0.05);
      const supportHandReach = reload > 0
        ? THREE.MathUtils.smoothstep(reload, 0.1, 0.27) * (1 - THREE.MathUtils.smoothstep(reload, 0.76, 0.94))
        : 0;
      handTarget.copy(swapping ? spareMagazine.position : magazineGroup.position).add(gripWristOffset);
      reloadWrist.copy(leftWrist).lerp(handTarget, supportHandReach);
      reloadElbow.copy(leftElbow);
      reloadElbow.x -= supportHandReach * 0.045;
      reloadElbow.y -= supportHandReach * 0.045;
      reloadArmDirection.subVectors(reloadWrist, reloadElbow);
      leftForearmPivot.position.copy(reloadElbow);
      leftForearmPivot.scale.y = reloadArmDirection.length() / leftSpan;
      leftForearmPivot.quaternion.setFromUnitVectors(Y_AXIS, reloadArmDirection.normalize());
      leftHandGroup.position.copy(reloadWrist);
      leftHandGroup.rotation.set(supportHandReach * 0.1, 0, supportHandReach * -0.38);
      boltCarrier.position.z = -0.012 + opts.boltKick * 0.055;

      // A collimated reticle translates across the lens with the eye, then clips at its aperture.
      // Hipfire views naturally lose the reticle; translating the weapon during ADS preserves aim.
      inverseWeaponRotation.copy(weaponPivot.quaternion).invert();
      eyeInWeapon.copy(weaponPivot.position).negate().applyQuaternion(inverseWeaponRotation).divideScalar(0.56);
      reticleTex.offset.set(-eyeInWeapon.x / 0.032, -(eyeInWeapon.y - (OPTIC_Y + 0.012)) / 0.034);

      const flashActive = opts.muzzleFlashTimer > 0;
      muzzleFlashGroup.visible = flashActive;
      if (flashActive) {
        muzzleFlashGroup.rotation.z = elapsed * 47.0;
        const s = 0.75 + (opts.muzzleFlashTimer / 0.05) * 0.55;
        muzzleFlashGroup.scale.setScalar(s);
      }
      muzzleFlashLight.intensity = flashActive ? (opts.muzzleFlashTimer / 0.05) * 5.5 : 0;
    },
    dispose: () => {
      for (const t of textures) t.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of meshMaterials) materials.add(material);
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
