import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

/** Short-range grounding for solid architecture, without opaque leaf-card artifacts. */
export class ContactOcclusionPass extends GTAOPass {
  private omitted: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, width: number, height: number) {
    super(scene, camera, width, height);
    this.blendIntensity = 0.36;
    this.updateGtaoMaterial({ radius: 0.65, thickness: 0.8, distanceExponent: 1.2, samples: 8 });
    this.updatePdMaterial({ radius: 3, samples: 8 });
  }

  override setSize(width: number, height: number): void {
    // Contact shading tolerates half resolution; preserve the full-resolution color buffer.
    super.setSize(Math.max(1, Math.round(width * 0.5)), Math.max(1, Math.round(height * 0.5)));
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    // The normal override cannot reproduce custom wind/alpha-tested vegetation or water.
    // The preceding color pass still contains them; only the AO depth excludes them.
    this.scene.traverseVisible((object) => {
      if (object.userData.excludeContactOcclusion) {
        this.omitted.push(object);
        return;
      }
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (materials.some((material) => material.transparent || material.alphaTest > 0 || (material as THREE.ShaderMaterial).isShaderMaterial)) {
        this.omitted.push(object);
      }
    });
    for (const object of this.omitted) object.visible = false;
    try {
      super.render(renderer, writeBuffer, readBuffer, 0, false);
    } finally {
      for (const object of this.omitted) object.visible = true;
      this.omitted.length = 0;
    }
  }
}
