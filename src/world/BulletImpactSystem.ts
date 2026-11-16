import * as THREE from 'three';

const MARK_COUNT = 24;
const DUST_COUNT = 48;
const MARK_LIFETIME = 32;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface ImpactMark {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  age: number;
}

interface DustPuff {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  velocity: THREE.Vector3;
  age: number;
  lifetime: number;
  startSize: number;
  endSize: number;
  opacity: number;
}

function createImpactTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const halo = ctx.createRadialGradient(64, 64, 5, 64, 64, 39);
  halo.addColorStop(0, 'rgba(13,15,13,.94)');
  halo.addColorStop(0.23, 'rgba(24,25,21,.78)');
  halo.addColorStop(0.46, 'rgba(52,48,39,.35)');
  halo.addColorStop(1, 'rgba(59,52,41,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 128, 128);

  // Uneven chips and hairline cracks keep a small scar from reading as a black circle.
  let seed = 8621;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 13; i++) {
    const angle = random() * Math.PI * 2;
    const length = 17 + random() * 29;
    ctx.strokeStyle = `rgba(24,26,22,${0.12 + random() * 0.25})`;
    ctx.lineWidth = 0.7 + random() * 1.1;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(angle) * 9, 64 + Math.sin(angle) * 9);
    ctx.lineTo(64 + Math.cos(angle + 0.08) * length * 0.6, 64 + Math.sin(angle + 0.08) * length * 0.6);
    ctx.lineTo(64 + Math.cos(angle) * length, 64 + Math.sin(angle) * length);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(8,10,9,.88)';
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    const radius = 5.2 + random() * 3;
    const x = 64 + Math.cos(angle) * radius;
    const y = 64 + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDustTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  // Several overlapping lobes make a soft irregular cloud, with no additive glow.
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.39996;
    const x = 64 + Math.cos(angle) * (i % 3) * 9;
    const y = 64 + Math.sin(angle) * (i % 3) * 9;
    const radius = 24 + (i % 4) * 5;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,.18)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,.1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Bounded surface feedback for hits against static solid meshes; no gameplay damage. */
