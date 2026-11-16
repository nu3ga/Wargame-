import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveServerBinding(): { port: number; host: string } {
  const args = process.argv.slice(2);
  let cliPort: number | null = null;
  let cliHost: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) cliPort = parsed;
      i++;
    } else if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isFinite(parsed) && parsed > 0) cliPort = parsed;
    } else if (arg === '--host' && args[i + 1]) {
      cliHost = args[i + 1];
      i++;
    } else if (arg.startsWith('--host=')) {
      cliHost = arg.slice('--host='.length);
    }
  }

  const defaultAppPort = Number(process.env.DEFAULT_APP_PORT || 3000);
  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT || 8080);
  // Never collide with the container's nginx reverse proxy port (8080) when PORT=8080 is inherited
  const safeEnvPort =
    Number.isFinite(envPort) && envPort > 0 && envPort !== nginxPort ? envPort : defaultAppPort;

  return {
    port: cliPort ?? safeEnvPort,
    host: cliHost || '0.0.0.0',
  };
}

const { port: PORT, host: HOST } = resolveServerBinding();
const isProduction = process.env.NODE_ENV === 'production';

type MaterialPattern =
  | 'clapboard'
  | 'brick'
  | 'plaster'
  | 'roof_tile'
  | 'standing_seam'
  | 'fieldstone'
  | 'gravel'
  | 'asphalt'
  | 'moss_timber';

interface SynthesizedMaterial {
  name: string;
  pattern: MaterialPattern;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  roughness: number;
  metalness: number;
  bumpScale: number;
  repeatX: number;
  repeatY: number;
  weathering: number;
  grain: number;
  notes: string;
  source: 'gemini' | 'deterministic';
}

function deterministicFallback(prompt: string, targetSurface: string): SynthesizedMaterial {
  const p = prompt.toLowerCase();
  if (p.includes('brick') || p.includes('ķieģel')) {
    return {
      name: 'Kurzeme Red Brick',
      pattern: 'brick',
      primaryHex: '#8d4332',
      secondaryHex: '#b89f8d',
      accentHex: '#5e2b20',
      roughness: 0.85,
      metalness: 0.04,
      bumpScale: 0.08,
      repeatX: 2.5,
      repeatY: 2.5,
      weathering: 0.45,
      grain: 0.55,
      notes: 'Kiln-fired Kurzeme clay brick with lime mortar joints.',
      source: 'deterministic',
    };
  }
  if (p.includes('stone') || p.includes('akmen') || p.includes('ruin') || p.includes('manor')) {
    return {
      name: 'Renda Fieldstone',
      pattern: 'fieldstone',
      primaryHex: '#7d7a72',
      secondaryHex: '#525049',
      accentHex: '#5a6b48',
      roughness: 0.9,
      metalness: 0.05,
      bumpScale: 0.12,
      repeatX: 2,
      repeatY: 2,
      weathering: 0.65,
      grain: 0.7,
      notes: 'Glacial erratic cobbles and limestone mortar with valley moss.',
      source: 'deterministic',
    };
  }
  if (p.includes('metal') || p.includes('tin') || p.includes('seam') || p.includes('zinc')) {
    return {
      name: 'Standing Seam Zinc',
      pattern: 'standing_seam',
      primaryHex: '#4f5d66',
      secondaryHex: '#354047',
      accentHex: '#7e8c94',
      roughness: 0.36,
      metalness: 0.68,
      bumpScale: 0.05,
      repeatX: 3,
      repeatY: 1,
      weathering: 0.25,
      grain: 0.2,
      notes: 'Painted Baltic standing-seam sheet roofing.',
      source: 'deterministic',
    };
  }
  if (p.includes('asphalt') || p.includes('road') || p.includes('tarmac')) {
    return {
      name: 'Country Asphalt',
      pattern: 'asphalt',
      primaryHex: '#404448',
      secondaryHex: '#585c60',
      accentHex: '#c8c3b4',
      roughness: 0.88,
      metalness: 0.02,
      bumpScale: 0.06,
      repeatX: 2,
      repeatY: 8,
      weathering: 0.5,
      grain: 0.75,
      notes: 'Fine-aggregate Latvian regional road surface.',
      source: 'deterministic',
    };
  }
  if (p.includes('gravel') || p.includes('dirt')) {
    return {
      name: 'Abava Crushed Gravel',
      pattern: 'gravel',
      primaryHex: '#8d806f',
      secondaryHex: '#63594c',
      accentHex: '#aba08e',
      roughness: 0.92,
      metalness: 0.02,
      bumpScale: 0.1,
      repeatX: 3,
      repeatY: 10,
      weathering: 0.5,
      grain: 0.8,
      notes: 'Compacted dolomite and river gravel track.',
      source: 'deterministic',
    };
  }
  if (p.includes('roof') || p.includes('tile') || p.includes('clay') || targetSurface === 'roof') {
    return {
      name: 'Terracotta Clay Tile',
      pattern: 'roof_tile',
      primaryHex: '#9c462f',
      secondaryHex: '#6e2e1f',
      accentHex: '#5a6e43',
      roughness: 0.78,
      metalness: 0.05,
      bumpScale: 0.09,
      repeatX: 3,
      repeatY: 3,
      weathering: 0.4,
      grain: 0.45,
      notes: 'Traditional Baltic terracotta roof tiles with subtle lichen.',
      source: 'deterministic',
    };
  }
  if (p.includes('plaster') || p.includes('stucco') || p.includes('white') || p.includes('church')) {
    return {
      name: 'Limewashed Plaster',
      pattern: 'plaster',
      primaryHex: '#eae3d2',
      secondaryHex: '#cfc4ad',
      accentHex: '#9d937e',
      roughness: 0.86,
      metalness: 0.02,
      bumpScale: 0.04,
      repeatX: 2,
      repeatY: 2,
      weathering: 0.3,
      grain: 0.45,
      notes: 'Warm limewash render typical of Courland churches and manors.',
      source: 'deterministic',
    };
  }
  return {
    name: 'Weathered Kurzeme Pine',
    pattern: 'moss_timber',
    primaryHex: '#9e7449',
    secondaryHex: '#6b4c2d',
    accentHex: '#4f623e',
    roughness: 0.82,
    metalness: 0.03,
    bumpScale: 0.07,
    repeatX: 2,
    repeatY: 2,
    weathering: 0.45,
    grain: 0.65,
    notes: 'Sun-aged Latvian horizontal timber cladding with valley patina.',
    source: 'deterministic',
  };
}

