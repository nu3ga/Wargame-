import type {
  AtmospherePreset,
  BuildingData,
  BuildingDesignRecipe,
  ChimneyStyle,
  CourierMission,
  DoorPlacement,
  DoorStyle,
  LandmarkData,
  PorchStyle,
  PrecisionMode,
  RendaWorldDataset,
  TrimStyle,
  WaterwayData,
  WindowMullionStyle,
  WindowPattern,
} from './types';

export interface BuildingCollider {
  id: number;
  cx: number;
  cz: number;
  radius: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function groundHeightAt(world: RendaWorldDataset, x: number, z: number): number {
  const { halfW, halfH, gridX, gridZ } = world.meta;
  const u = Math.max(0, Math.min(1, (x + halfW) / (halfW * 2))) * (gridX - 1);
  const v = Math.max(0, Math.min(1, (z + halfH) / (halfH * 2))) * (gridZ - 1);
  const ix = Math.min(gridX - 2, Math.floor(u));
  const iz = Math.min(gridZ - 2, Math.floor(v));
  const fx = u - ix;
  const fz = v - iz;
  const h00 = world.heights[iz * gridX + ix] ?? 0;
  const h10 = world.heights[iz * gridX + ix + 1] ?? 0;
  const h01 = world.heights[(iz + 1) * gridX + ix] ?? 0;
  const h11 = world.heights[(iz + 1) * gridX + ix + 1] ?? 0;
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}

export function computePolygonCentroid(ring: [number, number][]): {
  cx: number;
  cz: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  radius: number;
} {
  if (ring.length === 0) {
    return { cx: 0, cz: 0, minX: 0, maxX: 0, minZ: 0, maxZ: 0, radius: 1 };
  }
  let sx = 0;
  let sz = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const [x, z] of ring) {
    sx += x;
    sz += z;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const cx = sx / ring.length;
  const cz = sz / ring.length;
  let maxR = 1;
  for (const [x, z] of ring) {
    const d = Math.hypot(x - cx, z - cz);
    if (d > maxR) maxR = d;
  }
  return { cx, cz, minX, maxX, minZ, maxZ, radius: maxR };
}

export function buildBuildingColliders(buildings: BuildingData[]): BuildingCollider[] {
  return buildings.map((b) => {
    const c = computePolygonCentroid(b.ring);
    return {
      id: b.id,
      cx: c.cx,
      cz: c.cz,
      radius: c.radius,
      minX: c.minX,
      maxX: c.maxX,
      minZ: c.minZ,
      maxZ: c.maxZ,
    };
  });
}

export function resolveBuildingCollisions(
  x: number,
  z: number,
  actorRadius: number,
  colliders: BuildingCollider[],
  pad = 0.6
): { x: number; z: number; collided: boolean } {
  let nx = x;
  let nz = z;
  let collided = false;

  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    // Fast radial reject
    const dxCenter = nx - b.cx;
    const dzCenter = nz - b.cz;
    const maxReach = b.radius + actorRadius + pad + 1;
    if (dxCenter * dxCenter + dzCenter * dzCenter > maxReach * maxReach) continue;

    // Clamped AABB push-out
    const closestX = Math.max(b.minX - pad, Math.min(b.maxX + pad, nx));
    const closestZ = Math.max(b.minZ - pad, Math.min(b.maxZ + pad, nz));
    const dx = nx - closestX;
    const dz = nz - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < actorRadius * actorRadius) {
      collided = true;
      const dist = Math.sqrt(distSq);
      if (dist > 0.0001) {
        const push = actorRadius - dist;
        nx += (dx / dist) * push;
        nz += (dz / dist) * push;
      } else {
        // Inside AABB: push toward nearest edge
        const toLeft = Math.abs(nx - (b.minX - pad));
        const toRight = Math.abs(b.maxX + pad - nx);
        const toTop = Math.abs(nz - (b.minZ - pad));
        const toBot = Math.abs(b.maxZ + pad - nz);
        const m = Math.min(toLeft, toRight, toTop, toBot);
        if (m === toLeft) nx = b.minX - pad - actorRadius;
        else if (m === toRight) nx = b.maxX + pad + actorRadius;
        else if (m === toTop) nz = b.minZ - pad - actorRadius;
        else nz = b.maxZ + pad + actorRadius;
      }
    }
  }

  return { x: nx, z: nz, collided };
}

export function clampToPlayableBounds(
  world: RendaWorldDataset,
  x: number,
  z: number,
  margin = 35
): { x: number; z: number } {
  const maxX = world.meta.halfW - margin;
  const maxZ = world.meta.halfH - margin;
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    z: Math.max(-maxZ, Math.min(maxZ, z)),
  };
}

export function findNearestRiverPoint(
  waterways: WaterwayData[],
  x: number,
  z: number
): { x: number; z: number; distance: number; riverName: string; width: number } | null {
  let best: { x: number; z: number; distance: number; riverName: string; width: number } | null = null;
  for (const ww of waterways) {
    if (ww.kind !== 'river') continue;
    for (let i = 0; i < ww.pts.length; i++) {
      const [px, pz] = ww.pts[i];
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.distance) {
        best = { x: px, z: pz, distance: d, riverName: ww.name, width: ww.width };
      }
    }
  }
  return best;
}

export function findNearestLandmark(
  landmarks: LandmarkData[],
  x: number,
  z: number
): { landmark: LandmarkData; distanceM: number } | null {
  let best: { landmark: LandmarkData; distanceM: number } | null = null;
  for (const lm of landmarks) {
    const d = Math.hypot(x - lm.x, z - lm.z);
    if (!best || d < best.distanceM) {
      best = { landmark: lm, distanceM: d };
    }
  }
  return best;
}

export function checkLandmarkDiscoveries(
  landmarks: LandmarkData[],
  discoveredIds: string[],
  x: number,
  z: number,
  radiusM = 48
): LandmarkData[] {
  const newlyDiscovered: LandmarkData[] = [];
  const existing = new Set(discoveredIds);
  for (const lm of landmarks) {
    if (existing.has(lm.id)) continue;
    if (Math.hypot(x - lm.x, z - lm.z) <= radiusM) {
      newlyDiscovered.push(lm);
    }
  }
  return newlyDiscovered;
}

const CARGO_ITEMS = [
  'Fresh Rye Bread & Honey',
  'Parish Archive Letters',
  'Abava Honey Jars',
  'Courland Birch Timber',
  'Vini Curlandia Crates',
  'Village Mail Pouch',
];

