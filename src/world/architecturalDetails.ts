import * as THREE from 'three';
import { BUILDING_UV_METER_SCALE, computeTriplanarBoxUv } from './rendaMath';

/**
 * Ensures `uv2` matches `uv` on any BufferGeometry so MeshStandardMaterial `aoMap` renders properly.
 */
export function ensureGeometryUv2(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv');
  if (uv && !geo.getAttribute('uv2')) {
    geo.setAttribute('uv2', uv.clone());
  }
  return geo;
}

/**
 * Replaces stretched/default UVs on BoxGeometry/ExtrudeGeometry/CylinderGeometry meshes
 * with uniform world-meter triplanar box UVs and populates `uv2` for `aoMap`.
 */
export function applyMetricTriplanarUvAndUv2(
  geo: THREE.BufferGeometry,
  uvPerMeter = BUILDING_UV_METER_SCALE
): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) return geo;
  if (!geo.getAttribute('normal')) {
    geo.computeVertexNormals();
  }
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = computeTriplanarBoxUv(
      pos.getX(i),
      pos.getY(i),
      pos.getZ(i),
      nrm.getX(i),
      nrm.getY(i),
      nrm.getZ(i),
      uvPerMeter
    );
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  const uvAttr = new THREE.Float32BufferAttribute(uvs, 2);
  geo.setAttribute('uv', uvAttr);
  geo.setAttribute('uv2', uvAttr.clone());
  return geo;
}

function makeTexLoaderSet(
  loader: THREE.TextureLoader,
  folder: string,
  repeatX: number,
  repeatY: number,
  maxAnisotropy: number,
  texturesOut: THREE.Texture[],
  includeAo = true
): {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap?: THREE.Texture;
} {
  const load = (file: string, isColor: boolean) => {
    const t = loader.load(`/assets/textures/${folder}/${file}`, (loaded) => {
      loaded.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      loaded.wrapS = THREE.RepeatWrapping;
      loaded.wrapT = THREE.RepeatWrapping;
      loaded.repeat.set(repeatX, repeatY);
      loaded.anisotropy = maxAnisotropy;
      loaded.needsUpdate = true;
    });
    t.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = maxAnisotropy;
    texturesOut.push(t);
    return t;
  };
  return {
    map: load('diff.jpg', true),
    normalMap: load('nor_gl.jpg', false),
    roughnessMap: load('rough.jpg', false),
    aoMap: includeAo ? load('ao.jpg', false) : undefined,
  };
}

/**
 * Generates high-resolution (512x512) multi-layered architectural window textures
 * depicting recessed interior room depth, linen curtains, glass reflection streaks,
 * and subtle warm amber interior illumination.
 */
