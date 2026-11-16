import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { FpsWeaponSpringState } from './rendaMath';

// Small machined edge radii catch the environment lighting without increasing draw calls.
function machinedBox(width: number, height: number, depth: number): THREE.BufferGeometry {
  return new RoundedBoxGeometry(width, height, depth, 2, Math.min(width, height, depth) * 0.16);
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
  ];

  const receiverMetalMat = new THREE.MeshStandardMaterial({
    color: 0xa9afaa,
    map: metalMap,
    roughness: 0.78,
    metalness: 0.78,
    bumpMap: metalBump,
    bumpScale: 0.00016,
    roughnessMap: metalRough,
  });
  const darkGunmetalMat = new THREE.MeshStandardMaterial({
    color: 0x737c76,
    map: metalMap,
    roughness: 0.84,
    metalness: 0.68,
    bumpMap: metalBump,
    bumpScale: 0.00012,
    roughnessMap: metalRough,
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
  const dustMat = new THREE.MeshStandardMaterial({ color: 0x55574b, roughness: 0.92, metalness: 0.05 });
  const oliveSleeveMat = new THREE.MeshStandardMaterial({
    color: 0xe6e4da,
    map: sleeveMap,
    roughness: 0.96,
    metalness: 0.01,
    bumpMap: fabricBump,
    bumpScale: 0.00055,
    roughnessMap: sleeveRough,
  });
  const gloveFabricMat = new THREE.MeshStandardMaterial({
    color: 0x1d1f21,
    roughness: 0.84,
    metalness: 0.06,
    bumpMap: fabricBump,
    bumpScale: 0.00035,
  });
  const knuckleArmorMat = new THREE.MeshStandardMaterial({
    color: 0x131517,
    roughness: 0.42,
    metalness: 0.28,
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
    opacity: 0.12,
    roughness: 0.05,
    metalness: 0.12,
    reflectivity: 0.9,
    clearcoat: 1.0,
    depthWrite: false,
  });

  // Optic centerline height in weapon-local space = +0.086 (used to align ADS dead-center)
  const OPTIC_Y = 0.086;

  // 1. Chamfered Upper & Lower Receiver
  const recShape = new THREE.Shape();
  recShape.moveTo(-0.021, -0.028);
  recShape.lineTo(0.021, -0.028);
  recShape.lineTo(0.024, -0.012);
  recShape.lineTo(0.024, 0.048);
  recShape.lineTo(0.016, 0.058);
  recShape.lineTo(-0.016, 0.058);
  recShape.lineTo(-0.024, 0.048);
  recShape.lineTo(-0.024, -0.012);
  recShape.closePath();
  const recGeo = new THREE.ExtrudeGeometry(recShape, {
    depth: 0.21,
    bevelEnabled: true,
    bevelThickness: 0.0025,
    bevelSize: 0.002,
    bevelSegments: 2,
  });
  recGeo.translate(0, 0.003, -0.095);
  const receiverMesh = new THREE.Mesh(recGeo, receiverMetalMat);
  weaponPivot.add(receiverMesh);

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
  const chargingHandle = new THREE.Mesh(machinedBox(0.042, 0.011, 0.026), steelMat);
  chargingHandle.position.set(0, 0.054, 0.118);
  weaponPivot.add(chargingHandle);

  // Trigger guard & curved trigger
  const triggerGuard = new THREE.Mesh(machinedBox(0.012, 0.006, 0.052), mattePolymerMat);
  triggerGuard.position.set(0, -0.048, 0.048);
  weaponPivot.add(triggerGuard);
  const trigger = new THREE.Mesh(machinedBox(0.006, 0.022, 0.008), steelMat);
  trigger.position.set(0, -0.034, 0.052);
  trigger.rotation.x = 0.25;
  weaponPivot.add(trigger);

  // Pistol grip
  const pistolGrip = new THREE.Mesh(machinedBox(0.034, 0.105, 0.046), mattePolymerMat);
  pistolGrip.position.set(0, -0.078, 0.098);
  pistolGrip.rotation.x = -0.34;
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

  const stockBody = new THREE.Mesh(machinedBox(0.042, 0.092, 0.16), mattePolymerMat);
  stockBody.position.set(0, 0.008, 0.265);
  weaponPivot.add(stockBody);

  // Curved 30-round PMAG magazine with textured rib bands
  const magazineGroup = new THREE.Group();
  magazineGroup.position.set(0, -0.055, -0.052);
  const magUpper = new THREE.Mesh(machinedBox(0.028, 0.09, 0.064), mattePolymerMat);
  magUpper.rotation.x = 0.12;
  magazineGroup.add(magUpper);
  const magLower = new THREE.Mesh(machinedBox(0.028, 0.072, 0.062), mattePolymerMat);
  magLower.position.set(0, -0.072, -0.014);
  magLower.rotation.x = 0.26;
  magazineGroup.add(magLower);
  const magBaseplate = new THREE.Mesh(machinedBox(0.031, 0.012, 0.068), knuckleArmorMat);
  magBaseplate.position.set(0, -0.108, -0.023);
  magBaseplate.rotation.x = 0.26;
  magazineGroup.add(magBaseplate);
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
  const handguard = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.027, 0.34, 8), darkGunmetalMat);
  handguard.rotation.x = Math.PI / 2;
  handguard.rotation.y = Math.PI / 8;
  handguard.position.set(0, 0.032, -0.265);
  weaponPivot.add(handguard);

  // Top full-length Picatinny rail spine + individual notched teeth
  const railSpine = new THREE.Mesh(machinedBox(0.022, 0.01, 0.56), receiverMetalMat);
  railSpine.position.set(0, 0.062, -0.155);
  weaponPivot.add(railSpine);

  const toothGeo = machinedBox(0.024, 0.005, 0.007);
  const toothCount = 34;
  const railTeeth = new THREE.InstancedMesh(toothGeo, steelMat, toothCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < toothCount; i++) {
    dummy.position.set(0, 0.068, 0.105 - i * 0.016);
    dummy.updateMatrix();
    railTeeth.setMatrixAt(i, dummy.matrix);
  }
  railTeeth.instanceMatrix.needsUpdate = true;
  weaponPivot.add(railTeeth);

  // M-LOK side ventilation slots
  const slotGeo = machinedBox(0.004, 0.009, 0.032);
  for (const side of [-1, 1]) {
    for (let si = 0; si < 5; si++) {
      const slot = new THREE.Mesh(slotGeo, recessMat);
      slot.position.set(side * 0.025, 0.032, -0.15 - si * 0.052);
      weaponPivot.add(slot);
    }
  }

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

  const leftWall = new THREE.Mesh(machinedBox(0.0055, 0.044, 0.068), receiverMetalMat);
  leftWall.position.set(-0.019, 0.012, -0.006);
  opticGroup.add(leftWall);

  const rightWall = new THREE.Mesh(machinedBox(0.0055, 0.044, 0.068), receiverMetalMat);
  rightWall.position.set(0.019, 0.012, -0.006);
  opticGroup.add(rightWall);

  const hoodTop = new THREE.Mesh(machinedBox(0.043, 0.0055, 0.068), receiverMetalMat);
  hoodTop.position.set(0, 0.035, -0.006);
  opticGroup.add(hoodTop);

  const batteryHood = new THREE.Mesh(machinedBox(0.035, 0.024, 0.044), darkGunmetalMat);
  batteryHood.position.set(0, -0.002, -0.046);
  opticGroup.add(batteryHood);

  const windageDial = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 10), steelMat);
  windageDial.rotation.z = Math.PI / 2;
  windageDial.position.set(0.023, 0.008, -0.01);
  opticGroup.add(windageDial);

  const opticGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.036), opticGlassMat);
  opticGlass.position.set(0, 0.012, -0.004);
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
  const reticleMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.028, 0.028), reticleMat);
  reticleMesh.position.set(0, 0.012, -0.006);
  opticGroup.add(reticleMesh);
  weaponPivot.add(opticGroup);

  // 4. Cohesive Vector-Aligned Gloved Operator Left Arm, Rolled Olive Cuff, Watch & C-Clamp Handguard Grip
  const leftArmGroup = new THREE.Group();
  const elbowPos = new THREE.Vector3(-0.22, -0.145, 0.06);
  const wristPos = new THREE.Vector3(-0.048, -0.004, -0.225);
  const armSpan = elbowPos.distanceTo(wristPos);
  const armDir = new THREE.Vector3().subVectors(wristPos, elbowPos).normalize();
  const armMid = new THREE.Vector3().addVectors(elbowPos, wristPos).multiplyScalar(0.5);
  const armQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), armDir);

  const sleeveGeometry = new THREE.CylinderGeometry(0.047, 0.064, armSpan, 24, 18);
  const sleevePositions = sleeveGeometry.getAttribute('position');
  // The silhouette gets shallow cloth folds; fine ripstop remains a submillimetre bump.
  for (let i = 0; i < sleevePositions.count; i++) {
    const y = sleevePositions.getY(i);
    const along = (y + armSpan * 0.5) / armSpan;
    const angle = Math.atan2(sleevePositions.getZ(i), sleevePositions.getX(i));
    const fold = Math.sin(along * 23 + Math.cos(angle * 2) * 0.9) * 0.045 * Math.sin(along * Math.PI);
    sleevePositions.setX(i, sleevePositions.getX(i) * (1 + fold));
    sleevePositions.setZ(i, sleevePositions.getZ(i) * (1 + fold));
  }
  sleeveGeometry.computeVertexNormals();
  const leftForearm = new THREE.Mesh(sleeveGeometry, oliveSleeveMat);
  leftForearm.position.copy(armMid);
  leftForearm.quaternion.copy(armQuat);
  leftArmGroup.add(leftForearm);

  // Tapered olive sleeve cuff aligned coaxially along forearm
  const cuffRing = new THREE.Mesh(new THREE.CylinderGeometry(0.0485, 0.0505, 0.038, 20), oliveSleeveMat);
  cuffRing.position.copy(wristPos).addScaledVector(armDir, -0.02);
  cuffRing.quaternion.copy(armQuat);
  leftArmGroup.add(cuffRing);

  // Tactical wristwatch & strap seated on operator left wrist
  const watchBand = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.044, 0.02, 14), mattePolymerMat);
  watchBand.position.copy(wristPos).addScaledVector(armDir, -0.002);
  watchBand.quaternion.copy(armQuat);
  leftArmGroup.add(watchBand);

  const watchCase = new THREE.Mesh(machinedBox(0.028, 0.026, 0.012), knuckleArmorMat);
  watchCase.position.copy(wristPos).addScaledVector(armDir, -0.002).add(new THREE.Vector3(-0.018, 0.036, 0));
  watchCase.quaternion.copy(armQuat);
  leftArmGroup.add(watchCase);

  const watchFace = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.018), watchDialMat);
  watchFace.position.copy(watchCase.position).add(new THREE.Vector3(0, 0.007, 0));
  watchFace.rotation.x = -Math.PI / 2 + 0.35;
  watchFace.rotation.z = 0.25;
  leftArmGroup.add(watchFace);

  // Tactical glove wrist & Velcro cinch strap bridging sleeve into gloved palm
  const gloveWrist = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.043, 0.055, 14), gloveFabricMat);
  gloveWrist.position.copy(wristPos).addScaledVector(armDir, 0.016);
  gloveWrist.quaternion.copy(armQuat);
  leftArmGroup.add(gloveWrist);

  const wristStrap = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.018, 14), knuckleArmorMat);
  wristStrap.position.copy(wristPos).addScaledVector(armDir, 0.007);
  wristStrap.quaternion.copy(armQuat);
  leftArmGroup.add(wristStrap);

  // Left gloved palm & molded carbon knuckle armor cradling M-LOK handguard
  const leftPalm = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.042, 4, 10), gloveFabricMat);
  leftPalm.position.set(-0.028, 0.016, -0.268);
  leftPalm.rotation.set(Math.PI / 2 - 0.18, 0.14, -0.35);
  leftArmGroup.add(leftPalm);

  const knuckleGuard = new THREE.Mesh(machinedBox(0.018, 0.032, 0.062), knuckleArmorMat);
  knuckleGuard.position.set(-0.043, 0.025, -0.272);
  knuckleGuard.rotation.z = -0.26;
  leftArmGroup.add(knuckleGuard);

  // Thumb curled over top rail & 4 fingers gripping underside of M-LOK rail
  const leftThumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.046, 4, 8), gloveFabricMat);
  leftThumb.rotation.set(Math.PI / 2 - 0.35, 0.18, 0.72);
  leftThumb.position.set(-0.016, 0.049, -0.262);
  leftArmGroup.add(leftThumb);

  for (let fi = 0; fi < 4; fi++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.034, 4, 6), gloveFabricMat);
    finger.rotation.z = 0.85;
    finger.position.set(0.006, 0.006 - fi * 0.003, -0.242 - fi * 0.02);
    leftArmGroup.add(finger);
  }
  weaponPivot.add(leftArmGroup);

  // 5. Right Gloved Hand on Pistol Grip + Sleeve Edge
  const rightHand = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.044, 4, 10), gloveFabricMat);
  rightHand.position.set(0.015, -0.064, 0.106);
  rightHand.rotation.x = -0.32;
  weaponPivot.add(rightHand);

  const rElbow = new THREE.Vector3(0.14, -0.18, 0.34);
  const rWrist = new THREE.Vector3(0.03, -0.075, 0.13);
  const rDir = new THREE.Vector3().subVectors(rWrist, rElbow).normalize();
  const rMid = new THREE.Vector3().addVectors(rElbow, rWrist).multiplyScalar(0.5);
  const rightArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.058, rElbow.distanceTo(rWrist), 14),
    oliveSleeveMat
  );
  rightArm.position.copy(rMid);
  rightArm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rDir);
  weaponPivot.add(rightArm);

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
  const HIP_POS = new THREE.Vector3(0.155, -0.145, -0.285);
  const HIP_ROT = new THREE.Euler(0.02, -0.055, 0.02);

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
      const bobMult = (1 - a * 0.8) * (opts.speedMs > 0.25 ? moveIntensity : 0.14);

      const bobX = Math.cos(spring.bobPhase * 0.5) * 0.011 * bobMult;
      const bobY = Math.abs(Math.sin(spring.bobPhase)) * 0.009 * bobMult + Math.sin(elapsed * 1.45) * 0.0014 * (1 - a * 0.5);

      const px = THREE.MathUtils.lerp(HIP_POS.x, ADS_POS.x, a) + bobX + spring.swayX;
      const py = THREE.MathUtils.lerp(HIP_POS.y, ADS_POS.y, a) - bobY + spring.swayY;
      const pz = THREE.MathUtils.lerp(HIP_POS.z, ADS_POS.z, a) + spring.recoilKickZ * 0.45;

      let rx = THREE.MathUtils.lerp(HIP_ROT.x, ADS_ROT.x, a) + spring.recoilPitch * 0.52;
      let ry = THREE.MathUtils.lerp(HIP_ROT.y, ADS_ROT.y, a) + spring.recoilYaw * 0.35;
      let rz = THREE.MathUtils.lerp(HIP_ROT.z, ADS_ROT.z, a) - spring.swayX * 1.1;

      // Tactical low-ready sprint cant
      const sprintTarget = opts.sprinting && a < 0.2 && opts.reloadProgress <= 0 ? 1 : 0;
      sprintBlend = THREE.MathUtils.damp(sprintBlend, sprintTarget, 10, Math.min(dt, 0.1));
      const sx = -0.055 * sprintBlend;
      const sy = -0.032 * sprintBlend;
      rx -= 0.14 * sprintBlend;
      ry += 0.38 * sprintBlend;
      rz += 0.22 * sprintBlend;

      // Reload animation (tilt weapon & drop/swap magazine)
      let magDropY = 0;
      if (opts.reloadProgress > 0) {
        const p = opts.reloadProgress;
        const cant = Math.sin(p * Math.PI);
        rx += cant * 0.28;
        ry += cant * 0.32;
        rz -= cant * 0.42;
        if (p > 0.18 && p < 0.78) {
          magDropY = -Math.sin(((p - 0.18) / 0.6) * Math.PI) * 0.22;
        }
      }

      // Inspect showcase animation ([I])
      if (opts.inspectProgress > 0) {
        const p = opts.inspectProgress;
        const wave = Math.sin(p * Math.PI);
        ry += wave * 0.65;
        rz += wave * 0.28;
        rx += wave * 0.08;
      }

      weaponPivot.position.set(px + sx, py + sy, pz);
      weaponPivot.rotation.set(rx, ry, rz);
      magazineGroup.position.y = -0.055 + magDropY;
      const supportHandReach = opts.reloadProgress > 0
        ? Math.sin(THREE.MathUtils.smoothstep(opts.reloadProgress, 0.08, 0.9) * Math.PI)
        : 0;
      leftArmGroup.position.set(supportHandReach * 0.022, supportHandReach * -0.1, supportHandReach * 0.18);
      boltCarrier.position.z = -0.012 + opts.boltKick * 0.055;

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
