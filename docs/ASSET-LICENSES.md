# Third-party visual assets

## Photographic environment lighting added in this upgrade

These unmodified Radiance RGBE HDRIs are by **Sergej Majboroda**, provided by **Poly Haven** under **CC0 1.0 Universal**. Poly Haven permits commercial use, modification, and redistribution; attribution is appreciated but is not required. This credit is retained voluntarily.

| Local file | Original asset | Resolution | Download size |
| --- | --- | --- | --- |
| `public/assets/lighting/evening_field_1k.hdr` | [Evening Field](https://polyhaven.com/a/evening_field) | 1024 × 512 | 1,598,539 bytes |
| `public/assets/lighting/overcast_soil_1k.hdr` | [Overcast Soil](https://polyhaven.com/a/overcast_soil) | 1024 × 512 | 1,650,749 bytes |

- [Poly Haven asset license](https://polyhaven.com/license)
- [CC0 1.0 Universal summary and legal text](https://creativecommons.org/publicdomain/zero/1.0/)
- [Author's Poly Haven catalogue](https://polyhaven.com/all?a=Sergej%20Majboroda)

The exact source download URLs, byte lengths and SHA-256 hashes are recorded in `public/assets/lighting/manifest.json`. Downloads were checked against the byte lengths and MD5 checksums advertised by the official Poly Haven asset API. Both HDRIs were parsed with Three.js `HDRLoader` to verify the image format and dimensions.

These 1K maps provide photographic image-based illumination and reflections through PMREM. They are intentionally modest in size; the rendered village and procedural sky provide the visible scene.

## Assets supplied with the original project

The original project export already included the texture sets, foliage, village props, reference images, and generated textures elsewhere under `public/assets` and `src/assets`. They are preserved from that export. The new HDRI credits above document the assets newly sourced for this upgrade and do not relicense other project content. The original source identifies many foliage and prop assets as Poly Haven/CC0, but the export did not include a complete author/source manifest for them.

## Offline geometry optimization

The bundled scanned geometry was simplified for browser rendering with glTF Transform 4.5.1 and meshoptimizer 1.3.0. This creates optimized derivatives of the original project assets; it does not change their ownership or licenses. Textures remain byte-for-byte identical, including alpha masks. Material settings, texture references, primitive assignments, mesh names, scene transforms, normals and UV attributes are preserved. No runtime geometry decoder or compressed-texture extension is needed.

- 34 of 60 external GLTF models optimized; all primitives below 2,000 triangles are preserved.
- Unique source geometry: 1,135,722 → 464,633 triangles (59.1% fewer). Actual frame cost also depends on instance counts and visibility.
- External geometry buffers: 33,398,292 → 15,271,920 bytes (54.3% smaller).
- Error ceiling: 0.2% of mesh radius normally, 0.4–0.6% only for selected densely tessellated scans. Material/UV seams are retained, so a few meshes stop above their triangle targets.
- Every rewritten GLTF was reopened and checked for valid vertex indices and finite attributes. Before/after material, texture, scene and node data are compared exactly after writer normalization; bounding-box changes are limited to 1% of radius.
- The four original low-poly grass/flower GLBs are unchanged.

Detailed per-model and per-primitive results, bounds, and error limits are in `docs/asset-optimization.json`. Reproduction commands are at the top of `scripts/optimize-assets.mjs`; start from a separate untouched export, such as one extracted from the original project ZIP.

Simplification trades tiny geometric details for frame time. The most noticeable differences can occur extremely close to a leaf edge, a scanned stump, or basket weave; original texture and normal-map detail remains.

## Photographic pure-sky backgrounds

Two sky-only panoramas are included for the visible distant background. Both are **CC0 1.0 Universal**, edited by **Jarod Guest** from original photography by **Sergej Majboroda**, provided by Poly Haven. Their official asset pages explicitly identify them as edited sky-only versions of the original panoramas. No photographed buildings, terrain, or architecture is used as scene geometry.

| Local file | Original asset | Resolution | Download size |
| --- | --- | --- | --- |
| `public/assets/lighting/evening_road_01_puresky_2k.hdr` | [Evening Road 01 (Pure Sky)](https://polyhaven.com/a/evening_road_01_puresky) | 2048 × 1024 | 4,989,873 bytes |
| `public/assets/lighting/overcast_soil_puresky_2k.hdr` | [Overcast Soil (Pure Sky)](https://polyhaven.com/a/overcast_soil_puresky) | 2048 × 1024 | 4,568,000 bytes |

The evening panorama has a low warm sunlit cloud sector and scattered photographic clouds. The overcast panorama has continuous grey cloud cover and diffuse light. Files are unmodified upstream HDR downloads, verified against official API byte counts and MD5 checksums; SHA-256 hashes and measured bright-sector orientations are recorded in `public/assets/lighting/manifest.json`. Both load and render in Three.js `HDRLoader`. Licensing is the same [Poly Haven CC0 asset license](https://polyhaven.com/license) cited above.

## Lush grass ground material

`public/assets/textures/lush_meadow/` contains the unmodified **ambientCG Grass004** 1K color, OpenGL normal, roughness, and ambient-occlusion maps. The material is published under **CC0 1.0 Universal**; ambientCG explicitly allows commercial use and redistribution of raw asset files in games. Attribution is retained voluntarily.

- [Original Grass004 asset and downloads](https://ambientcg.com/view?id=Grass004)
- [ambientCG license](https://docs.ambientcg.com/license/)
- Physical tile size: approximately **1.4 × 1.4 m**; maps are **1024 × 1024**.
- Upstream technique: procedural PBR material. Its albedo was visually inspected: dense green blades, varied directions, a small amount of natural straw/root color, and no large exposed brown soil patches or mowing stripes.
- The engine-facing filenames `diff.jpg`, `nor_gl.jpg`, `rough.jpg`, and `ao.jpg` preserve the upstream bytes. Original filenames, download URL, byte counts, and SHA-256 hashes are in `public/assets/textures/lush_meadow/manifest.json`. The four selected maps total **6,081,661 bytes**; unused maps and authoring projects from the download ZIP are excluded.
