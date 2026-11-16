import * as THREE from 'three';
import { applyMetricTriplanarUvAndUv2, type ArchTrimMaterialBundle } from './architecturalDetails';
import { BUILDING_UV_METER_SCALE, computeGableRidgePlan, computePrimaryAxisAndBounds, computeWallSegments, type WallSegmentInfo } from './rendaMath';

function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createLatvianSignTexture(
  title: string,
  subtitle = '',
  bgHex = '#1f2d24',
  fgHex = '#f5eedc',
  borderHex = '#c89b4b'
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.strokeStyle = borderHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);

  ctx.fillStyle = fgHex;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = subtitle ? '700 38px "Plus Jakarta Sans", system-ui, sans-serif' : '700 44px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(title, c.width * 0.5, subtitle ? c.height * 0.4 : c.height * 0.5);

  if (subtitle) {
    ctx.fillStyle = borderHex;
    ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(subtitle, c.width * 0.5, c.height * 0.72);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createAbavaRiverSignTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 200;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = '#164d8c';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#eef4fa';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, c.width - 24, c.height - 24);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 72px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Abava', c.width * 0.5, c.height * 0.41);

  // Double Latvian river wave symbol
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  for (const wy of [136, 158]) {
    ctx.beginPath();
    for (let x = 148; x <= 364; x += 6) {
      const y = wy + Math.sin((x - 148) * 0.115) * 6;
      if (x === 148) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGraniteMasonryTextures(): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const bc = document.createElement('canvas');
  bc.width = size;
  bc.height = size;
  const bCtx = bc.getContext('2d')!;

  const rand = makeRand(4049);
  ctx.fillStyle = '#6f6a5f';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#383838';
  bCtx.fillRect(0, 0, size, size);

  const rows = 9;
  const rowH = size / rows;
  const tones = ['#7c7469', '#676158', '#8a7e6e', '#5b564e', '#766b5d', '#938574'];
  for (let r = 0; r < rows; r++) {
    let x = (r % 2) * -32;
    while (x < size) {
      const w = 48 + rand() * 54;
      const tone = tones[Math.floor(rand() * tones.length)];
      const h = rowH - 5;
      const y = r * rowH + 2.5;
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.roundRect(x + 2.5, y, w - 5, h, 6);
      ctx.fill();

      // Subtle mineral speckle & moss stain near waterline
      ctx.fillStyle = 'rgba(255,250,240,0.08)';
      ctx.fillRect(x + 6, y + 4, (w - 12) * 0.6, 5);
      if (r >= rows - 3) {
        ctx.fillStyle = 'rgba(72, 92, 54, 0.34)';
        ctx.fillRect(x + 3, y, w - 6, h);
      }

      bCtx.fillStyle = `rgb(${155 + Math.floor(rand() * 48)}, ${155 + Math.floor(rand() * 48)}, ${155 + Math.floor(rand() * 48)})`;
      bCtx.beginPath();
      bCtx.roundRect(x + 3, y + 1, w - 6, h - 2, 6);
      bCtx.fill();

      x += w;
    }
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2.4, 1.4);

  const bumpMap = new THREE.CanvasTexture(bc);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2.4, 1.4);
  return { map, bumpMap };
}

export function createBarkTextures(
  baseHex: string,
  fissureHex: string,
  isBirch = false
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const bc = document.createElement('canvas');
  bc.width = size;
  bc.height = size;
  const bCtx = bc.getContext('2d')!;

  const rand = makeRand(baseHex.charCodeAt(1) * 97 + (isBirch ? 13 : 3));
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  if (isBirch) {
    // Authentic Latvian silver birch papery white bark with dark horizontal lenticels & mossy base cracks
    for (let i = 0; i < 110; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const w = 14 + rand() * 44;
      const h = 2 + rand() * 5;
      ctx.fillStyle = rand() > 0.25 ? fissureHex : '#8d887d';
      ctx.globalAlpha = 0.65 + rand() * 0.3;
      ctx.fillRect(x, y, w, h);
      bCtx.fillStyle = '#404040';
      bCtx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;
  } else {
    // Deep vertical furrowed pine / oak / spruce bark
    for (let i = 0; i < 180; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const w = 2 + rand() * 6;
      const h = 28 + rand() * 75;
      ctx.fillStyle = rand() > 0.45 ? fissureHex : baseHex;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x, y, w, h);
      bCtx.fillStyle = rand() > 0.45 ? '#3e3e3e' : '#b8b8b8';
      bCtx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 3);

  const bumpMap = new THREE.CanvasTexture(bc);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 3);

  return { map, bumpMap };
}

export function createFoliageTextures(
  baseHex: string,
  leafHex: string,
  shadowHex: string,
  seedOffset = 1
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const bc = document.createElement('canvas');
  bc.width = size;
  bc.height = size;
  const bCtx = bc.getContext('2d')!;

  const rand = makeRand(991 + seedOffset * 53);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#787878';
  bCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 420; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rx = 4 + rand() * 8;
    const ry = 2.5 + rand() * 5;
    const ang = rand() * Math.PI;
    const tone = rand();
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
    ctx.fillStyle = tone > 0.58 ? leafHex : tone > 0.2 ? baseHex : shadowHex;
    ctx.globalAlpha = 0.72;
    ctx.fill();

    bCtx.beginPath();
    bCtx.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2);
    bCtx.fillStyle = tone > 0.45 ? '#c6c6c6' : '#424242';
    bCtx.fill();
  }
  ctx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);

  const bumpMap = new THREE.CanvasTexture(bc);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2, 2);

  return { map, bumpMap };
}

