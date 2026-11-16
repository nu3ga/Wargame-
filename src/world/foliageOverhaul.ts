import * as THREE from 'three';

export type TreeSpecies = 'pine' | 'spruce' | 'birch' | 'oak';
export type FoliageSpecies = TreeSpecies | 'shrub';

function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface CanopyCardSpec {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  pitch: number;
  yaw: number;
  roll: number;
  droop: number;
  ao: number;
  warmth: number;
}

/**
 * Pure deterministic layout generator for volumetric multi-tier foliage cards per species.
 * Ensures each species matches authentic Baltic Kurzeme tree silhouettes without flat blob rings.
 */
export function computeSpeciesCanopyCardLayout(species: FoliageSpecies, seed = 42): CanopyCardSpec[] {
  const rand = makeRand(seed);
  const cards: CanopyCardSpec[] = [];
  const goldenAngle = 2.39996323;

  if (species === 'pine') {
    // Tall clear trunk below 6m; airy layered horizontal Scots pine umbrella bough clouds from 6.0m to 10.9m
    const count = 30;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = 5.9 + t * 4.8 + (rand() - 0.5) * 0.45;
      const tierEnvelope = Math.sin(t * Math.PI * 0.88 + 0.22);
      const rad = (0.52 + tierEnvelope * 2.05) * (0.68 + rand() * 0.44);
      const yaw = i * goldenAngle + (rand() - 0.5) * 0.35;
      const horizTilt = (i % 4 === 0 ? 0.36 : 0.74) + (rand() - 0.5) * 0.25;
      cards.push({
        x: Math.cos(yaw) * rad,
        y,
        z: Math.sin(yaw) * rad,
        width: 1.78 + (1 - t * 0.35) * 0.82 + rand() * 0.38,
        height: 1.24 + rand() * 0.46,
        pitch: horizTilt,
        yaw: yaw + Math.PI * 0.5,
        roll: (rand() - 0.5) * 0.42,
        droop: 0.14,
        ao: 0.48 + t * 0.34 + (rad / 2.6) * 0.24,
        warmth: (rand() - 0.4) * 0.12,
      });
    }
    return cards;
  }

  if (species === 'spruce') {
    // Conical Norway spruce from sweeping lower skirt (2.5m) up to pointed leader apex (10.8m)
    const count = 38;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = 2.4 + Math.pow(t, 0.92) * 8.2;
      const coneR = THREE.MathUtils.lerp(2.2, 0.28, Math.pow(t, 0.85));
      const rad = coneR * (0.5 + rand() * 0.46);
      const yaw = i * goldenAngle + (rand() - 0.5) * 0.32;
      cards.push({
        x: Math.cos(yaw) * rad,
        y,
        z: Math.sin(yaw) * rad,
        width: THREE.MathUtils.lerp(2.18, 0.92, t) + rand() * 0.32,
        height: THREE.MathUtils.lerp(1.7, 0.98, t) + rand() * 0.26,
        pitch: 0.48 + (1 - t) * 0.32 + (rand() - 0.5) * 0.22,
        yaw: yaw + Math.PI * 0.5,
        roll: (rand() - 0.5) * 0.38,
        droop: 0.44,
        ao: 0.42 + t * 0.42 + (rad / Math.max(0.4, coneR)) * 0.22,
        warmth: (rand() - 0.5) * 0.08,
      });
    }
    return cards;
  }

  if (species === 'birch') {
    // Graceful high weeping silver birch canopy (4.4m..10.4m) with sunlit gaps & golden-green variation
    const count = 34;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = 4.4 + t * 5.8 + (rand() - 0.5) * 0.45;
      const lobeScale = Math.sin(t * Math.PI * 0.9 + 0.18);
      const rad = (0.36 + lobeScale * 1.68) * (0.55 + rand() * 0.5);
      const yaw = i * goldenAngle + (rand() - 0.5) * 0.45;
      cards.push({
        x: Math.cos(yaw) * rad,
        y,
        z: Math.sin(yaw) * rad,
        width: 1.48 + rand() * 0.55,
        height: 1.62 + rand() * 0.58,
        pitch: 0.18 + (rand() - 0.5) * 0.55,
        yaw: yaw + (rand() - 0.5) * 0.9,
        roll: (rand() - 0.5) * 0.5,
        droop: 0.32,
        ao: 0.54 + t * 0.34 + (rad / 2.2) * 0.2,
        warmth: rand() < 0.26 ? 0.18 + rand() * 0.14 : (rand() - 0.4) * 0.12,
      });
    }
    return cards;
  }

  if (species === 'oak') {
    // Broad spreading pedunculate oak / linden dome (4.3m..10.5m) with lush crown tiers & shaded inner vault
    const count = 40;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = 4.35 + Math.pow(t, 0.85) * 5.9 + (rand() - 0.5) * 0.4;
      const domeR = Math.sin(Math.min(1, t * 0.92 + 0.12) * Math.PI);
      const rad = (0.45 + domeR * 2.5) * (0.56 + rand() * 0.46);
      const yaw = i * goldenAngle + (rand() - 0.5) * 0.38;
      cards.push({
        x: Math.cos(yaw) * rad,
        y,
        z: Math.sin(yaw) * rad,
        width: 1.92 + (1 - t * 0.25) * 0.66 + rand() * 0.36,
        height: 1.56 + rand() * 0.48,
        pitch: (i % 3 === 0 ? 0.62 : 0.24) + (rand() - 0.5) * 0.45,
        yaw: yaw + (rand() - 0.5) * 0.75,
        roll: (rand() - 0.5) * 0.52,
        droop: 0.2,
        ao: 0.44 + t * 0.36 + (rad / 3.1) * 0.28,
        warmth: (rand() - 0.45) * 0.14,
      });
    }
    return cards;
  }

  // Riparian understory shrub (compact multi-stemmed dome 0.15..1.45m)
  const count = 12;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const y = 0.24 + t * 0.92;
    const rad = (1 - t * 0.45) * (0.25 + rand() * 0.46);
    const yaw = i * goldenAngle + (rand() - 0.5) * 0.4;
    cards.push({
      x: Math.cos(yaw) * rad,
      y,
      z: Math.sin(yaw) * rad,
      width: 0.88 + rand() * 0.34,
      height: 0.76 + rand() * 0.28,
      pitch: 0.28 + (rand() - 0.5) * 0.5,
      yaw: yaw + (rand() - 0.5) * 0.7,
      roll: (rand() - 0.5) * 0.45,
      droop: 0.22,
      ao: 0.48 + t * 0.4 + rad * 0.2,
      warmth: (rand() - 0.5) * 0.1,
    });
  }
  return cards;
}

/**
 * Generates high-resolution 512x512 species bark diffuse & bump CanvasTextures
 * featuring furrowed plates, root-collar moss, and authentic birch lenticels.
 */
