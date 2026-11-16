import * as THREE from 'three';
import { findNearestRiverPoint, groundHeightAt } from './rendaMath';
import type { BuildingCollider } from './rendaMath';
import type { RendaWorldDataset } from './types';

function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * V3 Photoreal GLSL Abava & Ivande River water material:
 * - Multi-octave animated capillary wave normals in world XZ space
 * - Schlick Fresnel grazing sky & horizon reflections
 * - Crisp directional sunlit specular sparkle path & shallow bank caustic shimmer
 * - Kurland emerald-amber depth tint + animated shoreline/riffle foam
 */
export function createAbavaWaterMaterial(
  timeUniform: { value: number },
  sunDirUniform: { value: THREE.Vector3 },
  sunColorUniform: { value: THREE.Color },
  skyColorUniform: { value: THREE.Color },
  horizonColorUniform: { value: THREE.Color }
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.06,
    metalness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    reflectivity: 0.94,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  mat.customProgramCacheKey = () => 'v3_abava_water';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = timeUniform;
    shader.uniforms.uSunDir = sunDirUniform;
    shader.uniforms.uSunColor = sunColorUniform;
    shader.uniforms.uSkyColor = skyColorUniform;
    shader.uniforms.uHorizonColor = horizonColorUniform;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWaterWorldPos;
varying vec2 vWaterUv;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vWaterUv = uv;
vWaterWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWaterTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uHorizonColor;
varying vec3 vWaterWorldPos;
varying vec2 vWaterUv;

float wHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float wNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(wHash(i + vec2(0.0, 0.0)), wHash(i + vec2(1.0, 0.0)), u.x),
    mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float waterWaveHeight(vec2 xz, float t) {
  vec2 flow = vec2(t * 0.45, -t * 0.78);
  float h = 0.0;
  h += wNoise(xz * 0.44 + flow * 0.85) * 0.44;
  h += wNoise(xz * 1.45 - vec2(t * 0.68, t * 0.52)) * 0.28;
  h += wNoise(xz * 4.2 + flow * 2.1) * 0.16;
  h += wNoise(xz * 10.5 - flow * 2.6) * 0.08;
  h += sin(xz.x * 1.15 + xz.y * 0.82 + t * 2.2) * 0.04;
  return h;
}`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float bankFactor = abs(vWaterUv.x * 2.0 - 1.0);
float centerDepth = 1.0 - smoothstep(0.28, 0.98, bankFactor);
vec3 deepKurland = vec3(0.045, 0.135, 0.148);
vec3 shallowBank = vec3(0.155, 0.235, 0.195);
vec3 baseWaterCol = mix(shallowBank, deepKurland, centerDepth);
float causticBand = wNoise(vWaterWorldPos.xz * 2.8 + vec2(uWaterTime * 0.6, -uWaterTime * 0.9)) * wNoise(vWaterWorldPos.xz * 3.4 - vec2(uWaterTime * 0.5, uWaterTime * 0.4));
baseWaterCol += vec3(0.06, 0.08, 0.05) * smoothstep(0.28, 0.72, causticBand) * (1.0 - centerDepth * 0.7);
float foamNoise = wNoise(vWaterWorldPos.xz * 2.6 + vec2(uWaterTime * 0.58, -uWaterTime * 0.85));
float bankFoam = smoothstep(0.82, 0.99, bankFactor) * smoothstep(0.42, 0.84, foamNoise);
float riffleFoam = smoothstep(0.75, 0.95, wNoise(vWaterWorldPos.xz * 1.85 - vec2(0.0, uWaterTime * 1.15))) * 0.15;
diffuseColor.rgb = mix(baseWaterCol, vec3(0.82, 0.89, 0.90), clamp(bankFoam * 0.72 + riffleFoam, 0.0, 0.8));`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
float eps = 0.14;
float hC = waterWaveHeight(vWaterWorldPos.xz, uWaterTime);
float hX = waterWaveHeight(vWaterWorldPos.xz + vec2(eps, 0.0), uWaterTime);
float hZ = waterWaveHeight(vWaterWorldPos.xz + vec2(0.0, eps), uWaterTime);
vec3 worldRippleN = normalize(vec3((hC - hX) * 0.72, 1.0, (hC - hZ) * 0.72));
vec3 viewRippleN = normalize((viewMatrix * vec4(worldRippleN, 0.0)).xyz);
normal = normalize(mix(normal, viewRippleN, 0.82));`
      )
      .replace(
        '#include <clearcoat_normal_fragment_maps>',
        `#include <clearcoat_normal_fragment_maps>
clearcoatNormal = normalize(mix(clearcoatNormal, normal, 0.84));`
      )
      .replace(
        '#include <opaque_fragment>',
        `vec3 viewDirW = normalize(cameraPosition - vWaterWorldPos);
vec3 worldRippleRefl = normalize(vec3((hC - hX) * 0.68, 1.0, (hC - hZ) * 0.68));
float NdotV = clamp(dot(worldRippleRefl, viewDirW), 0.001, 1.0);
float fresnel = 0.035 + 0.965 * pow(1.0 - NdotV, 4.2);
vec3 reflDir = reflect(-viewDirW, worldRippleRefl);
float skyMix = smoothstep(-0.06, 0.55, reflDir.y);
vec3 envRefl = mix(uHorizonColor * 0.94, uSkyColor * 1.12, skyMix);
vec3 sunLightDir = normalize(uSunDir);
vec3 halfVec = normalize(sunLightDir + viewDirW);
float sunSpec = pow(max(dot(worldRippleRefl, halfVec), 0.0), 380.0) * 2.25;
float sunGlow = pow(max(dot(worldRippleRefl, halfVec), 0.0), 38.0) * 0.22;
outgoingLight = mix(outgoingLight, envRefl, fresnel * 0.75) + uSunColor * (sunSpec + sunGlow);
#include <opaque_fragment>`
      );
  };

  return mat;
}

export interface TerrainDetailTextures {
  shortGrassDiff?: THREE.Texture;
  shortGrassNormal?: THREE.Texture;
  shortGrassRough?: THREE.Texture;
  grassDiff?: THREE.Texture;
  grassNormal?: THREE.Texture;
  grassRough?: THREE.Texture;
  forestDiff?: THREE.Texture;
  forestNormal?: THREE.Texture;
  cliffDiff?: THREE.Texture;
  cliffNormal?: THREE.Texture;
}

/**
 * V5 AAA Terrain Material Enhancement:
 * Blends 2K Poly Haven short turf (sparse_grass), lush meadow grass (leafy_grass),
 * pine-needle forest floor (forrest_ground_03), and cliff grass-rock (aerial_grass_rock)
 * using dual-scale rotated world-space anti-tiling with real PBR normals & roughness modulation
 * calibrated cleanly to the underlying orthophoto hue without high-frequency grain noise.
 */