export function createOrganicFoliageGeometry(radius: number, detail = 2, seed = 42, squashY = 0.92): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const rand = makeRand(seed);
  // Displace vertices deterministically per welded spatial position so seams stay watertight
  const dispMap = new Map<string, number>();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const key = `${vx.toFixed(3)}_${vy.toFixed(3)}_${vz.toFixed(3)}`;
    let factor = dispMap.get(key);
    if (factor === undefined) {
      // Smooth multi-frequency lobe undulation + subtle organic variation
      const ang = Math.atan2(vz, vx);
      const lobe = 1 + 0.12 * Math.sin(ang * 3 + seed) + 0.08 * Math.cos(vy * 2.1 + seed * 0.5);
      factor = lobe * (0.86 + rand() * 0.28);
      dispMap.set(key, factor);
    }
    const nx = vx * factor;
    const ny = vy * factor * squashY;
    const nz = vz * factor;
    pos.setXYZ(i, nx, ny, nz);

    // Subtle ambient occlusion gradient: cooler darker underside -> sunlit upper crown
    const hNorm = THREE.MathUtils.clamp((ny / Math.max(0.2, radius * squashY) + 1) * 0.5, 0, 1);
    const shade = 0.64 + hNorm * 0.44;
    colors[i * 3] = shade * 0.96;
    colors[i * 3 + 1] = shade * 1.02;
    colors[i * 3 + 2] = shade * 0.9;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export function createConiferTierGeometry(radius: number, height: number, radialSegs = 12, seed = 77): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(radius, height, radialSegs, 4, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const rand = makeRand(seed);
  const dispMap = new Map<string, number>();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    let nx = vx;
    let ny = vy;
    let nz = vz;
    if (vy <= height * 0.4) {
      const key = `${vx.toFixed(3)}_${vy.toFixed(3)}_${vz.toFixed(3)}`;
      let jitter = dispMap.get(key);
      if (jitter === undefined) {
        const ang = Math.atan2(vz, vx);
        jitter = (0.86 + 0.16 * Math.sin(ang * 5 + seed)) * (0.88 + rand() * 0.24);
        dispMap.set(key, jitter);
      }
      nx = vx * jitter;
      ny = vy - (jitter - 0.95) * 0.42;
      nz = vz * jitter;
      pos.setXYZ(i, nx, ny, nz);
    }
    const hNorm = THREE.MathUtils.clamp((ny + height * 0.5) / Math.max(0.5, height), 0, 1);
    const shade = 0.62 + hNorm * 0.42;
    colors[i * 3] = shade * 0.92;
    colors[i * 3 + 1] = shade * 1.02;
    colors[i * 3 + 2] = shade * 0.94;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the detailed P120 Abava River Bridge (38786002) matching bridge_p120.jpg:
 * - Curved haunched longitudinal concrete girders under deck
 * - Two battered coursed-granite piers with pointed ice-breaker cutwaters & bearing pedestals
 * - Sloped masonry embankment abutments with concrete bank stairs & handrails
 * - Overhanging concrete sidewalk curbs + dense galvanized vertical picket railings
 * - W-beam steel crash barriers + "ABAVA" river sign
 */
export function createAbavaBridgeGroup(
  pts: [number, number][],
  roadWidth: number,
  groundHeightAtFn: (x: number, z: number) => number,
  stonePierMat: THREE.Material,
  concreteDeckMat: THREE.Material,
  steelRailMat: THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  if (pts.length < 2) return group;

  const p0 = pts[0];
  const p1 = pts[pts.length - 1];
  const dxTotal = p1[0] - p0[0];
  const dzTotal = p1[1] - p0[1];
  const totalLen = Math.max(1, Math.hypot(dxTotal, dzTotal));
  const yaw = Math.atan2(dxTotal, dzTotal);

  const startY = groundHeightAtFn(p0[0], p0[1]) + 1.05;
  const endY = groundHeightAtFn(p1[0], p1[1]) + 1.05;
  const deckW = roadWidth + 3.4; // ~10.6m supporting P120 asphalt + both sidewalks

  const bridgePointAtT = (t: number) => {
    const x = p0[0] + dxTotal * t;
    const z = p0[1] + dzTotal * t;
    const rawY = startY + (endY - startY) * t + Math.sin(t * Math.PI) * 0.38;
    const y = Math.max(rawY, groundHeightAtFn(x, z) + 0.55);
    return { x, y, z };
  };

  const { map: graniteMap, bumpMap: graniteBump } = createGraniteMasonryTextures();
  const pierGraniteMat = new THREE.MeshStandardMaterial({
    color: 0xd6cfc3,
    map: graniteMap,
    bumpMap: graniteBump,
    bumpScale: 0.14,
    roughness: 0.88,
    metalness: 0.04,
  });
  // Preserve reference material param usage cleanly
  void stonePierMat;

  const girderMat = new THREE.MeshStandardMaterial({
    color: 0xc2beb2,
    roughness: 0.84,
    metalness: 0.05,
  });
  const darkConcreteMat = new THREE.MeshStandardMaterial({
    color: 0x8d897e,
    roughness: 0.9,
    metalness: 0.04,
  });
  const galvMat = steelRailMat;

  // 1. Deck slab + overhanging concrete sidewalk curbs along each bridge segment
  let acc = 0;
  let segTotal = 0;
  for (let i = 1; i < pts.length; i++) {
    segTotal += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  segTotal = Math.max(1, segTotal);

  const railPostTransforms: THREE.Matrix4[] = [];
  const picketTransforms: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (segLen < 0.2) continue;

    const t0 = acc / segTotal;
    const t1 = (acc + segLen) / segTotal;
    acc += segLen;

    const pa = bridgePointAtT(t0);
    const pb = bridgePointAtT(t1);
    const ya = pa.y;
    const yb = pb.y;
    const midX = (a[0] + b[0]) * 0.5;
    const midY = (ya + yb) * 0.5;
    const midZ = (a[1] + b[1]) * 0.5;
    const segYaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const segSlope = Math.atan2(yb - ya, segLen);

    // Upper bridge deck slab + overhanging pedestrian edge fascias
    const deckSlab = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.42, segLen + 0.2), concreteDeckMat);
    deckSlab.position.set(midX, midY - 0.14, midZ);
    deckSlab.rotation.order = 'YXZ';
    deckSlab.rotation.y = segYaw;
    deckSlab.rotation.x = -segSlope;
    deckSlab.receiveShadow = true;
    deckSlab.castShadow = true;
    group.add(deckSlab);

    for (const side of [-1, 1]) {
      const curbOff = side * (deckW * 0.5 - 0.22);
      const cx = midX + Math.cos(segYaw) * curbOff;
      const cz = midZ - Math.sin(segYaw) * curbOff;
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.54, segLen + 0.2), girderMat);
      curb.position.set(cx, midY - 0.04, cz);
      curb.rotation.order = 'YXZ';
      curb.rotation.y = segYaw;
      curb.rotation.x = -segSlope;
      curb.castShadow = true;
      group.add(curb);

      // Galvanized top + bottom horizontal railing bars
      const railOff = side * (deckW * 0.5 - 0.16);
      const rx = midX + Math.cos(segYaw) * railOff;
      const rz = midZ - Math.sin(segYaw) * railOff;
      for (const ryOff of [0.22, 1.08]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, segLen + 0.12), galvMat);
        bar.position.set(rx, midY + ryOff, rz);
        bar.rotation.order = 'YXZ';
        bar.rotation.y = segYaw;
        bar.rotation.x = -segSlope;
        bar.castShadow = true;
        group.add(bar);
      }

      // W-beam steel roadway crash barrier separating asphalt carriageway from pedestrian walkway
      const crashOff = side * (roadWidth * 0.5 + 0.18);
      const gx = midX + Math.cos(segYaw) * crashOff;
      const gz = midZ - Math.sin(segYaw) * crashOff;
      const wBeam = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.28, segLen + 0.1), galvMat);
      wBeam.position.set(gx, midY + 0.62, gz);
      wBeam.rotation.order = 'YXZ';
      wBeam.rotation.y = segYaw;
      wBeam.rotation.x = -segSlope;
      group.add(wBeam);

      // Queue dense vertical steel pickets (every ~0.28m) & square structural posts (every ~2.1m)
      const postSteps = Math.max(2, Math.round(segLen / 2.1));
      for (let pi = 0; pi < postSteps; pi++) {
        const u = (pi + 0.5) / postSteps;
        const localZ = (u - 0.5) * segLen;
        const py = THREE.MathUtils.lerp(ya, yb, u);
        dummy.position.set(rx + Math.sin(segYaw) * localZ, py + 0.58, rz + Math.cos(segYaw) * localZ);
        dummy.rotation.set(0, segYaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        railPostTransforms.push(dummy.matrix.clone());

        dummy.position.set(gx + Math.sin(segYaw) * localZ, py + 0.38, gz + Math.cos(segYaw) * localZ);
        dummy.updateMatrix();
        railPostTransforms.push(dummy.matrix.clone());
      }

      const picketSteps = Math.max(6, Math.round(segLen / 0.28));
      for (let ki = 0; ki < picketSteps; ki++) {
        const u = (ki + 0.5) / picketSteps;
        const localZ = (u - 0.5) * segLen;
        const py = THREE.MathUtils.lerp(ya, yb, u);
        dummy.position.set(rx + Math.sin(segYaw) * localZ, py + 0.65, rz + Math.cos(segYaw) * localZ);
        dummy.rotation.set(0, segYaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        picketTransforms.push(dummy.matrix.clone());
      }
    }
  }

  if (railPostTransforms.length > 0) {
    const postGeo = new THREE.BoxGeometry(0.11, 1.12, 0.11);
    const postIM = new THREE.InstancedMesh(postGeo, galvMat, railPostTransforms.length);
    for (let i = 0; i < railPostTransforms.length; i++) postIM.setMatrixAt(i, railPostTransforms[i]);
    postIM.instanceMatrix.needsUpdate = true;
    postIM.computeBoundingSphere();
    postIM.castShadow = true;
    group.add(postIM);
  }
  if (picketTransforms.length > 0) {
    const picketGeo = new THREE.BoxGeometry(0.032, 0.84, 0.032);
    const picketIM = new THREE.InstancedMesh(picketGeo, galvMat, picketTransforms.length);
    for (let i = 0; i < picketTransforms.length; i++) picketIM.setMatrixAt(i, picketTransforms[i]);
    picketIM.instanceMatrix.needsUpdate = true;
    picketIM.computeBoundingSphere();
    group.add(picketIM);
  }

  // 2. Curved Haunched Concrete Longitudinal Girders (4 ribs under the deck matching 3-span profile)
  const midPt = bridgePointAtT(0.5);
  const pierFracs = [0.29, 0.71]; // STRICT: Exact 2 central piers, zero extra side piers
  const pierHalfDist = totalLen * (pierFracs[1] - pierFracs[0]) * 0.5;
  const endHalfDist = totalLen * 0.5;

  const girderShape = new THREE.Shape();
  const sampleSoffit = (distFromMid: number): number => {
    const absD = Math.abs(distFromMid);
    if (absD <= pierHalfDist) {
      const u = absD / pierHalfDist;
      return -0.95 - Math.pow(u, 2.2) * 1.25;
    }
    const u = Math.min(1, (absD - pierHalfDist) / Math.max(1, endHalfDist - pierHalfDist));
    return -2.2 + Math.pow(u, 0.68) * 1.25;
  };

  girderShape.moveTo(-endHalfDist + 1.0, -0.35);
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const d = -endHalfDist + 1.0 + (i / steps) * (totalLen - 2.0);
    const topDeckLocalY = THREE.MathUtils.lerp(startY, endY, (d + endHalfDist) / totalLen) - midPt.y - 0.35;
    girderShape.lineTo(d, topDeckLocalY);
  }
  for (let i = steps; i >= 0; i--) {
    const d = -endHalfDist + 1.0 + (i / steps) * (totalLen - 2.0);
    const baseDeckLocalY = THREE.MathUtils.lerp(startY, endY, (d + endHalfDist) / totalLen) - midPt.y;
    girderShape.lineTo(d, baseDeckLocalY + sampleSoffit(d));
  }
  girderShape.closePath();

  const singleRibGeo = new THREE.ExtrudeGeometry(girderShape, {
    depth: 0.46,
    bevelEnabled: false,
  });
  singleRibGeo.translate(0, 0, -0.23);
  singleRibGeo.rotateY(-Math.PI / 2);

  const ribOffsets = [-roadWidth * 0.44, -roadWidth * 0.15, roadWidth * 0.15, roadWidth * 0.44];
  for (const rxOff of ribOffsets) {
    const rib = new THREE.Mesh(singleRibGeo, girderMat);
    rib.position.set(midPt.x + Math.cos(yaw) * rxOff, midPt.y, midPt.z - Math.sin(yaw) * rxOff);
    rib.rotation.y = yaw;
    rib.castShadow = true;
    rib.receiveShadow = true;
    group.add(rib);
  }

  // 3. Exact 2 Battered Coursed-Granite River Piers + Pointed Icebreaker Cutwaters + Bearing Caps
  for (const frac of pierFracs) {
    const pp = bridgePointAtT(frac);
    const pierGroup = new THREE.Group();
    pierGroup.position.set(pp.x, pp.y, pp.z);
    pierGroup.rotation.y = yaw;

    // Battered tapered granite shaft descending firmly into carved Abava riverbed
    const pierShaftGeo = new THREE.CylinderGeometry(1.22, 1.66, 9.4, 8);
    pierShaftGeo.scale((deckW - 1.1) / 2.6, 1, 1.05);
    const stoneWall = new THREE.Mesh(pierShaftGeo, pierGraniteMat);
    stoneWall.position.set(0, -6.8, 0);
    stoneWall.castShadow = true;
    stoneWall.receiveShadow = true;
    pierGroup.add(stoneWall);

    // Concrete pier cap collar + bearing pedestals under haunched ribs
    const capBeam = new THREE.Mesh(new THREE.BoxGeometry(deckW - 0.6, 0.54, 2.55), darkConcreteMat);
    capBeam.position.set(0, -2.38, 0);
    capBeam.castShadow = true;
    pierGroup.add(capBeam);

    for (const rxOff of ribOffsets) {
      const bearing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.9), girderMat);
      bearing.position.set(rxOff, -2.02, 0);
      pierGroup.add(bearing);
    }

    group.add(pierGroup);
  }

  // 4. Organic Sloped Rocky Riprap Embankments at Both Ends (Zero Extra Side Piers)
  const riprapMat = new THREE.MeshStandardMaterial({
    color: 0xa49b8e,
    roughness: 0.94,
    metalness: 0.02,
  });
  const bankCoreMat = new THREE.MeshStandardMaterial({
    color: 0x4b463c,
    roughness: 0.97,
    metalness: 0.01,
  });
  const riprapGeo = new THREE.DodecahedronGeometry(0.46, 0);
  const riprapTransforms: THREE.Matrix4[] = [];
  const riprapColors: THREE.Color[] = [];
  const ripRand = makeRand(9181);
  const ripTint = new THREE.Color();

  for (const isStart of [true, false]) {
    const ep = bridgePointAtT(isStart ? 0.035 : 0.965);
    const dirSign = isStart ? 1 : -1; // points toward river center
    const abutGroup = new THREE.Group();
    abutGroup.position.set(ep.x, ep.y, ep.z);
    abutGroup.rotation.y = yaw;

    // Recessed concrete bank-seat beam at road transition
    const bankSeat = new THREE.Mesh(new THREE.BoxGeometry(deckW + 0.6, 1.5, 2.2), darkConcreteMat);
    bankSeat.position.set(0, -0.95, -dirSign * 0.4);
    bankSeat.receiveShadow = true;
    abutGroup.add(bankSeat);

    // Sloped trapezoidal gravel/earth embankment core beneath approach deck (no vertical side pier!)
    const slopePrism = new THREE.Mesh(
      new THREE.CylinderGeometry(deckW * 0.46, deckW * 0.84, 7.8, 4),
      bankCoreMat
    );
    slopePrism.rotation.y = Math.PI / 4;
    slopePrism.scale.set(1.05, 1.0, 1.15);
    slopePrism.position.set(0, -5.05, dirSign * 1.45);
    slopePrism.receiveShadow = true;
    abutGroup.add(slopePrism);

    // Dense sloped rocky boulder riprap apron wrapping both abutment slopes down to waterline
    const localObj = new THREE.Object3D();
    for (let row = 0; row < 15; row++) {
      const tSlope = row / 14; // 0 near road abutment -> 1 at river waterline
      const zSlope = dirSign * (-1.2 + tSlope * 9.8);
      const ySlope = -1.25 - tSlope * 7.65;
      const halfSpan = deckW * 0.54 + tSlope * 4.4;
      const cols = 10 + Math.floor(tSlope * 5);
      for (let col = 0; col < cols; col++) {
        const u = (col / (cols - 1)) * 2 - 1;
        const lx = u * halfSpan + (ripRand() - 0.5) * 0.45;
        const ly = ySlope + (ripRand() - 0.5) * 0.28;
        const lz = zSlope + (ripRand() - 0.5) * 0.55;

        const worldX = ep.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz;
        const worldZ = ep.z - Math.sin(yaw) * lx + Math.cos(yaw) * lz;
        const worldY = ep.y + ly;

        localObj.position.set(worldX, worldY, worldZ);
        localObj.rotation.set(ripRand() * Math.PI, ripRand() * Math.PI, ripRand() * Math.PI);
        const s = 0.72 + ripRand() * 0.76;
        localObj.scale.set(s * 1.18, s * 0.78, s * 1.08);
        localObj.updateMatrix();
        riprapTransforms.push(localObj.matrix.clone());

        const mossChance = tSlope > 0.45 && ripRand() > 0.58;
        if (mossChance) {
          ripTint.setHSL(0.23 + ripRand() * 0.05, 0.28, 0.34 + ripRand() * 0.12);
        } else {
          ripTint.setHSL(0.09 + ripRand() * 0.04, 0.08 + ripRand() * 0.08, 0.34 + ripRand() * 0.22);
        }
        riprapColors.push(ripTint.clone());
      }
    }

    group.add(abutGroup);
  }

  if (riprapTransforms.length > 0) {
    const ripIm = new THREE.InstancedMesh(riprapGeo, riprapMat, riprapTransforms.length);
    for (let i = 0; i < riprapTransforms.length; i++) {
      ripIm.setMatrixAt(i, riprapTransforms[i]);
      ripIm.setColorAt(i, riprapColors[i]);
    }
    ripIm.instanceMatrix.needsUpdate = true;
    if (ripIm.instanceColor) ripIm.instanceColor.needsUpdate = true;
    ripIm.computeBoundingSphere();
    ripIm.receiveShadow = true;
    ripIm.castShadow = true;
    group.add(ripIm);
  }

  // 5. Three Curved Galvanized Highway Streetlamp Poles Along Bridge Deck (Reference 1)
  const lampHeadMat = new THREE.MeshStandardMaterial({
    color: 0xf0ead8,
    emissive: 0xffd288,
    emissiveIntensity: 0.75,
    roughness: 0.3,
  });
  for (const lampT of [0.25, 0.56, 0.86]) {
    const lp = bridgePointAtT(lampT);
    const side = 1;
    const baseOff = side * (deckW * 0.5 - 0.18);
    const bx = lp.x + Math.cos(yaw) * baseOff;
    const bz = lp.z - Math.sin(yaw) * baseOff;
    const inwardX = -Math.cos(yaw) * side;
    const inwardZ = Math.sin(yaw) * side;

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bx, lp.y + 0.1, bz),
      new THREE.Vector3(bx, lp.y + 5.2, bz),
      new THREE.Vector3(bx + inwardX * 0.32, lp.y + 6.4, bz + inwardZ * 0.32),
      new THREE.Vector3(bx + inwardX * 1.45, lp.y + 6.85, bz + inwardZ * 1.45),
      new THREE.Vector3(bx + inwardX * 2.15, lp.y + 6.72, bz + inwardZ * 2.15),
    ]);
    const poleGeo = new THREE.TubeGeometry(curve, 14, 0.068, 8, false);
    const poleMesh = new THREE.Mesh(poleGeo, galvMat);
    poleMesh.castShadow = true;
    group.add(poleMesh);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.24), galvMat);
    head.position.set(bx + inwardX * 2.22, lp.y + 6.7, bz + inwardZ * 2.22);
    head.rotation.y = yaw;
    group.add(head);

    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.18), lampHeadMat);
    lens.position.set(bx + inwardX * 2.22, lp.y + 6.64, bz + inwardZ * 2.22);
    lens.rotation.y = yaw;
    group.add(lens);
  }

  // 6. Blue Latvian "Abava" River Sign With Wave Symbol at Both Bridge Entries
  const signTex = createAbavaRiverSignTexture();
  const signFaceMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.34, metalness: 0.1 });
  for (const [frac, signSide] of [[0.04, 1], [0.96, -1]] as [number, number][]) {
    const sp = bridgePointAtT(frac);
    const poleX = sp.x + Math.cos(yaw) * signSide * (deckW * 0.5 + 0.42);
    const poleZ = sp.z - Math.sin(yaw) * signSide * (deckW * 0.5 + 0.42);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 2.35, 8), galvMat);
    pole.position.set(poleX, sp.y + 1.05, poleZ);
    group.add(pole);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.58, 0.05), signFaceMat);
    plate.position.set(poleX, sp.y + 2.02, poleZ);
    plate.rotation.y = yaw + (signSide < 0 ? Math.PI : 0);
    group.add(plate);
  }

  return group;
}