export function createNextCourierMission(
  landmarks: LandmarkData[],
  playerX: number,
  playerZ: number,
  completedCount: number,
  excludeId?: string
): CourierMission {
  const candidates = landmarks.filter((lm) => lm.id !== excludeId);
  // Pick a landmark at a rewarding medium-to-long distance (>= 160m if possible)
  const sorted = [...candidates].sort((a, b) => {
    const da = Math.hypot(a.x - playerX, a.z - playerZ);
    const db = Math.hypot(b.x - playerX, b.z - playerZ);
    return da - db;
  });
  const farEnough = sorted.filter((lm) => Math.hypot(lm.x - playerX, lm.z - playerZ) >= 160);
  const pool = farEnough.length > 0 ? farEnough : sorted;
  const target = pool[completedCount % pool.length] ?? landmarks[0];
  const dist = Math.round(Math.hypot(target.x - playerX, target.z - playerZ));
  const rewardScore = Math.max(150, Math.round(dist * 0.65 / 10) * 10);

  return {
    id: `mission_${completedCount + 1}_${target.id}`,
    pickupName: 'Renda Village Dispatch',
    targetLandmarkId: target.id,
    targetName: target.name,
    targetX: target.x,
    targetZ: target.z,
    cargoLabel: CARGO_ITEMS[completedCount % CARGO_ITEMS.length],
    distanceMeters: dist,
    rewardScore,
  };
}

export function formatLatLon(
  world: RendaWorldDataset,
  x: number,
  z: number
): { lat: number; lon: number } {
  const metersPerLat = 111320;
  const metersPerLon = 111320 * Math.cos((world.meta.centerLat * Math.PI) / 180);
  return {
    lat: +(world.meta.centerLat - z / metersPerLat).toFixed(5),
    lon: +(world.meta.centerLon + x / metersPerLon).toFixed(5),
  };
}

export interface WallSegmentInfo {
  midX: number;
  midZ: number;
  length: number;
  normalX: number;
  normalZ: number;
  yaw: number;
}

/**
 * Extracts outward-facing wall segments for a building footprint ring in local
 * coordinates around `(cx, cz)`. Used to place stylized indie windows, trim,
 * and porches flush along real OSM polygon edges.
 */
export function computeWallSegments(
  ring: [number, number][],
  cx: number,
  cz: number
): WallSegmentInfo[] {
  if (ring.length < 3) return [];
  const local = ring.map(([rx, rz]) => [rx - cx, rz - cz] as [number, number]);

  // Signed area in XZ to ensure consistent outward normals
  let signedArea = 0;
  for (let i = 0; i < local.length; i++) {
    const [x0, z0] = local[i];
    const [x1, z1] = local[(i + 1) % local.length];
    signedArea += x0 * z1 - x1 * z0;
  }
  const pts = signedArea < 0 ? [...local].reverse() : local;

  const segments: WallSegmentInfo[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1.2) continue;

    // Candidate outward normal (perpendicular to edge)
    let nx = dz / len;
    let nz = -dx / len;
    const mx = (x0 + x1) * 0.5;
    const mz = (z0 + z1) * 0.5;
    // Flip if pointing inward toward centroid (0, 0)
    if (mx * nx + mz * nz < 0) {
      nx = -nx;
      nz = -nz;
    }

    segments.push({
      midX: mx,
      midZ: mz,
      length: len,
      normalX: nx,
      normalZ: nz,
      yaw: Math.atan2(nx, nz),
    });
  }

  return segments;
}

/**
 * Converts virtual thumbstick pixel offset into normalized turning & throttle
 * commands `[-1..1]` with radial deadzone so gentle rests don't drift.
 */
export function computeTouchStickVector(
  dx: number,
  dy: number,
  maxRadius: number,
  deadzone = 0.14
): { turn: number; throttle: number; clampedX: number; clampedY: number } {
  const r = Math.max(1, maxRadius);
  const dist = Math.hypot(dx, dy);
  const scale = dist > r ? r / dist : 1;
  const clampedX = dx * scale;
  const clampedY = dy * scale;
  const normMag = Math.min(1, dist / r);

  if (normMag <= deadzone) {
    return { turn: 0, throttle: 0, clampedX, clampedY };
  }

  const effective = (normMag - deadzone) / (1 - deadzone);
  const ux = dist > 0 ? clampedX / dist : 0;
  const uy = dist > 0 ? clampedY / dist : 0;

  return {
    // Dragging stick left (ux < 0) turns left (+turn), dragging up (uy < 0) moves forward (+throttle)
    turn: Math.max(-1, Math.min(1, -ux * effective)),
    throttle: Math.max(-1, Math.min(1, -uy * effective)),
    clampedX,
    clampedY,
  };
}

function pointInRing(x: number, z: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    const intersect =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(
  x: number,
  z: number,
  ring: [number, number][],
  holes?: [number, number][][]
): boolean {
  if (ring.length < 3 || !pointInRing(x, z, ring)) return false;
  if (holes) {
    for (const h of holes) {
      if (h.length >= 3 && pointInRing(x, z, h)) return false;
    }
  }
  return true;
}

export interface OrientedBounds {
  angle: number;
  lengthU: number;
  widthV: number;
  centerX: number;
  centerZ: number;
}

/**
 * Computes the dominant edge orientation and tight Oriented Bounding Box (OBB)
 * of a building polygon in XZ coordinates. Ensures rotated real-life buildings
 * (such as Renda Lutheran Church) match their exact OSM orientation and size.
 */
export function computePrimaryAxisAndBounds(ring: [number, number][]): OrientedBounds {
  if (ring.length < 3) {
    return { angle: 0, lengthU: 10, widthV: 10, centerX: 0, centerZ: 0 };
  }

  // Weight orientation angles (mod PI) by edge length squared to find primary architectural axis
  let sumSin = 0;
  let sumCos = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i];
    const [x1, z1] = ring[(i + 1) % ring.length];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.8) continue;
    const a = Math.atan2(dz, dx);
    // Double angle mod PI/2 so orthogonal building walls reinforce the same orientation
    const w = len * len;
    sumCos += Math.cos(4 * a) * w;
    sumSin += Math.sin(4 * a) * w;
  }

  let bestAngle = Math.atan2(sumSin, sumCos) * 0.25;

  const project = (ang: number) => {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [x, z] of ring) {
      const u = x * ca + z * sa;
      const v = -x * sa + z * ca;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    return {
      minU,
      maxU,
      minV,
      maxV,
      lenU: maxU - minU,
      lenV: maxV - minV,
    };
  };

  let p = project(bestAngle);
  // Ensure U axis is the longer building axis
  if (p.lenV > p.lenU) {
    bestAngle += Math.PI * 0.5;
    p = project(bestAngle);
  }
  // Normalize angle to [-PI/2, PI/2]
  while (bestAngle > Math.PI * 0.5) bestAngle -= Math.PI;
  while (bestAngle < -Math.PI * 0.5) bestAngle += Math.PI;
  p = project(bestAngle);

  const ca = Math.cos(bestAngle);
  const sa = Math.sin(bestAngle);
  const cu = (p.minU + p.maxU) * 0.5;
  const cv = (p.minV + p.maxV) * 0.5;

  return {
    angle: bestAngle,
    lengthU: p.lenU,
    widthV: p.lenV,
    centerX: cu * ca - cv * sa,
    centerZ: cu * sa + cv * ca,
  };
}

