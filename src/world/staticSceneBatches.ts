import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Batch fixed scenery in small spatial cells, retaining edited buildings and animated actors. */
export function batchStaticScenery(scene: THREE.Scene, excluded: ReadonlySet<THREE.Object3D>) {
  const buckets = new Map<string, THREE.Mesh[]>();
  const mergedMeshes: THREE.Mesh[] = [];
  scene.updateMatrixWorld(true);
  const center = new THREE.Vector3();
  const box = new THREE.Box3();
  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    for (let ancestor: THREE.Object3D | null = mesh; ancestor; ancestor = ancestor.parent) {
      if (excluded.has(ancestor) || ancestor.userData.keepIndividual) return;
    }
    if (Array.isArray(mesh.material) || mesh.material.transparent || mesh.material.opacity < 1 || mesh.material.alphaTest > 0) return;
    if (!(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial && !(mesh.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) return;
    if (mesh.material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
    const geometry = mesh.geometry;
    if (!geometry.attributes.position || Object.keys(geometry.morphAttributes).length || geometry.drawRange.start !== 0 || Number.isFinite(geometry.drawRange.count)) return;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    box.copy(geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).getCenter(center);
    // Keep long geometry and its existing culling granularity intact.
    if (box.max.distanceTo(box.min) > 100) return;
    const key = [mesh.material.uuid, Math.floor(center.x / 64), Math.floor(center.z / 64), mesh.castShadow, mesh.receiveShadow, mesh.renderOrder].join(':');
    const bucket = buckets.get(key) ?? [];
    bucket.push(mesh);
    buckets.set(key, bucket);
  });
  let sourceDraws = 0;
  for (const meshes of buckets.values()) {
    if (meshes.length < 4) continue;
    const parts: THREE.BufferGeometry[] = [];
    for (const mesh of meshes) {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      for (const attribute of Object.keys(geometry.attributes)) {
        if (!['position', 'normal', 'uv', 'uv1', 'uv2', 'color'].includes(attribute)) geometry.deleteAttribute(attribute);
      }
      parts.push(geometry);
    }
    const channels = new Set(parts.flatMap((part) => Object.keys(part.attributes)));
    for (const part of parts) {
      for (const channel of channels) {
        if (part.hasAttribute(channel)) continue;
        const size = channel === 'position' || channel === 'normal' || channel === 'color' ? 3 : 2;
        const data = new Float32Array(part.attributes.position.count * size);
        if (channel === 'color') data.fill(1);
        if (channel === 'uv1' || channel === 'uv2') {
          const uv = part.attributes.uv;
          if (uv) for (let i = 0; i < uv.count; i++) { data[i * 2] = uv.getX(i); data[i * 2 + 1] = uv.getY(i); }
        }
        part.setAttribute(channel, new THREE.BufferAttribute(data, size));
      }
    }
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const first = meshes[0];
    const merged = new THREE.Mesh(geometry, first.material);
    merged.name = 'static-scenery-batch';
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    merged.renderOrder = first.renderOrder;
    for (const mesh of meshes) {
      sourceDraws++;
      mesh.removeFromParent();
    }
    scene.add(merged);
    mergedMeshes.push(merged);
  }
  return {
    sourceDraws,
    batchCount: mergedMeshes.length,
    impactTargets: mergedMeshes,
    dispose() {
      for (const mesh of mergedMeshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
      mergedMeshes.length = 0;
    },
  };
}