export function enhanceTerrainMaterial(
  mat: THREE.MeshStandardMaterial,
  detailTex?: TerrainDetailTextures
): void {
  const hasDetailTex = Boolean(detailTex?.grassDiff && detailTex?.forestDiff);
  mat.customProgramCacheKey = () => (hasDetailTex ? 'v5_terrain_pbr_2k' : 'v5_terrain');
  mat.onBeforeCompile = (shader) => {
    if (hasDetailTex && detailTex?.grassDiff && detailTex?.forestDiff) {
      shader.uniforms.uTerrainShortGrassMap = { value: detailTex.shortGrassDiff ?? detailTex.grassDiff };
      shader.uniforms.uTerrainShortGrassNormal = { value: detailTex.shortGrassNormal ?? detailTex.grassNormal ?? detailTex.grassDiff };
      shader.uniforms.uTerrainShortGrassRough = { value: detailTex.shortGrassRough ?? detailTex.grassRough ?? detailTex.grassDiff };
      shader.uniforms.uTerrainGrassMap = { value: detailTex.grassDiff };
      shader.uniforms.uTerrainGrassNormal = { value: detailTex.grassNormal ?? detailTex.grassDiff };
      shader.uniforms.uTerrainGrassRough = { value: detailTex.grassRough ?? detailTex.shortGrassRough ?? detailTex.grassDiff };
      shader.uniforms.uTerrainForestMap = { value: detailTex.forestDiff };
      shader.uniforms.uTerrainForestNormal = { value: detailTex.forestNormal ?? detailTex.grassNormal ?? detailTex.forestDiff };
      shader.uniforms.uTerrainCliffMap = { value: detailTex.cliffDiff ?? detailTex.forestDiff };
      shader.uniforms.uTerrainCliffNormal = { value: detailTex.cliffNormal ?? detailTex.forestNormal ?? detailTex.grassNormal ?? detailTex.forestDiff };
    }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTerrainWorldPos;
varying vec3 vTerrainWorldNormal;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTerrainWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
      );

    const fragUniforms = hasDetailTex
      ? `uniform sampler2D uTerrainShortGrassMap;
uniform sampler2D uTerrainShortGrassNormal;
uniform sampler2D uTerrainShortGrassRough;
uniform sampler2D uTerrainGrassMap;
uniform sampler2D uTerrainGrassNormal;
uniform sampler2D uTerrainGrassRough;
uniform sampler2D uTerrainForestMap;
uniform sampler2D uTerrainForestNormal;
uniform sampler2D uTerrainCliffMap;
uniform sampler2D uTerrainCliffNormal;\n`
      : '';

    const texMicroSnippet = hasDetailTex
      ? `
float detailWeight = 1.0 - smoothstep(24.0, 140.0, camDist);
float shortTurfMask = clamp(0.56 + 0.34 * (1.0 - smoothstep(0.08, 0.28, aerialLuma)), 0.28, 0.92);
vec3 pbrGrass = lushGrass;
vec3 pbrLoam = loamEarth;
vec3 texCliff = vec3(0.32, 0.28, 0.22);
float terrainRoughPbr = mix(0.94, mix(0.84, 0.91, shortTurfMask), greenness);
if (detailWeight > 0.01) {
  vec2 tUvA = vTerrainWorldPos.xz * 0.72;
  bool useDualTap = camDist < 58.0;
  vec2 tUvB = vec2(vTerrainWorldPos.x * 0.28 + vTerrainWorldPos.z * 0.17, -vTerrainWorldPos.x * 0.17 + vTerrainWorldPos.z * 0.28);
  if (greenness > 0.04) {
    vec3 texShortGrass = (useDualTap
      ? mix(texture2D(uTerrainShortGrassMap, tUvA).rgb, texture2D(uTerrainShortGrassMap, tUvB).rgb, 0.36)
      : texture2D(uTerrainShortGrassMap, tUvA).rgb) * vec3(0.90, 1.09, 0.82);
    vec3 texLushGrass = useDualTap
      ? mix(texture2D(uTerrainGrassMap, tUvA * 0.78).rgb, texture2D(uTerrainGrassMap, tUvB * 0.84).rgb, 0.38)
      : texture2D(uTerrainGrassMap, tUvA * 0.78).rgb;
    vec3 blendedTurfTex = mix(texLushGrass, texShortGrass, shortTurfMask);
    pbrGrass = mix(lushGrass, blendedTurfTex * (0.94 + 0.14 * tPatch), 0.86 * detailWeight);
    if (camDist < 72.0) {
      float roughShort = texture2D(uTerrainShortGrassRough, tUvA).r;
      float roughLush = texture2D(uTerrainGrassRough, tUvA * 0.78).r;
      terrainRoughPbr = mix(0.94, mix(roughLush, roughShort, shortTurfMask), greenness);
    }
  }
  if (greenness < 0.94) {
    vec3 texForest = useDualTap
      ? mix(texture2D(uTerrainForestMap, tUvA * 0.72).rgb, texture2D(uTerrainForestMap, tUvB * 0.78).rgb, 0.40)
      : texture2D(uTerrainForestMap, tUvA * 0.72).rgb;
    pbrLoam = mix(loamEarth, texForest * (0.92 + 0.14 * tMacro), 0.84 * detailWeight);
  }
  if (slopeRaw > 0.08) {
    texCliff = useDualTap
      ? mix(texture2D(uTerrainCliffMap, tUvA * 0.48).rgb, texture2D(uTerrainCliffMap, tUvB * 0.56).rgb, 0.42)
      : texture2D(uTerrainCliffMap, tUvA * 0.48).rgb;
  }
}
vec3 closeMicroCol = mix(pbrLoam, pbrGrass, greenness);`
      : `vec3 closeMicroCol = mix(loamEarth, lushGrass, greenness);
vec3 texCliff = vec3(0.32, 0.28, 0.22);
float shortTurfMask = 0.5;
float detailWeight = 0.0;
float terrainRoughPbr = 0.92;`;

    const normalTexSnippet = hasDetailTex
      ? `float camDistN = length(vViewPosition);
float normalTexFade = 1.0 - smoothstep(14.0, 78.0, camDistN);
vec3 tPerturbW = vec3(0.0);
if (normalTexFade > 0.01) {
  vec2 tnUvA = vTerrainWorldPos.xz * 0.72;
  bool dualNormalTap = camDistN < 34.0;
  vec2 tnUvB = vec2(vTerrainWorldPos.x * 0.28 + vTerrainWorldPos.z * 0.17, -vTerrainWorldPos.x * 0.17 + vTerrainWorldPos.z * 0.28);
  vec3 tnShort = (dualNormalTap
    ? mix(texture2D(uTerrainShortGrassNormal, tnUvA).xyz, texture2D(uTerrainShortGrassNormal, tnUvB).xyz, 0.36)
    : texture2D(uTerrainShortGrassNormal, tnUvA).xyz) * 2.0 - 1.0;
  vec3 tnLush = (dualNormalTap
    ? mix(texture2D(uTerrainGrassNormal, tnUvA * 0.78).xyz, texture2D(uTerrainGrassNormal, tnUvB * 0.84).xyz, 0.38)
    : texture2D(uTerrainGrassNormal, tnUvA * 0.78).xyz) * 2.0 - 1.0;
  float tSlopeN = 1.0 - clamp(vTerrainWorldNormal.y, 0.0, 1.0);
  float tCliffN = smoothstep(0.13, 0.32, tSlopeN);
  vec3 tTurfN = mix(tnLush, tnShort, 0.62);
  vec3 tGroundN = tTurfN;
  if (tSlopeN > 0.04) {
    vec3 tnForest = texture2D(uTerrainForestNormal, tnUvA * 0.72).xyz * 2.0 - 1.0;
    tGroundN = mix(tnForest, tTurfN, clamp(1.0 - tSlopeN * 2.2, 0.35, 1.0));
  }
  vec3 tFinalMapN = tGroundN;
  if (tCliffN > 0.02) {
    vec3 tnCliff = texture2D(uTerrainCliffNormal, tnUvA * 0.48).xyz * 2.0 - 1.0;
    tFinalMapN = mix(tGroundN, tnCliff, tCliffN * 0.85);
  }
  tPerturbW = vec3(tFinalMapN.x, 0.0, tFinalMapN.y) * 0.72 * normalTexFade;
}`
      : `float distFade = 1.0 - smoothstep(10.0, 72.0, length(vViewPosition));
float tEps = 0.22;
float tHc = tNoise(vTerrainWorldPos.xz * 1.4);
float tHx = tNoise((vTerrainWorldPos.xz + vec2(tEps, 0.0)) * 1.4);
float tHz = tNoise((vTerrainWorldPos.xz + vec2(0.0, tEps)) * 1.4);
vec3 tPerturbW = vec3((tHc - tHx) * 0.32, 0.0, (tHc - tHz) * 0.32) * distFade;`;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
${fragUniforms}varying vec3 vTerrainWorldPos;
varying vec3 vTerrainWorldNormal;

float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float tNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(tHash(i + vec2(0.0, 0.0)), tHash(i + vec2(1.0, 0.0)), u.x),
    mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float tFbm(vec2 p) {
  float v = 0.0;
  v += tNoise(p) * 0.54;
  v += tNoise(p * 2.13 + vec2(17.3, 9.1)) * 0.30;
  v += tNoise(p * 4.21 + vec2(3.7, 24.5)) * 0.16;
  return v;
}`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float tMacro = tNoise(vTerrainWorldPos.xz * 0.12);
float tPatch = tFbm(vTerrainWorldPos.xz * 0.42);
float tDryStraw = tFbm(vTerrainWorldPos.xz * 0.26 + vec2(31.7, 14.2));
float tTurf = tFbm(vTerrainWorldPos.xz * 1.35);
float camDist = length(vViewPosition);

vec3 aerialBase = pow(max(diffuseColor.rgb, vec3(0.001)), vec3(1.18)) * 0.82;
float aerialLuma = dot(aerialBase, vec3(0.299, 0.587, 0.114));
float slopeRaw = 1.0 - clamp(vTerrainWorldNormal.y, 0.0, 1.0);
float rawGreenness = smoothstep(-0.085, 0.015, aerialBase.g - max(aerialBase.r, aerialBase.b * 0.96));
float greenness = clamp(max(rawGreenness, 0.62 * (1.0 - smoothstep(0.08, 0.26, slopeRaw))), 0.0, 1.0);

// Grounded Baltic meadow & manicured turf palette calibrated to 2K PBR grass textures
vec3 lushGrass = mix(vec3(0.078, 0.128, 0.048), vec3(0.155, 0.212, 0.082), tPatch);
lushGrass = mix(lushGrass, vec3(0.195, 0.184, 0.102), smoothstep(0.56, 0.86, tDryStraw) * 0.38);
float rootAo = 0.84 + 0.20 * tTurf;
lushGrass *= rootAo;

vec3 loamEarth = mix(vec3(0.105, 0.098, 0.068), vec3(0.165, 0.152, 0.106), tTurf);
loamEarth *= (0.86 + 0.18 * tTurf);

${texMicroSnippet}
float aerialShade = clamp(aerialLuma / 0.24, 0.76, 1.22);
closeMicroCol *= mix(1.0, aerialShade, 0.34);

float closeBlend = 1.0 - smoothstep(18.0, 138.0, camDist);

float tDetail = 0.90 + 0.14 * tTurf;
vec3 smoothedAerial = mix(vec3(0.16, 0.20, 0.10), aerialBase, 0.60);
vec3 macroCol = smoothedAerial * mix(vec3(0.84, 0.88, 0.74), vec3(0.94, 0.95, 0.86), smoothstep(0.15, 0.65, tMacro)) * tDetail;
diffuseColor.rgb = mix(macroCol, closeMicroCol, closeBlend * 0.96);

// Damp shoreline loam tint on low riverbanks & stratified Devonian sandstone/dolomite bluffs
float riverLow = 1.0 - smoothstep(2.2, 5.8, vTerrainWorldPos.y);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.74, 0.72, 0.66), riverLow * 0.34);

float slopeAmt = 1.0 - clamp(vTerrainWorldNormal.y, 0.0, 1.0);
float cliffMask = smoothstep(0.13, 0.32, slopeAmt);
float strata = 0.5 + 0.5 * sin(vTerrainWorldPos.y * 5.2 + tNoise(vTerrainWorldPos.xz * 0.35) * 3.8);
vec3 devonianRock = mix(vec3(0.26, 0.22, 0.18), vec3(0.49, 0.41, 0.32), strata);
vec3 rockPbrBlend = mix(devonianRock, texCliff * 1.08, 0.65 * detailWeight);
diffuseColor.rgb = mix(diffuseColor.rgb, rockPbrBlend * (0.88 + 0.16 * tTurf), cliffMask * 0.84);`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = clamp(mix(roughnessFactor, 0.72 + terrainRoughPbr * 0.26, detailWeight * 0.85), 0.68, 0.98);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
${normalTexSnippet}
vec3 tPerturbV = (viewMatrix * vec4(tPerturbW, 0.0)).xyz;
normal = normalize(normal + tPerturbV);`
      );
  };
}

/**
 * V3 Overhead GLSL Volumetric FBM Cloud Sky Dome:
 * Eliminates translucent sphere/ellipse blobs by projecting layered multi-octave FBM
 * cumulus & wispy cirrus cloud banks onto a seamless overhead hemisphere shell.
 */
export function createVolumetricCloudDome(
  windTimeUniform: { value: number },
  sunDirUniform: { value: THREE.Vector3 },
  sunColorUniform: { value: THREE.Color },
  skyColorUniform: { value: THREE.Color },
  horizonColorUniform: { value: THREE.Color }
): THREE.Mesh {
  const geo = new THREE.SphereGeometry(2150, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.48);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCloudTime: windTimeUniform,
      uSunDir: sunDirUniform,
      uSunColor: sunColorUniform,
      uSkyColor: skyColorUniform,
      uHorizonColor: horizonColorUniform,
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uCloudTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyColor;
      uniform vec3 uHorizonColor;
      varying vec3 vWorldDir;

      float cHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float cNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(cHash(i + vec2(0.0, 0.0)), cHash(i + vec2(1.0, 0.0)), u.x),
          mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float cFbm(vec2 p) {
        float sum = 0.0;
        float amp = 0.52;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 5; i++) {
          sum += amp * cNoise(p);
          p = rot * p * 2.06 + vec2(11.3, 7.7);
          amp *= 0.5;
        }
        return sum;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float horizonFade = smoothstep(0.04, 0.28, dir.y);
        if (horizonFade <= 0.001) discard;

        // Curved atmospheric cloud projection plane
        vec2 cloudUv = dir.xz / (max(dir.y, 0.08) + 0.14);
        vec2 drift = vec2(uCloudTime * 0.008, uCloudTime * 0.0035);

        float baseDensity = cFbm(cloudUv * 0.65 + drift);
        float detailDensity = cFbm(cloudUv * 1.85 - drift * 1.35 + vec2(4.2, 9.1));
        float cloudShape = baseDensity * 0.72 + detailDensity * 0.28;

        // Soft wispy cirrus + billowing cumulus patches
        float cumulus = smoothstep(0.50, 0.78, cloudShape);
        float cirrus = smoothstep(0.46, 0.74, cFbm(cloudUv * vec2(1.1, 0.45) + drift * 1.8)) * 0.34;
        float alpha = clamp((cumulus * 0.72 + cirrus) * horizonFade, 0.0, 0.82);
        if (alpha < 0.005) discard;

        // Directional sunlight silver lining + cool sky shadow belly
        float sunAlign = max(dot(dir, normalize(uSunDir)), 0.0);
        float silverLining = pow(sunAlign, 8.0) * 0.55 + pow(sunAlign, 2.5) * 0.25;
        float topLit = smoothstep(0.38, 0.84, detailDensity);

        vec3 shadowCol = mix(uSkyColor * 0.92, uHorizonColor * 0.88, 0.55);
        vec3 litCol = mix(vec3(0.98, 0.96, 0.92), uSunColor * 1.15, 0.52);
        vec3 cloudCol = mix(shadowCol, litCol, clamp(topLit * 0.82 + silverLining * 0.6, 0.0, 1.0));
        cloudCol += uSunColor * silverLining * (1.0 - cumulus * 0.45) * 0.45;

        gl_FragColor = vec4(cloudCol, alpha);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    fog: false,
  });

  const dome = new THREE.Mesh(geo, mat);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  return dome;
}

/**
 * V3 Foliage Shader Enhancement:
 * Adds gentle instanced crown wind sway + leaf-tip micro-flutter + warm backlit
 * subsurface leaf translucency so Baltic pines, birches & oaks glow naturally.
 */
export function enhanceFoliageMaterial(
  mat: THREE.MeshStandardMaterial,
  windTimeUniform: { value: number },
  sunDirUniform: { value: THREE.Vector3 },
  sunColorUniform: { value: THREE.Color }
): void {
  mat.customProgramCacheKey = () => 'v3_foliage';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTimeUniform;
    shader.uniforms.uSunDir = sunDirUniform;
    shader.uniforms.uSunColor = sunColorUniform;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWindTime;
varying vec3 vFoliageWorldPos;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float wPhase = uWindTime * 1.65 + instanceMatrix[3].x * 0.15 + instanceMatrix[3].z * 0.19;
  float wAmp = max(0.0, transformed.y + 1.2) * 0.036;
  float tipFlutter = sin(uWindTime * 4.3 + transformed.x * 2.1 + transformed.z * 2.4 + instanceMatrix[3].x) * 0.018;
  transformed.x += sin(wPhase) * wAmp + tipFlutter;
  transformed.z += cos(wPhase * 0.82) * wAmp * 0.68;
#endif`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
#ifdef USE_INSTANCING
  vFoliageWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vFoliageWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uSunDir;
uniform vec3 uSunColor;
varying vec3 vFoliageWorldPos;`
      )
      .replace(
        '#include <opaque_fragment>',
        `vec3 viewDirF = normalize(cameraPosition - vFoliageWorldPos);
vec3 sDirF = normalize(uSunDir);
float backTransmit = pow(clamp(dot(viewDirF, -sDirF), 0.0, 1.0), 3.8);
float canopySky = 0.02 + 0.04 * max(0.0, sDirF.y);
outgoingLight += diffuseColor.rgb * uSunColor * (backTransmit * 0.24 + canopySky);
#include <opaque_fragment>`
      );
  };
}