/**
 * Computes a clean CCW outer ring and inward-inset ring for an arbitrary N-gon
 * roof footprint so L-shaped, U-shaped, and multi-wing buildings (like Lielrenda
 * Manor or Vīgneri Culture House) receive crisp hipped/mansard roofs without cones.
 */
export function computeInsetPolygon(
  localPts: [number, number][],
  targetInset: number
): { outer: [number, number][]; inset: [number, number][] } | null {
  // Remove near-duplicate vertices
  const cleaned: [number, number][] = [];
  for (const pt of localPts) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 0.35) {
      cleaned.push([pt[0], pt[1]]);
    }
  }
  if (
    cleaned.length > 3 &&
    Math.hypot(cleaned[0][0] - cleaned[cleaned.length - 1][0], cleaned[0][1] - cleaned[cleaned.length - 1][1]) <= 0.35
  ) {
    cleaned.pop();
  }
  if (cleaned.length < 3) return null;

  // Ensure CCW winding in XZ (signedArea > 0 => inward normal is (-dz, dx))
  let area = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const [x0, z0] = cleaned[i];
    const [x1, z1] = cleaned[(i + 1) % cleaned.length];
    area += x0 * z1 - x1 * z0;
  }
  if (Math.abs(area) < 1.0) return null;
  const outer = area < 0 ? [...cleaned].reverse() : cleaned;
  const n = outer.length;

  const normals: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const [x0, z0] = outer[i];
    const [x1, z1] = outer[(i + 1) % n];
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    normals.push([-dz / len, dx / len]);
  }

  const inset: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const prevIdx = (i - 1 + n) % n;
    const [n0x, n0z] = normals[prevIdx];
    const [n1x, n1z] = normals[i];

    // Miter normal = normalize(n0 + n1), scaled by 1 / dot(miter, n1)
    let mx = n0x + n1x;
    let mz = n0z + n1z;
    const mLen = Math.hypot(mx, mz);
    if (mLen < 0.05) {
      inset.push([outer[i][0] + n1x * targetInset, outer[i][1] + n1z * targetInset]);
      continue;
    }
    mx /= mLen;
    mz /= mLen;
    const cosHalf = mx * n1x + mz * n1z;
    const miterScale = Math.min(2.2, 1 / Math.max(0.35, cosHalf));
    const step = targetInset * miterScale;
    inset.push([outer[i][0] + mx * step, outer[i][1] + mz * step]);
  }

  // Validate inset polygon preserves positive signed area and doesn't invert edges
  let insetArea = 0;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = inset[i];
    const [x1, z1] = inset[(i + 1) % n];
    insetArea += x0 * z1 - x1 * z0;

    const ox = outer[(i + 1) % n][0] - outer[i][0];
    const oz = outer[(i + 1) % n][1] - outer[i][1];
    const ix = x1 - x0;
    const iz = z1 - z0;
    if (ox * ix + oz * iz < -0.5) return null;
  }
  if (insetArea <= 0.5) return null;

  return { outer, inset };
}

/**
 * Estimates surface slope magnitude (rise / run = hypot(dz/dx, dh/dz)) from the
 * terrain heightfield grid so steep Abava & Ivande valley cliffs can reveal stone bluffs.
 */
export function computeTerrainSlope(world: RendaWorldDataset, x: number, z: number): number {
  const step = 3.5;
  const hx0 = groundHeightAt(world, x - step, z);
  const hx1 = groundHeightAt(world, x + step, z);
  const hz0 = groundHeightAt(world, x, z - step);
  const hz1 = groundHeightAt(world, x, z + step);
  const dx = (hx1 - hx0) / (step * 2);
  const dz = (hz1 - hz0) / (step * 2);
  return Math.hypot(dx, dz);
}

export interface WaterwayFlowInfo {
  yaw: number;
  closestX: number;
  closestZ: number;
  upstreamElev: number;
  downstreamElev: number;
  dropM: number;
  riverName: string;
}

/**
 * Computes downstream orientation and local LiDAR surface drop along the closest
 * waterway segment to (x, z), used to align waterfalls & rapids to real channels.
 */
export function computeWaterwayFlowAtPoint(
  world: RendaWorldDataset,
  x: number,
  z: number
): WaterwayFlowInfo | null {
  let bestDistSq = Infinity;
  let bestResult: WaterwayFlowInfo | null = null;

  for (const ww of world.waterways) {
    if (ww.pts.length < 2) continue;
    for (let i = 0; i < ww.pts.length - 1; i++) {
      const [ax, az] = ww.pts[i];
      const [bx, bz] = ww.pts[i + 1];
      const vx = bx - ax;
      const vz = bz - az;
      const lenSq = vx * vx + vz * vz;
      if (lenSq < 0.01) continue;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / lenSq));
      const cx = ax + t * vx;
      const cz = az + t * vz;
      const dSq = (x - cx) * (x - cx) + (z - cz) * (z - cz);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        const eStart = ww.elevs?.[Math.max(0, i - 1)] ?? groundHeightAt(world, ax, az);
        const eEnd = ww.elevs?.[Math.min(ww.pts.length - 1, i + 1)] ?? groundHeightAt(world, bx, bz);
        // Ensure yaw points in the downhill direction
        const downhill = eStart >= eEnd;
        const dx = downhill ? vx : -vx;
        const dz = downhill ? vz : -vz;
        const up = Math.max(eStart, eEnd);
        const down = Math.min(eStart, eEnd);
        bestResult = {
          yaw: Math.atan2(dx, dz),
          closestX: cx,
          closestZ: cz,
          upstreamElev: up,
          downstreamElev: down,
          dropM: +(up - down).toFixed(2),
          riverName: ww.name,
        };
      }
    }
  }

  return bestResult;
}

export interface GableRidgePlan {
  ridgeA: [number, number];
  ridgeB: [number, number];
  eaveEndA: [[number, number], [number, number]];
  eaveEndB: [[number, number], [number, number]];
  ptsCCW: [number, number][];
}

/**
 * Computes exact gable ridge & triangular end-wall coordinates for 4-corner
 * buildings (or 5-corner near-rectangular rings with one collinear node) in local XZ.
 */
