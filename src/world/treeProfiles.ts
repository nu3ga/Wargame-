import {
  createKurzemeEzTreeOptions,
  type KurzemeEzTreeConfig,
  type TreeSpecies,
} from './foliageOverhaul';

export const LATVIAN_TREE_SPECIES = [
  'pine', 'spruce', 'birch', 'oak', 'alder', 'aspen', 'linden', 'ash',
] as const;

export type LatvianTreeSpecies = typeof LATVIAN_TREE_SPECIES[number];
export type TreeHabitat = 'woodland' | 'riparian' | 'park';

interface BotanicalProfile {
  name: string;
  family: TreeSpecies;
  bark: 'pine' | 'willow' | 'birch' | 'oak';
  barkTint: number;
}

export const LATVIAN_TREE_PROFILES: Record<LatvianTreeSpecies, BotanicalProfile> = {
  pine: { name: 'Scots pine', family: 'pine', bark: 'pine', barkTint: 0xffffff },
  spruce: { name: 'Norway spruce', family: 'spruce', bark: 'willow', barkTint: 0xe2e3dd },
  birch: { name: 'Silver birch', family: 'birch', bark: 'birch', barkTint: 0xffffff },
  oak: { name: 'Pedunculate oak', family: 'oak', bark: 'oak', barkTint: 0xf0eee6 },
  alder: { name: 'Black alder', family: 'oak', bark: 'willow', barkTint: 0xb7bdb1 },
  aspen: { name: 'European aspen', family: 'birch', bark: 'birch', barkTint: 0xc9d0b7 },
  linden: { name: 'Small-leaved linden', family: 'oak', bark: 'oak', barkTint: 0xe4e4d7 },
  ash: { name: 'European ash', family: 'oak', bark: 'willow', barkTint: 0xe1e3d9 },
};

/** Preserve measured conifer families; diversify broadleaf stands by habitat. */
export function chooseLatvianTreeSpecies(
  family: TreeSpecies,
  x: number,
  z: number,
  habitat: TreeHabitat,
): LatvianTreeSpecies {
  if (family === 'pine' || family === 'spruce') return family;
  const raw = Math.sin(Math.floor(x / 3) * 71.17 + Math.floor(z / 3) * 119.53) * 43758.5453;
  const choice = raw - Math.floor(raw);
  if (habitat === 'riparian') {
    if (choice < (family === 'birch' ? 0.62 : 0.4)) return 'alder';
    if (choice < 0.78) return family === 'birch' ? 'aspen' : 'ash';
  } else if (habitat === 'park') {
    if (choice < (family === 'oak' ? 0.42 : 0.2)) return 'linden';
    if (choice < 0.65) return 'ash';
  } else if (family === 'birch' && choice < 0.27) {
    return 'aspen';
  } else if (family === 'oak' && choice < 0.16) {
    return 'ash';
  }
  return family;
}

/** Species differ in branch architecture and age, rather than only leaf tint. */
export function createLatvianTreeOptions(
  species: LatvianTreeSpecies,
  variant: 0 | 1,
  lod: 'near' | 'far',
): KurzemeEzTreeConfig {
  const profile = LATVIAN_TREE_PROFILES[species];
  const options = createKurzemeEzTreeOptions(profile.family, variant, lod);
  const near = lod === 'near';
  options.seed += LATVIAN_TREE_SPECIES.indexOf(species) * 137;

  if (species === 'pine' && variant === 1) {
    // Old Scots pines retain a high, broad, asymmetric crown over a bare stem.
    options.branch.start[1] = 0.58;
    options.branch.angle[1] = 85;
    options.branch.length[1] = 27.5;
    options.branch.children[0] = 10;
    options.branch.gnarliness[0] = 0.075;
  } else if (species === 'spruce') {
    // Finer, overlapping needle sprays follow the tapering boughs; huge round
    // leaf cards would turn the distinct whorls into disconnected green balls.
    options.leaves.size = near ? 2.8 : 4.2;
    options.leaves.count = near ? 20 : 16;
    options.leaves.angle = 42;
    if (variant === 1) {
      options.branch.start[1] = 0.06;
      options.branch.length[0] = 62;
      options.branch.length[1] = 24;
      options.branch.children[0] = near ? 16 : 20;
      options.branch.angle[1] = 102;
    }
  } else if (species === 'alder') {
    // Low forking wet-bank alder, compact rounded crown and dark corrugated bark.
    options.branch.length = { 0: 48, 1: 20, 2: 11, 3: 5.4 };
    options.branch.radius = { 0: 1.15, 1: 0.64, 2: 0.6, 3: 0.7 };
    options.branch.start = { 1: variant === 0 ? 0.15 : 0.21, 2: 0.08, 3: 0.05 };
    options.branch.angle = { 1: variant === 0 ? 37 : 45, 2: 50, 3: 38 };
    options.branch.children = { 0: near ? 11 : 10, 1: near ? 6 : 4, 2: near ? 2 : 0 };
    options.branch.force.strength = 0.022;
    options.leaves.count = near ? 20 : 15;
    options.leaves.size = near ? 3.8 : 5.8;
  } else if (species === 'aspen') {
    // A clear central leader and tall narrow crown distinguish aspen from birch.
    options.branch.length = { 0: 72, 1: 16.5, 2: 9.5, 3: 4.8 };
    options.branch.radius = { 0: 0.95, 1: 0.5, 2: 0.56, 3: 0.56 };
    options.branch.start = { 1: 0.38 + variant * 0.06, 2: 0.14, 3: 0.08 };
    options.branch.angle = { 1: 43 + variant * 7, 2: 37, 3: 33 };
    options.branch.force.strength = 0.035;
    options.branch.gnarliness = { 0: 0.025, 1: 0.05, 2: 0.08, 3: 0.05 };
    options.leaves.count = near ? 20 : 14;
    options.leaves.size = near ? 3.5 : 5.4;
  } else if (species === 'linden') {
    // Park lindens form a broad domed crown with a low skirt of fine branches.
    options.branch.length = { 0: 50, 1: 25, 2: 14, 3: 7 };
    options.branch.radius = { 0: 1.85, 1: 0.6, 2: 0.62, 3: 0.66 };
    options.branch.start = { 1: variant === 0 ? 0.23 : 0.3, 2: 0.06, 3: 0.02 };
    options.branch.angle = { 1: 61, 2: 47, 3: 35 };
    options.branch.children = { 0: near ? 12 : 10, 1: near ? 7 : 4, 2: near ? 2 : 0 };
    options.branch.force.strength = 0.006;
    options.leaves.count = near ? 22 : 16;
    options.leaves.size = near ? 4.0 : 6.2;
  } else if (species === 'ash') {
    // Airier upward forks, longer clear stem and compound leaf sprays.
    options.branch.length = { 0: 65, 1: 23, 2: 14, 3: 7.5 };
    options.branch.radius = { 0: 1.35, 1: 0.6, 2: 0.58, 3: 0.6 };
    options.branch.start = { 1: 0.39, 2: 0.12, 3: 0.05 };
    options.branch.angle = { 1: 48 + variant * 8, 2: 40, 3: 35 };
    options.branch.children = { 0: near ? 9 : 8, 1: near ? 6 : 4, 2: near ? 2 : 0 };
    options.branch.force.strength = 0.025;
    options.leaves.count = near ? 20 : 14;
    options.leaves.size = near ? 3.65 : 5.7;
  }
  return options;
}