export class BulletImpactSystem {
  private readonly group = new THREE.Group();
  private readonly markGeometry = new THREE.PlaneGeometry(1, 1);
  private readonly markTexture = createImpactTexture();
  private readonly dustTexture = createDustTexture();
  private readonly marks: ImpactMark[] = [];
  private readonly dust: DustPuff[] = [];
  private readonly raycaster = new THREE.Raycaster(undefined, undefined, 0.15, 400);
  private readonly screenCenter = new THREE.Vector2();
  private readonly intersections: THREE.Intersection[] = [];
  private readonly normal = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly bitangent = new THREE.Vector3();
  private readonly surfaceMatrix = new THREE.Matrix4();
  private readonly instanceMatrix = new THREE.Matrix4();
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly dustColor = new THREE.Color();
  private readonly baseDustColor = new THREE.Color(0xa7a08c);
  private nextMark = 0;
  private nextDust = 0;
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.group.name = 'bullet-impacts';
    for (let i = 0; i < MARK_COUNT; i++) {
      const material = new THREE.MeshBasicMaterial({
        map: this.markTexture,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        fog: true,
      });
      const mesh = new THREE.Mesh(this.markGeometry, material);
      mesh.name = `impact-mark-${i}`;
      mesh.visible = false;
      this.group.add(mesh);
      this.marks.push({ mesh, age: MARK_LIFETIME });
    }
    for (let i = 0; i < DUST_COUNT; i++) {
      const material = new THREE.SpriteMaterial({
        map: this.dustTexture,
        color: this.baseDustColor,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = `impact-dust-${i}`;
      sprite.visible = false;
      this.group.add(sprite);
      this.dust.push({
        sprite, material, velocity: new THREE.Vector3(), age: 1,
        lifetime: 1, startSize: 0, endSize: 0, opacity: 0,
      });
    }
    scene.add(this.group);
  }

  /** Targets are an explicit, nonrecursive list of terrain, roads and building meshes. */
  fire(camera: THREE.Camera, targets: THREE.Object3D[]): void {
    if (this.disposed || targets.length === 0) return;
    camera.updateWorldMatrix(true, false);
    this.raycaster.setFromCamera(this.screenCenter, camera);
    this.intersections.length = 0;
    this.raycaster.intersectObjects(targets, false, this.intersections);
    const hit = this.intersections[0];
    if (!hit?.face) return;

    this.surfaceMatrix.copy(hit.object.matrixWorld);
    if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
      hit.object.getMatrixAt(hit.instanceId, this.instanceMatrix);
      this.surfaceMatrix.multiply(this.instanceMatrix);
    }
    this.normalMatrix.getNormalMatrix(this.surfaceMatrix);
    this.normal.copy(hit.face.normal).applyNormalMatrix(this.normalMatrix);
    if (this.normal.dot(this.raycaster.ray.direction) > 0) this.normal.negate();
    if (Math.abs(this.normal.y) < 0.95) this.tangent.set(0, 1, 0);
    else this.tangent.set(1, 0, 0);
    this.tangent.cross(this.normal).normalize();
    this.bitangent.crossVectors(this.normal, this.tangent).normalize();

    const mark = this.marks[this.nextMark];
    this.nextMark = (this.nextMark + 1) % MARK_COUNT;
    mark.age = 0;
    mark.mesh.visible = true;
    mark.mesh.material.opacity = 0.86;
    mark.mesh.position.copy(hit.point).addScaledVector(this.normal, 0.003);
    mark.mesh.quaternion.setFromUnitVectors(Z_AXIS, this.normal);
    mark.mesh.rotateZ(Math.random() * Math.PI * 2);
    mark.mesh.scale.setScalar(0.065 + Math.random() * 0.025);

    // A little surface-colored debris works for masonry and soil without implying metal sparks.
    this.dustColor.copy(this.baseDustColor);
    const hitMesh = hit.object as THREE.Mesh;
    const material = Array.isArray(hitMesh.material)
      ? hitMesh.material[hit.face.materialIndex ?? 0]
      : hitMesh.material;
    const surfaceColor = (material as THREE.MeshStandardMaterial | undefined)?.color;
    if (surfaceColor?.isColor) this.dustColor.lerp(surfaceColor, 0.22);

    for (let i = 0; i < 4; i++) {
      const puff = this.dust[this.nextDust];
      this.nextDust = (this.nextDust + 1) % DUST_COUNT;
      puff.age = 0;
      puff.lifetime = 0.45 + Math.random() * 0.45;
      puff.startSize = 0.055 + Math.random() * 0.05;
      puff.endSize = 0.23 + Math.random() * 0.24;
      puff.opacity = 0.38 + Math.random() * 0.15;
      puff.sprite.visible = true;
      puff.sprite.position.copy(hit.point).addScaledVector(this.normal, 0.025);
      puff.sprite.position.addScaledVector(this.tangent, (Math.random() - 0.5) * 0.025);
      puff.sprite.position.addScaledVector(this.bitangent, (Math.random() - 0.5) * 0.025);
      puff.velocity.copy(this.normal).multiplyScalar(0.35 + Math.random() * 0.65);
      puff.velocity.addScaledVector(this.tangent, (Math.random() - 0.5) * 0.55);
      puff.velocity.addScaledVector(this.bitangent, (Math.random() - 0.5) * 0.55);
      puff.velocity.y += 0.25;
      puff.material.color.copy(this.dustColor);
      puff.material.rotation = Math.random() * Math.PI * 2;
      puff.material.opacity = puff.opacity;
      puff.sprite.scale.setScalar(puff.startSize);
    }
  }

  update(dt: number): void {
    if (this.disposed || !Number.isFinite(dt) || dt <= 0) return;
    const step = Math.min(dt, 0.1);
    for (const mark of this.marks) {
      if (!mark.mesh.visible) continue;
      mark.age += dt;
      mark.mesh.material.opacity = 0.86 * (1 - THREE.MathUtils.smoothstep(mark.age, 24, MARK_LIFETIME));
      if (mark.age >= MARK_LIFETIME) mark.mesh.visible = false;
    }
    for (const puff of this.dust) {
      if (!puff.sprite.visible) continue;
      puff.age += dt;
      const progress = Math.min(1, puff.age / puff.lifetime);
      if (progress >= 1) {
        puff.sprite.visible = false;
        continue;
      }
      puff.velocity.multiplyScalar(Math.exp(-3.5 * step));
      puff.velocity.y -= 0.35 * step;
      puff.sprite.position.addScaledVector(puff.velocity, step);
      puff.sprite.scale.setScalar(THREE.MathUtils.lerp(puff.startSize, puff.endSize, Math.sqrt(progress)));
      puff.material.opacity = puff.opacity * (1 - THREE.MathUtils.smoothstep(progress, 0.05, 1));
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    for (const mark of this.marks) mark.mesh.material.dispose();
    for (const puff of this.dust) puff.material.dispose();
    this.markGeometry.dispose();
    this.markTexture.dispose();
    this.dustTexture.dispose();
    this.intersections.length = 0;
  }
}