/**
 * V4 Road & Trail Surface Enhancement:
 * - Multi-octave FBM edge warping + ragged alpha-cutout discard so NO road or footpath
 *   shows ruler-straight geometric borders against terrain grass.
 * - Realistic asphalt potholes, spalled edge gravel, tar crack webs, faded chipped paint,
 *   oil wear, wet puddle Fresnel reflections, and mud/grass median ruts on trails.
 */
export function enhanceRoadMaterial(
  mat: THREE.MeshStandardMaterial,
  roadKind: boolean | 'asphalt' | 'gravel' | 'trail',
  wetnessUniform?: { value: number },
  sunDirUniform?: { value: THREE.Vector3 },
  sunColorUniform?: { value: THREE.Color },
  skyColorUniform?: { value: THREE.Color },
  horizonColorUniform?: { value: THREE.Color }
): void {
  const mode: 'asphalt' | 'gravel' | 'trail' =
    typeof roadKind === 'boolean' ? (roadKind ? 'asphalt' : 'gravel') : roadKind;
  const isAsphalt = mode === 'asphalt';
  const isTrail = mode === 'trail';

  const wetU = wetnessUniform ?? { value: 0.45 };
  const sunDirU = sunDirUniform ?? { value: new THREE.Vector3(0.4, 0.5, -0.7).normalize() };
  const sunColU = sunColorUniform ?? { value: new THREE.Color(0xffbd75) };
  const skyColU = skyColorUniform ?? { value: new THREE.Color(0x6d98c2) };
  const horColU = horizonColorUniform ?? { value: new THREE.Color(0xd9c2a3) };

  mat.customProgramCacheKey = () => `v4_road_${mode}_wet`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRoadWetness = wetU;
    shader.uniforms.uRoadSunDir = sunDirU;
    shader.uniforms.uRoadSunColor = sunColU;
    shader.uniforms.uRoadSkyColor = skyColU;
    shader.uniforms.uRoadHorizonColor = horColU;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vRoadUv;
varying vec3 vRoadWorldPos;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vRoadUv = uv;
vRoadWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uRoadWetness;
uniform vec3 uRoadSunDir;
uniform vec3 uRoadSunColor;
uniform vec3 uRoadSkyColor;
uniform vec3 uRoadHorizonColor;
varying vec2 vRoadUv;
varying vec3 vRoadWorldPos;
float rHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float rNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(rHash(i), rHash(i + vec2(1.0, 0.0)), u.x),
    mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float rFbm(vec2 p) {
  float v = 0.0;
  v += rNoise(p) * 0.54;
  v += rNoise(p * 2.17 + vec2(13.1, 7.3)) * 0.28;
  v += rNoise(p * 4.81 + vec2(5.7, 21.9)) * 0.18;
  return v;
}`
      )
      .replace(
        '#include <map_fragment>',
        isAsphalt
          ? `#include <map_fragment>
float uAcross = vRoadUv.x;
float rawEdge = min(uAcross, 1.0 - uAcross);
float edgeWarp = (rFbm(vRoadWorldPos.xz * 1.15) - 0.5) * 0.075 + (rNoise(vRoadWorldPos.xz * 6.8) - 0.5) * 0.036;
float warpedEdge = rawEdge + edgeWarp;
if (warpedEdge < 0.032) discard;

float trackL = exp(-pow((uAcross - 0.29) * 8.2, 2.0));
float trackR = exp(-pow((uAcross - 0.71) * 8.2, 2.0));
float wheelWear = clamp(trackL + trackR, 0.0, 1.0);
float edgeShoulder = 1.0 - smoothstep(0.035, 0.165, warpedEdge);
float edgeCrumble = 1.0 - smoothstep(0.032, 0.095, warpedEdge);
float grit = rFbm(vRoadWorldPos.xz * 3.1);
float microGrit = rNoise(vRoadWorldPos.xz * 14.0);

// Organic patched asphalt repairs
vec2 patchCell = floor(vec2(uAcross * 3.0 + (grit - 0.5) * 0.25, vRoadUv.y * 0.42));
float patchRnd = rHash(patchCell + vec2(11.0, 7.0));
vec2 patchLocal = fract(vec2(uAcross * 3.0, vRoadUv.y * 0.42));
float inPatch = step(0.66, patchRnd)
  * smoothstep(0.07, 0.14, patchLocal.x) * (1.0 - smoothstep(0.86, 0.93, patchLocal.x))
  * smoothstep(0.07, 0.14, patchLocal.y) * (1.0 - smoothstep(0.86, 0.93, patchLocal.y));
diffuseColor.rgb *= mix(1.0, 0.70 + 0.18 * rHash(patchCell + 3.0), inPatch * 0.82);

// Multi-scale tar-sealed crack spiderwebs
float warpC = rNoise(vRoadWorldPos.xz * 0.85) * 0.38;
float crackField = abs(rNoise(vRoadWorldPos.xz * 1.65 + warpC) - 0.5);
float crackLine = 1.0 - smoothstep(0.006, 0.021, crackField);
float crackHair = 1.0 - smoothstep(0.004, 0.015, abs(rNoise(vRoadWorldPos.xz * 3.8 - warpC) - 0.5));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.075, 0.078, 0.084), clamp(crackLine * 0.55 + crackHair * 0.35, 0.0, 0.72) * (1.0 - edgeCrumble));

// Occasional spalled asphalt potholes along wheel lanes & shoulders
float potField = rFbm(vRoadWorldPos.xz * 0.55 + vec2(9.2, 3.7));
float pothole = smoothstep(0.77, 0.85, potField) * smoothstep(0.22, 0.75, wheelWear + edgeShoulder * 0.6);
vec3 potRubble = mix(vec3(0.22, 0.20, 0.17), vec3(0.11, 0.105, 0.095), microGrit);
diffuseColor.rgb = mix(diffuseColor.rgb, potRubble, pothole * 0.85);