export function createArchWindowTextures(maxAnisotropy = 8): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colCanvas = document.createElement('canvas');
  colCanvas.width = size;
  colCanvas.height = size;
  const ctx = colCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  const emCanvas = document.createElement('canvas');
  emCanvas.width = size;
  emCanvas.height = size;
  const eCtx = emCanvas.getContext('2d')!;

  // Deep cool-slate interior room gradient
  const bg = ctx.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, '#0d151c');
  bg.addColorStop(0.45, '#17232c');
  bg.addColorStop(0.85, '#262928');
  bg.addColorStop(1, '#121518');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Faint warm interior room depth glow in lower-middle center
  const roomGlow = ctx.createRadialGradient(size * 0.5, size * 0.62, 16, size * 0.5, size * 0.62, size * 0.42);
  roomGlow.addColorStop(0, 'rgba(132, 92, 46, 0.55)');
  roomGlow.addColorStop(0.55, 'rgba(58, 46, 34, 0.25)');
  roomGlow.addColorStop(1, 'rgba(15, 22, 28, 0)');
  ctx.fillStyle = roomGlow;
  ctx.fillRect(0, 0, size, size);

  // Subtle folded linen/lace side curtains framing left & right edges
  for (const side of [0, 1]) {
    const startX = side === 0 ? 0 : size - 132;
    const cGrad = ctx.createLinearGradient(
      side === 0 ? 0 : size,
      0,
      side === 0 ? 132 : size - 132,
      0
    );
    cGrad.addColorStop(0, 'rgba(202, 194, 176, 0.48)');
    cGrad.addColorStop(0.62, 'rgba(165, 158, 142, 0.24)');
    cGrad.addColorStop(1, 'rgba(120, 118, 108, 0)');
    ctx.fillStyle = cGrad;
    ctx.fillRect(startX, 0, 132, size);

    // Soft vertical drape pleat shadows
    for (let f = 0; f < 5; f++) {
      const fx = side === 0 ? 14 + f * 22 : size - 18 - f * 22;
      ctx.fillStyle = f % 2 === 0 ? 'rgba(225, 218, 200, 0.14)' : 'rgba(22, 28, 32, 0.16)';
      ctx.fillRect(fx, 0, 10, size);
    }
  }

  // Diagonal crisp sky reflection sheen across exterior glass pane
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, size * 0.34);
  ctx.lineTo(size * 0.54, 0);
  ctx.lineTo(size * 0.78, 0);
  ctx.lineTo(0, size * 0.62);
  ctx.closePath();
  const refl = ctx.createLinearGradient(0, 0, size * 0.7, size * 0.6);
  refl.addColorStop(0, 'rgba(195, 218, 232, 0.18)');
  refl.addColorStop(0.5, 'rgba(170, 200, 218, 0.08)');
  refl.addColorStop(1, 'rgba(140, 170, 195, 0)');
  ctx.fillStyle = refl;
  ctx.fill();
  ctx.restore();

  // Inner glazing putty / shadow border so panes look recessed in wood frame
  ctx.strokeStyle = 'rgba(12, 15, 18, 0.72)';
  ctx.lineWidth = 22;
  ctx.strokeRect(11, 11, size - 22, size - 22);

  // Roughness map: polished glass (~0.07 = byte 18) with slightly rougher bevel putty edges (~0.45)
  rCtx.fillStyle = 'rgb(20, 20, 20)';
  rCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = 'rgba(42, 42, 42, 0.45)';
  rCtx.fillRect(0, 0, 112, size);
  rCtx.fillRect(size - 112, 0, 112, size);
  rCtx.strokeStyle = 'rgb(135, 135, 135)';
  rCtx.lineWidth = 22;
  rCtx.strokeRect(11, 11, size - 22, size - 22);

  // Emissive map: soft interior lamp warmth behind central glass & curtain edges
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, size, size);
  const emGrad = eCtx.createRadialGradient(size * 0.5, size * 0.62, 18, size * 0.5, size * 0.58, size * 0.44);
  emGrad.addColorStop(0, '#ffd898');
  emGrad.addColorStop(0.55, '#7a5228');
  emGrad.addColorStop(1, '#080604');
  eCtx.fillStyle = emGrad;
  eCtx.fillRect(18, 18, size - 36, size - 36);

  const map = new THREE.CanvasTexture(colCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.anisotropy = maxAnisotropy;

  const emissiveMap = new THREE.CanvasTexture(emCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.anisotropy = maxAnisotropy;

  return { map, roughnessMap, emissiveMap };
}

/**
 * Generates a high-detail (512x512) traditional Baltic 4-panel timber entry door
 * with wood grain, recessed chamfered panels, brass handle/escutcheon, and matched normal + roughness maps.
 */
export function createPaneledDoorTextures(maxAnisotropy = 8): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const hCanv = document.createElement('canvas');
  hCanv.width = size;
  hCanv.height = size;
  const hCtx = hCanv.getContext('2d')!;

  // Base stained timber
  ctx.fillStyle = '#5c3c24';
  ctx.fillRect(0, 0, size, size);
  hCtx.fillStyle = '#b4b4b4';
  hCtx.fillRect(0, 0, size, size);

  // Subtle vertical wood grain streaks
  let seed = 7331;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 480; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const h = 36 + rand() * 140;
    const w = 1 + rand() * 2.5;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(38, 22, 12, 0.18)' : 'rgba(130, 92, 56, 0.14)';
    ctx.fillRect(x, y, w, h);
    hCtx.fillStyle = rand() > 0.5 ? 'rgba(90, 90, 90, 0.18)' : 'rgba(205, 205, 205, 0.16)';
    hCtx.fillRect(x, y, w, h);
  }

  // Four recessed chamfered door panels (upper 2 tall panels, lower 2 sturdy panels)
  const panels: [number, number, number, number][] = [
    [66, 48, 154, 210],
    [292, 48, 154, 210],
    [66, 294, 154, 154],
    [292, 294, 154, 154],
  ];
  for (const [px, py, pw, ph] of panels) {
    // Outer chamfer shadow / bevel
    ctx.strokeStyle = 'rgba(26, 15, 8, 0.85)';
    ctx.lineWidth = 10;
    ctx.strokeRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(148, 108, 70, 0.42)';
    ctx.lineWidth = 4;
    ctx.strokeRect(px + 8, py + 8, pw - 16, ph - 16);

    ctx.fillStyle = 'rgba(66, 43, 25, 0.42)';
    ctx.fillRect(px + 10, py + 10, pw - 20, ph - 20);

    // Heightmap recessed groove + raised inner panel center
    hCtx.strokeStyle = '#383838';
    hCtx.lineWidth = 12;
    hCtx.strokeRect(px, py, pw, ph);
    hCtx.fillStyle = '#8c8c8c';
    hCtx.fillRect(px + 10, py + 10, pw - 20, ph - 20);
  }

  // Subtle weathered kick-plate shading at door base
  const botGrad = ctx.createLinearGradient(0, size - 72, 0, size);
  botGrad.addColorStop(0, 'rgba(30, 22, 16, 0)');
  botGrad.addColorStop(1, 'rgba(28, 22, 16, 0.48)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, size - 72, size, 72);

  // Brass latch escutcheon plate & handle detail
  ctx.fillStyle = '#b9934c';
  ctx.fillRect(size - 56, 246, 18, 54);
  ctx.fillStyle = '#d9b56a';
  ctx.fillRect(size - 72, 266, 30, 9);
  hCtx.fillStyle = '#f5f5f5';
  hCtx.fillRect(size - 56, 246, 18, 54);

  // Compute tangent-space normal & roughness from height canvas
  const src = hCtx.getImageData(0, 0, size, size).data;
  const nCanvas = document.createElement('canvas');
  nCanvas.width = size;
  nCanvas.height = size;
  const nCtx = nCanvas.getContext('2d')!;
  const nImg = nCtx.createImageData(size, size);

  const rCanvas = document.createElement('canvas');
  rCanvas.width = size;
  rCanvas.height = size;
  const rCtx = rCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(size, size);

  const sample = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(size - 1, x));
    const cy = Math.max(0, Math.min(size - 1, y));
    return src[(cy * size + cx) * 4] / 255;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dX = (sample(x + 1, y) - sample(x - 1, y)) * 2.8;
      const dY = (sample(x, y + 1) - sample(x, y - 1)) * 2.8;
      const inv = 1 / Math.hypot(-dX, -dY, 1);
      nImg.data[i] = Math.round(((-dX * inv) * 0.5 + 0.5) * 255);
      nImg.data[i + 1] = Math.round(((-dY * inv) * 0.5 + 0.5) * 255);
      nImg.data[i + 2] = Math.round(((1 * inv) * 0.5 + 0.5) * 255);
      nImg.data[i + 3] = 255;

      const h = sample(x, y);
      const roughByte = Math.round(Math.max(70, Math.min(240, 175 + (0.6 - h) * 85)));
      rImg.data[i] = roughByte;
      rImg.data[i + 1] = roughByte;
      rImg.data[i + 2] = roughByte;
      rImg.data[i + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;

  const normalMap = new THREE.CanvasTexture(nCanvas);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.anisotropy = maxAnisotropy;

  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.anisotropy = maxAnisotropy;

  return { map, normalMap, roughnessMap };
}