export function createHighDetailBarkTextures(
  species: TreeSpecies
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;

  const bc = document.createElement('canvas');
  bc.width = size;
  bc.height = size;
  const bCtx = bc.getContext('2d')!;

  const rand = makeRand(species.charCodeAt(0) * 193 + species.length * 41);

  if (species === 'birch') {
    // Silver birch papery off-white bark with dark diamond knots & horizontal lenticels
    ctx.fillStyle = '#ddd7ca';
    ctx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#929292';
    bCtx.fillRect(0, 0, size, size);

    // Subtle papery horizontal tone bands
    for (let y = 0; y < size; y += 6) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(252,248,238,0.18)' : 'rgba(176,168,154,0.16)';
      ctx.fillRect(0, y, size, 3 + rand() * 5);
    }

    // Horizontal dark corky lenticels
    for (let i = 0; i < 260; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const w = 16 + rand() * 68;
      const h = 1.6 + rand() * 3.8;
      ctx.fillStyle = rand() > 0.22 ? '#292824' : '#7a7368';
      ctx.globalAlpha = 0.58 + rand() * 0.34;
      ctx.fillRect(x, y, w, h);
      bCtx.fillStyle = '#383838';
      bCtx.fillRect(x, y, w, h);
    }

    // Characteristic triangular/diamond black bark scars
    for (let i = 0; i < 24; i++) {
      const sx = rand() * size;
      const sy = rand() * size;
      const sw = 18 + rand() * 28;
      const sh = 10 + rand() * 18;
      ctx.fillStyle = '#1e1d1a';
      ctx.globalAlpha = 0.78;
      ctx.beginPath();
      ctx.moveTo(sx - sw * 0.5, sy);
      ctx.quadraticCurveTo(sx, sy - sh * 0.6, sx + sw * 0.5, sy);
      ctx.quadraticCurveTo(sx, sy + sh * 0.5, sx - sw * 0.5, sy);
      ctx.fill();
      bCtx.fillStyle = '#222222';
      bCtx.beginPath();
      bCtx.moveTo(sx - sw * 0.5, sy);
      bCtx.lineTo(sx, sy - sh * 0.45);
      bCtx.lineTo(sx + sw * 0.5, sy);
      bCtx.lineTo(sx, sy + sh * 0.4);
      bCtx.closePath();
      bCtx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    // Deeply fissured pine / spruce / oak bark plates
    const cfg = {
      pine: { base: '#5f4331', ridge: '#7f5b43', fissure: '#2d1c12', plates: 240 },
      spruce: { base: '#4a382c', ridge: '#634d3e', fissure: '#211610', plates: 280 },
      oak: { base: '#524234', ridge: '#6d5b4a', fissure: '#241c15', plates: 310 },
    }[species];

    ctx.fillStyle = cfg.base;
    ctx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#686868';
    bCtx.fillRect(0, 0, size, size);

    // Deep vertical bark furrows
    for (let i = 0; i < cfg.plates; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const w = 6 + rand() * 16;
      const h = 42 + rand() * 110;
      ctx.fillStyle = rand() > 0.42 ? cfg.ridge : cfg.fissure;
      ctx.globalAlpha = 0.42 + rand() * 0.35;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 3);
      ctx.fill();

      bCtx.fillStyle = rand() > 0.42 ? '#b8b8b8' : '#2c2c2c';
      bCtx.globalAlpha = 0.55;
      bCtx.beginPath();
      bCtx.roundRect(x, y, w, h, 3);
      bCtx.fill();
    }

    // Subtle olive-green trunk lichen / moss flecks
    for (let i = 0; i < 65; i++) {
      const lx = rand() * size;
      const ly = rand() * size;
      const lr = 4 + rand() * 12;
      ctx.fillStyle = 'rgba(104, 118, 78, 0.22)';
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    bCtx.globalAlpha = 1;
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

/**
 * Generates crisp 512x512 botanical branch-spray alpha-cutout textures with
 * internal branching woody twigs, batched crisp leaves/needles,
 * and a fast 2-pass RGB edge-bleed dilation to prevent dark mipmap fringes.
 */
export function createHighDetailFoliageAtlas(species: FoliageSpecies): THREE.CanvasTexture {
  const size = 512;
  const scale = size / 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const palette = {
    pine: {
      twig: '#5a3d28',
      dark: '#253f24',
      mid: '#35562e',
      light: '#4d723b',
      tip: '#628647',
      seed: 1011,
    },
    spruce: {
      twig: '#463022',
      dark: '#182f1d',
      mid: '#234227',
      light: '#335a33',
      tip: '#456f3f',
      seed: 2022,
    },
    birch: {
      twig: '#7a6c5a',
      dark: '#43642a',
      mid: '#60863a',
      light: '#7fa74b',
      tip: '#b89f43', // Subtle early-autumn golden birch tips matching Ref 1 & Ref 3
      seed: 3033,
    },
    oak: {
      twig: '#4a3525',
      dark: '#2f5021',
      mid: '#446d2e',
      light: '#5f8b3c',
      tip: '#809b44',
      seed: 4044,
    },
    shrub: {
      twig: '#4d3929',
      dark: '#355226',
      mid: '#4d7134',
      light: '#678d43',
      tip: '#809e4d',
      seed: 5055,
    },
  }[species];

  const rand = makeRand(palette.seed);
  const tones = [palette.dark, palette.mid, palette.light, palette.tip];
  const pickToneIdx = (): number => {
    const r = rand();
    if (species === 'birch') {
      if (r > 0.84) return 3;
      if (r > 0.45) return 2;
      if (r > 0.18) return 1;
      return 0;
    }
    if (r > 0.78) return 3;
    if (r > 0.42) return 2;
    if (r > 0.16) return 1;
    return 0;
  };

  // Batch needles / twig lines / leaves per tone for sub-50ms Canvas2D generation
  const stemSegs: [number, number, number, number, number, number, number][] = [];
  const needleBuckets: [number, number, number, number][][] = [[], [], [], []];
  const leafBuckets: { x: number; y: number; rot: number; sz: number }[][] = [[], [], [], []];

  const collectBranchStem = (
    x0: number,
    y0: number,
    ang: number,
    len: number,
    width: number,
    depth: number
  ) => {
    const x1 = x0 + Math.cos(ang) * len;
    const y1 = y0 + Math.sin(ang) * len;
    const mx = (x0 + x1) * 0.5 + (rand() - 0.5) * len * 0.12;
    const my = (y0 + y1) * 0.5 + (rand() - 0.5) * len * 0.12;
    stemSegs.push([x0, y0, mx, my, x1, y1, width]);

    if (depth === 0) {
      const subSteps = species === 'pine' ? 7 : species === 'spruce' ? 8 : 8;
      for (let s = 0; s < subSteps; s++) {
        const t = 0.18 + (s / subSteps) * 0.84;
        const px = THREE.MathUtils.lerp(x0, x1, t);
        const py = THREE.MathUtils.lerp(y0, y1, t);

        if (species === 'pine') {
          const needles = 14;
          for (let n = 0; n < needles; n++) {
            const na = ang + (rand() - 0.5) * 2.05;
            const nLen = (30 + rand() * 34) * scale;
            needleBuckets[pickToneIdx()].push([px, py, px + Math.cos(na) * nLen, py + Math.sin(na) * nLen]);
          }
        } else if (species === 'spruce') {
          const combCount = 11;
          for (let c = 0; c < combCount; c++) {
            const ct = c / combCount;
            const cx = THREE.MathUtils.lerp(px, x1, ct);
            const cy = THREE.MathUtils.lerp(py, y1, ct);
            for (const side of [-1, 1]) {
              const na = ang + side * (0.62 + rand() * 0.38);
              const nLen = (18 + rand() * 16) * scale;
              needleBuckets[pickToneIdx()].push([cx, cy, cx + Math.cos(na) * nLen, cy + Math.sin(na) * nLen]);
            }
          }
        } else {
          const lCount = species === 'birch' ? 6 : 6;
          for (let li = 0; li < lCount; li++) {
            const side = li % 2 === 0 ? 1 : -1;
            const lAng = ang + side * (0.45 + rand() * 0.72);
            const dist = (5 + rand() * 22) * scale;
            const lx = px + Math.cos(lAng) * dist;
            const ly = py + Math.sin(lAng) * dist;
            const lSz = (species === 'birch' ? 14 + rand() * 8 : species === 'oak' ? 20 + rand() * 9 : 16 + rand() * 8) * scale;
            leafBuckets[pickToneIdx()].push({ x: lx, y: ly, rot: lAng + Math.PI * 0.5, sz: lSz });
          }
        }
      }
      return;
    }

    const forkCount = depth === 2 ? 3 : 2;
    for (let f = 0; f < forkCount; f++) {
      const fFrac = 0.35 + (f / Math.max(1, forkCount - 1)) * 0.62;
      const sx = THREE.MathUtils.lerp(x0, x1, fFrac);
      const sy = THREE.MathUtils.lerp(y0, y1, fFrac);
      const side = f % 2 === 0 ? 1 : -1;
      const spread = (depth === 2 ? 0.64 : 0.48) * side + (rand() - 0.5) * 0.32;
      collectBranchStem(sx, sy, ang + spread, len * (0.56 + rand() * 0.22), width * 0.64, depth - 1);
    }
  };

  const mainSprays = species === 'spruce' ? 9 : 10;
  for (let i = 0; i < mainSprays; i++) {
    const a = (i / mainSprays) * Math.PI * 2 + (rand() - 0.5) * 0.28;
    const hubR = (20 + rand() * 28) * scale;
    const hx = size * 0.5 + Math.cos(a) * hubR;
    const hy = size * 0.5 + Math.sin(a) * hubR;
    const stemLen = size * (0.22 + rand() * 0.08);
    collectBranchStem(hx, hy, a, stemLen, 6.2 * scale, 2);
  }

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand() * 0.3;
    const r = (8 + rand() * 76) * scale;
    collectBranchStem(
      size * 0.5 + Math.cos(a) * r,
      size * 0.5 + Math.sin(a) * r,
      a,
      (84 + rand() * 48) * scale,
      3.0 * scale,
      0
    );
  }

  // Render woody branch scaffold
  ctx.strokeStyle = palette.twig;
  ctx.lineCap = 'round';
  for (const [x0, y0, mx, my, x1, y1, w] of stemSegs) {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
  }

  // Render batched needles (4 stroke calls instead of 10,000)
  if (species === 'pine' || species === 'spruce') {
    ctx.lineWidth = species === 'pine' ? 2.15 : 2.05;
    for (let ti = 0; ti < 4; ti++) {
      const segs = needleBuckets[ti];
      if (segs.length === 0) continue;
      ctx.strokeStyle = tones[ti];
      ctx.beginPath();
      for (let i = 0; i < segs.length; i++) {
        const [x0, y0, x1, y1] = segs[i];
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
    }
  } else {
    // Render crisp species-accurate broadleaf shoots using fast matrix transforms
    for (let ti = 0; ti < 4; ti++) {
      const leaves = leafBuckets[ti];
      if (leaves.length === 0) continue;
      ctx.fillStyle = tones[ti];
      ctx.beginPath();
      for (let i = 0; i < leaves.length; i++) {
        const { x, y, rot, sz } = leaves[i];
        const ca = Math.cos(rot);
        const sa = Math.sin(rot);
        const px = (lx: number, ly: number) => x + lx * ca - ly * sa;
        const py = (lx: number, ly: number) => y + lx * sa + ly * ca;

        if (species === 'birch') {
          ctx.moveTo(px(0, -sz * 0.85), py(0, -sz * 0.85));
          ctx.lineTo(px(sz * 0.56, -sz * 0.15), py(sz * 0.56, -sz * 0.15));
          ctx.lineTo(px(sz * 0.52, sz * 0.36), py(sz * 0.52, sz * 0.36));
          ctx.lineTo(px(0, sz * 0.72), py(0, sz * 0.72));
          ctx.lineTo(px(-sz * 0.52, sz * 0.36), py(-sz * 0.52, sz * 0.36));
          ctx.lineTo(px(-sz * 0.56, -sz * 0.15), py(-sz * 0.56, -sz * 0.15));
          ctx.closePath();
        } else if (species === 'oak') {
          ctx.moveTo(px(0, -sz * 0.92), py(0, -sz * 0.92));
          ctx.lineTo(px(sz * 0.48, -sz * 0.5), py(sz * 0.48, -sz * 0.5));
          ctx.lineTo(px(sz * 0.28, -sz * 0.26), py(sz * 0.28, -sz * 0.26));
          ctx.lineTo(px(sz * 0.66, 0), py(sz * 0.66, 0));
          ctx.lineTo(px(sz * 0.32, sz * 0.32), py(sz * 0.32, sz * 0.32));
          ctx.lineTo(px(sz * 0.45, sz * 0.64), py(sz * 0.45, sz * 0.64));
          ctx.lineTo(px(0, sz * 0.88), py(0, sz * 0.88));
          ctx.lineTo(px(-sz * 0.45, sz * 0.64), py(-sz * 0.45, sz * 0.64));
          ctx.lineTo(px(-sz * 0.32, sz * 0.32), py(-sz * 0.32, sz * 0.32));
          ctx.lineTo(px(-sz * 0.66, 0), py(-sz * 0.66, 0));
          ctx.lineTo(px(-sz * 0.28, -sz * 0.26), py(-sz * 0.28, -sz * 0.26));
          ctx.lineTo(px(-sz * 0.48, -sz * 0.5), py(-sz * 0.48, -sz * 0.5));
          ctx.closePath();
        } else {
          ctx.moveTo(px(0, -sz * 0.84), py(0, -sz * 0.84));
          ctx.lineTo(px(sz * 0.52, -sz * 0.2), py(sz * 0.52, -sz * 0.2));
          ctx.lineTo(px(sz * 0.44, sz * 0.42), py(sz * 0.44, sz * 0.42));
          ctx.lineTo(px(0, sz * 0.82), py(0, sz * 0.82));
          ctx.lineTo(px(-sz * 0.44, sz * 0.42), py(-sz * 0.44, sz * 0.42));
          ctx.lineTo(px(-sz * 0.52, -sz * 0.2), py(-sz * 0.52, -sz * 0.2));
          ctx.closePath();
        }
      }
      ctx.fill();
    }
  }

  // Fast 2-pass 4-neighbor RGBA RGB edge dilation so alphaTest edges never fringe black on mipmaps
  const img = ctx.getImageData(0, 0, size, size);
  const data = img.data;
  const copy = new Uint8ClampedArray(data.length);
  const rowStride = size * 4;
  for (let pass = 0; pass < 2; pass++) {
    copy.set(data);
    for (let y = 1; y < size - 1; y++) {
      let idx = (y * size + 1) * 4;
      for (let x = 1; x < size - 1; x++, idx += 4) {
        if (copy[idx + 3] > 24) continue;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let hits = 0;
        if (copy[idx - 1] > 24) {
          sr += copy[idx - 4];
          sg += copy[idx - 3];
          sb += copy[idx - 2];
          hits++;
        }
        if (copy[idx + 7] > 24) {
          sr += copy[idx + 4];
          sg += copy[idx + 5];
          sb += copy[idx + 6];
          hits++;
        }
        if (copy[idx - rowStride + 3] > 24) {
          sr += copy[idx - rowStride];
          sg += copy[idx - rowStride + 1];
          sb += copy[idx - rowStride + 2];
          hits++;
        }
        if (copy[idx + rowStride + 3] > 24) {
          sr += copy[idx + rowStride];
          sg += copy[idx + rowStride + 1];
          sb += copy[idx + rowStride + 2];
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

  // Fill remaining deep transparent texels with palette mid foliage tone
  const fallback = new THREE.Color(palette.mid);
  const fr = Math.round(fallback.r * 255);
  const fg = Math.round(fallback.g * 255);
  const fb = Math.round(fallback.b * 255);
  for (let p = 0; p < data.length; p += 4) {
    if (data[p + 3] === 0 && data[p] === 0 && data[p + 1] === 0 && data[p + 2] === 0) {
      data[p] = fr;
      data[p + 1] = fg;
      data[p + 2] = fb;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds an organic tapered curved tree skeleton (root buttress flare + S-curved trunk
 * + curved primary limbs + secondary branch forks) with baked species bark vertex tinting.
 */
export function createOrganicTreeSkeletonGeometry(species: TreeSpecies): THREE.BufferGeometry {
  const cfg = {
    pine: {
      baseR: 0.31,
      topR: 0.08,
      trunkH: 9.5,
      bend: 0.24,
      limbs: [
        { yFrac: 0.64, yaw: 0.4, tilt: 0.72, len: 2.35, rScale: 0.56 },
        { yFrac: 0.72, yaw: 2.1, tilt: 0.66, len: 2.2, rScale: 0.52 },
        { yFrac: 0.78, yaw: 3.9, tilt: 0.62, len: 2.0, rScale: 0.48 },
        { yFrac: 0.85, yaw: 5.4, tilt: 0.54, len: 1.75, rScale: 0.44 },
        { yFrac: 0.91, yaw: 1.2, tilt: 0.46, len: 1.45, rScale: 0.38 },
      ],
    },
    spruce: {
      baseR: 0.27,
      topR: 0.03,
      trunkH: 10.3,
      bend: 0.12,
      limbs: [
        { yFrac: 0.28, yaw: 0.2, tilt: 1.08, len: 1.95, rScale: 0.48 },
        { yFrac: 0.41, yaw: 1.8, tilt: 1.04, len: 1.75, rScale: 0.44 },
        { yFrac: 0.54, yaw: 3.4, tilt: 1.0, len: 1.5, rScale: 0.4 },
        { yFrac: 0.66, yaw: 5.0, tilt: 0.94, len: 1.25, rScale: 0.36 },
        { yFrac: 0.78, yaw: 1.0, tilt: 0.86, len: 0.98, rScale: 0.32 },
      ],
    },
    birch: {
      baseR: 0.17,
      topR: 0.038,
      trunkH: 8.9,
      bend: 0.36,
      limbs: [
        { yFrac: 0.52, yaw: 0.6, tilt: 0.52, len: 2.25, rScale: 0.55 },
        { yFrac: 0.62, yaw: 2.5, tilt: 0.48, len: 2.15, rScale: 0.52 },
        { yFrac: 0.72, yaw: 4.3, tilt: 0.44, len: 1.95, rScale: 0.48 },
        { yFrac: 0.81, yaw: 5.7, tilt: 0.4, len: 1.75, rScale: 0.44 },
        { yFrac: 0.88, yaw: 1.5, tilt: 0.34, len: 1.45, rScale: 0.38 },
      ],
    },
    oak: {
      baseR: 0.39,
      topR: 0.12,
      trunkH: 7.2,
      bend: 0.32,
      limbs: [
        { yFrac: 0.52, yaw: 0.3, tilt: 0.78, len: 2.85, rScale: 0.66 },
        { yFrac: 0.58, yaw: 1.85, tilt: 0.72, len: 2.7, rScale: 0.62 },
        { yFrac: 0.65, yaw: 3.45, tilt: 0.68, len: 2.55, rScale: 0.58 },
        { yFrac: 0.72, yaw: 4.95, tilt: 0.62, len: 2.35, rScale: 0.54 },
        { yFrac: 0.82, yaw: 1.1, tilt: 0.52, len: 2.0, rScale: 0.48 },
      ],
    },
  }[species];

  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let vOffset = 0;

  const appendGeometry = (geo: THREE.BufferGeometry, tintFn: (x: number, y: number, z: number) => [number, number, number]) => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    const n = geo.attributes.normal as THREE.BufferAttribute;
    const u = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vy = p.getY(i);
      const vz = p.getZ(i);
      pos.push(vx, vy, vz);
      nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
      const [cr, cg, cb] = tintFn(vx, vy, vz);
      col.push(cr, cg, cb);
    }
    const gIdx = geo.index;
    if (gIdx) {
      for (let i = 0; i < gIdx.count; i++) idx.push(gIdx.getX(i) + vOffset);
    } else {
      for (let i = 0; i < p.count; i++) idx.push(i + vOffset);
    }
    vOffset += p.count;
    geo.dispose();
  };

  const trunkTint = (vx: number, vy: number, vz: number): [number, number, number] => {
    const h01 = THREE.MathUtils.clamp(vy / cfg.trunkH, 0, 1);
    const rDist = Math.hypot(vx, vz);
    if (species === 'pine') {
      // Dark plated lower Scots pine trunk transitioning to warm cinnamon-orange upper bark
      const warmMix = THREE.MathUtils.smoothstep(h01, 0.42, 0.78);
      return [
        THREE.MathUtils.lerp(0.76, 1.32, warmMix),
        THREE.MathUtils.lerp(0.72, 0.88, warmMix),
        THREE.MathUtils.lerp(0.68, 0.64, warmMix),
      ];
    }
    if (species === 'birch') {
      // Dark rugged basal collar near ground transitioning smoothly to papery white birch bark
      const whiteMix = THREE.MathUtils.smoothstep(vy, 0.35, 1.55);
      return [
        THREE.MathUtils.lerp(0.32, 1.0, whiteMix),
        THREE.MathUtils.lerp(0.30, 0.99, whiteMix),
        THREE.MathUtils.lerp(0.28, 0.96, whiteMix),
      ];
    }
    const baseMoss = THREE.MathUtils.smoothstep(vy, -0.1, 1.2);
    const branchShadow = 1 - Math.min(0.18, rDist * 0.05);
    return [
      THREE.MathUtils.lerp(0.66, 1.0, baseMoss) * branchShadow,
      THREE.MathUtils.lerp(0.72, 1.0, baseMoss) * branchShadow,
      THREE.MathUtils.lerp(0.60, 0.96, baseMoss) * branchShadow,
    ];
  };

  // Smooth 10-sided multi-ring curved main trunk extending slightly below ground (-0.22m) so hills never expose gaps
  const totalH = cfg.trunkH + 0.22;
  const mainGeo = new THREE.CylinderGeometry(cfg.topR, cfg.baseR, totalH, 10, 7);
  mainGeo.translate(0, cfg.trunkH * 0.5 - 0.11, 0);
  const mp = mainGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < mp.count; i++) {
    const vx = mp.getX(i);
    const vy = mp.getY(i);
    const vz = mp.getZ(i);
    const h01 = THREE.MathUtils.clamp(vy / cfg.trunkH, 0, 1);
    const ang = Math.atan2(vz, vx);
    // Root buttress flutes on lower 1.2m
    const buttress = vy < 1.2 ? Math.pow(1 - Math.max(0, vy) / 1.2, 2) * (0.34 + 0.18 * Math.sin(ang * 4)) : 0;
    const scaleR = 1 + buttress;
    const curveX = Math.sin(h01 * Math.PI * 1.15) * cfg.bend;
    const curveZ = Math.cos(h01 * Math.PI * 0.85) * cfg.bend * 0.45 - cfg.bend * 0.45;
    mp.setXYZ(i, vx * scaleR + curveX, vy, vz * scaleR + curveZ);
  }
  mainGeo.computeVertexNormals();
  appendGeometry(mainGeo, trunkTint);

  // Curved primary limbs + secondary forks weaving into the foliage crown
  const qYaw = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const mat4 = new THREE.Matrix4();
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);

  for (let li = 0; li < cfg.limbs.length; li++) {
    const br = cfg.limbs[li];
    const startY = cfg.trunkH * br.yFrac;
    const startX = Math.sin(br.yFrac * Math.PI * 1.15) * cfg.bend;
    const startZ = Math.cos(br.yFrac * Math.PI * 0.85) * cfg.bend * 0.45 - cfg.bend * 0.45;
    const limbBaseR = THREE.MathUtils.lerp(cfg.baseR, cfg.topR, br.yFrac) * br.rScale;
    const limbTopR = limbBaseR * 0.36;

    const bGeo = new THREE.CylinderGeometry(limbTopR, limbBaseR, br.len, 6, 3);
    bGeo.translate(0, br.len * 0.5, 0);
    const bp = bGeo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < bp.count; k++) {
      const ly = bp.getY(k);
      const u = ly / Math.max(0.1, br.len);
      // Slight upward curve near outer tip for spruce/oak/pine limbs
      const arch = species === 'spruce' ? -Math.sin(u * Math.PI) * 0.16 + u * u * 0.22 : Math.sin(u * Math.PI) * 0.14;
      bp.setX(k, bp.getX(k) + arch);
    }
    qYaw.setFromAxisAngle(axisY, br.yaw);
    qTilt.setFromAxisAngle(axisZ, br.tilt);
    qYaw.multiply(qTilt);
    mat4.compose(new THREE.Vector3(startX, startY, startZ), qYaw, new THREE.Vector3(1, 1, 1));
    bGeo.applyMatrix4(mat4);
    bGeo.computeVertexNormals();
    appendGeometry(bGeo, trunkTint);

    // Secondary fork twig sprouting 62% along each primary limb
    const twigDir = new THREE.Vector3(0, 1, 0).applyQuaternion(qYaw);
    const forkOrigin = new THREE.Vector3(startX, startY, startZ).addScaledVector(twigDir, br.len * 0.6);
    const forkGeo = new THREE.CylinderGeometry(limbTopR * 0.32, limbTopR * 0.9, br.len * 0.58, 5, 1);
    forkGeo.translate(0, br.len * 0.29, 0);
    qYaw.setFromAxisAngle(axisY, br.yaw + (li % 2 === 0 ? 0.65 : -0.65));
    qTilt.setFromAxisAngle(axisZ, br.tilt * 0.72);
    qYaw.multiply(qTilt);
    mat4.compose(forkOrigin, qYaw, new THREE.Vector3(1, 1, 1));
    forkGeo.applyMatrix4(mat4);
    forkGeo.computeVertexNormals();
    appendGeometry(forkGeo, trunkTint);
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

/**
 * Builds a single unified volumetric 3D foliage bough geometry per species using
 * 24-36 low-poly dished/arched leaf cards (2x1 quads = 4 tris per card) with
 * spherical canopy shading normals and deep interior-to-tip ambient occlusion.
 */
export function createVolumetricCanopyGeometry(
  species: FoliageSpecies,
  seed = 77
): THREE.BufferGeometry {
  const layout = computeSpeciesCanopyCardLayout(species, seed);
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let vOff = 0;

  // Compute canopy centroid for smooth spherical exterior normals
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of layout) {
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  const midY = (minY + maxY) * 0.5;
  const halfH = Math.max(0.5, (maxY - minY) * 0.5);

  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const mat4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const sphereN = new THREE.Vector3();

  for (const spec of layout) {
    // 2x1 bent bough card (6 vertices, 4 triangles): dished arch avoids flat planar silhouettes
    const card = new THREE.PlaneGeometry(spec.width, spec.height, 2, 1);
    const cp = card.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) {
      const lx = cp.getX(i);
      const ly = cp.getY(i);
      const nx = lx / Math.max(0.2, spec.width * 0.5);
      const arch = -nx * nx * 0.24 - Math.abs(nx) * spec.droop * 0.28 + (ly < 0 ? -spec.droop * 0.14 : 0);
      cp.setZ(i, arch);
    }

    e.set(spec.pitch, spec.yaw, spec.roll, 'YXZ');
    q.setFromEuler(e);
    mat4.compose(new THREE.Vector3(spec.x, spec.y, spec.z), q, new THREE.Vector3(1, 1, 1));
    card.applyMatrix4(mat4);

    const pAttr = card.attributes.position as THREE.BufferAttribute;
    const uAttr = card.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pAttr.count; i++) {
      v.set(pAttr.getX(i), pAttr.getY(i), pAttr.getZ(i));
      pos.push(v.x, v.y, v.z);
      uv.push(uAttr.getX(i), uAttr.getY(i));

      // Blend outward spherical canopy normal with gentle upward sky bias for rich sun/shadow separation
      sphereN.set(v.x * 0.72, (v.y - midY) / halfH + 0.48, v.z * 0.72).normalize();
      nrm.push(sphereN.x, sphereN.y, sphereN.z);

      const hFactor = THREE.MathUtils.clamp((v.y - minY) / Math.max(0.5, maxY - minY), 0, 1);
      const ao = THREE.MathUtils.clamp(spec.ao * (0.76 + 0.34 * hFactor), 0.34, 1.15);
      const warm = spec.warmth;
      col.push(ao * (0.98 + warm * 0.75), ao * (1.02 + warm * 0.22), ao * (0.91 - warm * 0.45));
    }

    const gIdx = card.index!;
    for (let i = 0; i < gIdx.count; i++) idx.push(gIdx.getX(i) + vOff);
    vOff += pAttr.count;
    card.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

/**
 * Enhances alpha-tested foliage materials with height-anchored wind sway (static at trunk base),
 * leaf-tip micro-flutter, and realistic bounded backlit sun translucency.
 */
export function enhanceOverhaulFoliageMaterial(
  mat: THREE.MeshStandardMaterial,
  windTimeUniform: { value: number },
  sunDirUniform: { value: THREE.Vector3 },
  sunColorUniform: { value: THREE.Color }
): void {
  mat.customProgramCacheKey = () => 'v8_thin_leaf_foliage';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTimeUniform;
    shader.uniforms.uSunDir = sunDirUniform;
    shader.uniforms.uSunColor = sunColorUniform;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWindTime;
varying vec3 vFoliageWorldPos;
varying vec3 vFoliageWorldNormal;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float wPhase = uWindTime * 1.45 + instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.17;
  float crownHeightFactor = smoothstep(0.6, 10.5, max(0.0, transformed.y));
  float wAmp = crownHeightFactor * 0.16;
  float tipFlutter = sin(uWindTime * 3.9 + transformed.x * 2.1 + transformed.z * 2.3 + instanceMatrix[3].x) * 0.024 * (0.25 + crownHeightFactor);
  transformed.x += sin(wPhase) * wAmp + tipFlutter;
  transformed.z += cos(wPhase * 0.84) * wAmp * 0.72 + tipFlutter * 0.55;
#endif`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
#ifdef USE_INSTANCING
  vFoliageWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  vFoliageWorldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
#else
  vFoliageWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vFoliageWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
#endif`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vFoliageWorldPos;
varying vec3 vFoliageWorldNormal;`
      )
      .replace(
        '#include <opaque_fragment>',
        `vec3 viewDirF = normalize(cameraPosition - vFoliageWorldPos);
vec3 sDirF = normalize(uSunDir);
vec3 nF = normalize(vFoliageWorldNormal);
float sunWrap = clamp((dot(nF, sDirF) + 0.35) / 1.35, 0.0, 1.0);
float crownAO = mix(0.85, 1.0, sunWrap * 0.65 + clamp(nF.y * 0.5 + 0.5, 0.0, 1.0) * 0.35);
outgoingLight *= crownAO;
float backTransmit = pow(clamp(dot(viewDirF, -sDirF), 0.0, 1.0), 3.4);
float thinLeafLight = pow(max(0.0, dot(-nF, sDirF)), 1.4) * 0.08;
float skyBounce = 0.025 + 0.035 * max(0.0, sDirF.y) * clamp(nF.y * 0.5 + 0.5, 0.2, 1.0);
outgoingLight += diffuseColor.rgb * uSunColor * (backTransmit * 0.09 + thinLeafLight + skyBounce);
#include <opaque_fragment>`
      );
  };
}

/**
 * Generates a high-detail, zero-alpha-overdraw 3D curved grass-blade cluster BufferGeometry.
 * Each blade has 3 arched vertical segments tapering to a pointed tip, deep root-to-tip AO,
 * natural olive/warm per-blade color variation, and upward-biased curved normals.
 */
export function createCurvedGrassClusterGeometry(
  bladeCount = 16,
  spreadM = 0.66,
  minH = 0.24,
  maxH = 0.52
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];

  let seed = 41923 + bladeCount * 97;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  let vOff = 0;
  for (let b = 0; b < bladeCount; b++) {
    const baseAngle = (b / bladeCount) * Math.PI * 2 + (rand() - 0.5) * 0.55;
    const rad = Math.sqrt(rand()) * spreadM * 0.5;
    const bx = Math.cos(baseAngle) * rad;
    const bz = Math.sin(baseAngle) * rad;

    const yaw = baseAngle + (rand() - 0.5) * 1.65;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);

    const h = minH + rand() * (maxH - minH);
    // Natural meadow blade width (2.6-4.2cm) with anti-shimmer cross section
    const halfW = 0.013 + rand() * 0.008;
    const bend = 0.08 + rand() * 0.17;

    // Warm Baltic meadow palette: rich olive-sage greens mixed with subtle golden dry culms
    const isDryCulm = rand() < 0.14;
    const bladeWarm = isDryCulm ? 0.15 + rand() * 0.07 : (rand() - 0.44) * 0.12;
    const bladeBright = 0.84 + rand() * 0.24;

    // 2 lower tiers (root t=0, mid t=0.46) + pointed tip (t=1.0) = 5 verts, 3 tris per fine blade
    const tiers = [
      { t: 0.0, w: halfW, ao: 0.22 },
      { t: 0.46, w: halfW * 0.68, ao: 0.62 },
    ];

    for (let k = 0; k < tiers.length; k++) {
      const { t, w, ao } = tiers[k];
      const y = -0.025 + t * (h + 0.025);
      const arch = t * t * bend;
      const cx = bx + cosY * arch;
      const cz = bz + sinY * arch;
      const lx = -sinY * w;
      const lz = cosY * w;

      const nx = cosY * (0.24 + t * 0.30);
      const ny = 0.94;
      const nz = sinY * (0.24 + t * 0.30);
      const nLen = Math.hypot(nx, ny, nz) || 1;

      const r = ao * bladeBright * (1.02 + bladeWarm * 0.85);
      const g = ao * bladeBright * (1.01 + bladeWarm * 0.12);
      const bl = ao * bladeBright * (0.66 - bladeWarm * 0.42);

      pos.push(cx - lx, y, cz - lz, cx + lx, y, cz + lz);
      nrm.push(nx / nLen, ny / nLen, nz / nLen, nx / nLen, ny / nLen, nz / nLen);
      col.push(r, g, bl, r, g, bl);
    }

    const tipY = h;
    const tipX = bx + cosY * bend;
    const tipZ = bz + sinY * bend;
    const tnx = cosY * 0.48;
    const tny = 0.88;
    const tnz = sinY * 0.48;
    const tnLen = Math.hypot(tnx, tny, tnz) || 1;
    const tipAo = 1.06 * bladeBright;
    pos.push(tipX, tipY, tipZ);
    nrm.push(tnx / tnLen, tny / tnLen, tnz / tnLen);
    col.push(
      tipAo * (1.06 + bladeWarm * 0.9),
      tipAo * (1.02 + bladeWarm * 0.14),
      tipAo * (0.62 - bladeWarm * 0.42)
    );

    idx.push(
      vOff + 0, vOff + 1, vOff + 2,
      vOff + 1, vOff + 3, vOff + 2,
      vOff + 2, vOff + 3, vOff + 4
    );
    vOff += 5;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

/**
 * Applies synchronized trunk/branch wind sway so tree skeletons and leaf sprays move as one body.
 */
export function enhanceBarkMaterial(
  mat: THREE.MeshStandardMaterial,
  windTimeUniform: { value: number }
): void {
  mat.customProgramCacheKey = () => 'v5_aaa_bark';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTimeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float wPhase = uWindTime * 1.45 + instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.17;
  float crownHeightFactor = smoothstep(0.6, 10.5, max(0.0, transformed.y));
  float wAmp = crownHeightFactor * 0.16;
  transformed.x += sin(wPhase) * wAmp;
  transformed.z += cos(wPhase * 0.84) * wAmp * 0.72;
#endif`
      );
  };
}

/**
 * Matching custom depth material so dappled tree shadows move cleanly with the wind shader.
 */
export function createOverhaulLeafDepthMaterial(
  mapTex: THREE.Texture,
  windTimeUniform: { value: number },
  alphaTest = 0.42
): THREE.MeshDepthMaterial {
  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: mapTex,
    alphaTest,
  });
  depthMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTimeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float wPhase = uWindTime * 1.45 + instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.17;
  float crownHeightFactor = smoothstep(0.6, 10.5, max(0.0, transformed.y));
  float wAmp = crownHeightFactor * 0.16;
  transformed.x += sin(wPhase) * wAmp;
  transformed.z += cos(wPhase * 0.84) * wAmp * 0.72;
#endif`
      );
  };
  return depthMat;
}