// Weathered, chipped Latvian center dashed line (faded by tire crossings)
float centerDist = abs(uAcross - 0.5 + (grit - 0.5) * 0.006);
float dashPhase = fract(vRoadUv.y * 0.85);
float dashMask = smoothstep(0.18, 0.24, dashPhase) * (1.0 - smoothstep(0.64, 0.70, dashPhase));
float paintChip = smoothstep(0.32, 0.72, microGrit * 0.65 + grit * 0.35);
float paintLine = (1.0 - smoothstep(0.010, 0.021, centerDist)) * dashMask * paintChip;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.72, 0.66), paintLine * 0.62);

// Darkened rubberized tire tracks + irregular crushed gravel/soil/moss shoulder transition
diffuseColor.rgb *= mix(1.0, 0.78, wheelWear * 0.78);
vec3 shoulderGravel = mix(vec3(0.33, 0.30, 0.25), vec3(0.23, 0.24, 0.16), smoothstep(0.45, 0.8, grit));
diffuseColor.rgb = mix(diffuseColor.rgb, shoulderGravel * (0.78 + 0.36 * microGrit), edgeShoulder * 0.86);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.22, 0.11) * (0.78 + 0.32 * microGrit), edgeCrumble * 0.75);

// Scattered fallen autumn leaves & grit along curbs
float leafNoise = rHash(floor(vRoadWorldPos.xz * 4.5));
float leafDist = length(fract(vRoadWorldPos.xz * 4.5) - 0.5);
float leafBand = smoothstep(0.05, 0.28, edgeShoulder + (1.0 - wheelWear) * 0.22);
float isLeaf = step(0.952, leafNoise) * (1.0 - smoothstep(0.12, 0.28, leafDist)) * leafBand;
diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.54, 0.32, 0.13), vec3(0.64, 0.46, 0.16), fract(leafNoise * 31.7)), isLeaf * 0.85);

// Wet depression & pothole puddles driven by uRoadWetness
float puddleMacro = rNoise(vRoadWorldPos.xz * 0.22) * 0.65 + rNoise(vRoadWorldPos.xz * 0.68) * 0.35;
float puddleTrack = smoothstep(0.28, 0.85, wheelWear + (1.0 - edgeShoulder) * 0.35);
float puddleMask = smoothstep(0.56 - uRoadWetness * 0.18, 0.72 - uRoadWetness * 0.16, puddleMacro) * clamp(uRoadWetness * 1.15, 0.0, 1.0) * puddleTrack * (1.0 - edgeShoulder);
puddleMask = clamp(max(puddleMask, pothole * uRoadWetness * 0.85), 0.0, 1.0);
diffuseColor.rgb *= mix(1.0, 0.52, puddleMask);`
          : isTrail
            ? `#include <map_fragment>
float uAcross = vRoadUv.x;
float rawEdge = min(uAcross, 1.0 - uAcross);
float edgeWarp = (rFbm(vRoadWorldPos.xz * 1.45) - 0.5) * 0.13 + (rNoise(vRoadWorldPos.xz * 7.5) - 0.5) * 0.06;
float warpedEdge = rawEdge + edgeWarp;
if (warpedEdge < 0.065) discard;

float trailCenter = exp(-pow((uAcross - 0.5 + (rNoise(vRoadWorldPos.xz * 0.45) - 0.5) * 0.12) * 3.8, 2.0));
float pebble = rFbm(vRoadWorldPos.xz * 4.2);
float micro = rNoise(vRoadWorldPos.xz * 13.5);
float grassInvade = 1.0 - smoothstep(0.065, 0.24, warpedEdge);
float puddleMacro = rNoise(vRoadWorldPos.xz * 0.32) * 0.65 + rNoise(vRoadWorldPos.xz * 0.85) * 0.35;
float puddleMask = smoothstep(0.60 - uRoadWetness * 0.18, 0.76 - uRoadWetness * 0.14, puddleMacro) * clamp(uRoadWetness * 0.92, 0.0, 1.0) * trailCenter * (1.0 - grassInvade);

vec3 dirtTrack = mix(vec3(0.23, 0.195, 0.145), vec3(0.35, 0.30, 0.22), pebble);
vec3 grassMargin = mix(vec3(0.15, 0.19, 0.095), vec3(0.24, 0.27, 0.13), micro);
diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.84, 0.80, 0.72), dirtTrack, 0.45 + trailCenter * 0.35);
diffuseColor.rgb *= (0.80 + 0.36 * micro);
diffuseColor.rgb = mix(diffuseColor.rgb, grassMargin, clamp(grassInvade * 0.82 + (1.0 - trailCenter) * 0.24 * pebble, 0.0, 0.92));
diffuseColor.rgb *= mix(1.0, 0.55, puddleMask);`
            : `#include <map_fragment>
float uAcross = vRoadUv.x;
float rawEdge = min(uAcross, 1.0 - uAcross);
float edgeWarp = (rFbm(vRoadWorldPos.xz * 1.15) - 0.5) * 0.155 + (rNoise(vRoadWorldPos.xz * 5.8) - 0.5) * 0.072;
float warpedEdge = rawEdge + edgeWarp;
if (warpedEdge < 0.072) discard;

float trackL = exp(-pow((uAcross - 0.30) * 7.2, 2.0));
float trackR = exp(-pow((uAcross - 0.70) * 7.2, 2.0));
float wheelWear = clamp(trackL + trackR, 0.0, 1.0);
float centerStrip = exp(-pow((uAcross - 0.5) * 9.5, 2.0));
float vergeGrass = 1.0 - smoothstep(0.072, 0.28, warpedEdge);
float earthMargin = 1.0 - smoothstep(0.072, 0.175, warpedEdge);
float pebble = rFbm(vRoadWorldPos.xz * 4.5);
float micro = rNoise(vRoadWorldPos.xz * 14.0);
float puddleMacro = rNoise(vRoadWorldPos.xz * 0.24) * 0.65 + rNoise(vRoadWorldPos.xz * 0.72) * 0.35;
float puddleMask = smoothstep(0.62 - uRoadWetness * 0.16, 0.78 - uRoadWetness * 0.14, puddleMacro) * clamp(uRoadWetness * 0.9, 0.0, 1.0) * wheelWear * (1.0 - vergeGrass);

diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.29, 0.24), 0.32);
diffuseColor.rgb *= mix(1.02, 0.76, wheelWear * 0.86);
diffuseColor.rgb *= (0.86 + 0.28 * micro);
// Sparse mossy/grassy median strip down rural gravel lane center & ragged earthen/grassy shoulders
float medianGrass = centerStrip * smoothstep(0.42, 0.74, pebble) * 0.64;
vec3 earthCol = mix(vec3(0.24, 0.20, 0.145), vec3(0.30, 0.26, 0.19), micro);
vec3 vergeCol = mix(vec3(0.16, 0.195, 0.095), vec3(0.25, 0.26, 0.135), pebble);
diffuseColor.rgb = mix(diffuseColor.rgb, earthCol, earthMargin * 0.62);
diffuseColor.rgb = mix(diffuseColor.rgb, vergeCol * (0.82 + 0.30 * micro), clamp(vergeGrass * 0.86 + medianGrass, 0.0, 0.92));
diffuseColor.rgb *= mix(1.0, 0.58, puddleMask);`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        isAsphalt
          ? `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor - wheelWear * 0.14 + edgeShoulder * 0.14 + pothole * 0.12, 0.26, 0.98);
roughnessFactor = mix(roughnessFactor, 0.05, puddleMask);`
          : isTrail
            ? `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor - trailCenter * 0.05 + grassInvade * 0.06, 0.62, 0.98);
roughnessFactor = mix(roughnessFactor, 0.10, puddleMask);`
            : `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor - wheelWear * 0.07, 0.52, 0.98);
roughnessFactor = mix(roughnessFactor, 0.08, puddleMask);`
      )
      .replace(
        '#include <opaque_fragment>',
        `if (puddleMask > 0.02) {
  vec3 rViewW = normalize(cameraPosition - vRoadWorldPos);
  vec3 rNormW = normalize(vec3((rNoise(vRoadWorldPos.xz * 6.0) - 0.5) * 0.03, 1.0, (rNoise(vRoadWorldPos.xz * 6.0 + 3.1) - 0.5) * 0.03));
  float rNdotV = clamp(dot(rNormW, rViewW), 0.02, 1.0);
  float rFresnel = 0.04 + 0.96 * pow(1.0 - rNdotV, 4.0);
  vec3 rRefl = reflect(-rViewW, rNormW);
  vec3 rSkyRefl = mix(uRoadHorizonColor * 0.92, uRoadSkyColor * 1.08, smoothstep(-0.04, 0.5, rRefl.y));
  vec3 rHalf = normalize(normalize(uRoadSunDir) + rViewW);
  float rSpec = pow(max(dot(rNormW, rHalf), 0.0), 220.0) * 1.15;
  outgoingLight = mix(outgoingLight, rSkyRefl, puddleMask * rFresnel * 0.72) + uRoadSunColor * (rSpec * puddleMask);
}
#include <opaque_fragment>`
      );
  };
}

/**
 * V3 Volumetric Morning River Mist Planes:
 * Soft feathered FBM drift mist ribbons hovering cleanly above the Abava River
 * around P120 Bridge, Abavas Laivas, and Īvandes Rumba gorge.
 */
export function createValleyMistSystem(
  windTimeUniform: { value: number },
  horizonColorUniform: { value: THREE.Color },
  mistOpacityUniform: { value: number }
): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMistTime: windTimeUniform,
      uMistColor: horizonColorUniform,
      uMistOpacity: mistOpacityUniform,
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uMistTime;
      uniform vec3 uMistColor;
      uniform float uMistOpacity;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      float mHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float mNoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(mHash(i), mHash(i+vec2(1,0)), u.x), mix(mHash(i+vec2(0,1)), mHash(i+vec2(1,1)), u.x), u.y);
      }
      void main() {
        vec2 d = vUv * 2.0 - 1.0;
        float radial = 1.0 - smoothstep(0.25, 0.98, dot(d, d));
        if (radial < 0.01) discard;
        float wisp = mNoise(vWorldPos.xz * 0.045 + vec2(uMistTime * 0.035, -uMistTime * 0.02)) * 0.65
                   + mNoise(vWorldPos.xz * 0.11 - vec2(uMistTime * 0.05, uMistTime * 0.03)) * 0.35;
        float camFade = smoothstep(5.0, 22.0, length(cameraPosition - vWorldPos));
        float alpha = radial * smoothstep(0.28, 0.84, wisp) * uMistOpacity * 0.68 * camFade;
        if (alpha < 0.005) discard;
        gl_FragColor = vec4(mix(uMistColor, vec3(0.94, 0.96, 0.98), 0.35), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const spots: [number, number, number, number, number][] = [
    [238, 13.8, -149, 135, 115], // Abava Bridge morning river mist
    [215, 14.9, -158, 95, 85],
    [405, 22.8, 117, 78, 70],   // Ivande Waterfall gorge spray mist
    [-881, 12.2, -111, 140, 120], // Abava Boats river bend
  ];
  for (const [x, y, z, w, h] of spots) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), mat);
    plane.position.set(x, y, z);
    plane.renderOrder = 2;
    group.add(plane);
  }
  return group;
}

