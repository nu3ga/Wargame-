import * as THREE from 'three';
import { groundHeightAt } from './rendaMath';
import type { AtmospherePreset, RendaWorldDataset } from './types';

export interface BattlefieldAtmosphereHandle {
  update: (dt: number, elapsed: number, camera: THREE.Camera) => void;
  setAtmosphere: (preset: AtmospherePreset) => void;
  dispose: () => void;
}

interface AtmosphereLook {
  mist: number;
  smoke: number;
  rain: number;
  motes: number;
  mistColor: number;
  smokeColor: number;
  particleColor: number;
}

const LOOKS: Record<AtmospherePreset, AtmosphereLook> = {
  morning: { mist: 1, smoke: 0.32, rain: 0, motes: 0.1, mistColor: 0xadb8b4, smokeColor: 0x666d6a, particleColor: 0xbbc5c1 },
  golden: { mist: 0.34, smoke: 0.44, rain: 0, motes: 0.18, mistColor: 0xbeb9a9, smokeColor: 0x6c6b60, particleColor: 0xc6c1ab },
  overcast_rain: { mist: 0.8, smoke: 0.48, rain: 1, motes: 0, mistColor: 0x99a8ad, smokeColor: 0x5d666a, particleColor: 0xb9c9d1 },
  noon: { mist: 0.05, smoke: 0.24, rain: 0, motes: 0.055, mistColor: 0xb4c0c2, smokeColor: 0x707674, particleColor: 0xb8c0b1 },
  twilight: { mist: 0.62, smoke: 0.32, rain: 0, motes: 0.025, mistColor: 0x657987, smokeColor: 0x424d58, particleColor: 0x8b9ba5 },
};