export interface KurzemeEzTreeConfig {
  seed: number;
  type: 'deciduous' | 'evergreen';
  bark: {
    type: string;
    tint: number;
    flatShading: boolean;
    textured: boolean;
    textureScale: { x: number; y: number };
  };
  branch: {
    levels: number;
    angle: { 1: number; 2: number; 3: number };
    children: { 0: number; 1: number; 2: number };
    force: { direction: { x: number; y: number; z: number }; strength: number };
    gnarliness: { 0: number; 1: number; 2: number; 3: number };
    length: { 0: number; 1: number; 2: number; 3: number };
    radius: { 0: number; 1: number; 2: number; 3: number };
    sections: { 0: number; 1: number; 2: number; 3: number };
    segments: { 0: number; 1: number; 2: number; 3: number };
    start: { 1: number; 2: number; 3: number };
    taper: { 0: number; 1: number; 2: number; 3: number };
    twist: { 0: number; 1: number; 2: number; 3: number };
  };
  leaves: {
    type: string;
    billboard: 'single' | 'double';
    angle: number;
    count: number;
    start: number;
    size: number;
    sizeVariance: number;
    tint: number;
    alphaTest: number;
  };
  trellis: { enabled: boolean };
}

/**
 * Pure @dgreenheck/ez-tree configuration builder calibrated for Baltic Kurzeme tree silhouettes
 * across 2 botanical seed variants and 2 LOD tiers (near high-detail vs far instanced silhouette).
 */