/**
 * Renda Centre Shop & Post ("RENDAS VEIKALS · PASTS", id: 790959825)
 */
export function createShopPastsDetails(
  ring: [number, number][],
  cx: number,
  cz: number,
  wallH: number,
  roofH: number,
  archMats?: ArchTrimMaterialBundle
): THREE.Group {
  const group = new THREE.Group();
  const segments = computeWallSegments(ring, cx, cz);
  // Pick the SE plaza/church-facing main front wall (longest segment pointing generally +Z/+X)
  const frontSeg =
    [...segments].sort((a, b) => (b.normalZ * 0.7 + b.normalX * 0.7) * b.length - (a.normalZ * 0.7 + a.normalX * 0.7) * a.length)[0] ??
    segments[0];

  const plinthMat = archMats?.stonePlinthMat ?? new THREE.MeshStandardMaterial({ color: 0x625f58, roughness: 0.92, metalness: 0.04 });
  const trimMat = archMats
    ? (() => {
        const m = archMats.woodFrameMat.clone();
        m.color.setHex(0xf1ece0);
        return m;
      })()
    : new THREE.MeshStandardMaterial({ color: 0xf1ece0, roughness: 0.65 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3b3f43, roughness: 0.42, metalness: 0.55 });
  const shopGlassMat = archMats
    ? (() => {
        const m = archMats.windowGlassMat.clone();
        m.color.setHex(0xffe4a8);
        m.emissive.setHex(0xffba5c);
        m.emissiveIntensity = 0.5;
        return m;
      })()
    : new THREE.MeshStandardMaterial({
        color: 0xffe4a8,
        emissive: 0xffba5c,
        emissiveIntensity: 0.55,
        roughness: 0.15,
        metalness: 0.2,
      });
  const upperGlassMat = archMats
    ? (() => {
        const m = archMats.windowGlassMat.clone();
        m.emissiveIntensity = 0.34;
        return m;
      })()
    : new THREE.MeshStandardMaterial({
        color: 0x3a4d5c,
        emissive: 0x806035,
        emissiveIntensity: 0.32,
        roughness: 0.18,
        metalness: 0.25,
      });
  const awningMat = new THREE.MeshStandardMaterial({ color: 0x8d2d29, roughness: 0.62, metalness: 0.15 });
  const postYellowMat = new THREE.MeshStandardMaterial({ color: 0xe8b623, roughness: 0.42, metalness: 0.15 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd8b25a, roughness: 0.3, metalness: 0.8 });
  const zincMat = archMats?.zincRidgeMat ?? new THREE.MeshStandardMaterial({ color: 0x4b5257, roughness: 0.38, metalness: 0.65 });

  // Stone plinth + upper belt + eave cornice + gutters
  const plinthH = 0.58;
  for (const seg of segments) {
    const plinth = new THREE.Mesh(
      applyMetricTriplanarUvAndUv2(new THREE.BoxGeometry(seg.length + 0.14, plinthH + 0.8, 0.16), BUILDING_UV_METER_SCALE),
      plinthMat
    );
    plinth.position.set(seg.midX + seg.normalX * 0.04, plinthH - (plinthH + 0.8) * 0.5, seg.midZ + seg.normalZ * 0.04);
    plinth.rotation.y = seg.yaw;
    group.add(plinth);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(seg.length + 0.14, 0.16, 0.16), trimMat);
    belt.position.set(seg.midX + seg.normalX * 0.06, 3.65, seg.midZ + seg.normalZ * 0.06);
    belt.rotation.y = seg.yaw;
    group.add(belt);

    const cornice = new THREE.Mesh(new THREE.BoxGeometry(seg.length + 0.22, 0.24, 0.22), trimMat);
    cornice.position.set(seg.midX + seg.normalX * 0.08, wallH - 0.1, seg.midZ + seg.normalZ * 0.08);
    cornice.rotation.y = seg.yaw;
    group.add(cornice);

    const gutter = new THREE.Mesh(new THREE.BoxGeometry(seg.length + 0.3, 0.09, 0.12), zincMat);
    gutter.position.set(seg.midX + seg.normalX * 0.45, wallH - 0.05, seg.midZ + seg.normalZ * 0.45);
    gutter.rotation.y = seg.yaw;
    group.add(gutter);
  }
  for (const [rx, rz] of ring) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.32, wallH, 0.32), trimMat);
    pil.position.set(rx - cx, wallH * 0.5, rz - cz);
    group.add(pil);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, wallH, 6), zincMat);
    pipe.position.set((rx - cx) * 1.02, wallH * 0.5, (rz - cz) * 1.02);
    group.add(pipe);
  }

  // Front commercial storefront bays + awning + signage + concrete ramp/steps + postbox + bike rack
  if (frontSeg) {
    const store = new THREE.Group();
    store.position.set(frontSeg.midX, 0, frontSeg.midZ);
    store.rotation.y = frontSeg.yaw;

    // Concrete raised entry terrace + steps + accessibility ramp
    const terrace = new THREE.Mesh(
      applyMetricTriplanarUvAndUv2(new THREE.BoxGeometry(Math.min(frontSeg.length - 1.2, 11.4), 0.72, 2.2), BUILDING_UV_METER_SCALE),
      plinthMat
    );
    terrace.position.set(0, 0.2, 1.1);
    terrace.receiveShadow = true;
    store.add(terrace);

    for (let st = 0; st < 3; st++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.38), archMats?.graniteStepMat ?? trimMat);
      step.position.set(-1.5, 0.1 + st * 0.16, 2.75 - st * 0.35);
      store.add(step);
    }
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.16, 1.15), plinthMat);
    ramp.position.set(2.8, 0.26, 2.45);
    ramp.rotation.z = -0.13;
    store.add(ramp);
    const handrail = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.06, 0.06), zincMat);
    handrail.position.set(2.8, 1.15, 2.96);
    handrail.rotation.z = -0.13;
    store.add(handrail);

    // Double glass entry doors in center bay
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.45, 0.18), frameMat);
    doorFrame.position.set(-1.5, 1.75, 0.08);
    store.add(doorFrame);
    const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(1.92, 2.18, 0.21), shopGlassMat);
    doorGlass.position.set(-1.5, 1.72, 0.08);
    store.add(doorGlass);
    const doorStile = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 0.23), frameMat);
    doorStile.position.set(-1.5, 1.72, 0.09);
    store.add(doorStile);
    for (const hx of [-1.66, -1.34]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.52, 0.08), brassMat);
      bar.position.set(hx, 1.55, 0.22);
      store.add(bar);
    }

    // Two wide commercial display windows flanking entrance + planter flowerboxes
    const flowerLeafMat = new THREE.MeshStandardMaterial({ color: 0x3f5e2c, roughness: 0.85 });
    const flowerRedMat = new THREE.MeshStandardMaterial({ color: 0xd44b48, roughness: 0.78 });
    for (const wx of [-4.6, 2.2, 5.1]) {
      if (Math.abs(wx) > frontSeg.length * 0.44) continue;
      const wFrame = new THREE.Mesh(new THREE.BoxGeometry(2.35, 1.95, 0.16), frameMat);
      wFrame.position.set(wx, 1.85, 0.07);
      store.add(wFrame);
      const wGlass = new THREE.Mesh(new THREE.BoxGeometry(2.12, 1.72, 0.19), shopGlassMat);
      wGlass.position.set(wx, 1.85, 0.07);
      store.add(wGlass);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 0.24), trimMat);
      sill.position.set(wx, 0.86, 0.12);
      store.add(sill);

      const box = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.24, 0.34), frameMat);
      box.position.set(wx, 0.96, 0.24);
      store.add(box);
      const bush = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.28), flowerLeafMat);
      bush.position.set(wx, 1.12, 0.24);
      store.add(bush);
      const blooms = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.14, 0.24), flowerRedMat);
      blooms.position.set(wx, 1.24, 0.24);
      store.add(blooms);
    }

    // Sloped storefront awning + illuminated "Veikals" fascia signboard (matching Reference 3)
    const awningW = Math.min(frontSeg.length - 1.5, 10.6);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(awningW, 0.12, 1.45), awningMat);
    awning.position.set(0, 3.18, 0.72);
    awning.rotation.x = 0.24;
    awning.castShadow = true;
    store.add(awning);

    const signTex = createLatvianSignTexture('Veikals', 'RENDA · PASTS', '#f6f3ec', '#1d2220', '#2b4736');
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(5.8, 0.85, 0.14),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.38 })
    );
    signBoard.position.set(0, 3.88, 0.18);
    store.add(signBoard);

    // Classic Latvian yellow PASTS postbox beside entrance
    const postBox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.58, 0.24), postYellowMat);
    postBox.position.set(-3.05, 1.78, 0.22);
    store.add(postBox);

    // Steel bicycle rack on plaza edge
    for (let bi = 0; bi < 4; bi++) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 12, Math.PI), zincMat);
      hoop.position.set(4.1 + bi * 0.48, 0.58, 1.7);
      hoop.rotation.y = Math.PI / 2;
      store.add(hoop);
    }

    group.add(store);
  }

  // Upper 2nd & 3rd floor residential/office multi-pane windows across all walls
  for (const seg of segments) {
    if (seg.length < 4.5) continue;
    const cols = Math.max(2, Math.min(5, Math.floor((seg.length - 2.2) / 3.1)));
    const tx = -seg.normalZ;
    const tz = seg.normalX;
    const levels = wallH > 7.2 ? [5.15, 7.25] : [5.15];
    for (const wy of levels) {
      for (let wi = 0; wi < cols; wi++) {
        const t = cols === 1 ? 0 : (wi / (cols - 1) - 0.5) * (seg.length - 3.0);
        const wh = new THREE.Group();
        wh.position.set(seg.midX + tx * t + seg.normalX * 0.08, wy, seg.midZ + tz * t + seg.normalZ * 0.08);
        wh.rotation.y = seg.yaw;
        wh.add(new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.38, 0.11), trimMat));
        wh.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.16, 0.14), upperGlassMat));
        wh.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.18, 0.16), trimMat));
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.05, 0.16), trimMat);
        hBar.position.y = 0.16;
        wh.add(hBar);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.09, 0.18), trimMat);
        sill.position.y = -0.72;
        wh.add(sill);
        group.add(wh);
      }
    }
    // Ground floor non-front display windows
    if (seg !== frontSeg) {
      for (let wi = 0; wi < cols; wi++) {
        const t = cols === 1 ? 0 : (wi / (cols - 1) - 0.5) * (seg.length - 3.0);
        const wh = new THREE.Group();
        wh.position.set(seg.midX + tx * t + seg.normalX * 0.08, 2.0, seg.midZ + tz * t + seg.normalZ * 0.08);
        wh.rotation.y = seg.yaw;
        wh.add(new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.45, 0.11), frameMat));
        wh.add(new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.22, 0.14), upperGlassMat));
        group.add(wh);
      }
    }
  }

  // Twin masonry chimneys
  const obb = computePrimaryAxisAndBounds(ring);
  const brickMat = archMats?.brickChimneyMat ?? new THREE.MeshStandardMaterial({ color: 0x894230, roughness: 0.86 });
  for (const frac of [-0.26, 0.26]) {
    const stack = new THREE.Mesh(
      applyMetricTriplanarUvAndUv2(new THREE.BoxGeometry(0.76, roofH + 1.5, 0.76), BUILDING_UV_METER_SCALE),
      brickMat
    );
    stack.position.set(Math.cos(obb.angle) * obb.lengthU * frac, wallH + roofH * 0.58, Math.sin(obb.angle) * obb.lengthU * frac);
    group.add(stack);
  }

  return group;
}