function deterministicBuildingDesignFallback(
  prompt: string,
  buildingName: string,
  hasImages: boolean,
  precisionMode: 'stylized' | 'precise' = 'stylized',
  levels = 1
) {
  const p = prompt.toLowerCase();
  const isModern =
    p.includes('modern') ||
    p.includes('nordic') ||
    p.includes('scandinavian') ||
    p.includes('minimal') ||
    p.includes('flat') ||
    p.includes('glass');
  const isCabin =
    p.includes('cabin') ||
    p.includes('log') ||
    p.includes('wood') ||
    p.includes('timber') ||
    p.includes('chalet');
  const isBrick = p.includes('brick') || p.includes('red') || p.includes('industrial');
  const isManor =
    p.includes('manor') ||
    p.includes('classic') ||
    p.includes('church') ||
    p.includes('lutheran') ||
    p.includes('white') ||
    p.includes('yellow') ||
    p.includes('plaster');
  const isGambrel = p.includes('barn') || p.includes('gambrel') || p.includes('dutch');

  const baseId = `ref_${Date.now()}`;
  const hexColor =
    p.includes('blue') || p.includes('teal')
      ? '#496c7a'
      : p.includes('yellow') || p.includes('ochre') || p.includes('cream')
        ? '#d9b56c'
        : p.includes('green') || p.includes('sage')
          ? '#657d62'
          : p.includes('black') || p.includes('charcoal') || p.includes('dark')
            ? '#3c4246'
            : p.includes('red')
              ? '#964736'
              : null;

  const hasShutters = p.includes('shutter') || (precisionMode === 'precise' && isCabin);
  const hasPaired = p.includes('pair') || p.includes('double') || (precisionMode === 'precise' && isManor);
  const hasBalcony = p.includes('balcony') || p.includes('terrace');
  const wantTwoStory = p.includes('2-story') || p.includes('two story') || p.includes('tall') || levels >= 2;

  if (isModern) {
    const isFlat = p.includes('flat');
    return {
      id: baseId,
      designName: precisionMode === 'precise' ? 'Precise Nordic Volume' : 'Nordic Indie Loft',
      precisionMode,
      architecturalStyle: 'modern_nordic',
      heightScale: wantTwoStory ? 1.32 : 1.12,
      widthScale: p.includes('wide') ? 1.18 : 1.0,
      depthScale: 1.0,
      floors: wantTwoStory ? 2 : 1,
      roofStyle: isFlat ? 'flat_modern' : 'steep_gable',
      roofPitch: isFlat ? 0.55 : 1.28,
      overhangScale: isFlat ? 1.04 : 1.1,
      addWindows: true,
      windowStyle: 'tall_minimal',
      windowPattern: p.includes('ribbon') ? 'ribbon' : 'paired',
      windowCols: 4,
      windowRows: wantTwoStory ? 2 : 1,
      windowWidthM: 1.32,
      windowHeightM: 1.95,
      windowMullions: 'vertical_split',
      addShutters: false,
      shutterHex: '#252b2e',
      windowFrameHex: '#252b2e',
      windowGlowHex: '#ffd796',
      addChimney: p.includes('chimney') || p.includes('flue'),
      chimneyCount: p.includes('chimney') || p.includes('flue') ? 1 : 0,
      chimneyStyle: 'metal_flue',
      addPorch: true,
      porchStyle: 'modern_canopy',
      doorPlacement: 'offset_front',
      doorStyle: 'glazed_modern',
      doorHex: '#23282b',
      addBalcony: hasBalcony || wantTwoStory,
      addDormers: false,
      dormerCount: 0,
      addTrim: true,
      trimStyle: 'corner_boards',
      trimHex: '#2c3336',
      addPlinth: true,
      plinthHeightM: 0.34,
      plinthHex: '#525659',
      addCornice: true,
      addGutters: !isFlat,
      addGableWindow: !isFlat,
      wallRecipe: {
        id: `${baseId}_wall`,
        name: 'Nordic Matte Timber',
        pattern: 'clapboard',
        primaryHex: hexColor || '#d7d1c5',
        secondaryHex: '#4f5659',
        accentHex: '#8d9699',
        roughness: 0.72,
        metalness: 0.04,
        bumpScale: 0.05,
        repeatX: 2.5,
        repeatY: 2.2,
        weathering: 0.12,
        grain: 0.3,
      },
      roofRecipe: {
        id: `${baseId}_roof`,
        name: 'Charcoal Standing Seam',
        pattern: 'standing_seam',
        primaryHex: '#353d42',
        secondaryHex: '#23292d',
        accentHex: '#5c6870',
        roughness: 0.34,
        metalness: 0.65,
        bumpScale: 0.05,
        repeatX: 4,
        repeatY: 1,
        weathering: 0.15,
        grain: 0.18,
      },
      designSummary: `Restyled ${buildingName} in ${precisionMode} mode with tall split-mullion glazing, architectural door placement, and ${hasImages ? 'reference-matched proportions' : 'nordic detailing'}.`,
      source: 'deterministic',
    };
  }

  if (isBrick) {
    return {
      id: baseId,
      designName: precisionMode === 'precise' ? 'Precise Brick Masonry' : 'Kurzeme Brick Homestead',
      precisionMode,
      architecturalStyle: 'brick_hall',
      heightScale: wantTwoStory ? 1.24 : 1.1,
      widthScale: 1.04,
      depthScale: 1.0,
      floors: wantTwoStory ? 2 : 1,
      roofStyle: isGambrel ? 'gambrel' : 'pitched_hip',
      roofPitch: 1.18,
      overhangScale: 1.09,
      addWindows: true,
      windowStyle: 'arched',
      windowPattern: hasPaired ? 'paired' : 'uniform',
      windowCols: 4,
      windowRows: wantTwoStory ? 2 : 1,
      windowWidthM: 1.02,
      windowHeightM: 1.42,
      windowMullions: 'six_pane',
      addShutters: hasShutters,
      shutterHex: '#3f5246',
      windowFrameHex: '#ede4d3',
      windowGlowHex: '#ffd085',
      addChimney: true,
      chimneyCount: 1,
      chimneyStyle: 'brick_stack',
      addPorch: true,
      porchStyle: 'steps_only',
      doorPlacement: 'center_front',
      doorStyle: 'arched_oak',
      doorHex: '#4a2e1e',
      addBalcony: hasBalcony,
      addDormers: true,
      dormerCount: 2,
      addTrim: true,
      trimStyle: 'stone_quoins',
      trimHex: '#dfd5c3',
      addPlinth: true,
      plinthHeightM: 0.56,
      plinthHex: '#66635c',
      addCornice: true,
      addGutters: true,
      addGableWindow: true,
      wallRecipe: {
        id: `${baseId}_wall`,
        name: 'Fired Kurzeme Brick',
        pattern: 'brick',
        primaryHex: hexColor || '#964736',
        secondaryHex: '#cbbba6',
        accentHex: '#632c20',
        roughness: 0.82,
        metalness: 0.04,
        bumpScale: 0.08,
        repeatX: 3,
        repeatY: 2.5,
        weathering: 0.32,
        grain: 0.45,
      },
      roofRecipe: {
        id: `${baseId}_roof`,
        name: 'Slate Roof Shingles',
        pattern: 'standing_seam',
        primaryHex: '#465259',
        secondaryHex: '#2f373c',
        accentHex: '#6a7982',
        roughness: 0.44,
        metalness: 0.48,
        bumpScale: 0.06,
        repeatX: 4,
        repeatY: 1,
        weathering: 0.24,
        grain: 0.25,
      },
      designSummary: `Rebuilt ${buildingName} with stone quoins, arched 6-pane windows, granite plinth, twin dormers, and a brick chimney.`,
      source: 'deterministic',
    };
  }

  if (isManor) {
    return {
      id: baseId,
      designName: precisionMode === 'precise' ? 'Precise Classical Manor' : 'Pastel Manor Facade',
      precisionMode,
      architecturalStyle: 'manor_classic',
      heightScale: 1.28,
      widthScale: 1.06,
      depthScale: 1.0,
      floors: 2,
      roofStyle: p.includes('gable') ? 'steep_gable' : 'mansard',
      roofPitch: 1.24,
      overhangScale: 1.11,
      addWindows: true,
      windowStyle: p.includes('church') || p.includes('arched') ? 'arched' : 'modern_panes',
      windowPattern: 'grouped_bays',
      windowCols: 6,
      windowRows: 2,
      windowWidthM: 1.08,
      windowHeightM: 1.56,
      windowMullions: 'six_pane',
      addShutters: hasShutters,
      shutterHex: '#4f6354',
      windowFrameHex: '#f5efe2',
      windowGlowHex: '#ffda94',
      addChimney: true,
      chimneyCount: 2,
      chimneyStyle: 'plastered_cap',
      addPorch: true,
      porchStyle: 'column_portico',
      doorPlacement: 'center_front',
      doorStyle: 'double_manor',
      doorHex: '#3e271a',
      addBalcony: hasBalcony,
      addDormers: true,
      dormerCount: 3,
      addTrim: true,
      trimStyle: 'pilasters',
      trimHex: '#f2eadb',
      addPlinth: true,
      plinthHeightM: 0.58,
      plinthHex: '#716c63',
      addCornice: true,
      addGutters: true,
      addGableWindow: true,
      wallRecipe: {
        id: `${baseId}_wall`,
        name: 'Warm Manor Stucco',
        pattern: 'plaster',
        primaryHex: hexColor || '#e2cfa3',
        secondaryHex: '#c8b384',
        accentHex: '#9e8b64',
        roughness: 0.8,
        metalness: 0.02,
        bumpScale: 0.04,
        repeatX: 2,
        repeatY: 2,
        weathering: 0.22,
        grain: 0.35,
      },
      roofRecipe: {
        id: `${baseId}_roof`,
        name: p.includes('burgundy') || p.includes('manor') ? 'Burgundy Manor Seam' : 'Terracotta Manor Tile',
        pattern: p.includes('burgundy') ? 'standing_seam' : 'roof_tile',
        primaryHex: p.includes('burgundy') ? '#7d2b2e' : '#9e4730',
        secondaryHex: p.includes('burgundy') ? '#541b1d' : '#6e2e1e',
        accentHex: '#5c6e45',
        roughness: p.includes('burgundy') ? 0.45 : 0.72,
        metalness: p.includes('burgundy') ? 0.38 : 0.05,
        bumpScale: 0.08,
        repeatX: 3,
        repeatY: 3,
        weathering: 0.24,
        grain: 0.35,
      },
      designSummary: `Adapted ${buildingName} in ${precisionMode} mode with classical pilasters, grouped 6-pane bays, double portico, cornice trim, and twin chimneys.`,
      source: 'deterministic',
    };
  }

  return {
    id: baseId,
    designName:
      precisionMode === 'precise'
        ? 'Precise Kurzeme Homestead'
        : isCabin
          ? 'Handcrafted Timber Cabin'
          : 'Indie Kurzeme Cottage',
    precisionMode,
    architecturalStyle: isCabin ? 'timber_cabin' : 'kurzeme_cottage',
    heightScale: wantTwoStory ? 1.24 : 1.04,
    widthScale: 1.0,
    depthScale: 1.0,
    floors: wantTwoStory ? 2 : 1,
    roofStyle: isGambrel ? 'gambrel' : 'steep_gable',
    roofPitch: 1.32,
    overhangScale: 1.14,
    addWindows: true,
    windowStyle: 'timber_framed',
    windowPattern: hasPaired ? 'paired' : 'uniform',
    windowCols: 3,
    windowRows: wantTwoStory ? 2 : 1,
    windowWidthM: 0.96,
    windowHeightM: 1.18,
    windowMullions: 'cross',
    addShutters: hasShutters,
    shutterHex: '#465d4e',
    windowFrameHex: '#f0e7d5',
    windowGlowHex: '#ffd487',
    addChimney: true,
    chimneyCount: 1,
    chimneyStyle: 'brick_stack',
    addPorch: true,
    porchStyle: 'timber_veranda',
    doorPlacement: 'center_front',
    doorStyle: 'single_panel',
    doorHex: '#5b3922',
    addBalcony: hasBalcony,
    addDormers: p.includes('dormer'),
    dormerCount: p.includes('dormer') ? 2 : 0,
    addTrim: true,
    trimStyle: 'corner_boards',
    trimHex: '#e8decb',
    addPlinth: true,
    plinthHeightM: 0.42,
    plinthHex: '#6c685f',
    addCornice: true,
    addGutters: true,
    addGableWindow: true,
    wallRecipe: {
      id: `${baseId}_wall`,
      name: 'Indie Honey Timber',
      pattern: 'clapboard',
      primaryHex: hexColor || '#bf8d54',
      secondaryHex: '#7d5630',
      accentHex: '#5a6e44',
      roughness: 0.76,
      metalness: 0.03,
      bumpScale: 0.07,
      repeatX: 2.4,
      repeatY: 2.2,
      weathering: 0.24,
      grain: 0.45,
    },
    roofRecipe: {
      id: `${baseId}_roof`,
      name: 'Indie Terracotta Tile',
      pattern: 'roof_tile',
      primaryHex: '#a34831',
      secondaryHex: '#732f1e',
      accentHex: '#5a6d43',
      roughness: 0.72,
      metalness: 0.05,
      bumpScale: 0.08,
      repeatX: 3,
      repeatY: 3,
      weathering: 0.25,
      grain: 0.4,
    },
    designSummary: `Restyled ${buildingName} with cross-mullion timber windows, stone plinth, eave gutters, gable window, and timber veranda.`,
    source: 'deterministic',
  };
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.post('/api/studio/synthesize-material', async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const targetSurface = typeof req.body?.targetSurface === 'string' ? req.body.targetSurface : 'wall';

    if (!prompt) {
      res.status(400).json({ error: 'Please describe the surface material to synthesize.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.json(deterministicFallback(prompt, targetSurface));
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Design a physically-based procedural texture recipe for a 3D model of Renda, Latvia (Kurzeme rural village architecture and roads).
Target surface: ${targetSurface}
User description: "${prompt}"
Return realistic, non-neon, grounded natural hex colors and PBR values.`,
        config: {
          systemInstruction:
            'You are a 3D architectural PBR material artist specializing in Baltic/Latvian rural architecture. Output concise, physically calibrated surface parameters.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: 'Short 2-4 word material title' },
              pattern: {
                type: Type.STRING,
                description:
                  'One of: clapboard, brick, plaster, roof_tile, standing_seam, fieldstone, gravel, asphalt, moss_timber',
              },
              primaryHex: { type: Type.STRING, description: 'Main surface #RRGGBB color' },
              secondaryHex: { type: Type.STRING, description: 'Groove, mortar, or plank variation #RRGGBB color' },
              accentHex: { type: Type.STRING, description: 'Weathering, lichen, or highlight #RRGGBB color' },
              roughness: { type: Type.NUMBER, description: 'PBR roughness 0.15 to 0.96' },
              metalness: { type: Type.NUMBER, description: 'PBR metalness 0.0 to 0.85' },
              bumpScale: { type: Type.NUMBER, description: 'Surface micro-relief 0.02 to 0.15' },
              repeatX: { type: Type.NUMBER, description: 'Horizontal UV tiling 1 to 6' },
              repeatY: { type: Type.NUMBER, description: 'Vertical UV tiling 1 to 10' },
              weathering: { type: Type.NUMBER, description: 'Age/moss factor 0.0 to 1.0' },
              grain: { type: Type.NUMBER, description: 'Fine noise grain 0.1 to 1.0' },
              notes: { type: Type.STRING, description: 'One brief architectural sentence' },
            },
            required: [
              'name',
              'pattern',
              'primaryHex',
              'secondaryHex',
              'accentHex',
              'roughness',
              'metalness',
              'bumpScale',
              'repeatX',
              'repeatY',
              'weathering',
              'grain',
              'notes',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<SynthesizedMaterial>;
      const validPatterns: MaterialPattern[] = [
        'clapboard',
        'brick',
        'plaster',
        'roof_tile',
        'standing_seam',
        'fieldstone',
        'gravel',
        'asphalt',
        'moss_timber',
      ];
      const pattern = validPatterns.includes(parsed.pattern as MaterialPattern)
        ? (parsed.pattern as MaterialPattern)
        : deterministicFallback(prompt, targetSurface).pattern;

      const clamp = (v: unknown, min: number, max: number, def: number) =>
        typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
      const hex = (v: unknown, def: string) =>
        typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : def;

      const result: SynthesizedMaterial = {
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 40) : 'Custom Material',
        pattern,
        primaryHex: hex(parsed.primaryHex, '#9e7449'),
        secondaryHex: hex(parsed.secondaryHex, '#6b4c2d'),
        accentHex: hex(parsed.accentHex, '#4f623e'),
        roughness: clamp(parsed.roughness, 0.15, 0.98, 0.8),
        metalness: clamp(parsed.metalness, 0, 0.9, 0.04),
        bumpScale: clamp(parsed.bumpScale, 0.01, 0.18, 0.07),
        repeatX: clamp(parsed.repeatX, 1, 8, 2),
        repeatY: clamp(parsed.repeatY, 1, 12, 2),
        weathering: clamp(parsed.weathering, 0, 1, 0.4),
        grain: clamp(parsed.grain, 0.05, 1, 0.5),
        notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 140) : 'Custom synthesized Kurzeme surface.',
        source: 'gemini',
      };

      res.json(result);
    } catch (err) {
      console.warn('Gemini synthesis fallback:', err instanceof Error ? err.message : err);
      res.json(deterministicFallback(prompt, targetSurface));
    }
  });

  app.post('/api/studio/restyle-from-reference', async (req, res) => {
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    const imagesRaw: unknown[] = Array.isArray(req.body?.images) ? req.body.images.slice(0, 3) : [];
    const precisionMode: 'stylized' | 'precise' =
      req.body?.precisionMode === 'precise' ? 'precise' : 'stylized';
    const buildingName =
      typeof req.body?.buildingContext?.name === 'string'
        ? req.body.buildingContext.name
        : 'Renda Building';
    const buildingKind =
      typeof req.body?.buildingContext?.kind === 'string'
        ? req.body.buildingContext.kind
        : 'house';
    const levels =
      typeof req.body?.buildingContext?.levels === 'number'
        ? req.body.buildingContext.levels
        : 1;
    const widthM =
      typeof req.body?.buildingContext?.widthM === 'number'
        ? req.body.buildingContext.widthM
        : 12;
    const depthM =
      typeof req.body?.buildingContext?.depthM === 'number'
        ? req.body.buildingContext.depthM
        : 8;

    const validImages: { mimeType: string; dataBase64: string }[] = imagesRaw
      .filter(
        (img: unknown): img is { mimeType: string; dataBase64: string } =>
          Boolean(
            img &&
              typeof img === 'object' &&
              typeof (img as { mimeType?: unknown }).mimeType === 'string' &&
              typeof (img as { dataBase64?: unknown }).dataBase64 === 'string' &&
              (img as { dataBase64: string }).dataBase64.length > 20
          )
      )
      .map((img: { mimeType: string; dataBase64: string }) => ({
        mimeType: img.mimeType.startsWith('image/') ? img.mimeType : 'image/jpeg',
        dataBase64: img.dataBase64.replace(/^data:image\/[^;]+;base64,/, ''),
      }));

    if (!prompt && validImages.length === 0) {
      res.status(400).json({ error: 'Upload at least one reference photo or enter a style prompt.' });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.json(
        deterministicBuildingDesignFallback(
          prompt,
          buildingName,
          validImages.length > 0,
          precisionMode,
          levels
        )
      );
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const imageParts = validImages.map((img) => ({
        inlineData: {
          mimeType: img.mimeType,
          data: img.dataBase64,
        },
      }));

      const instructionText =
        precisionMode === 'precise'
          ? `Perform a PRECISE ARCHITECTURAL AUDIT of the uploaded reference photo(s) and notes to faithfully reconstruct this 3D building in Renda, Latvia ("${buildingName}", kind: ${buildingKind}, current footprint: ${widthM}m × ${depthM}m, levels: ${levels}).
User prompt: "${prompt || 'Reconstruct this 3D building to accurately match the exact facade geometry, window grid, mullions, door style, roof silhouette, plinth, and trim seen in the photo.'}"

Do NOT just pick wall and roof colors — carefully inspect EVERY visible structural and decorative detail in the photo:
1. PROPORTIONS & MASSING: Count exact visible stories (floors 1..4), estimate wall height multiplier (heightScale 0.72..1.95), and compare building aspect ratio in photo against ${widthM}m × ${depthM}m to output accurate widthScale (0.7..1.6) and depthScale (0.7..1.6).
2. ROOF SILHOUETTE: Identify exact roof geometry (pitched_hip, steep_gable, flat_modern, mansard, or gambrel barn-roof), roof pitch steepness (roofPitch 0.45..1.95), eave overhang (overhangScale 1.0..1.26), attic gable window (addGableWindow), dormers count (0..4), and chimney count (0..2) + style (brick_stack, plastered_cap, metal_flue).
3. WINDOW PATTERNS & JOINERY: Count exact horizontal window bays per main facade (windowCols 1..8) and vertical rows (windowRows 1..4). Identify arrangement pattern (uniform, paired, grouped_bays, or ribbon), approximate real window width (windowWidthM 0.6..2.4m) & height (windowHeightM 0.7..2.6m), pane mullions (none, cross, six_pane, vertical_split), and whether exterior shutters (addShutters + shutterHex) exist.
4. DOORS, PORCHES & BALCONIES: Identify entrance placement (center_front, offset_front, side_wall, none), door design (single_panel, double_manor, glazed_modern, arched_oak) + doorHex, porch/canopy type (none, steps_only, column_portico, timber_veranda, modern_canopy), and upper balcony (addBalcony).
5. FOUNDATION & ARCHITECTURAL TRIM: Identify stone/concrete base plinth (addPlinth, plinthHeightM, plinthHex), corner trim style (none, corner_boards, stone_quoins, pilasters), horizontal eave cornice/frieze band (addCornice), and eave rain gutters/downspouts (addGutters).`
          : `Analyze the uploaded real-life reference photo(s) (if any) and user notes for this 3D building in Renda, Latvia ("${buildingName}", kind: ${buildingKind}, levels: ${levels}, ${widthM}m × ${depthM}m).
User prompt: "${prompt || 'Adapt this building to match the architectural silhouette, colors, and charm of the uploaded reference photo(s).'}"

Translate the real-life building reference into a COHESIVE, STYLIZED, MODERN POLISHED INDIE 3D GAME ASSET recipe while still capturing accurate roof shape, window count/pattern, mullions, door/porch style, plinth, and trim.`;

      const systemInstruction =
        precisionMode === 'precise'
          ? 'You are a senior architectural photogrammetry & procedural 3D building engineer. Inspect reference photos with extreme attention to small geometric details—story height, footprint ratio, roof silhouette, window bays/patterns/sizes/mullions, shutters, door placement/style, porch/balcony, plinth foundation, quoins/pilasters, cornice, gutters, chimneys, and dormers—and output calibrated structured JSON.'
          : 'You are a lead indie 3D environment & technical artist. Convert real-world architecture reference images and user prompts into structured procedural building geometry + PBR material parameters with crisp proportions and rich architectural trim.';

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [...imageParts, { text: instructionText }],
        },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              designName: { type: Type.STRING, description: 'Short 2-4 word building title' },
              architecturalStyle: {
                type: Type.STRING,
                description:
                  'One of: kurzeme_cottage, modern_nordic, manor_classic, timber_cabin, brick_hall, studio_loft',
              },
              heightScale: { type: Type.NUMBER, description: 'Wall height multiplier 0.72 to 1.95' },
              widthScale: { type: Type.NUMBER, description: 'Footprint primary length multiplier 0.7 to 1.6' },
              depthScale: { type: Type.NUMBER, description: 'Footprint depth multiplier 0.7 to 1.6' },
              floors: { type: Type.INTEGER, description: 'Visible building stories 1 to 4' },
              roofStyle: {
                type: Type.STRING,
                description: 'One of: pitched_hip, steep_gable, flat_modern, mansard, gambrel',
              },
              roofPitch: { type: Type.NUMBER, description: 'Roof height multiplier 0.45 to 1.95' },
              overhangScale: { type: Type.NUMBER, description: 'Eaves overhang multiplier 1.0 to 1.26' },
              addWindows: { type: Type.BOOLEAN },
              windowStyle: {
                type: Type.STRING,
                description: 'One of: arched, modern_panes, timber_framed, tall_minimal',
              },
              windowPattern: {
                type: Type.STRING,
                description: 'One of: uniform, paired, grouped_bays, ribbon',
              },
              windowCols: { type: Type.INTEGER, description: 'Windows per main facade row (1 to 8)' },
              windowRows: { type: Type.INTEGER, description: 'Vertical rows of windows (1 to 4)' },
              windowWidthM: { type: Type.NUMBER, description: 'Window width in meters 0.6 to 2.4' },
              windowHeightM: { type: Type.NUMBER, description: 'Window height in meters 0.7 to 2.6' },
              windowMullions: {
                type: Type.STRING,
                description: 'One of: none, cross, six_pane, vertical_split',
              },
              addShutters: { type: Type.BOOLEAN },
              shutterHex: { type: Type.STRING, description: '#RRGGBB window shutter color' },
              windowFrameHex: { type: Type.STRING, description: '#RRGGBB window frame trim color' },
              windowGlowHex: { type: Type.STRING, description: 'Warm or cool glass #RRGGBB color' },
              addChimney: { type: Type.BOOLEAN },
              chimneyCount: { type: Type.INTEGER, description: 'Number of roof chimneys 0 to 2' },
              chimneyStyle: {
                type: Type.STRING,
                description: 'One of: brick_stack, plastered_cap, metal_flue',
              },
              addPorch: { type: Type.BOOLEAN },
              porchStyle: {
                type: Type.STRING,
                description: 'One of: none, steps_only, column_portico, timber_veranda, modern_canopy',
              },
              doorPlacement: {
                type: Type.STRING,
                description: 'One of: center_front, offset_front, side_wall, none',
              },
              doorStyle: {
                type: Type.STRING,
                description: 'One of: single_panel, double_manor, glazed_modern, arched_oak',
              },
              doorHex: { type: Type.STRING, description: '#RRGGBB entrance door color' },
              addBalcony: { type: Type.BOOLEAN },
              addDormers: { type: Type.BOOLEAN },
              dormerCount: { type: Type.INTEGER, description: 'Number of roof dormers 0 to 4' },
              addTrim: { type: Type.BOOLEAN },
              trimStyle: {
                type: Type.STRING,
                description: 'One of: none, corner_boards, stone_quoins, pilasters',
              },
              trimHex: { type: Type.STRING, description: '#RRGGBB corner/fascia trim color' },
              addPlinth: { type: Type.BOOLEAN },
              plinthHeightM: { type: Type.NUMBER, description: 'Foundation plinth height 0.25 to 1.0m' },
              plinthHex: { type: Type.STRING, description: '#RRGGBB foundation plinth stone/concrete color' },
              addCornice: { type: Type.BOOLEAN },
              addGutters: { type: Type.BOOLEAN },
              addGableWindow: { type: Type.BOOLEAN },
              wallPattern: {
                type: Type.STRING,
                description: 'One of: clapboard, brick, plaster, fieldstone, moss_timber',
              },
              wallPrimaryHex: { type: Type.STRING },
              wallSecondaryHex: { type: Type.STRING },
              wallAccentHex: { type: Type.STRING },
              wallRoughness: { type: Type.NUMBER },
              roofPattern: {
                type: Type.STRING,
                description: 'One of: roof_tile, standing_seam, plaster',
              },
              roofPrimaryHex: { type: Type.STRING },
              roofSecondaryHex: { type: Type.STRING },
              roofAccentHex: { type: Type.STRING },
              roofRoughness: { type: Type.NUMBER },
              roofMetalness: { type: Type.NUMBER },
              designSummary: {
                type: Type.STRING,
                description: 'Concise 1-sentence summary of the extracted proportions, window pattern, roof, and trim.',
              },
            },
            required: [
              'designName',
              'architecturalStyle',
              'heightScale',
              'widthScale',
              'depthScale',
              'floors',
              'roofStyle',
              'roofPitch',
              'overhangScale',
              'addWindows',
              'windowStyle',
              'windowPattern',
              'windowCols',
              'windowRows',
              'windowWidthM',
              'windowHeightM',
              'windowMullions',
              'addShutters',
              'shutterHex',
              'windowFrameHex',
              'windowGlowHex',
              'addChimney',
              'chimneyCount',
              'chimneyStyle',
              'addPorch',
              'porchStyle',
              'doorPlacement',
              'doorStyle',
              'doorHex',
              'addBalcony',
              'addDormers',
              'dormerCount',
              'addTrim',
              'trimStyle',
              'trimHex',
              'addPlinth',
              'plinthHeightM',
              'plinthHex',
              'addCornice',
              'addGutters',
              'addGableWindow',
              'wallPattern',
              'wallPrimaryHex',
              'wallSecondaryHex',
              'wallAccentHex',
              'wallRoughness',
              'roofPattern',
              'roofPrimaryHex',
              'roofSecondaryHex',
              'roofAccentHex',
              'roofRoughness',
              'roofMetalness',
              'designSummary',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
      const fallback = deterministicBuildingDesignFallback(
        prompt,
        buildingName,
        validImages.length > 0,
        precisionMode,
        levels
      );
      const clamp = (v: unknown, min: number, max: number, def: number) =>
        typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
      const clampInt = (v: unknown, min: number, max: number, def: number) =>
        Math.round(clamp(v, min, max, def));
      const hex = (v: unknown, def: string) =>
        typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : def;
      const pick = <T extends string>(v: unknown, allowed: T[], def: T): T =>
        typeof v === 'string' && (allowed as string[]).includes(v) ? (v as T) : def;

      const chimneyCount = clampInt(
        parsed.chimneyCount,
        0,
        2,
        typeof parsed.addChimney === 'boolean' ? (parsed.addChimney ? 1 : 0) : fallback.chimneyCount
      );
      const dormerCount = clampInt(
        parsed.dormerCount,
        0,
        4,
        typeof parsed.addDormers === 'boolean' ? (parsed.addDormers ? 2 : 0) : fallback.dormerCount
      );
      const porchStyle = pick(
        parsed.porchStyle,
        ['none', 'steps_only', 'column_portico', 'timber_veranda', 'modern_canopy'],
        fallback.porchStyle as 'none'
      );
      const trimStyle = pick(
        parsed.trimStyle,
        ['none', 'corner_boards', 'stone_quoins', 'pilasters'],
        fallback.trimStyle as 'corner_boards'
      );

      const baseId = `ref_${Date.now()}`;
      const result = {
        id: baseId,
        designName:
          typeof parsed.designName === 'string' && parsed.designName.trim()
            ? parsed.designName.trim().slice(0, 42)
            : fallback.designName,
        precisionMode,
        architecturalStyle: pick(
          parsed.architecturalStyle,
          ['kurzeme_cottage', 'modern_nordic', 'manor_classic', 'timber_cabin', 'brick_hall', 'studio_loft'],
          fallback.architecturalStyle as 'kurzeme_cottage'
        ),
        heightScale: clamp(parsed.heightScale, 0.72, 1.95, fallback.heightScale),
        widthScale: clamp(parsed.widthScale, 0.7, 1.6, fallback.widthScale),
        depthScale: clamp(parsed.depthScale, 0.7, 1.6, fallback.depthScale),
        floors: clampInt(parsed.floors, 1, 4, fallback.floors),
        roofStyle: pick(
          parsed.roofStyle,
          ['pitched_hip', 'steep_gable', 'flat_modern', 'mansard', 'gambrel'],
          fallback.roofStyle as 'pitched_hip'
        ),
        roofPitch: clamp(parsed.roofPitch, 0.45, 1.95, fallback.roofPitch),
        overhangScale: clamp(parsed.overhangScale, 1.0, 1.26, fallback.overhangScale),
        addWindows: typeof parsed.addWindows === 'boolean' ? parsed.addWindows : true,
        windowStyle: pick(
          parsed.windowStyle,
          ['arched', 'modern_panes', 'timber_framed', 'tall_minimal'],
          fallback.windowStyle as 'timber_framed'
        ),
        windowPattern: pick(
          parsed.windowPattern,
          ['uniform', 'paired', 'grouped_bays', 'ribbon'],
          fallback.windowPattern as 'uniform'
        ),
        windowCols: clampInt(parsed.windowCols, 1, 8, fallback.windowCols),
        windowRows: clampInt(parsed.windowRows, 1, 4, fallback.windowRows),
        windowWidthM: clamp(parsed.windowWidthM, 0.6, 2.4, fallback.windowWidthM),
        windowHeightM: clamp(parsed.windowHeightM, 0.7, 2.6, fallback.windowHeightM),
        windowMullions: pick(
          parsed.windowMullions,
          ['none', 'cross', 'six_pane', 'vertical_split'],
          fallback.windowMullions as 'cross'
        ),
        addShutters: typeof parsed.addShutters === 'boolean' ? parsed.addShutters : fallback.addShutters,
        shutterHex: hex(parsed.shutterHex, fallback.shutterHex),
        windowFrameHex: hex(parsed.windowFrameHex, fallback.windowFrameHex),
        windowGlowHex: hex(parsed.windowGlowHex, fallback.windowGlowHex),
        addChimney: chimneyCount > 0,
        chimneyCount,
        chimneyStyle: pick(
          parsed.chimneyStyle,
          ['brick_stack', 'plastered_cap', 'metal_flue'],
          fallback.chimneyStyle as 'brick_stack'
        ),
        addPorch: porchStyle !== 'none',
        porchStyle,
        doorPlacement: pick(
          parsed.doorPlacement,
          ['center_front', 'offset_front', 'side_wall', 'none'],
          fallback.doorPlacement as 'center_front'
        ),
        doorStyle: pick(
          parsed.doorStyle,
          ['single_panel', 'double_manor', 'glazed_modern', 'arched_oak'],
          fallback.doorStyle as 'single_panel'
        ),
        doorHex: hex(parsed.doorHex, fallback.doorHex),
        addBalcony: typeof parsed.addBalcony === 'boolean' ? parsed.addBalcony : fallback.addBalcony,
        addDormers: dormerCount > 0,
        dormerCount,
        addTrim: trimStyle !== 'none',
        trimStyle,
        trimHex: hex(parsed.trimHex, fallback.trimHex),
        addPlinth: typeof parsed.addPlinth === 'boolean' ? parsed.addPlinth : fallback.addPlinth,
        plinthHeightM: clamp(parsed.plinthHeightM, 0.25, 1.0, fallback.plinthHeightM),
        plinthHex: hex(parsed.plinthHex, fallback.plinthHex),
        addCornice: typeof parsed.addCornice === 'boolean' ? parsed.addCornice : fallback.addCornice,
        addGutters: typeof parsed.addGutters === 'boolean' ? parsed.addGutters : fallback.addGutters,
        addGableWindow:
          typeof parsed.addGableWindow === 'boolean' ? parsed.addGableWindow : fallback.addGableWindow,
        wallRecipe: {
          id: `${baseId}_wall`,
          name: 'Reference Facade',
          pattern: pick(
            parsed.wallPattern,
            ['clapboard', 'brick', 'plaster', 'fieldstone', 'moss_timber'],
            fallback.wallRecipe.pattern as MaterialPattern
          ),
          primaryHex: hex(parsed.wallPrimaryHex, fallback.wallRecipe.primaryHex),
          secondaryHex: hex(parsed.wallSecondaryHex, fallback.wallRecipe.secondaryHex),
          accentHex: hex(parsed.wallAccentHex, fallback.wallRecipe.accentHex),
          roughness: clamp(parsed.wallRoughness, 0.25, 0.95, 0.78),
          metalness: 0.03,
          bumpScale: 0.06,
          repeatX: 2.5,
          repeatY: 2.2,
          weathering: 0.22,
          grain: 0.42,
        },
        roofRecipe: {
          id: `${baseId}_roof`,
          name: 'Reference Roof',
          pattern: pick(
            parsed.roofPattern,
            ['roof_tile', 'standing_seam', 'plaster'],
            fallback.roofRecipe.pattern as MaterialPattern
          ),
          primaryHex: hex(parsed.roofPrimaryHex, fallback.roofRecipe.primaryHex),
          secondaryHex: hex(parsed.roofSecondaryHex, fallback.roofRecipe.secondaryHex),
          accentHex: hex(parsed.roofAccentHex, fallback.roofRecipe.accentHex),
          roughness: clamp(parsed.roofRoughness, 0.25, 0.92, 0.65),
          metalness: clamp(parsed.roofMetalness, 0, 0.72, 0.15),
          bumpScale: 0.07,
          repeatX: 3.2,
          repeatY: 2.4,
          weathering: 0.2,
          grain: 0.35,
        },
        designSummary:
          typeof parsed.designSummary === 'string' && parsed.designSummary.trim()
            ? (() => {
                const s = parsed.designSummary.trim();
                if (s.length <= 260) return s;
                const cut = s.slice(0, 257);
                const lastSpace = cut.lastIndexOf(' ');
                return `${(lastSpace > 180 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:]+$/, '')}…`;
              })()
            : fallback.designSummary,
        source: 'gemini',
      };

      res.json(result);
    } catch (err) {
      console.warn('Gemini reference restyle fallback:', err instanceof Error ? err.message : err);
      res.json(
        deterministicBuildingDesignFallback(
          prompt,
          buildingName,
          validImages.length > 0,
          precisionMode,
          levels
        )
      );
    }
  });

  let viteServer: Awaited<ReturnType<typeof import('vite')['createServer']>> | null = null;

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const disableHmr = process.env.DISABLE_HMR === 'true';
    viteServer = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: !disableHmr,
        ws: disableHmr ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, HOST, () => {
    console.log(`Renda 3D server listening on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    httpServer.close();
    if (viteServer) {
      await viteServer.close();
    }
    process.exit(0);
  };
  process.once('SIGTERM', () => {
    void shutdown();
  });
  process.once('SIGINT', () => {
    void shutdown();
  });
}

createServer().catch((err) => {
  console.error('Failed to start Renda 3D server:', err);
  process.exit(1);
});