export function createKurzemeEzTreeOptions(
  species: TreeSpecies,
  variant: 0 | 1,
  lod: 'near' | 'far'
): KurzemeEzTreeConfig {
  const isNear = lod === 'near';
  const seedBase = variant === 0 ? 11000 : 27000;

  if (species === 'pine') {
    return {
      seed: seedBase + 416,
      type: 'evergreen',
      bark: { type: 'pine', tint: 0xffffff, flatShading: false, textured: true, textureScale: { x: 1, y: 1.4 } },
      branch: {
        levels: isNear ? 3 : 2,
        angle: { 1: variant === 0 ? 74 : 80, 2: 46, 3: 38 },
        children: { 0: isNear ? 12 : 14, 1: isNear ? 6 : 4, 2: isNear ? 2 : 0 },
        force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.017 },
        gnarliness: { 0: 0.045, 1: 0.08, 2: 0.07, 3: 0.05 },
        length: { 0: 66, 1: 24, 2: 13.5, 3: 6.4 },
        radius: { 0: 1.55, 1: 0.44, 2: 0.58, 3: 0.6 },
        sections: { 0: isNear ? 8 : 6, 1: isNear ? 4 : 4, 2: isNear ? 3 : 3, 3: 3 },
        segments: { 0: isNear ? 6 : 5, 1: isNear ? 4 : 4, 2: 3, 3: 3 },
        start: { 1: 0.45, 2: 0.14, 3: 0.22 },
        taper: { 0: 0.68, 1: 0.72, 2: 0.75, 3: 0.72 },
        twist: { 0: 0.04, 1: 0, 2: 0, 3: 0 },
      },
      leaves: {
        type: 'pine',
        billboard: 'double',
        angle: 50,
        count: isNear ? 16 : 12,
        start: 0.03,
        size: isNear ? 3.18 : 4.25,
        sizeVariance: 0.52,
        tint: 0xffffff,
        alphaTest: 0.4,
      },
      trellis: { enabled: false },
    };
  }

  if (species === 'spruce') {
    return {
      seed: seedBase + 712,
      type: 'evergreen',
      bark: { type: 'willow', tint: 0xffffff, flatShading: false, textured: true, textureScale: { x: 1, y: 1.2 } },
      branch: {
        levels: isNear ? 3 : 2,
        angle: { 1: variant === 0 ? 108 : 114, 2: 40, 3: 45 },
        children: { 0: isNear ? 16 : 20, 1: isNear ? 6 : 4, 2: isNear ? 2 : 0 },
        force: { direction: { x: 0, y: 1, z: 0 }, strength: -0.006 },
        gnarliness: { 0: 0.025, 1: 0.055, 2: 0.05, 3: 0 },
        length: { 0: 56, 1: 22.0, 2: 9.8, 3: 4.2 },
        radius: { 0: 1.28, 1: 0.36, 2: 0.56, 3: 0.6 },
        sections: { 0: isNear ? 8 : 6, 1: isNear ? 4 : 3, 2: 3, 3: 3 },
        segments: { 0: isNear ? 6 : 5, 1: isNear ? 4 : 3, 2: 3, 3: 3 },
        start: { 1: 0.1, 2: 0.1, 3: 0.24 },
        taper: { 0: 0.78, 1: 0.72, 2: 0.72, 3: 0.7 },
        twist: { 0: 0, 1: 0, 2: 0, 3: 0 },
      },
      leaves: {
        type: 'pine',
        billboard: 'double',
        angle: 48,
        count: isNear ? 15 : 10,
        start: 0.02,
        size: isNear ? 3.08 : 3.95,
        sizeVariance: 0.48,
        tint: 0xffffff,
        alphaTest: 0.4,
      },
      trellis: { enabled: false },
    };
  }

  if (species === 'birch') {
    return {
      seed: seedBase + 802,
      type: 'deciduous',
      bark: { type: 'birch', tint: 0xffffff, flatShading: false, textured: true, textureScale: { x: 1, y: 1.25 } },
      branch: {
        levels: isNear ? 3 : 2,
        angle: { 1: variant === 0 ? 48 : 54, 2: 52, 3: 32 },
        children: { 0: isNear ? 10 : 10, 1: isNear ? 6 : 4, 2: isNear ? 2 : 0 },
        force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.015 },
        gnarliness: { 0: 0.055, 1: 0.08, 2: 0.12, 3: 0.06 },
        length: { 0: 62, 1: 18.0, 2: 11.8, 3: 6.2 },
        radius: { 0: 0.92, 1: 0.52, 2: 0.62, 3: 0.6 },
        sections: { 0: isNear ? 7 : 5, 1: isNear ? 4 : 3, 2: 3, 3: 3 },
        segments: { 0: isNear ? 6 : 5, 1: isNear ? 4 : 3, 2: 3, 3: 3 },
        start: { 1: 0.34, 2: 0.12, 3: 0.08 },
        taper: { 0: 0.66, 1: 0.35, 2: 0.68, 3: 0.7 },
        twist: { 0: 0.08, 1: 0, 2: 0, 3: 0 },
      },
      leaves: {
        type: 'aspen',
        billboard: 'double',
        angle: 56,
        count: isNear ? 17 : 12,
        start: 0.03,
        size: isNear ? 3.12 : 4.1,
        sizeVariance: 0.52,
        tint: 0xffffff,
        alphaTest: 0.4,
      },
      trellis: { enabled: false },
    };
  }

  return {
    seed: seedBase + 339,
    type: 'deciduous',
    bark: { type: 'oak', tint: 0xffffff, flatShading: false, textured: true, textureScale: { x: 1, y: 1.2 } },
    branch: {
      levels: isNear ? 3 : 2,
      angle: { 1: variant === 0 ? 54 : 60, 2: 48, 3: 36 },
      children: { 0: isNear ? 10 : 9, 1: isNear ? 6 : 5, 2: isNear ? 2 : 0 },
      force: { direction: { x: 0, y: 1, z: 0 }, strength: 0.015 },
      gnarliness: { 0: -0.04, 1: 0.14, 2: -0.08, 3: 0.08 },
      length: { 0: 48, 1: 23.5, 2: 15.8, 3: 7.8 },
      radius: { 0: 2.35, 1: 0.66, 2: 0.64, 3: 0.8 },
      sections: { 0: isNear ? 7 : 5, 1: isNear ? 4 : 3, 2: 3, 3: 3 },
      segments: { 0: isNear ? 6 : 5, 1: isNear ? 4 : 3, 2: 3, 3: 3 },
      start: { 1: 0.32, 2: 0.10, 3: 0.04 },
      taper: { 0: 0.72, 1: 0.44, 2: 0.68, 3: 0.75 },
      twist: { 0: -0.18, 1: 0.32, 2: 0, 3: 0 },
    },
    leaves: {
      type: 'oak',
      billboard: 'double',
      angle: 58,
      count: isNear ? 18 : 12,
      start: 0.03,
      size: isNear ? 3.24 : 4.45,
      sizeVariance: 0.54,
      tint: 0xffffff,
      alphaTest: 0.4,
    },
    trellis: { enabled: false },
  };
}