/**
 * Kafejnīca "Abavas pagrabiņš" (id: 790959832) — Cozy Kurzeme riverside fieldstone cellar & tavern deck
 */
export function createPagrabinsCafeDetails(
  ring: [number, number][],
  cx: number,
  cz: number,
  wallH: number,
  roofH: number,
  archMats?: ArchTrimMaterialBundle
): THREE.Group {
  const group = new THREE.Group();
  const segments = computeWallSegments(ring, cx, cz);
  // Longest edge facing Abava river (-Z / NW) or road (+X)
  const riverSeg = [...segments].sort((a, b) => (-b.normalZ + b.normalX * 0.3) * b.length - (-a.normalZ + a.normalX * 0.3) * a.length)[0] ?? segments[0];
  const roadSeg = [...segments].sort((a, b) => (b.normalZ * 0.7 + b.normalX * 0.7) * b.length - (a.normalZ * 0.7 + a.normalX * 0.7) * a.length)[0] ?? segments[0];

  const timberMat = archMats
    ? (() => {
        const m = archMats.woodFrameMat.clone();
        m.color.setHex(0x8e6442);
        return m;
      })()
    : new THREE.MeshStandardMaterial({ color: 0x6e4729, roughness: 0.84 });
  const deckMat = archMats
    ? (() => {
        const m = archMats.woodFasciaMat.clone();
        m.color.setHex(0xa87a52);
        return m;
      })()
    : new THREE.MeshStandardMaterial({ color: 0x8a5e39, roughness: 0.8 });
  const trimMat = archMats
    ? (() => {
        const m = archMats.woodFrameMat.clone();
        m.color.setHex(0xe9dec8);
        return m;
      })()
    : new THREE.MeshStandardMaterial({ color: 0xe9dec8, roughness: 0.7 });
  const warmGlassMat = archMats
    ? (() => {
        const m = archMats.windowGlassMat.clone();
        m.color.setHex(0xffe2a2);
        m.emissive.setHex(0xffa83e);
        m.emissiveIntensity = 0.72;
        return m;
      })()
    : new THREE.MeshStandardMaterial({
        color: 0xffe2a2,
        emissive: 0xffa83e,
        emissiveIntensity: 0.85,
        roughness: 0.2,
      });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.45, metalness: 0.65 });
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xc93b42, roughness: 0.8 });
  const umbrellaMat = new THREE.MeshStandardMaterial({ color: 0xa6392e, roughness: 0.72, side: THREE.DoubleSide });

  // Heavy timber corner beams & upper timber gable fascia collar
  for (const [rx, rz] of ring) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, wallH, 0.26), timberMat);
    post.position.set(rx - cx, wallH * 0.5, rz - cz);
    group.add(post);
  }
  for (const seg of segments) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(seg.length + 0.16, 0.2, 0.18), timberMat);
    beam.position.set(seg.midX + seg.normalX * 0.05, wallH - 0.1, seg.midZ + seg.normalZ * 0.05);
    beam.rotation.y = seg.yaw;
    group.add(beam);

    // Warm tavern mullioned windows + flower boxes
    if (seg.length >= 4.2) {
      const tx = -seg.normalZ;
      const tz = seg.normalX;
      const count = seg.length > 7 ? 2 : 1;
      for (let wi = 0; wi < count; wi++) {
        const t = count === 1 ? 0 : (wi === 0 ? -1.9 : 1.9);
        if (seg === roadSeg && Math.abs(t) < 0.8) continue;
        const win = new THREE.Group();
        win.position.set(seg.midX + tx * t + seg.normalX * 0.08, 1.95, seg.midZ + tz * t + seg.normalZ * 0.08);
        win.rotation.y = seg.yaw;
        win.add(new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.04, 0.12), trimMat));
        win.add(new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.84, 0.15), warmGlassMat));
        win.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.86, 0.17), timberMat));
        win.add(new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.05, 0.17), timberMat));
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.22, 0.28), timberMat);
        box.position.set(0, -0.62, 0.1);
        win.add(box);
        const flowers = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.16, 0.2), flowerMat);
        flowers.position.set(0, -0.46, 0.1);
        win.add(flowers);
        group.add(win);
      }
    }
  }

  // Road-facing tavern arched oak entry + hanging carved wooden "ABAVAS PAGRABIŅŠ" sign + brass wall lanterns
  if (roadSeg) {
    const entry = new THREE.Group();
    entry.position.set(roadSeg.midX, 0, roadSeg.midZ);
    entry.rotation.y = roadSeg.yaw;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.65, 2.35, 0.18), timberMat);
    frame.position.set(0, 1.18, 0.08);
    entry.add(frame);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.26, 2.08, 0.2),
      archMats?.woodDoorMat ?? new THREE.MeshStandardMaterial({ color: 0x422a19, roughness: 0.72 })
    );
    door.position.set(0, 1.05, 0.09);
    entry.add(door);

    const signTex = createLatvianSignTexture('ABAVAS PAGRABIŅŠ', 'KAFEJNĪCA · KROGS', '#362315', '#f5e4c3', '#c89545');
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.72, 0.1),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.45 })
    );
    signBoard.position.set(0, 3.05, 0.22);
    entry.add(signBoard);

    for (const lx of [-1.2, 1.2]) {
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), warmGlassMat);
      lantern.position.set(lx, 2.25, 0.26);
      entry.add(lantern);
    }
    group.add(entry);
  }

  // Raised wooden riverside dining terrace overlooking Abava River with picnic tables & red umbrellas
  if (riverSeg) {
    const terrace = new THREE.Group();
    terrace.position.set(riverSeg.midX, 0, riverSeg.midZ);
    terrace.rotation.y = riverSeg.yaw;

    const deckW = Math.max(7.2, riverSeg.length + 1.2);
    const deckD = 4.4;
    const platform = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.36, deckD), deckMat);
    platform.position.set(0, 0.22, deckD * 0.5);
    platform.receiveShadow = true;
    platform.castShadow = true;
    terrace.add(platform);

    // Timber pilings & fascia skirting anchoring the terrace firmly into the riverbank slope
    const apron = new THREE.Mesh(new THREE.BoxGeometry(deckW + 0.08, 0.32, 0.16), timberMat);
    apron.position.set(0, 0.18, deckD - 0.06);
    terrace.add(apron);
    for (let pi = -2; pi <= 2; pi++) {
      const piling = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.6, 0.2), timberMat);
      piling.position.set((pi / 2) * (deckW * 0.44), -1.65, deckD - 0.22);
      terrace.add(piling);
    }

    // Timber deck balustrade
    const rail = new THREE.Mesh(new THREE.BoxGeometry(deckW, 0.09, 0.09), timberMat);
    rail.position.set(0, 1.12, deckD - 0.12);
    terrace.add(rail);
    for (let pi = -3; pi <= 3; pi++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), timberMat);
      post.position.set((pi / 3) * (deckW * 0.46), 0.72, deckD - 0.12);
      terrace.add(post);
    }

    // Two rustic picnic tables with canvas sun umbrellas
    for (const tx of [-1.9, 1.9]) {
      const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.9), timberMat);
      tableTop.position.set(tx, 1.08, deckD * 0.52);
      terrace.add(tableTop);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.35, 6), ironMat);
      pole.position.set(tx, 2.15, deckD * 0.52);
      terrace.add(pole);
      const umbrella = new THREE.Mesh(new THREE.ConeGeometry(1.32, 0.55, 8), umbrellaMat);
      umbrella.position.set(tx, 3.22, deckD * 0.52);
      umbrella.castShadow = true;
      terrace.add(umbrella);
    }

    group.add(terrace);
  }

  // Stone chimney rising through clay tile gable
  const chim = new THREE.Mesh(
    applyMetricTriplanarUvAndUv2(new THREE.BoxGeometry(0.66, roofH + 1.4, 0.66), BUILDING_UV_METER_SCALE),
    archMats?.stonePlinthMat ?? new THREE.MeshStandardMaterial({ color: 0x767268, roughness: 0.9 })
  );
  chim.position.set(0, wallH + roofH * 0.58, 0);
  group.add(chim);

  return group;
}