/**
 * V3 Volumetric Sun Shafts:
 * Gentle additive crepuscular light rays filtering through pines & oaks at
 * Īvandes Rumba gorge and Renda Churchyard.
 */
export function createVolumetricSunShafts(
  windTimeUniform: { value: number },
  sunDirUniform: { value: THREE.Vector3 },
  sunColorUniform: { value: THREE.Color }
): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uShaftTime: windTimeUniform,
      uShaftColor: sunColorUniform,
      uShaftStrength: { value: 0.24 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uShaftTime;
      uniform vec3 uShaftColor;
      uniform float uShaftStrength;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      void main() {
        vec3 viewD = normalize(cameraPosition - vWorldPos);
        float edge = pow(abs(dot(vNormalW, viewD)), 1.65);
        float vertical = smoothstep(0.0, 0.32, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float shimmer = 0.78 + 0.22 * sin(vUv.x * 18.0 + uShaftTime * 0.45);
        float alpha = edge * vertical * shimmer * uShaftStrength;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uShaftColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  group.userData.shaftMat = mat;

  const rayDefs: [number, number, number, number][] = [
    [400, 31, 118, 12], // Ivande waterfall forest clearing
    [412, 32, 110, 10],
    [196, 44, 96, 13],  // Renda Lutheran Churchyard oak canopy
  ];
  const tmpQuat = new THREE.Quaternion();
  const upVec = new THREE.Vector3(0, 1, 0);
  const rayDir = new THREE.Vector3();
  for (const [x, y, z, rad] of rayDefs) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, 34, 16, 1, true), mat);
    cone.position.set(x, y, z);
    rayDir.copy(sunDirUniform.value).normalize();
    tmpQuat.setFromUnitVectors(upVec, rayDir);
    cone.quaternion.copy(tmpQuat);
    cone.renderOrder = 3;
    group.add(cone);
  }
  return group;
}

/**
 * V4 Building Wall Grounding & Weathering Enhancement:
 * Adds foundation splashback AO, climbing damp moss, rain-runoff streaks below eaves,
 * and subtle FBM plaster/wood grime mottling so buildings look authentically aged.
 */
export function enhanceBuildingWallMaterial(mat: THREE.MeshStandardMaterial): void {
  mat.customProgramCacheKey = () => 'v4_building_wall';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vWallLocalY;
varying vec3 vWallWorldPos;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vWallLocalY = position.y;
vWallWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vWallLocalY;
varying vec3 vWallWorldPos;
float bwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bwNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(bwHash(i), bwHash(i+vec2(1,0)), u.x), mix(bwHash(i+vec2(0,1)), bwHash(i+vec2(1,1)), u.x), u.y);
}`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float wMacro = bwNoise(vWallWorldPos.xz * 0.38 + vec2(vWallLocalY * 0.12));
float wStreak = bwNoise(vec2((vWallWorldPos.x + vWallWorldPos.z) * 1.65, vWallLocalY * 0.24));
float wFine = bwNoise(vWallWorldPos.xz * 3.8 + vWallLocalY * 2.1);

// Grounded foundation contact AO & damp splashback moss near plinth (local y ~ 1.4..3.0m)
float baseAo = smoothstep(1.35, 3.05, vWallLocalY);
float dampMoss = (1.0 - smoothstep(1.5, 2.85, vWallLocalY + wMacro * 0.55)) * smoothstep(0.35, 0.8, wStreak);
float wallShade = 0.72 + 0.28 * baseAo;
float horizWeath = 0.88 + 0.14 * wMacro * (0.75 + 0.25 * wFine);
float rainGrime = 1.0 - smoothstep(0.55, 0.92, wStreak) * 0.15;

diffuseColor.rgb *= wallShade * horizWeath * rainGrime;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.21, 0.13), dampMoss * 0.42);`
      );
  };
}

/**
 * V4 Building Roof Weathering Enhancement:
 * Adds aged tile/panel tonal variation, dark soot/lichen spots, damp moss creeping
 * near lower roof eaves, and subtle weathering roughness breaks.
 */
export function enhanceBuildingRoofMaterial(mat: THREE.MeshStandardMaterial): void {
  mat.customProgramCacheKey = () => 'v4_building_roof';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vRoofLocalY;
varying vec3 vRoofWorldPos;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vRoofLocalY = position.y;
vRoofWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vRoofLocalY;
varying vec3 vRoofWorldPos;
float brHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float brNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(brHash(i), brHash(i+vec2(1,0)), u.x), mix(brHash(i+vec2(0,1)), brHash(i+vec2(1,1)), u.x), u.y);
}`
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float rPatina = brNoise(vRoofWorldPos.xz * 0.48) * 0.65 + brNoise(vRoofWorldPos.xz * 1.65) * 0.35;
float rLichen = smoothstep(0.58, 0.88, brNoise(vRoofWorldPos.xz * 2.2 + 5.3));
float eaveMoss = (1.0 - smoothstep(0.0, 1.4, vRoofLocalY)) * smoothstep(0.42, 0.78, brNoise(vRoofWorldPos.xz * 1.4));
diffuseColor.rgb *= (0.78 + 0.28 * rPatina);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.22, 0.14), clamp(eaveMoss * 0.55 + rLichen * 0.28, 0.0, 0.65));`
      );
  };
}

/**
 * V3 512x512 RGBA alpha-cutout leaf/needle foliage CanvasTexture
 * with woody sub-twigs, serrated leaf midribs, and RGB bleed dilation.
 */
