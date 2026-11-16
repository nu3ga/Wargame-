import * as THREE from 'three';
import type { FpsWeaponSpringState } from './rendaMath';

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

  dCtx.fillStyle = '#292c30';
  dCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#626262';
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
    grad.addColorStop(1, 'rgba(41,44,48,0)');
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

    rCtx.strokeStyle = isWear ? '#383838' : rand() > 0.45 ? '#787878' : '#4a4a4a';
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

  // Diagonal natural sleeve tension folds
  for (let f = 0; f < 14; f++) {
    const y0 = (f / 14) * size + (rand() - 0.5) * 18;
    const g = dCtx.createLinearGradient(0, y0 - 16, 0, y0 + 16);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.45, 'rgba(20,24,16,0.28)');
    g.addColorStop(0.65, 'rgba(115,124,96,0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    dCtx.fillStyle = g;
    dCtx.fillRect(0, y0 - 16, size, 32);

    const bg = bCtx.createLinearGradient(0, y0 - 14, 0, y0 + 14);
    bg.addColorStop(0, 'rgba(128,128,128,0)');
    bg.addColorStop(0.45, 'rgba(76,76,76,0.45)');
    bg.addColorStop(0.65, 'rgba(182,182,182,0.35)');
    bg.addColorStop(1, 'rgba(128,128,128,0)');
    bCtx.fillStyle = bg;
    bCtx.fillRect(0, y0 - 14, size, 28);
  }

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
  const textures: THREE.Texture[] = [
    metalMap,
    metalBump,
    metalRough,
    sleeveMap,
    fabricBump,
    sleeveRough,
    reticleTex,
  ];

  const receiverMetalMat = new THREE.MeshStandardMaterial({
    color: 0xd4d8de,
    map: metalMap,
    roughness: 0.4,
    metalness: 0.8,
    bumpMap: metalBump,
    bumpScale: 0.011,
    roughnessMap: metalRough,
  });
  const darkGunmetalMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a8,
    map: metalMap,
    roughness: 0.46,
    metalness: 0.72,
    bumpMap: metalBump,
    bumpScale: 0.008,
    roughnessMap: metalRough,
  });
  const mattePolymerMat = new THREE.MeshStandardMaterial({
    color: 0x1a1c1f,
    roughness: 0.8,
    metalness: 0.08,
    bumpMap: fabricBump,
    bumpScale: 0.006,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x4b5059,
    roughness: 0.28,
    metalness: 0.9,
    bumpMap: metalBump,
    bumpScale: 0.004,
  });
  const oliveSleeveMat = new THREE.MeshStandardMaterial({
    color: 0xe6e4da,
    map: sleeveMap,
    roughness: 0.96,
    metalness: 0.01,
    bumpMap: fabricBump,
    bumpScale: 0.028,
    roughnessMap: sleeveRough,
  });
  const gloveFabricMat = new THREE.MeshStandardMaterial({
    color: 0x1d1f21,
    roughness: 0.84,
    metalness: 0.06,
    bumpMap: fabricBump,
    bumpScale: 0.016,
  });
  const knuckleArmorMat = new THREE.MeshStandardMaterial({
    color: 0x131517,
    roughness: 0.42,
    metalness: 0.28,
    bumpMap: metalBump,
    bumpScale: 0.005,
  });
  const watchDialMat = new THREE.MeshStandardMaterial({
    color: 0x101814,
    emissive: 0x2d6e44,
    emissiveIntensity: 0.65,
    roughness: 0.12,
    metalness: 0.2,
  });
  const opticGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x9fc8d8,
    transparent: true,
    opacity: 0.26,
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
  const deflector = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.024, 0.03), darkGunmetalMat);
  deflector.position.set(0.024, 0.038, 0.035);
  weaponPivot.add(deflector);

  const forwardAssist = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.032, 10), steelMat);
  forwardAssist.rotation.x = Math.PI / 2;
  forwardAssist.rotation.z = -0.35;
  forwardAssist.position.set(0.027, 0.031, 0.068);
  weaponPivot.add(forwardAssist);

  const boltCarrier = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.018, 0.072), steelMat);
  boltCarrier.position.set(0.023, 0.038, -0.012);
  weaponPivot.add(boltCarrier);

  // Charging handle T-latch
  const chargingHandle = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.011, 0.026), steelMat);
  chargingHandle.position.set(0, 0.054, 0.118);
  weaponPivot.add(chargingHandle);

  // Trigger guard & curved trigger
  const triggerGuard = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.052), mattePolymerMat);
  triggerGuard.position.set(0, -0.048, 0.048);
  weaponPivot.add(triggerGuard);
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.022, 0.008), steelMat);
  trigger.position.set(0, -0.034, 0.052);
  trigger.rotation.x = 0.25;
  weaponPivot.add(trigger);

  // Pistol grip
  const pistolGrip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.105, 0.046), mattePolymerMat);
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

  const stockBody = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.092, 0.16), mattePolymerMat);
  stockBody.position.set(0, 0.008, 0.265);
  weaponPivot.add(stockBody);

  // Curved 30-round PMAG magazine with textured rib bands
  const magazineGroup = new THREE.Group();
  magazineGroup.position.set(0, -0.055, -0.052);
  const magUpper = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.09, 0.064), mattePolymerMat);
  magUpper.rotation.x = 0.12;
  magazineGroup.add(magUpper);
  const magLower = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.072, 0.062), mattePolymerMat);
  magLower.position.set(0, -0.072, -0.014);
  magLower.rotation.x = 0.26;
  magazineGroup.add(magLower);
  const magBaseplate = new THREE.Mesh(new THREE.BoxGeometry(0.031, 0.012, 0.068), knuckleArmorMat);
  magBaseplate.position.set(0, -0.108, -0.023);
  magBaseplate.rotation.x = 0.26;
  magazineGroup.add(magBaseplate);
  weaponPivot.add(magazineGroup);

  // 2. Free-float M-LOK Vented Handguard & Fluted Barrel + Compensator
  const handguard = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.027, 0.34, 8), darkGunmetalMat);
  handguard.rotation.x = Math.PI / 2;
  handguard.rotation.y = Math.PI / 8;
  handguard.position.set(0, 0.032, -0.265);
  weaponPivot.add(handguard);

  // Top full-length Picatinny rail spine + individual notched teeth
  const railSpine = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.01, 0.56), receiverMetalMat);
  railSpine.position.set(0, 0.062, -0.155);
  weaponPivot.add(railSpine);

  const toothGeo = new THREE.BoxGeometry(0.024, 0.005, 0.007);
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
  const slotGeo = new THREE.BoxGeometry(0.004, 0.009, 0.032);
  for (const side of [-1, 1]) {
    for (let si = 0; si < 5; si++) {
      const slot = new THREE.Mesh(slotGeo, steelMat);
      slot.position.set(side * 0.025, 0.032, -0.15 - si * 0.052);
      weaponPivot.add(slot);
    }
  }

  // Angled M-LOK handstop + side tactical weapon light + top PEQ laser module
  const handstop = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.028, 0.064), mattePolymerMat);
  handstop.position.set(0, -0.002, -0.258);
  handstop.rotation.x = 0.24;
  weaponPivot.add(handstop);

  const tacLightMount = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.014, 0.028), receiverMetalMat);
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

  const peqBody = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.016, 0.068), mattePolymerMat);
  peqBody.position.set(0.011, 0.074, -0.31);
  weaponPivot.add(peqBody);
  const peqSwitch = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.004, 0.038), knuckleArmorMat);
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

  // Flip-up front & rear backup iron sights
  const frontSightBase = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.016, 0.026), mattePolymerMat);
  frontSightBase.position.set(0, 0.075, -0.415);
  weaponPivot.add(frontSightBase);
  const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.014, 0.006), steelMat);
  frontPost.position.set(0, 0.087, -0.418);
  weaponPivot.add(frontPost);

  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.014, 0.028), mattePolymerMat);
  rearSight.position.set(0, 0.074, 0.082);
  weaponPivot.add(rearSight);

  // 3. EOTech-Style Holographic Optic (Hood + Base + Glass + Glowing Red Reticle)
  const opticGroup = new THREE.Group();
  opticGroup.position.set(0, OPTIC_Y, -0.02);

  const opticBase = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.014, 0.092), darkGunmetalMat);
  opticBase.position.set(0, -0.014, 0);
  opticGroup.add(opticBase);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.0055, 0.044, 0.068), receiverMetalMat);
  leftWall.position.set(-0.019, 0.012, -0.006);
  opticGroup.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.0055, 0.044, 0.068), receiverMetalMat);
  rightWall.position.set(0.019, 0.012, -0.006);
  opticGroup.add(rightWall);

  const hoodTop = new THREE.Mesh(new THREE.BoxGeometry(0.043, 0.0055, 0.068), receiverMetalMat);
  hoodTop.position.set(0, 0.035, -0.006);
  opticGroup.add(hoodTop);

  const batteryHood = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.024, 0.044), darkGunmetalMat);
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
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
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

  const leftForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.064, armSpan, 20), oliveSleeveMat);
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

  const watchCase = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.026, 0.012), knuckleArmorMat);
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

  const knuckleGuard = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.032, 0.062), knuckleArmorMat);
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
    color: 0xffc978,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.048), flashMat);
    fin.rotation.z = (i / 4) * Math.PI;
    fin.position.z = -0.025;
    muzzleFlashGroup.add(fin);
  }
  const flashCore = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), flashMat);
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
    update: (_dt, elapsed, spring, opts) => {
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
      let sx = 0;
      let sy = 0;
      if (opts.sprinting && a < 0.2 && opts.reloadProgress <= 0) {
        sx = -0.055;
        sy = -0.032;
        rx -= 0.14;
        ry += 0.38;
        rz += 0.22;
      }

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
    },
  };
}