/**
 * Renda Culture House & Parish Administration ("Vīgneri", id: 790959820 — 17-vertex civic complex)
 */
export function createCultureHouseDetails(
  ring: [number, number][],
  cx: number,
  cz: number,
  wallH: number,
  roofH: number,
  archMats?: ArchTrimMaterialBundle
): THREE.Group {
  const group = new THREE.Group();
  const segments = computeWallSegments(ring, cx, cz);
  // Main civic portico faces the village pedestrian plaza (+Z south-west entrance bay)
  const frontSeg =
    [...segments].sort((a, b) => (b.normalZ * 0.95 - b.normalX * 0.25) * b.length - (a.normalZ * 0.95 - a.normalX * 0.25) * a.length)[0] ??
    segments[0];
  // Secondary P120 highway-facing long elevation (+X/-Z side seen from P120 & Abava Bridge)
  const highwaySeg =
    [...segments]
      .filter((s) => s !== frontSeg)
      .sort((a, b) => (b.normalX * 0.85 - b.normalZ * 0.52) * b.length - (a.normalX * 0.85 - a.normalZ * 0.52) * a.length)[0];

  const plinthMat = archMats?.stonePlinthMat ?? new THREE.MeshStandardMaterial({ color: 0x6f6c64, roughness: 0.9 });
  const trimMat = archMats
    ? (() => {
        const m = archMats.woodFrameMat.clone();
        m.color.setHex(0xf4efe3);
        return m;
      })()
    : new THREE.MeshStandardMaterial({ color: 0xf4efe3, roughness: 0.6 });
  const roofCapMat = new THREE.MeshStandardMaterial({ color: 0x8d4230, roughness: 0.72 });
  const glassMat = archMats
    ? (() => {
        const m = archMats.windowGlassMat.clone();
        m.emissiveIntensity = 0.36;
        return m;
      })()
    : new THREE.MeshStandardMaterial({
        color: 0x3b5060,
        emissive: 0xdba555,
        emissiveIntensity: 0.38,
        roughness: 0.18,
        metalness: 0.25,
      });
  const oakDoorMat = archMats?.woodDoorMat ?? new THREE.MeshStandardMaterial({ color: 0x4b2f1d, roughness: 0.68 });
  const zincMat = archMats?.zincRidgeMat ?? new THREE.MeshStandardMaterial({ color: 0x4b5156, roughness: 0.4, metalness: 0.65 });

  // Perimeter stone foundation plinth, classical corner pilasters, eave cornice & gutters
  const plinthH = 0.56;
  for (const seg of segments) {
    const plinth = new THREE.Mesh(
      applyMetricTriplanarUvAndUv2(new THREE.BoxGeometry(seg.length + 0.14, plinthH + 0.85, 0.16), BUILDING_UV_METER_SCALE),
      plinthMat
    );
    plinth.position.set(seg.midX + seg.normalX * 0.04, plinthH - (plinthH + 0.85) * 0.5, seg.midZ + seg.normalZ * 0.04);
    plinth.rotation.y = seg.yaw;
    group.add(plinth);

    const cornice = new THREE.Mesh(new THREE.BoxGeometry(seg.length + 0.2, 0.26, 0.22), trimMat);
    cornice.position.set(seg.midX + seg.normalX * 0.08, wallH - 0.12, seg.midZ + seg.normalZ * 0.08);
    cornice.rotation.y = seg.yaw;
    group.add(cornice);

    const gutter = new THREE.Mesh(new THREE.BoxGeometry(seg.length + 0.26, 0.1, 0.14), zincMat);
    gutter.position.set(seg.midX + seg.normalX * 0.36, wallH - 0.04, seg.midZ + seg.normalZ * 0.36);
    gutter.rotation.y = seg.yaw;
    group.add(gutter);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(seg.length + 0.12, 0.13, 0.13), trimMat);
    belt.position.set(seg.midX + seg.normalX * 0.05, wallH * 0.52, seg.midZ + seg.normalZ * 0.05);
    belt.rotation.y = seg.yaw;
    group.add(belt);

    // Multi-bay civic windows
    if (seg.length >= 4.2) {
      const tx = -seg.normalZ;
      const tz = seg.normalX;
      const cols = Math.max(1, Math.min(6, Math.floor((seg.length - 2.0) / 3.2)));
      for (const fl of [0, 1]) {
        const wy = fl === 0 ? 1.85 : wallH * 0.72;
        if (fl === 1 && wallH < 4.7) continue;
        for (let wi = 0; wi < cols; wi++) {
          const t = cols === 1 ? 0 : (wi / (cols - 1) - 0.5) * (seg.length - 3.0);
          if (seg === frontSeg && fl === 0 && Math.abs(t) < 2.2) continue;
          const wh = new THREE.Group();
          wh.position.set(seg.midX + tx * t + seg.normalX * 0.08, wy, seg.midZ + tz * t + seg.normalZ * 0.08);
          wh.rotation.y = seg.yaw;
          wh.add(new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.56, 0.11), trimMat));
          wh.add(new THREE.Mesh(new THREE.BoxGeometry(0.96, 1.34, 0.14), glassMat));
          wh.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.36, 0.16), trimMat));
          const sill = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.1, 0.18), trimMat);
          sill.position.y = -0.82;
          wh.add(sill);
          group.add(wh);
        }
      }
    }
  }

  for (let i = 0; i < ring.length; i += 2) {
    const [rx, rz] = ring[i];
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.28, wallH, 0.28), trimMat);
    pil.position.set(rx - cx, wallH * 0.5, rz - cz);
    group.add(pil);
  }

  const signTex = createLatvianSignTexture('RENDAS KULTŪRAS NAMS', 'PAGASTA PĀRVALDE', '#26342c', '#f7f1df', '#d1a44d');
  const plaqueMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.38 });

  // Monumental 4-column neoclassical civic entrance portico + Latvian flagpole facing village plaza
  if (frontSeg) {
    const portico = new THREE.Group();
    portico.position.set(frontSeg.midX, 0, frontSeg.midZ);
    portico.rotation.y = frontSeg.yaw;

    const steps = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.62, 2.2), plinthMat);
    steps.position.set(0, 0.22, 1.1);
    portico.add(steps);

    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.15, 2.85, 0.16), trimMat);
    doorFrame.position.set(0, 1.92, 0.07);
    portico.add(doorFrame);
    const oakDoors = new THREE.Mesh(new THREE.BoxGeometry(1.82, 2.48, 0.19), oakDoorMat);
    oakDoors.position.set(0, 1.76, 0.08);
    portico.add(oakDoors);
    const fanlight = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.42, 0.19), glassMat);
    fanlight.position.set(0, 3.05, 0.08);
    portico.add(fanlight);

    for (const px of [-2.05, -0.95, 0.95, 2.05]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 3.6, 12), trimMat);
      col.position.set(px, 2.25, 1.85);
      col.castShadow = true;
      portico.add(col);
    }

    const architrave = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.36, 2.25), trimMat);
    architrave.position.set(0, 4.15, 1.05);
    portico.add(architrave);

    const pedimentRoof = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.15, 4), roofCapMat);
    pedimentRoof.position.set(0, 4.88, 1.05);
    pedimentRoof.rotation.y = Math.PI / 4;
    pedimentRoof.scale.set(1.25, 1, 0.62);
    portico.add(pedimentRoof);

    const plaque = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.62, 0.12), plaqueMat);
    plaque.position.set(0, 4.2, 2.22);
    portico.add(plaque);

    // Tall Latvian flagpole with crimson-white-crimson national flag on the plaza edge
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, 8.6, 8), zincMat);
    pole.position.set(4.6, 4.3, 3.6);
    portico.add(pole);

    const flagMatRed = new THREE.MeshStandardMaterial({ color: 0x9e3039, roughness: 0.72, side: THREE.DoubleSide });
    const flagMatWhite = new THREE.MeshStandardMaterial({ color: 0xf7f5f0, roughness: 0.72, side: THREE.DoubleSide });
    for (const [fy, fh, fMat] of [
      [8.25, 0.34, flagMatRed],
      [7.99, 0.18, flagMatWhite],
      [7.73, 0.34, flagMatRed],
    ] as [number, number, THREE.Material][]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.65, fh, 0.03), fMat);
      strip.position.set(5.45, fy, 3.6);
      portico.add(strip);
    }

    group.add(portico);
  }

  // Highway-facing stone-pilaster gable projection & illuminated Rendas Kultūras Nams frieze facing P120/Bridge
  if (highwaySeg) {
    const hw = new THREE.Group();
    hw.position.set(highwaySeg.midX, 0, highwaySeg.midZ);
    hw.rotation.y = highwaySeg.yaw;

    const frieze = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.32, 0.24), trimMat);
    frieze.position.set(0, wallH - 0.28, 0.12);
    hw.add(frieze);

    const hwPlaque = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.72, 0.12), plaqueMat);
    hwPlaque.position.set(0, wallH - 0.92, 0.16);
    hw.add(hwPlaque);

    for (const px of [-3.1, 3.1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.38, wallH, 0.28), trimMat);
      pil.position.set(px, wallH * 0.5, 0.08);
      hw.add(pil);
    }
    group.add(hw);
  }

  // Twin civic chimneys & zinc roof vent cupola
  const chimMat = archMats?.brickChimneyMat ?? new THREE.MeshStandardMaterial({ color: 0x924733, roughness: 0.86 });
  for (const [dx, dz] of [[-4, -2], [5, 3]]) {
    const stack = new THREE.Mesh(
      applyMetricTriplanarUvAndUv2(new THREE.BoxGeometry(0.84, roofH + 1.6, 0.84), BUILDING_UV_METER_SCALE),
      chimMat
    );
    stack.position.set(dx, wallH + roofH * 0.6, dz);
    group.add(stack);
  }
  const cupola = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.4), zincMat);
  cupola.position.set(0, wallH + roofH * 0.86, 0);
  group.add(cupola);

  return group;
}