export function createBotanicalLeafCutoutTexture(
  species: 'pine' | 'spruce' | 'birch' | 'oak' | 'shrub'
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const palette = {
    pine: { base: '#2a4429', mid: '#3b5d33', tip: '#577a43', twig: '#543b28', seed: 101 },
    spruce: { base: '#1b3320', mid: '#27462a', tip: '#3c633a', twig: '#422e20', seed: 202 },
    birch: { base: '#577b38', mid: '#749c49', tip: '#99be61', twig: '#8c7e6c', seed: 303 },
    oak: { base: '#3a6029', mid: '#507b36', tip: '#6f9948', twig: '#4d3725', seed: 404 },
    shrub: { base: '#3f5e2d', mid: '#567c3b', tip: '#749b4e', twig: '#4f3a29', seed: 505 },
  }[species];

  const rand = makeRand(palette.seed);
  const rgbBase = new THREE.Color(palette.base);
  const r8 = Math.round(rgbBase.r * 255);
  const g8 = Math.round(rgbBase.g * 255);
  const b8 = Math.round(rgbBase.b * 255);
  ctx.clearRect(0, 0, size, size);

  const drawNeedleSprig = (cx: number, cy: number, ang: number, len: number, color: string) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.strokeStyle = palette.twig;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    const count = species === 'spruce' ? 30 : 22;
    ctx.strokeStyle = color;
    ctx.lineWidth = species === 'spruce' ? 3.2 : 2.6;
    for (let i = 0; i < count; i++) {
      const t = 0.1 + (i / count) * 0.9;
      const x = t * len;
      const spread = (species === 'spruce' ? 24 : 32) * (1 - t * 0.42);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (species === 'spruce' ? 10 : 17), side * spread * (0.72 + rand() * 0.46));
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const drawBroadLeafSprig = (cx: number, cy: number, ang: number, len: number, leafColor: string, leafSize: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.strokeStyle = palette.twig;
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    const leaves = species === 'birch' ? 13 : 9;
    for (let i = 0; i < leaves; i++) {
      const t = 0.14 + (i / leaves) * 0.86;
      const lx = t * len;
      const side = i % 2 === 0 ? 1 : -1;
      const ly = side * (leafSize * 0.65 + rand() * leafSize * 0.36);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(side * (0.55 + (rand() - 0.5) * 0.38));
      ctx.fillStyle = leafColor;
      ctx.beginPath();
      if (species === 'birch') {
        ctx.moveTo(0, -leafSize * 0.7);
        ctx.quadraticCurveTo(leafSize * 0.56, -leafSize * 0.16, leafSize * 0.44, leafSize * 0.38);
        ctx.lineTo(0, leafSize * 0.72);
        ctx.lineTo(-leafSize * 0.44, leafSize * 0.38);
        ctx.quadraticCurveTo(-leafSize * 0.56, -leafSize * 0.16, 0, -leafSize * 0.7);
      } else if (species === 'oak') {
        // Multi-lobed oak silhouette
        ctx.moveTo(0, -leafSize * 0.82);
        ctx.bezierCurveTo(leafSize * 0.55, -leafSize * 0.62, leafSize * 0.32, -leafSize * 0.25, leafSize * 0.62, -leafSize * 0.08);
        ctx.bezierCurveTo(leafSize * 0.68, leafSize * 0.22, leafSize * 0.26, leafSize * 0.42, leafSize * 0.42, leafSize * 0.62);
        ctx.lineTo(0, leafSize * 0.82);
        ctx.lineTo(-leafSize * 0.42, leafSize * 0.62);
        ctx.bezierCurveTo(-leafSize * 0.26, leafSize * 0.42, -leafSize * 0.68, leafSize * 0.22, -leafSize * 0.62, -leafSize * 0.08);
        ctx.bezierCurveTo(-leafSize * 0.32, -leafSize * 0.25, -leafSize * 0.55, -leafSize * 0.62, 0, -leafSize * 0.82);
      } else {
        ctx.ellipse(0, 0, leafSize * 0.52, leafSize * 0.78, 0, 0, Math.PI * 2);
      }
      ctx.fill();

      // Central midrib vein highlight
      ctx.strokeStyle = 'rgba(255,255,220,0.16)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -leafSize * 0.52);
      ctx.lineTo(0, leafSize * 0.55);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };

  const sprigCount = species === 'pine' || species === 'spruce' ? 46 : 52;
  for (let i = 0; i < sprigCount; i++) {
    const r = Math.pow(rand(), 0.7) * (size * 0.25);
    const a = (i / sprigCount) * Math.PI * 2 + (rand() - 0.5) * 0.4;
    const sx = size * 0.5 + Math.cos(a) * r;
    const sy = size * 0.5 + Math.sin(a) * r;
    const tone = rand();
    const col = tone > 0.62 ? palette.tip : tone > 0.24 ? palette.mid : palette.base;
    const len = size * (0.2 + rand() * 0.14);
    if (species === 'pine' || species === 'spruce') {
      drawNeedleSprig(sx, sy, a + (rand() - 0.5) * 0.6, len, col);
    } else {
      const lSz = species === 'birch' ? 21 + rand() * 10 : species === 'oak' ? 25 + rand() * 11 : 22 + rand() * 9;
      drawBroadLeafSprig(sx, sy, a + (rand() - 0.5) * 0.6, len, col, lSz);
    }
  }

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let p = 0; p < d.length; p += 4) {
    if (d[p + 3] < 8) {
      d[p] = r8;
      d[p + 1] = g8;
      d[p + 2] = b8;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds an organic tapered trunk with 3-4 forked limbs & root flare merged
 * into a single BufferGeometry so trees no longer look like stick-lollipop cylinders.
 */
export function createForkedTrunkGeometry(
  baseR: number,
  topR: number,
  trunkH: number,
  branches: { yFrac: number; yaw: number; tilt: number; len: number; rScale: number }[]
): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let vOffset = 0;

  const appendPart = (geo: THREE.BufferGeometry, mat4: THREE.Matrix4) => {
    geo.applyMatrix4(mat4);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const n = geo.attributes.normal as THREE.BufferAttribute;
    const u = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u.getX(i), u.getY(i));
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

  const mainGeo = new THREE.CylinderGeometry(topR, baseR, trunkH, 7, 3);
  const mp = mainGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < mp.count; i++) {
    const vy = mp.getY(i);
    if (vy < -trunkH * 0.35) {
      const flare = 1.24;
      mp.setX(i, mp.getX(i) * flare);
      mp.setZ(i, mp.getZ(i) * flare);
    }
    const h01 = (vy + trunkH * 0.5) / Math.max(0.1, trunkH);
    mp.setX(i, mp.getX(i) + Math.sin(h01 * 2.4) * baseR * 0.45);
  }
  mainGeo.computeVertexNormals();
  const mainM = new THREE.Matrix4().makeTranslation(0, trunkH * 0.5, 0);
  appendPart(mainGeo, mainM);

  const qYaw = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const vPos = new THREE.Vector3();
  const vScale = new THREE.Vector3(1, 1, 1);
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);

  for (const br of branches) {
    const bGeo = new THREE.CylinderGeometry(topR * br.rScale * 0.45, topR * br.rScale * 1.15, br.len, 5, 1);
    bGeo.translate(0, br.len * 0.5, 0);
    qYaw.setFromAxisAngle(axisY, br.yaw);
    qTilt.setFromAxisAngle(axisZ, br.tilt);
    qYaw.multiply(qTilt);
    vPos.set(0, trunkH * br.yFrac, 0);
    m.compose(vPos, qYaw, vScale);
    appendPart(bGeo, m);
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

/**
 * Builds an intersecting 3D botanical leaf-card cluster geometry with spherical
 * canopy normals and interior-to-tip vertex AO.
 */
export function createLeafCardClusterGeo(
  radiusX: number,
  radiusY: number,
  cardCount = 8,
  seed = 17,
  droopDown = 0.0
): THREE.BufferGeometry {
  const rand = makeRand(seed);
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let vOff = 0;

  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const centerN = new THREE.Vector3();

  for (let c = 0; c < cardCount; c++) {
    const cw = radiusX * (1.28 + rand() * 0.42);
    const ch = radiusY * (1.22 + rand() * 0.42);
    const card = new THREE.PlaneGeometry(cw, ch, 2, 2);
    const cp = card.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) {
      const px = cp.getX(i);
      const py = cp.getY(i);
      const arch = -(px * px + py * py) / Math.max(0.5, cw * ch) * 0.28 - droopDown * Math.abs(px) * 0.35;
      cp.setZ(i, arch);
    }

    const yaw = (c / cardCount) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    const pitch = (c % 3 === 0 ? 0.58 : c % 2 === 0 ? -0.46 : 0.14) + (rand() - 0.5) * 0.3;
    const roll = (rand() - 0.5) * 0.55;
    e.set(pitch, yaw, roll);
    q.setFromEuler(e);

    const offR = radiusX * (0.14 + rand() * 0.24);
    const offY = (rand() - 0.42) * radiusY * 0.42;
    m.compose(new THREE.Vector3(Math.cos(yaw) * offR, offY, Math.sin(yaw) * offR), q, new THREE.Vector3(1, 1, 1));
    card.applyMatrix4(m);

    const pAttr = card.attributes.position as THREE.BufferAttribute;
    const uAttr = card.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pAttr.count; i++) {
      v.set(pAttr.getX(i), pAttr.getY(i), pAttr.getZ(i));
      pos.push(v.x, v.y, v.z);
      uv.push(uAttr.getX(i), uAttr.getY(i));

      centerN.set(v.x / Math.max(0.2, radiusX), (v.y / Math.max(0.2, radiusY)) + 0.38, v.z / Math.max(0.2, radiusX)).normalize();
      nrm.push(centerN.x, centerN.y, centerN.z);

      const radialD = Math.min(1, v.length() / Math.max(0.4, (radiusX + radiusY) * 0.55));
      const hBias = THREE.MathUtils.clamp((v.y / Math.max(0.25, radiusY) + 1) * 0.5, 0, 1);
      const shade = 0.52 + radialD * 0.24 + hBias * 0.34;
      col.push(shade * 0.96, shade * 1.03, shade * 0.90);
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
 * Custom dappled leaf-silhouette shadow depth material matching wind sway.
 */
export function createLeafDepthMaterial(
  mapTex: THREE.Texture,
  windTimeUniform: { value: number }
): THREE.MeshDepthMaterial {
  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: mapTex,
    alphaTest: 0.42,
  });
  depthMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTimeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float wPhase = uWindTime * 1.65 + instanceMatrix[3].x * 0.15 + instanceMatrix[3].z * 0.19;
  float wAmp = max(0.0, transformed.y + 1.2) * 0.036;
  transformed.x += sin(wPhase) * wAmp;
  transformed.z += cos(wPhase * 0.82) * wAmp * 0.68;
#endif`
      );
  };
  return depthMat;
}

/**
 * V3 Lush Renda Meadow Grass (9,200 10-blade tufts), Wildflowers (950),
 * Woodland & Riparian Ferns (420), P120 roadside guideposts, utility poles,
 * and split-rail pasture fences placed accurately at real landmark coordinates.
 */