export interface ArchTrimMaterialBundle {
  stonePlinthMat: THREE.MeshStandardMaterial;
  graniteStepMat: THREE.MeshStandardMaterial;
  graniteSillMat: THREE.MeshStandardMaterial;
  woodFasciaMat: THREE.MeshStandardMaterial;
  woodFrameMat: THREE.MeshStandardMaterial;
  woodShutterMat: THREE.MeshStandardMaterial;
  woodDoorMat: THREE.MeshStandardMaterial;
  brickChimneyMat: THREE.MeshStandardMaterial;
  chimneyCapMat: THREE.MeshStandardMaterial;
  terracottaPotMat: THREE.MeshStandardMaterial;
  zincRidgeMat: THREE.MeshStandardMaterial;
  windowGlassMat: THREE.MeshStandardMaterial;
  textures: THREE.Texture[];
  materials: THREE.Material[];
}

export function createSharedArchMaterials(maxAnisotropy: number): ArchTrimMaterialBundle {
  const loader = new THREE.TextureLoader();
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];

  const plinthPbr = makeTexLoaderSet(loader, 'medieval_blocks_05', 3.4, 0.85, maxAnisotropy, textures, true);
  const stepPbr = makeTexLoaderSet(loader, 'medieval_blocks_05', 1.15, 0.55, maxAnisotropy, textures, true);
  const sillPbr = makeTexLoaderSet(loader, 'medieval_blocks_05', 0.9, 0.25, maxAnisotropy, textures, true);
  const fasciaPbr = makeTexLoaderSet(loader, 'brown_planks_03', 3.2, 0.35, maxAnisotropy, textures, true);
  const framePbr = makeTexLoaderSet(loader, 'brown_planks_03', 0.85, 0.95, maxAnisotropy, textures, true);
  const shutterPbr = makeTexLoaderSet(loader, 'brown_planks_03', 0.55, 1.0, maxAnisotropy, textures, true);
  const brickPbr = makeTexLoaderSet(loader, 'red_brick_03', 0.85, 1.9, maxAnisotropy, textures, true);
  const ridgePbr = makeTexLoaderSet(loader, 'corrugated_iron', 0.45, 3.2, maxAnisotropy, textures, true);
  const potPbr = makeTexLoaderSet(loader, 'clay_roof_tiles_02', 1.0, 1.0, maxAnisotropy, textures, true);

  const winTex = createArchWindowTextures(maxAnisotropy);
  const doorTex = createPaneledDoorTextures(maxAnisotropy);
  textures.push(
    winTex.map,
    winTex.roughnessMap,
    winTex.emissiveMap,
    doorTex.map,
    doorTex.normalMap,
    doorTex.roughnessMap
  );

  const stonePlinthMat = new THREE.MeshStandardMaterial({
    color: 0xc2bcb0,
    map: plinthPbr.map,
    normalMap: plinthPbr.normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughnessMap: plinthPbr.roughnessMap,
    roughness: 0.96,
    aoMap: plinthPbr.aoMap,
    aoMapIntensity: 0.72,
    metalness: 0.03,
  });

  const graniteStepMat = new THREE.MeshStandardMaterial({
    color: 0xbcb6aa,
    map: stepPbr.map,
    normalMap: stepPbr.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: stepPbr.roughnessMap,
    roughness: 0.94,
    aoMap: stepPbr.aoMap,
    aoMapIntensity: 0.65,
    metalness: 0.03,
  });

  const graniteSillMat = new THREE.MeshStandardMaterial({
    color: 0xd0c9bc,
    map: sillPbr.map,
    normalMap: sillPbr.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: sillPbr.roughnessMap,
    roughness: 0.9,
    metalness: 0.03,
  });

  const woodFasciaMat = new THREE.MeshStandardMaterial({
    color: 0xf4ede0,
    map: fasciaPbr.map,
    normalMap: fasciaPbr.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: fasciaPbr.roughnessMap,
    roughness: 0.82,
    metalness: 0.03,
  });

  const woodFrameMat = new THREE.MeshStandardMaterial({
    color: 0xf3ece0,
    map: framePbr.map,
    normalMap: framePbr.normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: framePbr.roughnessMap,
    roughness: 0.78,
    metalness: 0.03,
  });

  const woodShutterMat = new THREE.MeshStandardMaterial({
    color: 0x62735f,
    map: shutterPbr.map,
    normalMap: shutterPbr.normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: shutterPbr.roughnessMap,
    roughness: 0.84,
    aoMap: shutterPbr.aoMap,
    aoMapIntensity: 0.65,
    metalness: 0.04,
  });

  const woodDoorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: doorTex.map,
    normalMap: doorTex.normalMap,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughnessMap: doorTex.roughnessMap,
    roughness: 0.92,
    metalness: 0.05,
  });

  const brickChimneyMat = new THREE.MeshStandardMaterial({
    color: 0xdfc1b5,
    map: brickPbr.map,
    normalMap: brickPbr.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: brickPbr.roughnessMap,
    roughness: 0.94,
    aoMap: brickPbr.aoMap,
    aoMapIntensity: 0.7,
    metalness: 0.03,
  });

  const chimneyCapMat = new THREE.MeshStandardMaterial({
    color: 0xb2aba0,
    map: sillPbr.map,
    normalMap: sillPbr.normalMap,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: sillPbr.roughnessMap,
    roughness: 0.88,
    metalness: 0.04,
  });

  const terracottaPotMat = new THREE.MeshStandardMaterial({
    color: 0xd0886d,
    map: potPbr.map,
    normalMap: potPbr.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.84,
    metalness: 0.03,
  });

  const zincRidgeMat = new THREE.MeshStandardMaterial({
    color: 0x5c6165,
    map: ridgePbr.map,
    normalMap: ridgePbr.normalMap,
    normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: ridgePbr.roughnessMap,
    roughness: 0.72,
    metalness: 0.38,
  });

  const windowGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: winTex.map,
    roughnessMap: winTex.roughnessMap,
    roughness: 1.0,
    metalness: 0.2,
    envMapIntensity: 1.45,
    emissive: 0xffe0a4,
    emissiveMap: winTex.emissiveMap,
    emissiveIntensity: 0.24,
  });

  materials.push(
    stonePlinthMat,
    graniteStepMat,
    graniteSillMat,
    woodFasciaMat,
    woodFrameMat,
    woodShutterMat,
    woodDoorMat,
    brickChimneyMat,
    chimneyCapMat,
    terracottaPotMat,
    zincRidgeMat,
    windowGlassMat
  );

  return {
    stonePlinthMat,
    graniteStepMat,
    graniteSillMat,
    woodFasciaMat,
    woodFrameMat,
    woodShutterMat,
    woodDoorMat,
    brickChimneyMat,
    chimneyCapMat,
    terracottaPotMat,
    zincRidgeMat,
    windowGlassMat,
    textures,
    materials,
  };
}