/**
 * Lielrenda Manor (Lielrendas muiža) — Classical 2-story Baltic estate with 4-column
 * garden portico, triangular pediment, grand stone terrace stairs & iron balustrades,
 * corner pilasters, roof dormers, stone plinth, and twin chimneys (manor.jpg).
 */
export function createLielrendaManorDetails(
  ring: [number, number][],
  cx: number,
  cz: number,
  wallH: number,
  roofH: number,
  archMats?: ArchTrimMaterialBundle
): THREE.Group {
  const group = new THREE.Group();
  const segments = computeWallSegments(ring, cx, cz);
  const southCourtyardSeg = [...segments]
    .filter((s) => s.normalZ > 0.35 && s.length >= 25)
    .sort((a, b) => b.length - a.length)[0];
  const longestSeg =
    southCourtyardSeg ?? [...segments].sort((a, b) => b.length - a.length)[0] ?? segments[0];

  const plinthMat = archMats?.stonePlinthMat ?? new THREE.MeshStandardMaterial({ color: 0x767268, roughness: 0.92, metalness: 0.04 });
  const trimMat = archMats
    ? (() => {
        const m = archMats.woodFrameMat.clone();
        m.color.setHex(0xf3ecda);
        return m;
      })()
    : new THREE.MeshStandardMaterial({ color: 0xf3ecda, roughness: 0.62 });
  const roofCapMat = new THREE.MeshStandardMaterial({ color: 0x7a282a, roughness: 0.45, metalness: 0.35 });
  const oakDoorMat = archMats?.woodDoorMat ?? new THREE.MeshStandardMaterial({ color: 0x3b2416, roughness: 0.68 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x222528, roughness: 0.42, metalness: 0.72 });
  const glassMat = archMats?.windowGlassMat ?? new THREE.MeshStandardMaterial({
    color: 0x22333f,
    emissive: 0x5c4223,
    emissiveIntensity: 0.18,
    roughness: 0.14,
    metalness: 0.42,
  });
  const chimMat = archMats
    ? (() => {
        const m = archMats.stonePlinthMat.clone();
        m.color.setHex(0xd8c8aa);
        return m;
      })()
    : new THREE.MeshStandardMaterial({ color: 0xc9b998, roughness: 0.84 });

  // Stone foundation plinth + eave cornice + horizontal mid-story belt course
  const plinthH = 0.62;
  for (const seg of segments) {
    const plinth = new THREE.Mesh(
      applyMetricTriplanarUvAndUv2(new THREE.BoxGeometry(seg.length + 0.16, plinthH + 0.9, 0.18), BUILDING_UV_METER_SCALE),
      plinthMat
    );
    plinth.position.set(seg.midX + seg.normalX * 0.04, plinthH - (plinthH + 0.9) * 0.5, seg.midZ + seg.normalZ * 0.04);
    plinth.rotation.y = seg.yaw;
    group.add(plinth);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(seg.length + 0.14, 0.15, 0.16), trimMat);
    belt.position.set(seg.midX + seg.normalX * 0.05, wallH * 0.5, seg.midZ + seg.normalZ * 0.05);
    belt.rotation.y = seg.yaw;
    group.add(belt);

    const cornice = new THREE.Mesh(new THREE.BoxGeometry(seg.length + 0.24, 0.28, 0.24), trimMat);
    cornice.position.set(seg.midX + seg.normalX * 0.08, wallH - 0.12, seg.midZ + seg.normalZ * 0.08);
    cornice.rotation.y = seg.yaw;
    group.add(cornice);

    // Tall symmetric manor mullioned windows on ground & 2nd floor
    if (seg.length >= 4.2) {
      const tx = -seg.normalZ;
      const tz = seg.normalX;
      const cols = Math.min(22, Math.max(2, Math.floor((seg.length - 2.0) / 3.8)));
      for (const fl of [0, 1]) {
        const wy = fl === 0 ? wallH * 0.32 : wallH * 0.72;
        for (let wi = 0; wi < cols; wi++) {
          const t = cols === 1 ? 0 : (wi / (cols - 1) - 0.5) * (seg.length - 2.8);
          if (seg === longestSeg && fl === 0 && Math.abs(t) < 2.2) continue;

          const wh = new THREE.Group();
          wh.position.set(seg.midX + tx * t + seg.normalX * 0.08, wy, seg.midZ + tz * t + seg.normalZ * 0.08);
          wh.rotation.y = seg.yaw;

          wh.add(new THREE.Mesh(new THREE.BoxGeometry(1.16, 1.62, 0.12), trimMat));
          wh.add(new THREE.Mesh(new THREE.BoxGeometry(0.92, 1.38, 0.15), glassMat));
          wh.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.4, 0.17), trimMat));
          for (const hy of [-0.24, 0.24]) {
            const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.045, 0.17), trimMat);
            hBar.position.y = hy;
            wh.add(hBar);
          }
          const sill = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.2), trimMat);
          sill.position.y = -0.84;
          wh.add(sill);
          const ped = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.12, 0.18), trimMat);
          ped.position.y = 0.85;
          wh.add(ped);
          group.add(wh);
        }
      }
    }
  }

  // Classical corner pilasters
  for (let i = 0; i < ring.length; i += 2) {
    const [rx, rz] = ring[i];
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.36, wallH, 0.36), trimMat);
    pil.position.set(rx - cx, wallH * 0.5, rz - cz);
    group.add(pil);
  }

  // Grand 4-column neoclassical entrance portico, wide terraced steps, iron railings & roof dormers
  if (longestSeg) {
    const portico = new THREE.Group();
    portico.position.set(longestSeg.midX, 0, longestSeg.midZ);
    portico.rotation.y = longestSeg.yaw;

    // Raised limestone portico podium & 4 wide terraced stair risers
    const podium = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.78, 3.1), plinthMat);
    podium.position.set(0, 0.26, 1.55);
    podium.receiveShadow = true;
    portico.add(podium);

    for (let st = 0; st < 4; st++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(4.6 + (3 - st) * 0.4, 0.18, 0.48), trimMat);
      step.position.set(0, 0.08 + st * 0.15, 4.45 - st * 0.42);
      step.receiveShadow = true;
      portico.add(step);
    }

    // Iron stair handrails + classical garden urns flanking the terrace stairs
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 2.2), ironMat);
      rail.position.set(side * 2.2, 1.05, 3.65);
      rail.rotation.x = 0.28;
      portico.add(rail);

      const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.34), trimMat);
      post.position.set(side * 2.65, 0.55, 4.15);
      portico.add(post);

      const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.16, 0.42, 10), trimMat);
      urn.position.set(side * 2.65, 1.2, 4.15);
      portico.add(urn);
    }

    // Double oak manor entrance doors + fanlight
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(2.25, 2.9, 0.16), trimMat);
    doorFrame.position.set(0, 2.05, 0.08);
    portico.add(doorFrame);
    const oakDoors = new THREE.Mesh(new THREE.BoxGeometry(1.88, 2.52, 0.19), oakDoorMat);
    oakDoors.position.set(0, 1.9, 0.09);
    portico.add(oakDoors);
    const fanlight = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.42, 0.19), glassMat);
    fanlight.position.set(0, 3.22, 0.09);
    portico.add(fanlight);

    // 4 tall Doric columns with sculpted bases & capitals supporting entablature & classical triangular pediment
    for (const px of [-2.85, -1.05, 1.05, 2.85]) {
      const colBase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.22, 0.56), trimMat);
      colBase.position.set(px, 0.72, 2.65);
      portico.add(colBase);

      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, wallH - 1.15, 14), trimMat);
      col.position.set(px, 0.75 + (wallH - 1.15) * 0.5, 2.65);
      col.castShadow = true;
      portico.add(col);

      const capBlock = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.18, 0.54), trimMat);
      capBlock.position.set(px, wallH - 0.42, 2.65);
      portico.add(capBlock);
    }

    // Wrought-iron balcony railings flanking entrance podium
    for (const side of [-1, 1]) {
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.06, 0.06), ironMat);
      topBar.position.set(side * 2.55, 1.48, 2.98);
      portico.add(topBar);
      for (let bi = -2; bi <= 2; bi++) {
        const baluster = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.85, 0.04), ironMat);
        baluster.position.set(side * 2.55 + bi * 0.36, 1.05, 2.98);
        portico.add(baluster);
      }
    }

    const entablature = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.48, 3.1), trimMat);
    entablature.position.set(0, wallH - 0.14, 1.52);
    portico.add(entablature);

    // Classical triangular neoclassical pediment tympanum + overhanging pitched roof slabs + medallion
    const pedShape = new THREE.Shape();
    pedShape.moveTo(-3.55, 0);
    pedShape.lineTo(3.55, 0);
    pedShape.lineTo(0, 1.62);
    pedShape.closePath();
    const pedGeo = new THREE.ExtrudeGeometry(pedShape, {
      depth: 3.12,
      bevelEnabled: false,
    });
    pedGeo.translate(0, 0, -1.56);
    const pedTympanum = new THREE.Mesh(pedGeo, trimMat);
    pedTympanum.position.set(0, wallH + 0.1, 1.52);
    pedTympanum.castShadow = true;
    portico.add(pedTympanum);

    const roofPitchAngle = Math.atan2(1.62, 3.55);
    const slopeLen = Math.hypot(3.78, 1.72);
    for (const side of [-1, 1]) {
      const pedSlope = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.16, 3.36), roofCapMat);
      pedSlope.position.set(side * 1.82, wallH + 0.94, 1.54);
      pedSlope.rotation.z = -side * roofPitchAngle;
      pedSlope.castShadow = true;
      portico.add(pedSlope);
    }

    const crestMedallion = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.12, 16), plinthMat);
    crestMedallion.rotation.x = Math.PI / 2;
    crestMedallion.position.set(0, wallH + 0.72, 3.09);
    portico.add(crestMedallion);

    // 3 arched dormers rising along the burgundy manor roof slope
    for (const dx of [-6.4, 0, 6.4]) {
      if (Math.abs(dx) > longestSeg.length * 0.36) continue;
      const dormer = new THREE.Group();
      dormer.position.set(dx, wallH + roofH * 0.45, 1.85);
      dormer.add(new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.15, 1.5), trimMat));
      const dGlass = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.78, 0.15), glassMat);
      dGlass.position.set(0, 0.04, 0.72);
      dormer.add(dGlass);
      const dRoof = new THREE.Mesh(new THREE.ConeGeometry(1.12, 0.68, 4), roofCapMat);
      dRoof.position.set(0, 0.88, 0);
      dRoof.rotation.y = Math.PI / 4;
      dormer.add(dRoof);
      portico.add(dormer);
    }

    group.add(portico);
  }

  // Twin plastered manor chimneys
  const obb = computePrimaryAxisAndBounds(ring);
  for (const frac of [-0.28, 0.28]) {
    const stack = new THREE.Mesh(
      applyMetricTriplanarUvAndUv2(new THREE.BoxGeometry(0.85, roofH + 1.8, 0.85), BUILDING_UV_METER_SCALE),
      chimMat
    );
    stack.position.set(
      Math.cos(obb.angle) * obb.lengthU * frac,
      wallH + roofH * 0.62,
      Math.sin(obb.angle) * obb.lengthU * frac
    );
    stack.castShadow = true;
    group.add(stack);
  }

  return group;
}