export function buildV2MeadowAndProps(
  scene: THREE.Scene,
  world: RendaWorldDataset,
  colliders: BuildingCollider[],
  windTimeUniform: { value: number },
  isSoftwareGl: boolean
): void {
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let seed = 8842;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const isBlocked = (gx: number, gz: number, roadPad = 0.85) => {
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (gx >= c.minX - 1.1 && gx <= c.maxX + 1.1 && gz >= c.minZ - 1.1 && gz <= c.maxZ + 1.1) {
        return true;
      }
    }
    for (const r of world.roads) {
      if (r.pts.length < 2) continue;
      const halfR = r.width * 0.5 + roadPad;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [ax, az] = r.pts[i];
        const [bx, bz] = r.pts[i + 1];
        const vx = bx - ax;
        const vz = bz - az;
        const l2 = vx * vx + vz * vz;
        if (l2 < 0.01) continue;
        const t = Math.max(0, Math.min(1, ((gx - ax) * vx + (gz - az) * vz) / l2));
        if (Math.hypot(gx - (ax + t * vx), gz - (az + t * vz)) < halfR) return true;
      }
    }
    const riv = findNearestRiverPoint(world.waterways, gx, gz);
    if (riv && riv.distance < riv.width * 0.52) return true;
    return false;
  };

  // Natural fallen branches & tree stumps are now loaded as Poly Haven GLTFs in aaaFoliageSystem.ts

  // 2. P120 Roadside black-and-white delineator guideposts & weathered timber utility poles
  const delinPostGeo = new THREE.BoxGeometry(0.1, 1.05, 0.06);
  const delinBandGeo = new THREE.BoxGeometry(0.11, 0.22, 0.07);
  const delinWhiteMat = new THREE.MeshStandardMaterial({ color: 0xbcbab2, roughness: 0.72 });
  const delinBlackMat = new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.74 });

  const delinList: { x: number; y: number; z: number; yaw: number }[] = [];
  const utilPoleList: { x: number; y: number; z: number; yaw: number }[] = [];

  for (const r of world.roads) {
    if (r.kind !== 'primary' || r.bridge || r.pts.length < 3) continue;
    for (let i = 1; i < r.pts.length - 1; i += 2) {
      const [px, pz] = r.pts[i];
      const [nxPt, nzPt] = r.pts[i + 1];
      const dx = nxPt - px;
      const dz = nzPt - pz;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const yaw = Math.atan2(dx, dz);

      if (delinList.length < 70) {
        for (const side of [-1, 1]) {
          const ox = px + nx * side * (r.width * 0.5 + 0.95);
          const oz = pz + nz * side * (r.width * 0.5 + 0.95);
          delinList.push({ x: ox, y: groundHeightAt(world, ox, oz), z: oz, yaw });
        }
      }
      if (i % 6 === 1 && utilPoleList.length < 28) {
        const ux = px + nx * (r.width * 0.5 + 3.2);
        const uz = pz + nz * (r.width * 0.5 + 3.2);
        if (!isBlocked(ux, uz, 0.2)) {
          utilPoleList.push({ x: ux, y: groundHeightAt(world, ux, uz), z: uz, yaw });
        }
      }
    }
  }

  if (delinList.length > 0) {
    const dPosts = new THREE.InstancedMesh(delinPostGeo, delinWhiteMat, delinList.length);
    const dBands = new THREE.InstancedMesh(delinBandGeo, delinBlackMat, delinList.length);
    for (let i = 0; i < delinList.length; i++) {
      const p = delinList[i];
      const leanX = (rand() - 0.5) * 0.055;
      const leanZ = (rand() - 0.5) * 0.055;
      dummy.position.set(p.x, p.y + 0.51, p.z);
      dummy.rotation.set(leanX, p.yaw, leanZ);
      dummy.scale.set(1, 0.95 + rand() * 0.08, 1);
      dummy.updateMatrix();
      dPosts.setMatrixAt(i, dummy.matrix);

      dummy.position.set(p.x, p.y + 0.77, p.z);
      dummy.updateMatrix();
      dBands.setMatrixAt(i, dummy.matrix);
    }
    dPosts.instanceMatrix.needsUpdate = true;
    dBands.instanceMatrix.needsUpdate = true;
    dPosts.computeBoundingSphere();
    dBands.computeBoundingSphere();
    scene.add(dPosts, dBands);
  }

  if (utilPoleList.length > 0) {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4b3d2e, roughness: 0.93 });
    const crossMat = new THREE.MeshStandardMaterial({ color: 0x35393b, roughness: 0.65, metalness: 0.42 });
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.16, 7.6, 7), poleMat, utilPoleList.length);
    const crossArms = new THREE.InstancedMesh(new THREE.BoxGeometry(1.45, 0.1, 0.1), crossMat, utilPoleList.length);
    for (let i = 0; i < utilPoleList.length; i++) {
      const p = utilPoleList[i];
      const leanX = (rand() - 0.5) * 0.032;
      const leanZ = (rand() - 0.5) * 0.032;
      dummy.position.set(p.x, p.y + 3.7, p.z);
      dummy.rotation.set(leanX, p.yaw, leanZ);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);

      dummy.position.set(p.x + leanZ * 3.4, p.y + 7.1, p.z - leanX * 3.4);
      dummy.updateMatrix();
      crossArms.setMatrixAt(i, dummy.matrix);
    }
    poles.instanceMatrix.needsUpdate = true;
    crossArms.instanceMatrix.needsUpdate = true;
    poles.castShadow = !isSoftwareGl;
    poles.computeBoundingSphere();
    crossArms.computeBoundingSphere();
    scene.add(poles, crossArms);
  }

  // 3. Rustic weathered Latvian wooden split-rail pasture fences with organic lean & tonal variation
  const makeWeatheredWoodTex = (baseHex: string, darkHex: string, mossHex: string, seedVal: number) => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    const r = makeRand(seedVal);
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = i % 3 === 0 ? mossHex : darkHex;
      ctx.globalAlpha = 0.12 + r() * 0.22;
      ctx.fillRect(r() * 128, 0, 2 + r() * 5, 128);
    }
    // Lower damp mud splash & moss
    const grad = ctx.createLinearGradient(0, 82, 0, 128);
    grad.addColorStop(0, 'rgba(38,42,26,0)');
    grad.addColorStop(1, 'rgba(36,34,26,0.48)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 82, 128, 46);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    return t;
  };

  const fenceTex = makeWeatheredWoodTex('#5c4835', '#362a1e', '#434d33', 912);
  const fenceWoodMat = new THREE.MeshStandardMaterial({ map: fenceTex, roughness: 0.94 });
  const fenceSegments: [number, number, number, number][] = [
    [-156, -642, -108, -654], // Lielrenda Manor south park paddock
    [-906, -92, -864, -84],   // Abavas Laivas pier meadow edge
    [146, 76, 172, 114],      // West churchyard lane
    [296, 62, 336, 86],       // East village pasture
  ];
  const fencePostPts: [number, number, number][] = [];
  const fenceRailPts: [number, number, number, number, number][] = [];
  for (const [x0, z0, x1, z1] of fenceSegments) {
    const total = Math.hypot(x1 - x0, z1 - z0);
    const spans = Math.max(2, Math.floor(total / 3.2));
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= spans; i++) {
      const t = i / spans;
      const fx = x0 + (x1 - x0) * t;
      const fz = z0 + (z1 - z0) * t;
      const fy = groundHeightAt(world, fx, fz);
      fencePostPts.push([fx, fy, fz]);
      if (i < spans) {
        const tNext = (i + 1) / spans;
        const nx = x0 + (x1 - x0) * tNext;
        const nz = z0 + (z1 - z0) * tNext;
        const ny = groundHeightAt(world, nx, nz);
        const spanLen = Math.hypot(nx - fx, nz - fz);
        fenceRailPts.push([(fx + nx) * 0.5, (fy + ny) * 0.5, (fz + nz) * 0.5, yaw, spanLen]);
      }
    }
  }
  if (fencePostPts.length > 0 && fenceRailPts.length > 0) {
    const fPosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.065, 0.08, 1.25, 6), fenceWoodMat, fencePostPts.length);
    for (let i = 0; i < fencePostPts.length; i++) {
      const [fx, fy, fz] = fencePostPts[i];
      dummy.position.set(fx, fy + 0.54, fz);
      dummy.rotation.set((rand() - 0.5) * 0.075, rand() * Math.PI * 2, (rand() - 0.5) * 0.075);
      dummy.scale.set(1, 0.92 + rand() * 0.14, 1);
      dummy.updateMatrix();
      fPosts.setMatrixAt(i, dummy.matrix);
      tint.setScalar(0.84 + rand() * 0.24);
      fPosts.setColorAt(i, tint);
    }
    const fRails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.09, 1), fenceWoodMat, fenceRailPts.length * 2);
    for (let i = 0; i < fenceRailPts.length; i++) {
      const [mx, my, mz, yaw, len] = fenceRailPts[i];
      for (const [ri, hOff] of [[0, 0.52], [1, 0.92]] as [number, number][]) {
        dummy.position.set(mx, my + hOff + (rand() - 0.5) * 0.03, mz);
        dummy.rotation.set((rand() - 0.5) * 0.04, yaw, (rand() - 0.5) * 0.03);
        dummy.scale.set(1, 1, len + 0.1);
        dummy.updateMatrix();
        fRails.setMatrixAt(i * 2 + ri, dummy.matrix);
        tint.setScalar(0.84 + rand() * 0.22);
        fRails.setColorAt(i * 2 + ri, tint);
      }
    }
    fPosts.instanceMatrix.needsUpdate = true;
    fRails.instanceMatrix.needsUpdate = true;
    if (fPosts.instanceColor) fPosts.instanceColor.needsUpdate = true;
    if (fRails.instanceColor) fRails.instanceColor.needsUpdate = true;
    fPosts.castShadow = !isSoftwareGl;
    fPosts.computeBoundingSphere();
    fRails.computeBoundingSphere();
    scene.add(fPosts, fRails);
  }

  // 4. Overhead sagging utility wires & village streetlamp arms along utility poles
  if (utilPoleList.length >= 2) {
    const wireVerts: number[] = [];
    for (let i = 0; i < utilPoleList.length - 1; i++) {
      const a = utilPoleList[i];
      const b = utilPoleList[i + 1];
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      if (dist > 65 || dist < 4) continue;
      for (const sideOff of [-0.46, 0, 0.46]) {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const ox = (-dz / len) * sideOff;
        const oz = (dx / len) * sideOff;
        const steps = 6;
        for (let s = 0; s < steps; s++) {
          const t0 = s / steps;
          const t1 = (s + 1) / steps;
          const sag0 = Math.sin(t0 * Math.PI) * Math.min(1.1, dist * 0.024);
          const sag1 = Math.sin(t1 * Math.PI) * Math.min(1.1, dist * 0.024);
          wireVerts.push(
            a.x + dx * t0 + ox, a.y + 7.12 - sag0 + (b.y - a.y) * t0, a.z + dz * t0 + oz,
            a.x + dx * t1 + ox, a.y + 7.12 - sag1 + (b.y - a.y) * t1, a.z + dz * t1 + oz
          );
        }
      }
    }
    if (wireVerts.length > 0) {
      const wGeo = new THREE.BufferGeometry();
      wGeo.setAttribute('position', new THREE.Float32BufferAttribute(wireVerts, 3));
      const wMat = new THREE.LineBasicMaterial({ color: 0x1b1d1f, transparent: true, opacity: 0.78 });
      scene.add(new THREE.LineSegments(wGeo, wMat));
    }
  }

  // 5. Authentic weathered Latvian roadside signs ("RENDA" entry, Bus Stop, Pedestrian Crossing)
  const makeSignTexture = (kind: 'renda' | 'bus' | 'crossing'): THREE.CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = kind === 'renda' ? 512 : 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    if (kind === 'renda') {
      ctx.fillStyle = '#cfccc2';
      ctx.fillRect(0, 0, 512, 256);
      ctx.strokeStyle = '#1e2022';
      ctx.lineWidth = 18;
      ctx.strokeRect(14, 14, 484, 228);
      ctx.fillStyle = '#1b1d1f';
      ctx.font = '700 108px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('RENDA', 256, 134);
    } else if (kind === 'bus') {
      ctx.fillStyle = '#1b4980';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#d4d1c7';
      ctx.lineWidth = 12;
      ctx.strokeRect(12, 12, 232, 232);
      ctx.fillStyle = '#dcd9cf';
      ctx.fillRect(58, 62, 140, 108);
      ctx.fillStyle = '#1b4980';
      ctx.fillRect(72, 78, 112, 42);
      ctx.fillStyle = '#1b4980';
      ctx.beginPath();
      ctx.arc(84, 174, 14, 0, Math.PI * 2);
      ctx.arc(172, 174, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dcd9cf';
      ctx.font = '700 28px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('RENDA', 128, 224);
    } else {
      ctx.fillStyle = '#1b4980';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = '#d4d1c7';
      ctx.lineWidth = 10;
      ctx.strokeRect(10, 10, 236, 236);
      ctx.fillStyle = '#dcd9cf';
      ctx.beginPath();
      ctx.moveTo(128, 38);
      ctx.lineTo(214, 210);
      ctx.lineTo(42, 210);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1e2022';
      ctx.beginPath();
      ctx.arc(128, 102, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(118, 118, 20, 42);
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#1e2022';
      ctx.beginPath();
      ctx.moveTo(124, 155);
      ctx.lineTo(100, 198);
      ctx.moveTo(134, 155);
      ctx.lineTo(154, 198);
      ctx.stroke();
    }
    // Weathered grime streaks, rust chips & damp edge patina
    const sr = makeRand(kind.length * 709);
    for (let i = 0; i < 65; i++) {
      const gx = sr() * c.width;
      const gy = sr() * c.height;
      ctx.fillStyle = i % 4 === 0 ? 'rgba(110,68,38,0.28)' : 'rgba(42,40,34,0.16)';
      ctx.fillRect(gx, gy, 2 + sr() * 7, 4 + sr() * 24);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };

  const galvMat = new THREE.MeshStandardMaterial({ color: 0x7e8589, roughness: 0.56, metalness: 0.65 });
  const signBackMat = new THREE.MeshStandardMaterial({ color: 0x5c6266, roughness: 0.68, metalness: 0.48 });

  // RENDA village entry sign on right shoulder of Church Road matching Ref 3
  const rendaSignPos = { x: 162.8, z: 50.8 };
  const rendaSignY = groundHeightAt(world, rendaSignPos.x, rendaSignPos.z);
  const rendaSignGrp = new THREE.Group();
  rendaSignGrp.position.set(rendaSignPos.x, rendaSignY, rendaSignPos.z);
  rendaSignGrp.rotation.y = Math.atan2(168 - rendaSignPos.x, 38.5 - rendaSignPos.z);
  rendaSignGrp.rotation.z = 0.018;
  for (const px of [-0.52, 0.52]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 2.65, 8), galvMat);
    post.position.set(px, 1.32, 0);
    post.castShadow = !isSoftwareGl;
    rendaSignGrp.add(post);
  }
  const rendaBoard = new THREE.Mesh(
    new THREE.BoxGeometry(1.42, 0.68, 0.05),
    [signBackMat, signBackMat, signBackMat, signBackMat, new THREE.MeshStandardMaterial({ map: makeSignTexture('renda'), roughness: 0.62 }), signBackMat]
  );
  rendaBoard.position.set(0, 2.25, 0.03);
  rendaBoard.castShadow = !isSoftwareGl;
  rendaSignGrp.add(rendaBoard);
  scene.add(rendaSignGrp);

  // Bus Stop sign next to shelter (232.0, 80.5) & Pedestrian crossing signs along Church Rd
  const busTex = makeSignTexture('bus');
  const crossTex = makeSignTexture('crossing');
  const smallSignSpecs: { x: number; z: number; lookX: number; lookZ: number; tex: THREE.CanvasTexture }[] = [
    { x: 231.2, z: 80.2, lookX: 168, lookZ: 38.5, tex: busTex },
    { x: 164.8, z: 86.5, lookX: 168, lookZ: 38.5, tex: crossTex },
    { x: 173.4, z: 92.2, lookX: 168, lookZ: 38.5, tex: crossTex },
  ];
  for (const sp of smallSignSpecs) {
    const sy = groundHeightAt(world, sp.x, sp.z);
    const grp = new THREE.Group();
    grp.position.set(sp.x, sy, sp.z);
    grp.rotation.y = Math.atan2(sp.lookX - sp.x, sp.lookZ - sp.z);
    grp.rotation.z = (rand() - 0.5) * 0.04;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 2.5, 8), galvMat);
    post.position.y = 1.25;
    grp.add(post);
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.64, 0.64, 0.04),
      [signBackMat, signBackMat, signBackMat, signBackMat, new THREE.MeshStandardMaterial({ map: sp.tex, roughness: 0.6 }), signBackMat]
    );
    board.position.set(0, 2.22, 0.02);
    grp.add(board);
    scene.add(grp);
  }

  // 6. Village weathered wooden picket fences with missing/crooked aged slats & tonal patina
  const picketTex = makeWeatheredWoodTex('#6b6052', '#423930', '#485239', 418);
  const picketMat = new THREE.MeshStandardMaterial({ map: picketTex, roughness: 0.92 });
  const picketRuns: [number, number, number, number][] = [
    [164.3, 53.5, 165.4, 83.5],
    [172.2, 54.0, 173.1, 86.0],
    [186.5, 18.0, 198.0, 25.5],
  ];
  const pPosts: [number, number, number][] = [];
  const pSlats: [number, number, number, number][] = [];
  const pRails: [number, number, number, number, number][] = [];
  for (const [x0, z0, x1, z1] of picketRuns) {
    const total = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const slatCount = Math.floor(total / 0.24);
    for (let s = 0; s <= slatCount; s++) {
      if (s % 10 === 0) {
        const t = s / slatCount;
        const px = x0 + (x1 - x0) * t;
        const pz = z0 + (z1 - z0) * t;
        pPosts.push([px, groundHeightAt(world, px, pz), pz]);
      }
      // Realistic aged picket fence: occasional missing or crooked slat
      if (s % 23 === 11) continue;
      const t = s / slatCount;
      const sx = x0 + (x1 - x0) * t;
      const sz = z0 + (z1 - z0) * t;
      const sy = groundHeightAt(world, sx, sz);
      pSlats.push([sx, sy, sz, yaw]);
    }
    const midY0 = groundHeightAt(world, x0, z0);
    const midY1 = groundHeightAt(world, x1, z1);
    pRails.push([(x0 + x1) * 0.5, (midY0 + midY1) * 0.5, (z0 + z1) * 0.5, yaw, total]);
  }
  if (pSlats.length > 0) {
    const slatIm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.92, 0.11), picketMat, pSlats.length);
    for (let i = 0; i < pSlats.length; i++) {
      const [sx, sy, sz, yaw] = pSlats[i];
      dummy.position.set(sx, sy + 0.45 + (rand() - 0.5) * 0.025, sz);
      dummy.rotation.set((rand() - 0.5) * 0.055, yaw, (rand() - 0.5) * 0.045);
      dummy.scale.set(1, 0.88 + rand() * 0.16, 1);
      dummy.updateMatrix();
      slatIm.setMatrixAt(i, dummy.matrix);
      tint.setScalar(0.80 + rand() * 0.26);
      slatIm.setColorAt(i, tint);
    }
    slatIm.instanceMatrix.needsUpdate = true;
    if (slatIm.instanceColor) slatIm.instanceColor.needsUpdate = true;
    slatIm.computeBoundingSphere();
    scene.add(slatIm);

    const railIm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.07, 1), picketMat, pRails.length * 2);
    for (let i = 0; i < pRails.length; i++) {
      const [mx, my, mz, yaw, len] = pRails[i];
      for (const [ri, hy] of [[0, 0.28], [1, 0.72]] as [number, number][]) {
        dummy.position.set(mx, my + hy, mz);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, len);
        dummy.updateMatrix();
        railIm.setMatrixAt(i * 2 + ri, dummy.matrix);
      }
    }
    railIm.instanceMatrix.needsUpdate = true;
    railIm.computeBoundingSphere();
    scene.add(railIm);
  }
  if (pPosts.length > 0) {
    const postIm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 1.05, 0.09), picketMat, pPosts.length);
    for (let i = 0; i < pPosts.length; i++) {
      const [px, py, pz] = pPosts[i];
      dummy.position.set(px, py + 0.5, pz);
      dummy.rotation.set((rand() - 0.5) * 0.045, 0, (rand() - 0.5) * 0.045);
      dummy.scale.set(1, 0.96 + rand() * 0.08, 1);
      dummy.updateMatrix();
      postIm.setMatrixAt(i, dummy.matrix);
    }
    postIm.instanceMatrix.needsUpdate = true;
    postIm.computeBoundingSphere();
    scene.add(postIm);
  }

  // 7. Riparian water lily pads near P120 Abava Bridge & canoe pier (Ref 1)
  const lilyShape = new THREE.Shape();
  lilyShape.absarc(0, 0, 0.26, 0.22, Math.PI * 2 - 0.22, false);
  lilyShape.lineTo(0, 0);
  lilyShape.closePath();
  const lilyGeo = new THREE.ShapeGeometry(lilyShape);
  lilyGeo.rotateX(-Math.PI / 2);
  const lilyMat = new THREE.MeshStandardMaterial({ color: 0x456330, roughness: 0.45, metalness: 0.04, side: THREE.DoubleSide });
  const lilyCoords: [number, number, number][] = [];
  for (const [cx, cz, rad, count] of [
    [224, -158, 14, 34],
    [248, -142, 13, 28],
    [-874, -108, 12, 24],
  ] as [number, number, number, number][]) {
    for (let k = 0; k < count; k++) {
      const ang = rand() * Math.PI * 2;
      const r = rand() * rad;
      const lx = cx + Math.cos(ang) * r;
      const lz = cz + Math.sin(ang) * r;
      const riv = findNearestRiverPoint(world.waterways, lx, lz);
      if (riv && riv.distance < riv.width * 0.45 && riv.distance > riv.width * 0.14) {
        lilyCoords.push([lx, groundHeightAt(world, riv.x, riv.z) + 0.57, lz]);
      }
    }
  }
  if (lilyCoords.length > 0) {
    const lilyIm = new THREE.InstancedMesh(lilyGeo, lilyMat, lilyCoords.length);
    for (let i = 0; i < lilyCoords.length; i++) {
      const [lx, ly, lz] = lilyCoords[i];
      dummy.position.set(lx, ly, lz);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.setScalar(0.75 + rand() * 0.7);
      dummy.updateMatrix();
      lilyIm.setMatrixAt(i, dummy.matrix);
    }
    lilyIm.instanceMatrix.needsUpdate = true;
    lilyIm.computeBoundingSphere();
    scene.add(lilyIm);
  }
}

