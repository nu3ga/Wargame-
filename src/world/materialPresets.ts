import * as THREE from 'three';
import type { MaterialRecipe } from './types';

export const GENERATED_TEXTURES = {
  timber: new URL('../assets/images/tex_kurzeme_timber_1794562129997.jpg', import.meta.url).href,
  clayRoof: new URL('../assets/images/tex_clay_roof_1794562130368.jpg', import.meta.url).href,
  gravelRoad: new URL('../assets/images/tex_gravel_cobble_1794562131023.jpg', import.meta.url).href,
} as const;

export const WALL_PRESETS: MaterialRecipe[] = [
  {
    id: 'kurzeme_timber',
    name: 'Kurzeme Pine Clapboard',
    pattern: 'photo_timber',
    primaryHex: '#9d7b4f',
    secondaryHex: '#694d2f',
    accentHex: '#445238',
    roughness: 0.86,
    metalness: 0.03,
    bumpScale: 0.09,
    repeatX: 2.4,
    repeatY: 2.0,
    weathering: 0.52,
    grain: 0.68,
    notes: 'Weathered Latvian horizontal pine siding.',
  },
  {
    id: 'lime_plaster',
    name: 'Limewashed Plaster',
    pattern: 'plaster',
    primaryHex: '#cfc7b6',
    secondaryHex: '#b3a792',
    accentHex: '#7d7464',
    roughness: 0.91,
    metalness: 0.02,
    bumpScale: 0.055,
    repeatX: 2,
    repeatY: 2,
    weathering: 0.55,
    grain: 0.55,
    notes: 'Warm Courland church and manor limewash.',
  },
  {
    id: 'red_brick',
    name: 'Kurzeme Red Brick',
    pattern: 'brick',
    primaryHex: '#7c3f32',
    secondaryHex: '#b0a28f',
    accentHex: '#4f271e',
    roughness: 0.88,
    metalness: 0.03,
    bumpScale: 0.1,
    repeatX: 3,
    repeatY: 2.5,
    weathering: 0.58,
    grain: 0.62,
    notes: 'Kiln-fired clay brick with pale lime mortar.',
  },
  {
    id: 'fieldstone',
    name: 'Renda Fieldstone',
    pattern: 'fieldstone',
    primaryHex: '#76726a',
    secondaryHex: '#48453f',
    accentHex: '#4d5b3e',
    roughness: 0.94,
    metalness: 0.04,
    bumpScale: 0.13,
    repeatX: 2.2,
    repeatY: 2.2,
    weathering: 0.68,
    grain: 0.74,
    notes: 'Glacial boulders and dolomite mortar.',
  },
  {
    id: 'moss_timber',
    name: 'Barn Aged Timber',
    pattern: 'moss_timber',
    primaryHex: '#5e4a37',
    secondaryHex: '#3b2e21',
    accentHex: '#3f4f33',
    roughness: 0.91,
    metalness: 0.02,
    bumpScale: 0.1,
    repeatX: 2.2,
    repeatY: 2.2,
    weathering: 0.72,
    grain: 0.74,
    notes: 'Dark tar-treated Baltic barn planks.',
  },
  {
    id: 'manor_ochre',
    name: 'Lielrenda Manor Ochre',
    pattern: 'plaster',
    primaryHex: '#bfae86',
    secondaryHex: '#a3926c',
    accentHex: '#75684f',
    roughness: 0.89,
    metalness: 0.02,
    bumpScale: 0.055,
    repeatX: 2,
    repeatY: 2,
    weathering: 0.45,
    grain: 0.5,
    notes: 'Warm ochre-sand limewash of Lielrenda Manor.',
  },
];