/**
 * Abava Boats Pier ("ABAVAS LAIVAS") — Weathered plank timber jetty with pilings,
 * cleats, moored wooden canoes, lifebuoy, and boat-launch trail sign.
 */
export function createAbavaPierDetails(): THREE.Group {
  const g = new THREE.Group();
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x735234, roughness: 0.86, metalness: 0.03 });
  const darkTimberMat = new THREE.MeshStandardMaterial({ color: 0x4b3522, roughness: 0.9, metalness: 0.03 });
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x876442, roughness: 0.82 });
  const canoeHullMat = new THREE.MeshPhysicalMaterial({ color: 0x9b4528, roughness: 0.38, clearcoat: 0.65 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.45, metalness: 0.68 });
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xd94b2b, roughness: 0.55 });

  // Stringers + individual deck planks for real tactile timber jetty look
  const stringer = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 9.0), darkTimberMat);
  stringer.position.set(0, 0.82, 0);
  stringer.castShadow = true;
  stringer.receiveShadow = true;
  g.add(stringer);

  for (let i = 0; i < 18; i++) {
    const z = -4.2 + i * 0.49;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.07, 0.42), i % 3 === 0 ? timberMat : plankMat);
    plank.position.set(0, 0.94, z);
    plank.castShadow = true;
    plank.receiveShadow = true;
    g.add(plank);
  }

  // Mooring pilings & iron rope cleats
  for (const sx of [-1.62, 1.62]) {
    for (const sz of [-3.9, -1.3, 1.3, 3.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 2.4, 8), darkTimberMat);
      post.position.set(sx, 0.72, sz);
      post.castShadow = true;
      g.add(post);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 8), ironMat);
      cap.position.set(sx, 1.94, sz);
      g.add(cap);
    }
  }

  // Pier timber side rail + "ABAVAS LAIVAS" painted signboard
  const signTex = createLatvianSignTexture('ABAVAS LAIVAS', 'LAIVU PIESTĀTNE · MARŠRUTS', '#1c332b', '#f6efe0', '#d8a346');
  const postSign = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.3, 8), darkTimberMat);
  postSign.position.set(-1.62, 1.9, -3.9);
  g.add(postSign);
  const signPlate = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.62, 0.08),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.4 })
  );
  signPlate.position.set(-1.62, 2.75, -3.9);
  g.add(signPlate);

  // Life preserver ring hung at pier head
  const buoy = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 8, 16), orangeMat);
  buoy.position.set(1.72, 1.45, 3.9);
  buoy.rotation.y = Math.PI / 2;
  g.add(buoy);

  // Two moored wooden tourist canoes resting beside the pier
  for (const [cx, cz, rot] of [[2.55, 1.2, 0.08], [-2.5, 2.4, -0.1]] as [number, number, number][]) {
    const canoe = new THREE.Group();
    canoe.position.set(cx, 0.25, cz);
    canoe.rotation.y = rot;
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 3.1, 6, 12), canoeHullMat);
    hull.rotation.x = Math.PI / 2;
    hull.scale.set(1.0, 1.0, 0.52);
    hull.castShadow = true;
    canoe.add(hull);
    const thwart = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 0.24), timberMat);
    thwart.position.y = 0.22;
    canoe.add(thwart);
    g.add(canoe);
  }

  return g;
}