/**
 * Clean photographic filmic color-grading & optical vignette ShaderPass
 * (zero film grain or unsharp halo artifacts so fine foliage & stonework stay crystal-clear).
 */
export function createCinematicColorGradeShader() {
  return {
    uniforms: {
      tDiffuse: { value: null },
      uVignette: { value: 0.26 },
      uWarmth: { value: 0.03 },
      uContrast: { value: 0.18 },
      uSaturation: { value: 0.86 },
      uGrain: { value: 0.0 },
      uResolution: { value: new THREE.Vector2(1440, 900) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uVignette;
      uniform float uWarmth;
      uniform float uContrast;
      uniform float uSaturation;
      uniform float uGrain;
      uniform vec2 uResolution;
      varying vec2 vUv;

      void main() {
        vec4 center = texture2D(tDiffuse, vUv);
        vec3 col = center.rgb;

        float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(luma), col, uSaturation);

        vec3 shadowTint = vec3(0.93, 0.96, 1.03);
        vec3 highlightTint = vec3(1.0 + uWarmth, 1.0 + uWarmth * 0.42, 1.0 - uWarmth * 0.45);
        col *= mix(shadowTint, highlightTint, smoothstep(0.06, 0.72, luma));

        vec3 sCurve = col * col * (3.0 - 2.0 * clamp(col, 0.0, 1.0));
        col = mix(col, sCurve, uContrast);

        vec2 dist = vUv - 0.5;
        float r2 = dot(dist, dist) * 2.0;
        float vig = 1.0 - smoothstep(0.28, 1.38, r2) * uVignette;
        col *= vig;
        gl_FragColor = vec4(col, center.a);
      }
    `,
  };
}