/**
 * Normalizes a pair of generated ez-tree branch & leaf BufferGeometries so total height matches
 * targetHeightM (anchored -0.22m below y=0 for slope grounding), and bakes realistic vertical
 * bark gradients (including birch basal dark collar & pine warm upper bark) + smooth spherical
 * canopy Ambient Occlusion vertex colors.
 */
export function normalizeEzTreeGeometry(
  branchGeo: THREE.BufferGeometry,
  leafGeo: THREE.BufferGeometry,
  species: TreeSpecies,
  targetHeightM = 10.5
): void {
  branchGeo.computeBoundingBox();
  leafGeo.computeBoundingBox();

  const bBox = branchGeo.boundingBox!;
  const lBox = leafGeo.boundingBox!;
  const maxY = Math.max(bBox.max.y, lBox.max.y, 1);
  const scale = targetHeightM / maxY;
  const sinkY = -0.22;

  branchGeo.scale(scale, scale, scale);
  branchGeo.translate(0, sinkY, 0);
  leafGeo.scale(scale, scale, scale);
  leafGeo.translate(0, sinkY, 0);

  const bPos = branchGeo.attributes.position as THREE.BufferAttribute;
  const bCol = new Float32Array(bPos.count * 3);
  for (let i = 0; i < bPos.count; i++) {
    const x = bPos.getX(i);
    const y = bPos.getY(i);
    const z = bPos.getZ(i);
    const h01 = THREE.MathUtils.clamp(y / targetHeightM, 0, 1);
    const rDist = Math.hypot(x, z);

    let r = 1;
    let g = 1;
    let b = 1;
    if (species === 'pine') {
      const warm = THREE.MathUtils.smoothstep(h01, 0.4, 0.74);
      r = THREE.MathUtils.lerp(0.76, 1.24, warm);
      g = THREE.MathUtils.lerp(0.72, 0.86, warm);
      b = THREE.MathUtils.lerp(0.68, 0.64, warm);
    } else if (species === 'birch') {
      const whiteMix = THREE.MathUtils.smoothstep(y, 0.28, 1.45);
      r = THREE.MathUtils.lerp(0.28, 1.0, whiteMix);
      g = THREE.MathUtils.lerp(0.26, 0.99, whiteMix);
      b = THREE.MathUtils.lerp(0.24, 0.97, whiteMix);
    } else {
      const mossMix = THREE.MathUtils.smoothstep(y, -0.1, 1.15);
      const innerShadow = 1 - Math.min(0.2, rDist * 0.04);
      r = THREE.MathUtils.lerp(0.66, 0.96, mossMix) * innerShadow;
      g = THREE.MathUtils.lerp(0.72, 0.96, mossMix) * innerShadow;
      b = THREE.MathUtils.lerp(0.58, 0.92, mossMix) * innerShadow;
    }
    bCol[i * 3] = r;
    bCol[i * 3 + 1] = g;
    bCol[i * 3 + 2] = b;
  }
  branchGeo.setAttribute('color', new THREE.BufferAttribute(bCol, 3));

  leafGeo.computeBoundingBox();
  const cBox = leafGeo.boundingBox!;
  const minY = cBox.min.y;
  const spanY = Math.max(1.0, cBox.max.y - minY);
  const midY = (minY + cBox.max.y) * 0.5;
  const maxRad = Math.max(
    1.2,
    Math.hypot(Math.max(Math.abs(cBox.min.x), Math.abs(cBox.max.x)), Math.max(Math.abs(cBox.min.z), Math.abs(cBox.max.z)))
  );

  const lPos = leafGeo.attributes.position as THREE.BufferAttribute;
  const lNrm = leafGeo.attributes.normal as THREE.BufferAttribute;
  const lCol = new Float32Array(lPos.count * 3);
  const sphN = new THREE.Vector3();
  const origN = new THREE.Vector3();

  for (let i = 0; i < lPos.count; i++) {
    const x = lPos.getX(i);
    const y = lPos.getY(i);
    const z = lPos.getZ(i);
    const hFrac = THREE.MathUtils.clamp((y - minY) / spanY, 0, 1);
    const rFrac = THREE.MathUtils.clamp(Math.hypot(x, z) / maxRad, 0, 1);

    origN.set(lNrm.getX(i), lNrm.getY(i), lNrm.getZ(i));
    sphN.set(x * 0.72, (y - midY) / (spanY * 0.5) + 0.45, z * 0.72).normalize();
    origN.lerp(sphN, 0.52).normalize();
    lNrm.setXYZ(i, origN.x, origN.y, origN.z);

    const ao = THREE.MathUtils.clamp(0.24 + rFrac * 0.44 + hFrac * 0.36, 0.24, 1.04);
    lCol[i * 3] = ao;
    lCol[i * 3 + 1] = ao * 1.01;
    lCol[i * 3 + 2] = ao * 0.94;
  }
  leafGeo.setAttribute('color', new THREE.BufferAttribute(lCol, 3));
  branchGeo.computeBoundingSphere();
  leafGeo.computeBoundingSphere();
}

/**
 * Partitions an array of tree world XZ coordinates into near-camera LOD0 indices and far LOD1 indices.
 */
export function partitionTreeInstancesByDistance(
  positionsXZ: ReadonlyArray<{ x: number; z: number }>,
  camX: number,
  camZ: number,
  nearRadiusM = 120
): { nearIndices: number[]; farIndices: number[] } {
  const nearR2 = nearRadiusM * nearRadiusM;
  const nearIndices: number[] = [];
  const farIndices: number[] = [];
  for (let i = 0; i < positionsXZ.length; i++) {
    const dx = positionsXZ[i].x - camX;
    const dz = positionsXZ[i].z - camZ;
    if (dx * dx + dz * dz <= nearR2) nearIndices.push(i);
    else farIndices.push(i);
  }
  return { nearIndices, farIndices };
}
