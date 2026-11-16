export type PropDistanceCategory = 'detail' | 'furniture' | 'large';

export interface PropTierRule {
  maxDrawDistM: number;
  shadowDistM: number;
  fadeStartM: number;
}

export interface TreeThreeTierPartition {
  nearIndices: number[];
  farIndices: number[];
  culledCount: number;
}

export interface CellCoordDist {
  cx: number;
  cz: number;
  key: string;
  distSq: number;
}

export interface DistanceFilteredItem {
  index: number;
  fadeScale: number;
}

export const DEFAULT_GRASS_STREAM_INNER_M = 54;
export const DEFAULT_GRASS_STREAM_OUTER_M = 114;
export const DEFAULT_TREE_NEAR_M = 135;
export const DEFAULT_TREE_MAX_DRAW_M = 940;

/**
 * Returns draw-distance, fade-start, and shadow cutoff distances for non-vegetation props
 * so high-detail clutter is crisp up close without wasting draw calls across the 2.3km valley.
 */
export function computePropTierRule(category: PropDistanceCategory): PropTierRule {
  if (category === 'detail') {
    return { maxDrawDistM: 175, shadowDistM: 75, fadeStartM: 145 };
  }
  if (category === 'furniture') {
    return { maxDrawDistM: 280, shadowDistM: 110, fadeStartM: 235 };
  }
  return { maxDrawDistM: 490, shadowDistM: 150, fadeStartM: 420 };
}

/**
 * Smooth cubic distance-fade multiplier [0..1] used to scale grass blades & detail clutter
 * smoothly down into the terrain before hitting cullDistM.
 */
export function computeDrawDistanceFade(
  distM: number,
  fadeStartM: number,
  cullDistM: number
): number {
  if (distM <= fadeStartM) return 1;
  if (distM >= cullDistM || cullDistM <= fadeStartM) return 0;
  const t = 1 - (distM - fadeStartM) / (cullDistM - fadeStartM);
  return t * t * (3 - 2 * t);
}

/**
 * Partitions tree world XZ coordinates into:
 * - nearIndices (<= nearRadiusM): dense multi-tier branch + fine leaf cards
 * - farIndices (nearRadiusM..maxDrawRadiusM): mid/far crown silhouette
 * - culledCount (> maxDrawRadiusM): skipped beyond dense valley fog
 */
export function partitionTreeInstancesByDistance3Tier(
  positionsXZ: ReadonlyArray<{ x: number; z: number }>,
  camX: number,
  camZ: number,
  nearRadiusM = DEFAULT_TREE_NEAR_M,
  maxDrawRadiusM = DEFAULT_TREE_MAX_DRAW_M
): TreeThreeTierPartition {
  const nearR2 = nearRadiusM * nearRadiusM;
  const maxR2 = maxDrawRadiusM * maxDrawRadiusM;
  const nearIndices: number[] = [];
  const farIndices: number[] = [];
  let culledCount = 0;

  for (let i = 0; i < positionsXZ.length; i++) {
    const dx = positionsXZ[i].x - camX;
    const dz = positionsXZ[i].z - camZ;
    const d2 = dx * dx + dz * dz;
    if (d2 <= nearR2) {
      nearIndices.push(i);
    } else if (d2 <= maxR2) {
      farIndices.push(i);
    } else {
      culledCount++;
    }
  }

  return { nearIndices, farIndices, culledCount };
}

/**
 * Collects square spatial grid cells intersecting a circle of radiusM around (camX, camZ),
 * ordered nearest-first so inner rings always win instance capacity caps.
 */
export function collectCellCoordsInRadius(
  camX: number,
  camZ: number,
  cellSizeM: number,
  radiusM: number
): CellCoordDist[] {
  const minCx = Math.floor((camX - radiusM) / cellSizeM);
  const maxCx = Math.floor((camX + radiusM) / cellSizeM);
  const minCz = Math.floor((camZ - radiusM) / cellSizeM);
  const maxCz = Math.floor((camZ + radiusM) / cellSizeM);
  const maxReach = radiusM + cellSizeM * 0.72;
  const maxReachSq = maxReach * maxReach;

  const cells: CellCoordDist[] = [];
  for (let cz = minCz; cz <= maxCz; cz++) {
    const centerZ = (cz + 0.5) * cellSizeM;
    const dz = centerZ - camZ;
    for (let cx = minCx; cx <= maxCx; cx++) {
      const centerX = (cx + 0.5) * cellSizeM;
      const dx = centerX - camX;
      const distSq = dx * dx + dz * dz;
      if (distSq <= maxReachSq) {
        cells.push({ cx, cz, key: `${cx},${cz}`, distSq });
      }
    }
  }

  cells.sort((a, b) => a.distSq - b.distSq);
  return cells;
}

/**
 * Filters a list of positioned items against maxDrawDistM and computes smooth scale fade near the boundary.
 */
export function filterInstancesByDrawDistance(
  positionsXZ: ReadonlyArray<{ x: number; z: number }>,
  camX: number,
  camZ: number,
  maxDrawDistM: number,
  fadeStartRatio = 0.8
): DistanceFilteredItem[] {
  const maxR2 = maxDrawDistM * maxDrawDistM;
  const fadeStartM = maxDrawDistM * Math.max(0.1, Math.min(0.98, fadeStartRatio));
  const out: DistanceFilteredItem[] = [];

  for (let i = 0; i < positionsXZ.length; i++) {
    const dx = positionsXZ[i].x - camX;
    const dz = positionsXZ[i].z - camZ;
    const d2 = dx * dx + dz * dz;
    if (d2 > maxR2) continue;
    const dist = Math.sqrt(d2);
    const fadeScale = computeDrawDistanceFade(dist, fadeStartM, maxDrawDistM);
    if (fadeScale > 0.02) {
      out.push({ index: i, fadeScale });
    }
  }
  return out;
}