export function computeGableRidgePlan(
  localPts: [number, number][],
  ridgeFactor = 1.0
): GableRidgePlan | null {
  if (localPts.length < 4) return null;

  // Simplify near-collinear edges on 5-6 vertex OSM rectangles
  let pts: [number, number][] = localPts.map(([x, z]) => [x, z]);
  if (pts.length > 4 && pts.length <= 6) {
    const simplified: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const curr = pts[i];
      const next = pts[(i + 1) % pts.length];
      const v1x = curr[0] - prev[0];
      const v1z = curr[1] - prev[1];
      const v2x = next[0] - curr[0];
      const v2z = next[1] - curr[1];
      const l1 = Math.hypot(v1x, v1z);
      const l2 = Math.hypot(v2x, v2z);
      if (l1 < 0.4 || l2 < 0.4) continue;
      const dot = (v1x * v2x + v1z * v2z) / (l1 * l2);
      if (dot < 0.985) simplified.push(curr);
    }
    if (simplified.length === 4) pts = simplified;
  }
  if (pts.length !== 4) return null;

  let signedArea = 0;
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % 4];
    signedArea += x0 * z1 - x1 * z0;
  }
  const ptsCCW = signedArea < 0 ? [...pts].reverse() : pts;

  const d01 = Math.hypot(ptsCCW[1][0] - ptsCCW[0][0], ptsCCW[1][1] - ptsCCW[0][1]);
  const d12 = Math.hypot(ptsCCW[2][0] - ptsCCW[1][0], ptsCCW[2][1] - ptsCCW[1][1]);

  let rawA: [number, number];
  let rawB: [number, number];
  let eaveEndA: [[number, number], [number, number]];
  let eaveEndB: [[number, number], [number, number]];

  if (d01 >= d12) {
    rawA = [(ptsCCW[0][0] + ptsCCW[3][0]) * 0.5, (ptsCCW[0][1] + ptsCCW[3][1]) * 0.5];
    rawB = [(ptsCCW[1][0] + ptsCCW[2][0]) * 0.5, (ptsCCW[1][1] + ptsCCW[2][1]) * 0.5];
    eaveEndA = [ptsCCW[3], ptsCCW[0]];
    eaveEndB = [ptsCCW[1], ptsCCW[2]];
  } else {
    rawA = [(ptsCCW[0][0] + ptsCCW[1][0]) * 0.5, (ptsCCW[0][1] + ptsCCW[1][1]) * 0.5];
    rawB = [(ptsCCW[2][0] + ptsCCW[3][0]) * 0.5, (ptsCCW[2][1] + ptsCCW[3][1]) * 0.5];
    eaveEndA = [ptsCCW[0], ptsCCW[1]];
    eaveEndB = [ptsCCW[2], ptsCCW[3]];
  }

  return {
    ridgeA: [rawA[0] * ridgeFactor, rawA[1] * ridgeFactor],
    ridgeB: [rawB[0] * ridgeFactor, rawB[1] * ridgeFactor],
    eaveEndA,
    eaveEndB,
    ptsCCW,
  };
}

/**
 * Converts local stick / WASD inputs (strafeRight in [-1..1], forward in [-1..1])
 * into world-space XZ movement aligned with the third-person camera yaw.
 */
export function computeCameraRelativeMoveVector(
  strafeRight: number,
  forward: number,
  camYaw: number
): { moveX: number; moveZ: number; magnitude: number; targetHeading: number } {
  const magRaw = Math.hypot(strafeRight, forward);
  if (magRaw < 0.001) {
    return { moveX: 0, moveZ: 0, magnitude: 0, targetHeading: camYaw };
  }
  const scale = magRaw > 1 ? 1 / magRaw : 1;
  const sr = strafeRight * scale;
  const fw = forward * scale;

  // Camera forward = (sin(camYaw), cos(camYaw)); screen-right = (-cos(camYaw), sin(camYaw))
  const sinY = Math.sin(camYaw);
  const cosY = Math.cos(camYaw);
  const moveX = sinY * fw - cosY * sr;
  const moveZ = cosY * fw + sinY * sr;
  const magnitude = Math.min(1, magRaw);
  return {
    moveX,
    moveZ,
    magnitude,
    targetHeading: Math.atan2(moveX, moveZ),
  };
}

/**
 * Interpolates between two heading angles (radians) along the shortest circular arc.
 */
export function shortestAngleLerp(current: number, target: number, alpha: number): number {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + diff * Math.max(0, Math.min(1, alpha));
}

/**
 * Converts a Three.js camera yaw (where +Z is yaw=0 and -Z is North) into
 * standard 0..360 compass bearing degrees (0=North, 90=East, 180=South, 270=West).
 */
export function computeCompassBearingDeg(camYaw: number): number {
  const fx = Math.sin(camYaw);
  const fz = Math.cos(camYaw);
  const rad = Math.atan2(fx, -fz);
  return ((rad * 180) / Math.PI + 360) % 360;
}

/**
 * Scales a building footprint polygon around `(cx, cz)` along its OBB primary
 * (length/width) and secondary (depth) axes so rotated buildings stretch cleanly
 * without diagonal skew.
 */
export function scaleFootprintRingAlongAxes(
  ring: [number, number][],
  cx: number,
  cz: number,
  widthScale = 1,
  depthScale = 1
): [number, number][] {
  if (ring.length < 3) return ring.map(([x, z]) => [x, z]);
  const ws = Math.max(0.65, Math.min(1.75, Number.isFinite(widthScale) ? widthScale : 1));
  const ds = Math.max(0.65, Math.min(1.75, Number.isFinite(depthScale) ? depthScale : 1));
  if (Math.abs(ws - 1) < 0.005 && Math.abs(ds - 1) < 0.005) {
    return ring.map(([x, z]) => [x, z]);
  }
  const obb = computePrimaryAxisAndBounds(ring);
  const ca = Math.cos(obb.angle);
  const sa = Math.sin(obb.angle);

  return ring.map(([x, z]) => {
    const dx = x - cx;
    const dz = z - cz;
    const u = (dx * ca + dz * sa) * ws;
    const v = (-dx * sa + dz * ca) * ds;
    return [cx + u * ca - v * sa, cz + u * sa + v * ca];
  });
}

/**
 * Computes horizontal tangent offsets (in meters from wall midpoint `0`) for windows
 * along a facade segment, supporting uniform, paired, grouped bays, and ribbon patterns
 * while preventing corner overlap and leaving clear room for doors.
 */