function makeRandom(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Repeatable tileable noise, sampled by every bank/plume instead of per-pixel FBM. */
function makeAtmosphereNoise(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size);
  const rand = makeRandom(460311);
  const grids = [4, 8, 16, 32, 64].map((cells) => ({
    cells,
    values: Float32Array.from({ length: cells * cells }, rand),
  }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      let weight = 0.54;
      let total = 0;
      for (const { cells, values } of grids) {
        const px = x / size * cells;
        const py = y / size * cells;
        const ix = Math.floor(px);
        const iy = Math.floor(py);
        const fx = px - ix;
        const fy = py - iy;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const at = (gx: number, gy: number) => values[(gy % cells) * cells + (gx % cells)];
        sum += THREE.MathUtils.lerp(
          THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), sx),
          THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx),
          sy
        ) * weight;
        total += weight;
        weight *= 0.5;
      }
      data[y * size + x] = Math.round(sum / total * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function makeBillboardGeometry(): THREE.InstancedBufferGeometry {
  const source = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', source.getAttribute('position').clone());
  geometry.setAttribute('uv', source.getAttribute('uv').clone());
  geometry.setIndex(source.getIndex()!.clone());
  source.dispose();
  return geometry;
}

/**
 * Sparse, layered atmosphere around the village, rather than a haze over the view.
 * All coordinates are world metres. The approach road and checkpoint sightline stay clear.
 */
export function createBattlefieldAtmosphere(
  scene: THREE.Scene,
  world: RendaWorldDataset
): BattlefieldAtmosphereHandle {
  const group = new THREE.Group();
  group.name = 'battlefield-atmosphere';
  scene.add(group);
  const noise = makeAtmosphereNoise();
  const rand = makeRandom(302177);
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const cameraPosition = new THREE.Vector3();
  let disposed = false;

  const bankUniforms = {
    uNoise: { value: noise },
    uTime: { value: 0 },
    uRight: { value: right },
    uUp: { value: up },
    uMist: { value: 0.8 },
    uSmoke: { value: 0.48 },
    uMistColor: { value: new THREE.Color(LOOKS.overcast_rain.mistColor) },
    uSmokeColor: { value: new THREE.Color(LOOKS.overcast_rain.smokeColor) },
  };
  const banks = makeBillboardGeometry();
  const centers: number[] = [];
  const sizes: number[] = [];
  const seeds: number[] = [];
  const kinds: number[] = [];
  // Low banks sit behind vegetation and architecture, not across the approach itself.
  const mistSpots: [number, number, number, number][] = [
    [137, 67, 24, 1.4], [123, 91, 34, 1.7], [140, 119, 28, 1.5],
    [148, 153, 30, 1.8], [224, 136, 34, 2.1], [238, 78, 32, 1.6],
    [196, 172, 41, 2.1], [194, 218, 44, 2.4], [98, 24, 34, 1.9],
    [127, -9, 28, 1.5], [220, 20, 30, 1.5], [106, 151, 35, 2.1],
  ];
  for (const [x, z, width, height] of mistSpots) {
    // Three separately seeded, shallow layers break the appearance of a flat rectangle.
    for (let layer = 0; layer < 3; layer++) {
      const px = x + (rand() - 0.5) * width * 0.45;
      const pz = z + (rand() - 0.5) * 7;
      centers.push(px, groundHeightAt(world, px, pz) + height * 0.35, pz);
      sizes.push(width * (0.75 + rand() * 0.35), height * (0.65 + rand() * 0.5));
      seeds.push(rand());
      kinds.push(0);
    }
  }
  // Two distant sources imply activity beyond the village; no flames or combat effects.
  for (const [x, z] of [[97, 174], [258, 188]]) {
    const baseY = groundHeightAt(world, x, z);
    for (let i = 0; i < 22; i++) {
      centers.push(x + (rand() - 0.5) * 2.2, baseY + 2 + rand() * 1.5, z + (rand() - 0.5) * 2.2);
      sizes.push(5 + rand() * 4, 7 + rand() * 6);
      seeds.push((i + rand() * 0.6) / 22);
      kinds.push(1);
    }
  }
  banks.setAttribute('aCenter', new THREE.InstancedBufferAttribute(new Float32Array(centers), 3));
  banks.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 2));
  banks.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
  banks.setAttribute('aKind', new THREE.InstancedBufferAttribute(new Float32Array(kinds), 1));
  banks.instanceCount = kinds.length;
  const bankMaterial = new THREE.ShaderMaterial({
    name: 'Village layered vapour',
    uniforms: bankUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 aCenter;
      attribute vec2 aSize;
      attribute float aSeed;
      attribute float aKind;
      uniform float uTime;
      uniform vec3 uRight;
      uniform vec3 uUp;
      varying vec2 vUv;
      varying float vSeed;
      varying float vKind;
      varying float vLife;
      varying float vDistance;
      void main() {
        vUv = uv; vSeed = aSeed; vKind = aKind;
        vec3 center = aCenter;
        vec2 scale = aSize;
        vLife = 1.0;
        vec3 vertical = vec3(0.0, 1.0, 0.0);
        vec3 horizontal = normalize(vec3(uRight.x, 0.0, uRight.z));
        if (aKind > 0.5) {
          float age = fract(aSeed + uTime * 0.011);
          center.y += age * 34.0;
          center.x += age * age * 11.5 + sin(age * 7.0 + aSeed * 11.0) * 1.2;
          center.z += age * 2.8;
          scale *= 0.65 + age * 1.25;
          vLife = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.5, 1.0, age));
          horizontal = uRight; vertical = uUp;
        } else {
          center.x += sin(uTime * 0.035 + aSeed * 18.0) * 1.8;
          center.y += sin(uTime * 0.065 + aSeed * 8.0) * 0.08;
        }
        vec3 wp = center + horizontal * position.x * scale.x + vertical * position.y * scale.y;
        vDistance = distance(wp, cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uNoise;
      uniform float uTime;
      uniform float uMist;
      uniform float uSmoke;
      uniform vec3 uMistColor;
      uniform vec3 uSmokeColor;
      varying vec2 vUv;
      varying float vSeed;
      varying float vKind;
      varying float vLife;
      varying float vDistance;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float envelope = pow(max(0.0, 1.0 - dot(p, p)), 1.7);
        vec2 drift = vec2(uTime * 0.0025, -uTime * 0.0014);
        vec2 seed = vec2(vSeed * 3.17, vSeed * 7.91);
        float broad = texture2D(uNoise, vUv * vec2(1.4, 0.9) + seed + drift).r;
        float fine = texture2D(uNoise, vUv * vec2(4.8, 2.1) - seed + drift * 2.2).r;
        float density = smoothstep(0.29, 0.74, broad * 0.76 + fine * 0.24);
        float nearFade = smoothstep(7.0, 22.0, vDistance);
        float farFade = 1.0 - smoothstep(450.0, 700.0, vDistance);
        float alpha;
        vec3 color;
        if (vKind > 0.5) {
          alpha = envelope * density * vLife * uSmoke * 0.28;
          color = mix(uSmokeColor, uMistColor, 0.06 + broad * 0.08);
        } else {
          // The layered sum remains translucent even when banks overlap in projection.
          alpha = envelope * density * uMist * 0.105;
          color = uMistColor * (0.94 + broad * 0.1);
        }
        alpha *= nearFade * farFade;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const bankMesh = new THREE.Mesh(banks, bankMaterial);
  bankMesh.name = 'Village mist and distant smoke';
  bankMesh.frustumCulled = false;
  bankMesh.renderOrder = 3;
  group.add(bankMesh);

  const particles = makeBillboardGeometry();
  const offsets: number[] = [];
  const dimensions: number[] = [];
  const particleSeeds: number[] = [];
  for (let i = 0; i < 1100; i++) {
    offsets.push((rand() - 0.5) * 82, rand() * 28, (rand() - 0.5) * 82);
    dimensions.push(0.009 + rand() * 0.012, 0.28 + rand() * 0.5);
    particleSeeds.push(rand());
  }
  particles.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
  particles.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(dimensions), 2));
  particles.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(particleSeeds), 1));
  particles.instanceCount = particleSeeds.length;
  const particleUniforms = {
    uTime: { value: 0 },
    uRight: { value: right },
    uCamera: { value: cameraPosition },
    uFloor: { value: groundHeightAt(world, world.meta.spawnX, world.meta.spawnZ) },
    uRain: { value: 1 },
    uMotes: { value: 0 },
    uColor: { value: new THREE.Color(LOOKS.overcast_rain.particleColor) },
  };
  const particleMaterial = new THREE.ShaderMaterial({
    name: 'Fine world rain and airborne dust',
    uniforms: particleUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec3 aOffset;
      attribute vec2 aSize;
      attribute float aSeed;
      uniform float uTime;
      uniform vec3 uRight;
      uniform vec3 uCamera;
      uniform float uFloor;
      uniform float uRain;
      uniform float uMotes;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vDistance;
      void main() {
        vUv = uv;
        bool raining = uRain > 0.05;
        vec3 center;
        vec2 size = aSize;
        if (raining) {
          center.x = mod(aOffset.x - uCamera.x + uTime * 0.7 + 41.0, 82.0) + uCamera.x - 41.0;
          center.z = mod(aOffset.z - uCamera.z + uTime * 0.18 + 41.0, 82.0) + uCamera.z - 41.0;
          center.y = uFloor + mod(aOffset.y - uTime * (14.0 + aSeed * 6.0), 28.0) + 0.12;
          vAlpha = aSeed < uRain * 0.86 ? 0.21 : 0.0;
        } else {
          center.x = mod(aOffset.x - uCamera.x + uTime * 0.12 + 41.0, 82.0) + uCamera.x - 41.0;
          center.z = mod(aOffset.z - uCamera.z + 41.0, 82.0) + uCamera.z - 41.0;
          center.y = uFloor + 0.6 + mod(aOffset.y * 0.25 + sin(uTime * 0.14 + aSeed * 8.0) * 0.4, 6.0);
          size = vec2(0.023 + aSeed * 0.025);
          vAlpha = aSeed < uMotes ? 0.26 : 0.0;
        }
        vec3 wp = center + uRight * (position.x * size.x - position.y * size.y * (raining ? 0.045 : 0.0));
        wp.y += position.y * size.y;
        vDistance = distance(center, uCamera);
        vAlpha *= smoothstep(1.2, 4.0, vDistance) * (1.0 - smoothstep(28.0, 43.0, vDistance));
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uRain;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vDistance;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float shape = uRain > 0.05
          ? (1.0 - smoothstep(0.0, 1.0, abs(p.x))) * (1.0 - smoothstep(0.2, 1.0, abs(p.y)))
          : pow(max(0.0, 1.0 - dot(p, p)), 2.0);
        float alpha = shape * vAlpha;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const particleMesh = new THREE.Mesh(particles, particleMaterial);
  particleMesh.name = 'Fine local weather';
  particleMesh.frustumCulled = false;
  particleMesh.renderOrder = 4;
  group.add(particleMesh);

  const setAtmosphere = (preset: AtmospherePreset) => {
    const look = LOOKS[preset];
    bankUniforms.uMist.value = look.mist;
    bankUniforms.uSmoke.value = look.smoke;
    bankUniforms.uMistColor.value.setHex(look.mistColor);
    bankUniforms.uSmokeColor.value.setHex(look.smokeColor);
    particleUniforms.uRain.value = look.rain;
    particleUniforms.uMotes.value = look.motes;
    particleUniforms.uColor.value.setHex(look.particleColor);
    particleMesh.visible = look.rain > 0 || look.motes > 0;
  };
  setAtmosphere('overcast_rain');

  return {
    setAtmosphere,
    update: (_dt, elapsed, camera) => {
      if (disposed) return;
      bankUniforms.uTime.value = elapsed;
      particleUniforms.uTime.value = elapsed;
      camera.updateWorldMatrix(true, false);
      cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      up.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
      particleUniforms.uFloor.value = groundHeightAt(world, cameraPosition.x, cameraPosition.z);
      // The effect belongs to the village; wide-world exploration stays inexpensive.
      bankMesh.visible = Math.hypot(cameraPosition.x - 175, cameraPosition.z - 110) < 720;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      banks.dispose();
      particles.dispose();
      bankMaterial.dispose();
      particleMaterial.dispose();
      noise.dispose();
    },
  };
}