/**
 * Duke's Hunting Lodge Ruins — Weathered fieldstone & kiln-brick masonry arches,
 * collapsed chimney gable, mossy rubble, and heritage marker plaque.
 */
export function createHuntingLodgeRuinsDetails(): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x777368, roughness: 0.94, metalness: 0.03 });
  const brickMat = new THREE.MeshStandardMaterial({ color: 0x864636, roughness: 0.88, metalness: 0.04 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x566942, roughness: 0.9 });
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x5c422a, roughness: 0.88 });

  // Main jagged gable wall & window embrasure
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.8, 0.9), stoneMat);
  backWall.position.set(0, 2.2, -3.0);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  g.add(backWall);

  const brickArchTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 0.96), brickMat);
  brickArchTop.position.set(0, 4.95, -3.0);
  brickArchTop.castShadow = true;
  g.add(brickArchTop);

  // Flanking wing masonry piers
  for (const [wx, wz, h, rot] of [
    [-3.1, -0.4, 3.9, 0.05],
    [3.1, 0.2, 3.1, -0.06],
  ] as [number, number, number, number][]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.95, h, 4.2), stoneMat);
    pier.position.set(wx, h * 0.5 - 0.15, wz);
    pier.rotation.y = rot;
    pier.castShadow = true;
    pier.receiveShadow = true;
    g.add(pier);
  }

  // Collapsed rubble stones & mossy coping
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const rubble = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.42 + (i % 3) * 0.16, 0),
      i % 2 === 0 ? stoneMat : mossMat
    );
    rubble.position.set(Math.cos(a) * (1.4 + (i % 3) * 0.9), 0.22, Math.sin(a) * (1.2 + (i % 2) * 1.1));
    rubble.scale.set(1.25, 0.65, 1.1);
    rubble.castShadow = true;
    g.add(rubble);
  }

  const signTex = createLatvianSignTexture('HERCOGA MEDĪBU PILS', 'DRUPAS · XVII GS.', '#2e2923', '#f2e8d4', '#c29248');
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 2.1, 8), timberMat);
  post.position.set(4.5, 1.0, 2.2);
  g.add(post);
  const plaque = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.6, 0.08),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.45 })
  );
  plaque.position.set(4.5, 1.85, 2.2);
  g.add(plaque);

  return g;
}