export function computeFacadeWindowPositions(
  segLength: number,
  requestedCols: number,
  pattern: WindowPattern,
  winW: number,
  doorExclusion?: { center: number; halfWidth: number } | null
): number[] {
  const safeWinW = Math.max(0.45, Math.min(2.6, winW));
  const margin = Math.max(0.65, safeWinW * 0.65 + 0.25);
  const usableSpan = segLength - margin * 2;
  if (usableSpan < safeWinW * 0.85) return [];

  const maxFit = Math.max(1, Math.floor((usableSpan + 0.25) / (safeWinW + 0.22)));
  const count = Math.max(1, Math.min(maxFit, Math.round(requestedCols)));
  const rawOffsets: number[] = [];

  if (pattern === 'ribbon') {
    const step = Math.min(usableSpan / Math.max(1, count), safeWinW * 1.06);
    const total = (count - 1) * step;
    for (let i = 0; i < count; i++) {
      rawOffsets.push(-total * 0.5 + i * step);
    }
  } else if (pattern === 'paired' && count >= 2) {
    const pairStep = safeWinW * 1.16;
    const pairCount = Math.floor(count / 2);
    const hasOdd = count % 2 === 1;
    const groupCenters = hasOdd ? pairCount + 1 : pairCount;
    const groupSpan = Math.min(usableSpan - pairStep, Math.max(0, usableSpan * 0.88));
    for (let g = 0; g < groupCenters; g++) {
      const center = groupCenters === 1 ? 0 : (g / (groupCenters - 1) - 0.5) * groupSpan;
      if (hasOdd && g === Math.floor(groupCenters / 2)) {
        rawOffsets.push(center);
      } else {
        rawOffsets.push(center - pairStep * 0.5, center + pairStep * 0.5);
      }
    }
  } else if (pattern === 'grouped_bays' && count >= 3) {
    const clusterSpan = usableSpan * 0.72;
    for (let i = 0; i < count; i++) {
      rawOffsets.push((i / (count - 1) - 0.5) * clusterSpan);
    }
  } else {
    if (count === 1) {
      rawOffsets.push(0);
    } else {
      for (let i = 0; i < count; i++) {
        rawOffsets.push((i / (count - 1) - 0.5) * usableSpan);
      }
    }
  }

  const maxBound = segLength * 0.5 - safeWinW * 0.5 - 0.28;
  return rawOffsets
    .map((pos) => Math.max(-maxBound, Math.min(maxBound, pos)))
    .filter((pos) => {
      if (!doorExclusion) return true;
      return Math.abs(pos - doorExclusion.center) >= doorExclusion.halfWidth + safeWinW * 0.52;
    });
}

export interface NormalizedBuildingDesign extends BuildingDesignRecipe {
  precisionMode: PrecisionMode;
  widthScale: number;
  depthScale: number;
  floors: number;
  windowPattern: WindowPattern;
  windowCols: number;
  windowRows: number;
  windowWidthM: number;
  windowHeightM: number;
  windowMullions: WindowMullionStyle;
  addShutters: boolean;
  shutterHex: string;
  chimneyCount: number;
  chimneyStyle: ChimneyStyle;
  porchStyle: PorchStyle;
  doorPlacement: DoorPlacement;
  doorStyle: DoorStyle;
  doorHex: string;
  addBalcony: boolean;
  dormerCount: number;
  trimStyle: TrimStyle;
  addPlinth: boolean;
  plinthHeightM: number;
  plinthHex: string;
  addCornice: boolean;
  addGutters: boolean;
  addGableWindow: boolean;
}