export const ROOF_PRESETS: MaterialRecipe[] = [
  {
    id: 'clay_tile',
    name: 'Terracotta Clay Tile',
    pattern: 'photo_clay_roof',
    primaryHex: '#733829',
    secondaryHex: '#4d2419',
    accentHex: '#4a5939',
    roughness: 0.84,
    metalness: 0.04,
    bumpScale: 0.11,
    repeatX: 3,
    repeatY: 3,
    weathering: 0.66,
    grain: 0.55,
    notes: 'Traditional Kurzeme fired clay roof tiles.',
  },
  {
    id: 'crimson_manor',
    name: 'Burgundy Metal Seam',
    pattern: 'standing_seam',
    primaryHex: '#632627',
    secondaryHex: '#401819',
    accentHex: '#7d3a3b',
    roughness: 0.5,
    metalness: 0.42,
    bumpScale: 0.06,
    repeatX: 4,
    repeatY: 1,
    weathering: 0.4,
    grain: 0.28,
    notes: 'Deep burgundy sheet-metal roof matching Lielrenda Manor.',
  },
  {
    id: 'standing_seam',
    name: 'Slate Standing Seam',
    pattern: 'standing_seam',
    primaryHex: '#434f56',
    secondaryHex: '#2b3439',
    accentHex: '#637178',
    roughness: 0.42,
    metalness: 0.6,
    bumpScale: 0.06,
    repeatX: 4,
    repeatY: 1,
    weathering: 0.34,
    grain: 0.26,
    notes: 'Painted Baltic zinc standing-seam roofing.',
  },
  {
    id: 'zinc_seam',
    name: 'Galvanized Zinc Roof',
    pattern: 'standing_seam',
    primaryHex: '#7e8488',
    secondaryHex: '#5b6165',
    accentHex: '#9ba1a5',
    roughness: 0.52,
    metalness: 0.54,
    bumpScale: 0.055,
    repeatX: 4,
    repeatY: 1,
    weathering: 0.42,
    grain: 0.32,
    notes: 'Weathered light galvanized metal rural roofing.',
  },
  {
    id: 'weathered_brown',
    name: 'Latvian Corrugated Slate',
    pattern: 'standing_seam',
    primaryHex: '#5d615f',
    secondaryHex: '#414544',
    accentHex: '#757975',
    roughness: 0.82,
    metalness: 0.07,
    bumpScale: 0.09,
    repeatX: 6,
    repeatY: 2.5,
    weathering: 0.58,
    grain: 0.54,
    notes: 'Weathered Latvian rural corrugated slate (šīferis) roofing.',
  },
  {
    id: 'church_slate',
    name: 'Church Slate Spire',
    pattern: 'standing_seam',
    primaryHex: '#3f4448',
    secondaryHex: '#282c2f',
    accentHex: '#5c6267',
    roughness: 0.48,
    metalness: 0.48,
    bumpScale: 0.055,
    repeatX: 4,
    repeatY: 1,
    weathering: 0.44,
    grain: 0.32,
    notes: 'Dark grey sheet-metal steeple cladding of Renda Church.',
  },
];