const clampNum = (v: unknown, min: number, max: number, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;

export function normalizeBuildingDesign(
  design: BuildingDesignRecipe,
  baseLevels = 1
): NormalizedBuildingDesign {
  const isManor = design.architecturalStyle === 'manor_classic';
  const isModern = design.architecturalStyle === 'modern_nordic' || design.architecturalStyle === 'studio_loft';
  const isBrick = design.architecturalStyle === 'brick_hall';

  const floors = Math.round(
    clampNum(design.floors, 1, 4, design.heightScale >= 1.45 ? Math.max(2, baseLevels) : Math.max(1, baseLevels))
  );
  const windowRows = Math.round(clampNum(design.windowRows, 1, 4, floors));
  const windowCols = Math.round(clampNum(design.windowCols, 1, 8, isManor ? 5 : isModern ? 4 : 3));

  const windowPattern: WindowPattern =
    design.windowPattern ??
    (isModern ? 'ribbon' : isManor ? 'grouped_bays' : 'uniform');

  const windowMullions: WindowMullionStyle =
    design.windowMullions ??
    (design.windowStyle === 'tall_minimal'
      ? 'vertical_split'
      : design.windowStyle === 'arched' || design.windowStyle === 'modern_panes'
        ? 'six_pane'
        : 'cross');

  const porchStyle: PorchStyle =
    design.porchStyle ??
    (!design.addPorch
      ? 'none'
      : isModern
        ? 'modern_canopy'
        : isManor
          ? 'column_portico'
          : 'timber_veranda');

  const doorPlacement: DoorPlacement = design.doorPlacement ?? (design.addPorch ? 'center_front' : 'offset_front');
  const doorStyle: DoorStyle =
    design.doorStyle ??
    (isManor ? 'double_manor' : isModern ? 'glazed_modern' : isBrick ? 'arched_oak' : 'single_panel');

  const trimStyle: TrimStyle =
    design.trimStyle ??
    (!design.addTrim
      ? 'none'
      : isManor
        ? 'pilasters'
        : isBrick
          ? 'stone_quoins'
          : 'corner_boards');

  const chimneyCount =
    typeof design.chimneyCount === 'number'
      ? Math.round(clampNum(design.chimneyCount, 0, 2, 1))
      : design.addChimney
        ? isManor
          ? 2
          : 1
        : 0;

  const dormerCount =
    typeof design.dormerCount === 'number'
      ? Math.round(clampNum(design.dormerCount, 0, 4, 1))
      : design.addDormers
        ? 2
        : 0;

  const chimneyStyle: ChimneyStyle =
    design.chimneyStyle ??
    (isModern ? 'metal_flue' : isManor ? 'plastered_cap' : 'brick_stack');

  return {
    ...design,
    precisionMode: design.precisionMode ?? 'stylized',
    heightScale: clampNum(design.heightScale, 0.72, 2.1, 1),
    widthScale: clampNum(design.widthScale, 0.65, 1.75, 1),
    depthScale: clampNum(design.depthScale, 0.65, 1.75, 1),
    floors,
    roofPitch: clampNum(design.roofPitch, 0.4, 2.1, 1.15),
    overhangScale: clampNum(design.overhangScale, 1.0, 1.3, 1.08),
    windowPattern,
    windowCols,
    windowRows,
    windowWidthM: clampNum(design.windowWidthM, 0.55, 2.5, isModern ? 1.3 : 0.96),
    windowHeightM: clampNum(design.windowHeightM, 0.65, 2.8, isModern ? 1.85 : isManor ? 1.38 : 1.15),
    windowMullions,
    addShutters: design.addShutters ?? false,
    shutterHex: design.shutterHex || design.roofRecipe.primaryHex || '#495e52',
    addChimney: chimneyCount > 0,
    chimneyCount,
    chimneyStyle,
    addPorch: porchStyle !== 'none',
    porchStyle,
    doorPlacement,
    doorStyle,
    doorHex: design.doorHex || '#4b3121',
    addBalcony: design.addBalcony ?? false,
    addDormers: dormerCount > 0,
    dormerCount,
    addTrim: trimStyle !== 'none',
    trimStyle,
    addPlinth: design.addPlinth ?? true,
    plinthHeightM: clampNum(design.plinthHeightM, 0.22, 1.1, isManor || isBrick ? 0.52 : 0.36),
    plinthHex: design.plinthHex || '#66635d',
    addCornice: design.addCornice ?? (design.addTrim || isManor),
    addGutters: design.addGutters ?? (design.roofStyle !== 'flat_modern'),
    addGableWindow: design.addGableWindow ?? (design.roofStyle === 'steep_gable' || design.roofStyle === 'gambrel'),
  };
}

/**
 * Snaps a directional shadow frustum target to discrete texel increments so
 * shadows do not swim/shimmer as the camera or player moves.
 */
export function snapShadowCenter(
  x: number,
  z: number,
  frustumHalfExtent: number,
  shadowMapSize: number
): { x: number; z: number } {
  const safeSize = Math.max(64, shadowMapSize);
  const texelWorld = (frustumHalfExtent * 2) / safeSize;
  return {
    x: Math.round(x / texelWorld) * texelWorld,
    z: Math.round(z / texelWorld) * texelWorld,
  };
}

export interface FlyoverAnchor {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
}

/**
 * Computes a smooth closed cinematic flyover camera position and look-at target
 * sweeping around Renda landmarks (Church -> Bridge -> Manor -> Valley).
 */
export function computeTitleFlyoverPose(
  phaseAngle: number,
  anchors: FlyoverAnchor[]
): { camX: number; camY: number; camZ: number; lookX: number; lookY: number; lookZ: number } {
  if (anchors.length === 0) {
    return { camX: 0, camY: 45, camZ: 120, lookX: 0, lookY: 8, lookZ: 0 };
  }
  if (anchors.length === 1) {
    const a = anchors[0];
    return {
      camX: a.x + Math.cos(phaseAngle) * a.radius,
      camY: a.y + a.height,
      camZ: a.z + Math.sin(phaseAngle) * a.radius,
      lookX: a.x,
      lookY: a.y + 8,
      lookZ: a.z,
    };
  }

  // Advance across anchor tour every ~2PI / anchors.length radians with smooth cosine easing
  const norm = (((phaseAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
  const scaled = norm * anchors.length;
  const idx0 = Math.floor(scaled) % anchors.length;
  const idx1 = (idx0 + 1) % anchors.length;
  const frac = scaled - Math.floor(scaled);
  const ease = 0.5 - 0.5 * Math.cos(frac * Math.PI);

  const a0 = anchors[idx0];
  const a1 = anchors[idx1];
  const lookX = a0.x + (a1.x - a0.x) * ease;
  const lookY = a0.y + (a1.y - a0.y) * ease + 8;
  const lookZ = a0.z + (a1.z - a0.z) * ease;
  const radius = a0.radius + (a1.radius - a0.radius) * ease;
  const height = a0.height + (a1.height - a0.height) * ease + Math.sin(phaseAngle * 2) * 4.5;

  return {
    camX: lookX + Math.cos(phaseAngle) * radius,
    camY: lookY - 8 + height,
    camZ: lookZ + Math.sin(phaseAngle) * radius,
    lookX,
    lookY,
    lookZ,
  };
}

export interface FpsWeaponSpringState {
  recoilPitch: number;
  recoilYaw: number;
  recoilKickZ: number;
  recoilPitchVel: number;
  recoilYawVel: number;
  recoilKickZVel: number;
  adsAlpha: number;
  swayX: number;
  swayY: number;
  bobPhase: number;
  leanAngle: number;
  crouchBlend: number;
}

export function createInitialFpsWeaponState(): FpsWeaponSpringState {
  return {
    recoilPitch: 0,
    recoilYaw: 0,
    recoilKickZ: 0,
    recoilPitchVel: 0,
    recoilYawVel: 0,
    recoilKickZVel: 0,
    adsAlpha: 0,
    swayX: 0,
    swayY: 0,
    bobPhase: 0,
    leanAngle: 0,
    crouchBlend: 0,
  };
}

/**
 * Computes realistic tactical infantry speed in m/s factoring walk, sprint,
 * crouch stealth, and ADS precision penalties.
 */
export function computeFpsMoveSpeed(
  sprinting: boolean,
  crouching: boolean,
  adsAlpha: number,
  stamina: number
): number {
  const baseWalk = 4.65;
  const sprintMax = 8.45;
  const crouchSpd = 2.65;
  if (crouching) {
    return crouchSpd * (1 - adsAlpha * 0.25);
  }
  const canSprint = sprinting && stamina > 0.05 && adsAlpha < 0.25;
  const raw = canSprint ? sprintMax : baseWalk;
  return raw * (1 - adsAlpha * 0.42);
}

/**
 * Applies ballistic recoil impulse (pitch climb, slight horizontal dispersion,
 * rearward bolt kick) damped cleanly when aiming down the EOTech optic.
 */
export function applyFpsRecoilImpulse(
  state: FpsWeaponSpringState,
  adsAlpha: number,
  jitterSeed: number
): FpsWeaponSpringState {
  const adsScale = 1 - adsAlpha * 0.45;
  const lateral = Math.sin(jitterSeed * 12.9898) * 0.012 * adsScale;
  return {
    ...state,
    recoilPitchVel: state.recoilPitchVel + 0.34 * adsScale,
    recoilYawVel: state.recoilYawVel + lateral * 20,
    recoilKickZVel: state.recoilKickZVel + 0.48 * adsScale,
  };
}

/**
 * Advances FPS weapon springs, ADS interpolation, lean roll, crouch eye offset,
 * and figure-8 tactical movement bob in pure deterministic math.
 */
export function stepFpsWeaponPhysics(
  state: FpsWeaponSpringState,
  dt: number,
  opts: {
    aiming: boolean;
    crouching: boolean;
    leanInput: number; // -1 left, 0 center, +1 right
    speedMs: number;
    grounded: boolean;
    lookDeltaX: number;
    lookDeltaY: number;
  }
): FpsWeaponSpringState {
  const safeDt = Math.min(0.05, Math.max(0.0001, dt));
  const adsTarget = opts.aiming ? 1 : 0;
  const adsRate = opts.aiming ? 20.0 : 12.0;
  const adsAlpha = state.adsAlpha + (adsTarget - state.adsAlpha) * (1 - Math.exp(-adsRate * safeDt));

  const crouchTarget = opts.crouching ? 1 : 0;
  const crouchBlend = state.crouchBlend + (crouchTarget - state.crouchBlend) * (1 - Math.exp(-11 * safeDt));

  const leanTarget = Math.max(-1, Math.min(1, opts.leanInput)) * 0.22;
  const leanAngle = state.leanAngle + (leanTarget - state.leanAngle) * (1 - Math.exp(-12 * safeDt));

  // Critically-damped style recoil spring recovery
  const k = 155;
  const damp = 21;
  const pitchAcc = -k * state.recoilPitch - damp * state.recoilPitchVel;
  const yawAcc = -k * state.recoilYaw - damp * state.recoilYawVel;
  const kickAcc = -195 * state.recoilKickZ - 24 * state.recoilKickZVel;

  const recoilPitchVel = state.recoilPitchVel + pitchAcc * safeDt;
  const recoilYawVel = state.recoilYawVel + yawAcc * safeDt;
  const recoilKickZVel = state.recoilKickZVel + kickAcc * safeDt;

  const recoilPitch = Math.max(-0.08, Math.min(0.24, state.recoilPitch + recoilPitchVel * safeDt));
  const recoilYaw = Math.max(-0.09, Math.min(0.09, state.recoilYaw + recoilYawVel * safeDt));
  const recoilKickZ = Math.max(-0.01, Math.min(0.09, state.recoilKickZ + recoilKickZVel * safeDt));

  const speedFactor = opts.grounded ? Math.min(1.4, opts.speedMs / 4.8) : 0.12;
  const bobFreq = 8.2 + speedFactor * 3.4;
  const bobPhase = state.bobPhase + safeDt * (opts.speedMs > 0.25 ? bobFreq : 1.6);

  const dampMouse = 1 - Math.exp(-14 * safeDt);
  const targetSwayX = Math.max(-0.025, Math.min(0.025, -opts.lookDeltaX * 0.00055)) * (1 - adsAlpha * 0.72);
  const targetSwayY = Math.max(-0.022, Math.min(0.022, opts.lookDeltaY * 0.0005)) * (1 - adsAlpha * 0.72);
  const swayX = state.swayX + (targetSwayX - state.swayX) * dampMouse;
  const swayY = state.swayY + (targetSwayY - state.swayY) * dampMouse;

  return {
    recoilPitch,
    recoilYaw,
    recoilKickZ,
    recoilPitchVel,
    recoilYawVel,
    recoilKickZVel,
    adsAlpha,
    swayX,
    swayY,
    bobPhase,
    leanAngle,
    crouchBlend,
  };
}

/**
 * Computes responsive tactical FOV across hipfire, sprint, and holographic ADS.
 */
export function computeFpsCameraFov(adsAlpha: number, sprinting: boolean, speedMs: number): number {
  const sprintBoost = sprinting && speedMs > 4.8 ? Math.min(4.5, (speedMs - 4.8) * 1.15) : 0;
  const baseFov = 66 + sprintBoost;
  const adsFov = 46;
  return baseFov + (adsFov - baseFov) * Math.max(0, Math.min(1, adsAlpha));
}

export interface CompassTick {
  deg: number;
  label: string;
  isCardinal: boolean;
  offsetDeg: number; // -halfWindow .. +halfWindow
}

const CARDINAL_LABELS: Record<number, string> = {
  0: 'N',
  45: 'NE',
  90: 'E',
  135: 'SE',
  180: 'S',
  225: 'SW',
  270: 'W',
  315: 'NW',
};

/**
 * Returns crisp AAA top-bar compass ticks centered around the current camera bearing.
 */
export function computeCompassTicks(centerBearingDeg: number, halfSpanDeg = 72): CompassTick[] {
  const normCenter = ((centerBearingDeg % 360) + 360) % 360;
  const ticks: CompassTick[] = [];
  for (let d = 0; d < 360; d += 15) {
    let diff = d - normCenter;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    if (Math.abs(diff) <= halfSpanDeg) {
      const cardinal = CARDINAL_LABELS[d];
      ticks.push({
        deg: d,
        label: cardinal ?? String(d),
        isCardinal: Boolean(cardinal),
        offsetDeg: diff,
      });
    }
  }
  ticks.sort((a, b) => a.offsetDeg - b.offsetDeg);
  return ticks;
}

export function computeSignedAngleDiffDeg(fromBearingDeg: number, toBearingDeg: number): number {
  let diff = ((toBearingDeg - fromBearingDeg) % 360 + 540) % 360 - 180;
  return diff;
}

/**
 * Deterministic spatial value-noise helper in [0, 1] for pure geometry & foliage placement.
 */
export function deterministicSpatialNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const h = (gx: number, gz: number) => {
    const s = Math.sin(gx * 127.1 + gz * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  };
  const a = h(ix, iz);
  const b = h(ix + 1, iz);
  const c = h(ix, iz + 1);
  const d = h(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

/**
 * Computes organic lateral edge offset (meters) for road shoulders, gravel lanes,
 * and footpaths so ribbons never show ruler-straight geometric borders.
 */
export function computeRoadEdgeDisplacement(
  worldX: number,
  worldZ: number,
  sideSign: -1 | 1,
  halfWidth: number,
  surfaceKind: 'asphalt' | 'gravel' | 'trail'
): number {
  const phase = sideSign * 19.7;
  const macro = deterministicSpatialNoise2D(worldX * 0.19 + phase, worldZ * 0.19 - phase) - 0.5;
  const micro = deterministicSpatialNoise2D(worldX * 0.68 - phase, worldZ * 0.68 + phase) - 0.5;
  const amp =
    surfaceKind === 'trail'
      ? Math.min(0.45, Math.max(0.14, halfWidth * 0.34))
      : surfaceKind === 'gravel'
        ? Math.min(0.55, Math.max(0.22, halfWidth * 0.18))
        : Math.min(0.42, Math.max(0.16, halfWidth * 0.1));
  return (macro * 0.7 + micro * 0.3) * 2 * amp;
}

/**
 * Evaluates whether roadside weeds/creeping turf should encroach into a road shoulder margin
 * based on lateral distance from the road outer boundary (negative = slightly onto verge).
 */
export function computeVergeWeedDensity(
  worldX: number,
  worldZ: number,
  distOutsideEdgeM: number
): number {
  if (distOutsideEdgeM < -0.35 || distOutsideEdgeM > 2.4) return 0;
  const patch = deterministicSpatialNoise2D(worldX * 0.35 + 4.1, worldZ * 0.35 - 2.3);
  const fine = deterministicSpatialNoise2D(worldX * 1.4 - 7.7, worldZ * 1.4 + 5.2);
  const proximity = 1 - Math.min(1, Math.max(0, (distOutsideEdgeM + 0.35) / 2.75));
  return Math.max(0, Math.min(1, proximity * (0.45 + patch * 0.55) * (0.65 + fine * 0.35)));
}

export interface MoodColorProfile {
  elevDeg: number;
  azimDeg: number;
  sunHex: number;
  sunInt: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiInt: number;
  fogHex: number;
  fogDensity: number;
  skyColorHex: number;
  turbidity: number;
  rayleigh: number;
  wetness: number;
  mistOpacity: number;
  shaftStrength: number;
  exposure: number;
  vignette: number;
  warmth: number;
  contrast: number;
  saturation: number;
  grain: number;
  warmLightInt: number;
}

/**
 * Photorealistic moody AAA lighting & Tarkov/CoD-inspired Baltic filmic grading profiles.
 */
export function evaluateMoodColorProfile(preset: AtmospherePreset): MoodColorProfile {
  if (preset === 'morning') {
    return {
      elevDeg: 11,
      azimDeg: 96,
      sunHex: 0xffd5a6,
      sunInt: 2.35,
      hemiSkyHex: 0x89a8bf,
      hemiGroundHex: 0x20261d,
      hemiInt: 0.48,
      fogHex: 0xbac5be,
      fogDensity: 0.00235,
      skyColorHex: 0x7092ad,
      turbidity: 4.8,
      rayleigh: 1.75,
      wetness: 0.62,
      mistOpacity: 0.94,
      shaftStrength: 0.34,
      exposure: 0.92,
      vignette: 0.25,
      warmth: 0.025,
      contrast: 0.16,
      saturation: 0.87,
      grain: 0,
      warmLightInt: 14,
    };
  }
  if (preset === 'overcast_rain') {
    return {
      elevDeg: 20,
      azimDeg: 138,
      sunHex: 0xc8d5de,
      sunInt: 2.05,
      hemiSkyHex: 0x7a8a94,
      hemiGroundHex: 0x1a1f19,
      hemiInt: 0.36,
      fogHex: 0x76848c,
      fogDensity: 0.00285,
      skyColorHex: 0x6b7b85,
      turbidity: 10.2,
      rayleigh: 0.88,
      wetness: 0.96,
      mistOpacity: 0.88,
      shaftStrength: 0.0,
      exposure: 0.94,
      vignette: 0.3,
      warmth: -0.02,
      contrast: 0.2,
      saturation: 0.88,
      grain: 0,
      warmLightInt: 16,
    };
  }
  if (preset === 'noon') {
    return {
      elevDeg: 42,
      azimDeg: 168,
      sunHex: 0xfff0d8,
      sunInt: 2.48,
      hemiSkyHex: 0x8eb1cc,
      hemiGroundHex: 0x242a1f,
      hemiInt: 0.46,
      fogHex: 0xb1c3cd,
      fogDensity: 0.00125,
      skyColorHex: 0x5c8ab5,
      turbidity: 4.2,
      rayleigh: 1.45,
      wetness: 0.16,
      mistOpacity: 0.16,
      shaftStrength: 0.1,
      exposure: 0.9,
      vignette: 0.22,
      warmth: 0.01,
      contrast: 0.15,
      saturation: 0.86,
      grain: 0,
      warmLightInt: 4,
    };
  }
  if (preset === 'twilight') {
    return {
      elevDeg: 2.6,
      azimDeg: 258,
      sunHex: 0xe39066,
      sunInt: 1.45,
      hemiSkyHex: 0x485d78,
      hemiGroundHex: 0x151916,
      hemiInt: 0.42,
      fogHex: 0x536070,
      fogDensity: 0.0021,
      skyColorHex: 0x354761,
      turbidity: 6.4,
      rayleigh: 3.1,
      wetness: 0.48,
      mistOpacity: 0.65,
      shaftStrength: 0.06,
      exposure: 0.94,
      vignette: 0.32,
      warmth: 0.02,
      contrast: 0.2,
      saturation: 0.84,
      grain: 0,
      warmLightInt: 30,
    };
  }
  // Default 'golden': dramatic Baltic late-afternoon / tactical Tarkov golden sunbreak
  return {
    elevDeg: 9.5,
    azimDeg: 232,
    sunHex: 0xffba72,
    sunInt: 2.42,
    hemiSkyHex: 0x7e99b3,
    hemiGroundHex: 0x1e241a,
    hemiInt: 0.44,
    fogHex: 0xc2b29c,
    fogDensity: 0.00165,
    skyColorHex: 0x6280a1,
    turbidity: 7.2,
    rayleigh: 1.85,
    wetness: 0.56,
    mistOpacity: 0.48,
    shaftStrength: 0.3,
    exposure: 0.91,
    vignette: 0.26,
    warmth: 0.03,
    contrast: 0.18,
    saturation: 0.86,
    grain: 0,
    warmLightInt: 18,
  };
}

export const BUILDING_UV_METER_SCALE = 0.25;

/**
 * Computes true metric 3D slope-aligned UVs for a roof slope quad from eave edge
 * (ox0, oz0)->(ox1, oz1) at height yBot up to ridge/upper edge (ix0, iz0)->(ix1, iz1) at yTop.
 * Prevents vertical tile squashing or horizontal stretching across wide/narrow buildings.
 */
export function computeMetricRoofQuadUvs(
  ox0: number,
  oz0: number,
  ox1: number,
  oz1: number,
  ix0: number,
  iz0: number,
  ix1: number,
  iz1: number,
  yBot: number,
  yTop: number,
  uvPerMeter = BUILDING_UV_METER_SCALE
): {
  b0: [number, number];
  b1: [number, number];
  t0: [number, number];
  t1: [number, number];
} {
  const ex = ox1 - ox0;
  const ez = oz1 - oz0;
  const edgeLen = Math.hypot(ex, ez) || 1;
  const tx = ex / edgeLen;
  const tz = ez / edgeLen;
  const nx = -tz;
  const nz = tx;

  const uTop0 = (ix0 - ox0) * tx + (iz0 - oz0) * tz;
  const uTop1 = (ix1 - ox0) * tx + (iz1 - oz0) * tz;
  const perp0 = Math.abs((ix0 - ox0) * nx + (iz0 - oz0) * nz);
  const perp1 = Math.abs((ix1 - ox0) * nx + (iz1 - oz0) * nz);
  const dy = yTop - yBot;
  const vTop0 = Math.hypot(perp0, dy);
  const vTop1 = Math.hypot(perp1, dy);

  return {
    b0: [0, 0],
    b1: [edgeLen * uvPerMeter, 0],
    t0: [uTop0 * uvPerMeter, vTop0 * uvPerMeter],
    t1: [uTop1 * uvPerMeter, vTop1 * uvPerMeter],
  };
}

/**
 * Computes distortion-free metric triplanar UVs from a local vertex position & normal
 * so architectural boxes, cylinders, and extrusions maintain uniform texel density.
 */
export function computeTriplanarBoxUv(
  px: number,
  py: number,
  pz: number,
  nx: number,
  ny: number,
  nz: number,
  uvPerMeter = BUILDING_UV_METER_SCALE
): [number, number] {
  if (Math.abs(ny) > 0.72) {
    return [px * uvPerMeter, pz * uvPerMeter];
  }
  if (Math.abs(nx) >= Math.abs(nz)) {
    return [pz * uvPerMeter, py * uvPerMeter];
  }
  return [px * uvPerMeter, py * uvPerMeter];
}