export const ROAD_PRESETS: MaterialRecipe[] = [
  {
    id: 'gravel_country',
    name: 'Abava Gravel Road',
    pattern: 'photo_gravel',
    primaryHex: '#7c7161',
    secondaryHex: '#544b40',
    accentHex: '#9d917f',
    roughness: 0.94,
    metalness: 0.02,
    bumpScale: 0.1,
    repeatX: 1.5,
    repeatY: 8,
    weathering: 0.62,
    grain: 0.82,
    notes: 'Rural crushed pebble and packed earth lane.',
  },
  {
    id: 'regional_asphalt',
    name: 'Regional Asphalt',
    pattern: 'asphalt',
    primaryHex: '#383b40',
    secondaryHex: '#4c5157',
    accentHex: '#bab3a1',
    roughness: 0.88,
    metalness: 0.03,
    bumpScale: 0.06,
    repeatX: 1,
    repeatY: 6,
    weathering: 0.58,
    grain: 0.78,
    notes: 'Two-lane paved Kurzeme regional road.',
  },
];

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drawPatternToCanvases(recipe: MaterialRecipe): {
  albedoCanvas: HTMLCanvasElement;
  bumpCanvas: HTMLCanvasElement;
} {
  const size = 512;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const ctx = albedoCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const rand = seededRand(
    recipe.id.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7)
  );

  ctx.fillStyle = recipe.primaryHex;
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  if (recipe.pattern === 'clapboard' || recipe.pattern === 'moss_timber' || recipe.pattern === 'photo_timber') {
    const planks = 10;
    const ph = size / planks;
    for (let i = 0; i < planks; i++) {
      const y = i * ph;
      ctx.fillStyle = i % 2 === 0 ? recipe.primaryHex : recipe.secondaryHex;
      ctx.globalAlpha = 0.24 + rand() * 0.36;
      ctx.fillRect(0, y, size, ph);
      ctx.globalAlpha = 1;

      // Beveled plank shadow + highlight lip
      ctx.fillStyle = recipe.secondaryHex;
      ctx.fillRect(0, y + ph - 5, size, 5);
      ctx.fillStyle = recipe.accentHex;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(0, y, size, 3);
      ctx.globalAlpha = 1;

      bCtx.fillStyle = '#282828';
      bCtx.fillRect(0, y + ph - 5, size, 5);
      bCtx.fillStyle = '#c8c8c8';
      bCtx.fillRect(0, y, size, 4);

      // Fine timber grain fibers & occasional knot
      for (let g = 0; g < 34; g++) {
        const gy = y + 5 + rand() * (ph - 11);
        ctx.fillStyle = rand() > 0.5 ? recipe.secondaryHex : recipe.accentHex;
        ctx.globalAlpha = 0.06 + recipe.grain * 0.13;
        ctx.fillRect(0, gy, size, 1 + rand() * 2);
        bCtx.fillStyle = rand() > 0.5 ? '#969696' : '#6c6c6c';
        bCtx.fillRect(0, gy, size, 1.5);
      }
      if (rand() < 0.55) {
        const kx = 24 + rand() * (size - 48);
        const ky = y + ph * (0.35 + rand() * 0.3);
        ctx.beginPath();
        ctx.ellipse(kx, ky, 7 + rand() * 5, 3.5 + rand() * 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = recipe.secondaryHex;
        ctx.globalAlpha = 0.38;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  } else if (recipe.pattern === 'brick') {
    const rows = 16;
    const cols = 6;
    const rh = size / rows;
    const cw = size / cols;
    ctx.fillStyle = recipe.secondaryHex;
    ctx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#363636';
    bCtx.fillRect(0, 0, size, size);

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (cw * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * cw + offset + 3;
        const y = r * rh + 3;
        const toneRoll = rand();
        ctx.fillStyle = toneRoll > 0.32 ? recipe.primaryHex : toneRoll > 0.12 ? recipe.accentHex : recipe.secondaryHex;
        ctx.globalAlpha = toneRoll > 0.12 ? 0.78 + rand() * 0.22 : 0.45;
        ctx.fillRect(x, y, cw - 6, rh - 6);

        // Micro firing speckle on brick face
        ctx.fillStyle = recipe.accentHex;
        ctx.globalAlpha = 0.16;
        ctx.fillRect(x + 2, y + rh - 10, cw - 10, 3);

        bCtx.fillStyle = `rgb(${182 + Math.floor(rand() * 38)},${182 + Math.floor(rand() * 38)},${182 + Math.floor(rand() * 38)})`;
        bCtx.fillRect(x, y, cw - 6, rh - 6);
      }
    }
    ctx.globalAlpha = 1;
  } else if (recipe.pattern === 'fieldstone') {
    ctx.fillStyle = recipe.secondaryHex;
    ctx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#323232';
    bCtx.fillRect(0, 0, size, size);
    // Coursed glacial & dolomite fieldstones with subtle mortar shadow
    for (let i = 0; i < 110; i++) {
      const cx = rand() * size;
      const cy = rand() * size;
      const rx = 20 + rand() * 28;
      const ry = 14 + rand() * 20;
      const ang = (rand() - 0.5) * 0.55;
      const stoneRoll = rand();
      const fillCol =
        stoneRoll > 0.48
          ? recipe.primaryHex
          : stoneRoll > 0.22
            ? recipe.accentHex
            : '#6b675e';
      const alpha = 0.75 + rand() * 0.24;
      for (const ox of [-size, 0, size]) {
        for (const oy of [-size, 0, size]) {
          ctx.beginPath();
          ctx.ellipse(cx + ox, cy + oy, rx + 2, ry + 2, ang, 0, Math.PI * 2);
          ctx.fillStyle = '#2d2b26';
          ctx.globalAlpha = 0.25;
          ctx.fill();

          ctx.beginPath();
          ctx.ellipse(cx + ox, cy + oy, rx, ry, ang, 0, Math.PI * 2);
          ctx.fillStyle = fillCol;
          ctx.globalAlpha = alpha;
          ctx.fill();

          bCtx.beginPath();
          bCtx.ellipse(cx + ox, cy + oy, rx - 3, ry - 3, ang, 0, Math.PI * 2);
          bCtx.fillStyle = '#d4d4d4';
          bCtx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  } else if (recipe.pattern === 'roof_tile' || recipe.pattern === 'photo_clay_roof') {
    const rows = 12;
    const cols = 12;
    const rh = size / rows;
    const cw = size / cols;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw;
        const y = r * rh;
        ctx.fillStyle = rand() > 0.28 ? recipe.primaryHex : recipe.secondaryHex;
        ctx.fillRect(x + 2, y + 1, cw - 4, rh - 4);
        ctx.fillStyle = recipe.secondaryHex;
        ctx.fillRect(x, y + rh - 5, cw, 5);
        bCtx.fillStyle = '#c2c2c2';
        bCtx.fillRect(x + 3, y + 2, cw - 6, rh - 7);
        bCtx.fillStyle = '#2e2e2e';
        bCtx.fillRect(x, y + rh - 5, cw, 5);
      }
    }
  } else if (recipe.pattern === 'standing_seam') {
    const isCorrugatedSlate = recipe.metalness < 0.2;
    if (isCorrugatedSlate) {
      const waves = 20;
      const ww = size / waves;
      for (let i = 0; i < waves; i++) {
        const x = i * ww;
        const grad = ctx.createLinearGradient(x, 0, x + ww, 0);
        grad.addColorStop(0, recipe.accentHex);
        grad.addColorStop(0.45, recipe.primaryHex);
        grad.addColorStop(0.85, recipe.secondaryHex);
        grad.addColorStop(1, recipe.primaryHex);
        ctx.fillStyle = grad;
        ctx.fillRect(x, 0, ww + 0.5, size);

        const bGrad = bCtx.createLinearGradient(x, 0, x + ww, 0);
        bGrad.addColorStop(0, '#dcdcdc');
        bGrad.addColorStop(0.5, '#464646');
        bGrad.addColorStop(1, '#dcdcdc');
        bCtx.fillStyle = bGrad;
        bCtx.fillRect(x, 0, ww + 0.5, size);
      }
      for (const y of [0, size * 0.5]) {
        ctx.fillStyle = recipe.secondaryHex;
        ctx.globalAlpha = 0.72;
        ctx.fillRect(0, y, size, 7);
        ctx.globalAlpha = 1;
        bCtx.fillStyle = '#262626';
        bCtx.fillRect(0, y, size, 7);
      }
    } else {
      const panels = 8;
      const pw = size / panels;
      for (let i = 0; i < panels; i++) {
        const x = i * pw;
        ctx.fillStyle = i % 2 === 0 ? recipe.primaryHex : recipe.secondaryHex;
        ctx.globalAlpha = 0.18 + rand() * 0.14;
        ctx.fillRect(x, 0, pw, size);
        ctx.globalAlpha = 1;
        // Raised double-lock standing seam rib
        ctx.fillStyle = recipe.accentHex;
        ctx.fillRect(x, 0, 5, size);
        ctx.fillStyle = recipe.secondaryHex;
        ctx.fillRect(x + 5, 0, 5, size);

        bCtx.fillStyle = '#efefef';
        bCtx.fillRect(x, 0, 6, size);
        bCtx.fillStyle = '#4f4f4f';
        bCtx.fillRect(x + 6, 0, 4, size);
      }
      // Subtle horizontal sheet lock seam
      for (const y of [size * 0.33, size * 0.67]) {
        ctx.fillStyle = recipe.secondaryHex;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(0, y, size, 3);
        ctx.globalAlpha = 1;
        bCtx.fillStyle = '#5c5c5c';
        bCtx.fillRect(0, y, size, 3);
      }
    }
  } else if (recipe.pattern === 'asphalt') {
    // Realistic Baltic two-lane asphalt: dark aggregate speckles, worn wheel paths, sealed tar lines, crisp road markings
    ctx.fillStyle = recipe.primaryHex;
    ctx.fillRect(0, 0, size, size);

    // Subtle worn wheel-path darkening in left and right lanes
    for (const wx of [size * 0.24, size * 0.38, size * 0.62, size * 0.76]) {
      const g = ctx.createLinearGradient(wx - 28, 0, wx + 28, 0);
      g.addColorStop(0, 'rgba(26,28,31,0)');
      g.addColorStop(0.5, 'rgba(24,26,30,0.28)');
      g.addColorStop(1, 'rgba(26,28,31,0)');
      ctx.fillStyle = g;
      ctx.fillRect(wx - 28, 0, 56, size);
    }

    // Fine mineral chip aggregate across 512px tile
    for (let i = 0; i < 6500; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const sz = 1.5 + rand() * 2.2;
      ctx.fillStyle = rand() > 0.45 ? recipe.secondaryHex : '#2a2d31';
      ctx.globalAlpha = 0.38;
      ctx.fillRect(x, y, sz, sz);
      bCtx.fillStyle = rand() > 0.5 ? '#a8a8a8' : '#585858';
      bCtx.fillRect(x, y, sz, sz);
    }

    // Organic gravelly edge stippling & spalled margin dust (never flat rectangular curb bars)
    for (let i = 0; i < 1600; i++) {
      const side = rand() > 0.5 ? 1 : 0;
      const dx = Math.pow(rand(), 1.8) * 42;
      const x = side ? size - dx - 2 : dx;
      const y = rand() * size;
      const sz = 1.5 + rand() * 4.5;
      ctx.fillStyle = rand() > 0.45 ? '#5d574d' : '#4a463f';
      ctx.globalAlpha = 0.28 + rand() * 0.26;
      ctx.fillRect(x, y, sz, sz);
      bCtx.fillStyle = rand() > 0.5 ? '#c6c6c6' : '#4a4a4a';
      bCtx.fillRect(x, y, sz, sz);
    }

    // Subtle weathered/chipped road edge lines (broken paint flakes, not solid bars)
    ctx.fillStyle = recipe.accentHex;
    for (let y = 0; y < size; y += 6) {
      if (rand() < 0.34) continue; // chipped missing paint segments
      ctx.globalAlpha = 0.35 + rand() * 0.32;
      const jxL = 22 + (rand() - 0.5) * 3.5;
      const jxR = size - 28 + (rand() - 0.5) * 3.5;
      ctx.fillRect(jxL, y, 4 + rand() * 2.5, 4.5);
      if (rand() > 0.25) ctx.fillRect(jxR, y, 4 + rand() * 2.5, 4.5);
    }
    for (let y = 18; y < size; y += 96) {
      for (let sy = 0; sy < 48; sy += 6) {
        if (rand() < 0.22) continue;
        ctx.globalAlpha = 0.45 + rand() * 0.32;
        ctx.fillRect(size * 0.5 - 3.5 + (rand() - 0.5) * 1.6, y + sy, 6.5, 5);
      }
    }
    ctx.globalAlpha = 1;
  } else {
    // Plaster / gravel with subtle troweled limewash texture & bottom dampness patina
    for (let i = 0; i < 3200; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const s =
        recipe.pattern === 'gravel' || recipe.pattern === 'photo_gravel'
          ? 2 + rand() * 5.5
          : 4 + rand() * 12;
      ctx.fillStyle = rand() > 0.4 ? recipe.secondaryHex : recipe.accentHex;
      ctx.globalAlpha = 0.12 + recipe.grain * 0.17;
      ctx.fillRect(x, y, s, s * 0.85);
      bCtx.fillStyle = rand() > 0.5 ? '#aaaaaa' : '#5e5e5e';
      bCtx.fillRect(x, y, s, s);
    }
    if (recipe.pattern === 'plaster') {
      // Hairline plaster cracks & subtle rain-runoff grime streaks
      ctx.strokeStyle = recipe.accentHex;
      ctx.lineWidth = 1;
      for (let i = 0; i < 34; i++) {
        const x = rand() * size;
        const y = rand() * size;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 38, y + (rand() - 0.5) * 38);
        ctx.stroke();
      }
      for (let i = 0; i < 42; i++) {
        const sx = rand() * size;
        const sy = rand() * size * 0.7;
        const sh = 40 + rand() * 140;
        const g = ctx.createLinearGradient(0, sy, 0, sy + sh);
        g.addColorStop(0, 'rgba(55,50,42,0.12)');
        g.addColorStop(1, 'rgba(55,50,42,0)');
        ctx.fillStyle = g;
        ctx.globalAlpha = 1;
        ctx.fillRect(sx, sy, 3 + rand() * 8, sh);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Subtle weathering / moss patina speckles & damp blotches
  if (recipe.weathering > 0.05) {
    const count = Math.floor(recipe.weathering * 440);
    for (let i = 0; i < count; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 2 + rand() * 11;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = i % 5 === 0 ? '#3f4734' : recipe.accentHex;
      ctx.globalAlpha = 0.06 + recipe.weathering * 0.11;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  return { albedoCanvas, bumpCanvas };
}

function buildNormalAndRoughnessCanvases(
  bumpCanvas: HTMLCanvasElement,
  baseRoughness: number,
  weathering: number,
  strength = 2.6
): { normalCanvas: HTMLCanvasElement; roughnessCanvas: HTMLCanvasElement } {
  const size = bumpCanvas.width;
  const bCtx = bumpCanvas.getContext('2d')!;
  const src = bCtx.getImageData(0, 0, size, size).data;

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nCtx = normalCanvas.getContext('2d')!;
  const nImg = nCtx.createImageData(size, size);
  const nData = nImg.data;

  const roughnessCanvas = document.createElement('canvas');
  roughnessCanvas.width = size;
  roughnessCanvas.height = size;
  const rCtx = roughnessCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(size, size);
  const rData = rImg.data;

  const sampleH = (x: number, y: number) => {
    const wx = (x + size) % size;
    const wy = (y + size) % size;
    return src[(wy * size + wx) * 4] / 255;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const tl = sampleH(x - 1, y - 1);
      const t = sampleH(x, y - 1);
      const tr = sampleH(x + 1, y - 1);
      const l = sampleH(x - 1, y);
      const c = sampleH(x, y);
      const r = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const b = sampleH(x, y + 1);
      const br = sampleH(x + 1, y + 1);

      const dX = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dY = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      let nx = -dX;
      let ny = -dY;
      let nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      nData[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      nData[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nData[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      nData[idx + 3] = 255;

      // Recessed mortar/grooves & weathered dips are rougher; raised tile/seam crests catch crisp specular highlights
      const roughMod = (0.5 - c) * (0.28 + weathering * 0.14);
      const roughVal = Math.max(0.12, Math.min(1.0, baseRoughness + roughMod));
      const rByte = Math.round(roughVal * 255);
      rData[idx] = rByte;
      rData[idx + 1] = rByte;
      rData[idx + 2] = rByte;
      rData[idx + 3] = 255;
    }
  }

  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);
  return { normalCanvas, roughnessCanvas };
}

interface HostedPbrSet {
  folder: string;
  tintHex: number;
  repeatScale?: number;
  normalScale?: number;
  roughnessMul?: number;
  hasAo?: boolean;
}

const HOSTED_PBR_PRESETS: Record<string, HostedPbrSet> = {
  kurzeme_timber: { folder: 'weathered_brown_planks', tintHex: 0xe8c99d, repeatScale: 1.18, normalScale: 1.08, roughnessMul: 0.92, hasAo: true },
  moss_timber: { folder: 'weathered_brown_planks', tintHex: 0x9b8064, repeatScale: 1.18, normalScale: 1.15, roughnessMul: 0.96, hasAo: true },
  lime_plaster: { folder: 'white_plaster_rough_02', tintHex: 0xf4eee0, repeatScale: 1.28, normalScale: 0.52, roughnessMul: 0.98, hasAo: true },
  manor_ochre: { folder: 'painted_plaster_wall', tintHex: 0xe8cf96, repeatScale: 1.25, normalScale: 0.54, roughnessMul: 0.96, hasAo: true },
  red_brick: { folder: 'red_brick_03', tintHex: 0xe6beb0, repeatScale: 1.16, normalScale: 0.92, roughnessMul: 0.98, hasAo: true },
  fieldstone: { folder: 'rustic_stone_wall_02', tintHex: 0xd8d3c9, repeatScale: 1.14, normalScale: 1.06, roughnessMul: 0.98, hasAo: true },
  clay_tile: { folder: 'clay_roof_tiles_02', tintHex: 0xe0aa94, repeatScale: 1.15, normalScale: 1.18, roughnessMul: 0.88, hasAo: true },
  crimson_manor: { folder: 'corrugated_iron', tintHex: 0x963234, repeatScale: 1.18, normalScale: 0.78, roughnessMul: 0.88, hasAo: true },
  standing_seam: { folder: 'corrugated_iron', tintHex: 0x5d6e78, repeatScale: 1.18, normalScale: 0.78, roughnessMul: 0.84, hasAo: true },
  zinc_seam: { folder: 'corrugated_iron', tintHex: 0xbac0c4, repeatScale: 1.18, normalScale: 0.92, roughnessMul: 0.72, hasAo: true },
  weathered_brown: { folder: 'roof_07', tintHex: 0xc8c0b6, repeatScale: 1.1, normalScale: 1.12, roughnessMul: 0.92, hasAo: true },
  church_slate: { folder: 'roof_slates_03', tintHex: 0x737a80, repeatScale: 1.18, normalScale: 1.05, roughnessMul: 0.76, hasAo: true },
  regional_asphalt: { folder: 'asphalt_02', tintHex: 0xc2c6ca, repeatScale: 1.25, normalScale: 0.92, roughnessMul: 0.94, hasAo: true },
  gravel_country: { folder: 'gravel_road', tintHex: 0xd8d0c0, repeatScale: 1.22, normalScale: 1.08, roughnessMul: 0.96, hasAo: true },
};

export class MaterialLibrary {
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  private textureLoader = new THREE.TextureLoader();
  private maxAnisotropy: number;

  constructor(maxAnisotropy: number) {
    this.maxAnisotropy = maxAnisotropy;
  }

  private getPhotoUrl(pattern: MaterialRecipe['pattern']): string | null {
    if (pattern === 'photo_timber') return GENERATED_TEXTURES.timber;
    if (pattern === 'photo_clay_roof') return GENERATED_TEXTURES.clayRoof;
    if (pattern === 'photo_gravel') return GENERATED_TEXTURES.gravelRoad;
    return null;
  }

  private configureDataTex(canvas: HTMLCanvasElement, repeatX: number, repeatY: number): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = this.maxAnisotropy;
    return tex;
  }

  private loadHostedTex(
    url: string,
    isColor: boolean,
    repeatX: number,
    repeatY: number
  ): THREE.Texture {
    const tex = this.textureLoader.load(url, (loaded) => {
      loaded.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      loaded.wrapS = THREE.RepeatWrapping;
      loaded.wrapT = THREE.RepeatWrapping;
      loaded.repeat.set(repeatX, repeatY);
      loaded.anisotropy = this.maxAnisotropy;
      loaded.needsUpdate = true;
    });
    tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = this.maxAnisotropy;
    return tex;
  }

  getMaterial(recipe: MaterialRecipe): THREE.MeshStandardMaterial {
    const cacheKey = JSON.stringify([
      recipe.id, recipe.pattern, recipe.primaryHex, recipe.secondaryHex, recipe.accentHex,
      recipe.roughness, recipe.metalness, recipe.bumpScale, recipe.repeatX, recipe.repeatY,
      recipe.weathering, recipe.grain,
    ]);
    const existing = this.cache.get(cacheKey);
    if (existing) return existing;

    // Paint, plaster, brick and timber are dielectric; only exposed metal conducts.
    const paintedMetal = ['crimson_manor', 'standing_seam', 'church_slate'].includes(recipe.id);
    const materialMetalness = paintedMetal ? 0.12 : recipe.metalness <= 0.1 ? 0 : Math.min(0.85, recipe.metalness);
    const hosted = HOSTED_PBR_PRESETS[recipe.id];
    if (hosted) {
      const rMul = hosted.repeatScale ?? 1.0;
      const rx = recipe.repeatX * rMul;
      const ry = recipe.repeatY * rMul;
      const base = `/assets/textures/${hosted.folder}`;
      const diffTex = this.loadHostedTex(`${base}/diff.jpg`, true, rx, ry);
      const norTex = this.loadHostedTex(`${base}/nor_gl.jpg`, false, rx, ry);
      const roughTex = this.loadHostedTex(`${base}/rough.jpg`, false, rx, ry);
      const aoTex = hosted.hasAo ? this.loadHostedTex(`${base}/ao.jpg`, false, rx, ry) : null;
      const nScale = hosted.normalScale ?? 0.95;

      const mat = new THREE.MeshStandardMaterial({
        color: hosted.tintHex,
        map: diffTex,
        normalMap: norTex,
        normalScale: new THREE.Vector2(nScale, nScale),
        roughnessMap: roughTex,
        roughness: hosted.roughnessMul ?? 1.0,
        aoMap: aoTex ?? undefined,
        aoMapIntensity: aoTex ? 0.78 : 0,
        metalness: materialMetalness,
        envMapIntensity: materialMetalness > 0.3 ? 0.95 : 0.65,
      });
      this.cache.set(cacheKey, mat);
      return mat;
    }

    const { albedoCanvas, bumpCanvas } = drawPatternToCanvases(recipe);
    const normalStrength = Math.max(1.4, Math.min(4.2, recipe.bumpScale * 34));
    const { normalCanvas, roughnessCanvas } = buildNormalAndRoughnessCanvases(
      bumpCanvas,
      recipe.roughness,
      recipe.weathering,
      normalStrength
    );
    const normalTex = this.configureDataTex(normalCanvas, recipe.repeatX, recipe.repeatY);
    const roughnessTex = this.configureDataTex(roughnessCanvas, recipe.repeatX, recipe.repeatY);

    const photoUrl = this.getPhotoUrl(recipe.pattern);
    let mapTex: THREE.Texture;

    if (photoUrl) {
      mapTex = this.loadHostedTex(photoUrl, true, recipe.repeatX, recipe.repeatY);
    } else {
      const cTex = new THREE.CanvasTexture(albedoCanvas);
      cTex.colorSpace = THREE.SRGBColorSpace;
      cTex.wrapS = THREE.RepeatWrapping;
      cTex.wrapT = THREE.RepeatWrapping;
      cTex.repeat.set(recipe.repeatX, recipe.repeatY);
      cTex.anisotropy = this.maxAnisotropy;
      mapTex = cTex;
    }

    const nScale = Math.max(0.35, Math.min(1.15, recipe.bumpScale * 9.5));
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: mapTex,
      normalMap: normalTex,
      normalScale: new THREE.Vector2(nScale, nScale),
      roughnessMap: roughnessTex,
      roughness: 1.0,
      metalness: materialMetalness,
      envMapIntensity: materialMetalness > 0.3 ? 0.95 : 0.65,
    });

    this.cache.set(cacheKey, mat);
    return mat;
  }

  dispose(): void {
    for (const mat of this.cache.values()) {
      mat.map?.dispose();
      mat.bumpMap?.dispose();
      mat.normalMap?.dispose();
      mat.roughnessMap?.dispose();
      mat.aoMap?.dispose();
      mat.dispose();
    }
    this.cache.clear();
  }
}
