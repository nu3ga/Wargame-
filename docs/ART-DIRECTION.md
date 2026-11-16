# Renda visual direction and asset approach

The target is a grounded, detailed northern European first-person environment. Judge changes from the player's view, both stationary and moving, rather than from an isolated model preview or an instance count.

## Landscape

Use a continuous short-grass base with real geometric blade coverage near the player, then clustered meadow plants, shrubs and a layered tree canopy. Empty, uniformly colored terrain between isolated oversized tufts is a failure case. Keep the road, workshop, and checkpoint's deliberately cleared ground free of grass. Match base material color and physical texture scale to the blades above it.

Use region-appropriate species and varied ages: Scots pine, Norway spruce, silver birch, pedunculate oak, black alder, European aspen, small-leaved linden and European ash. Preserve measured conifer families where the source dataset supplies them; use riparian and park habitats for appropriate broadleaf variation. Avoid identical silhouettes distinguished only by color.

## Village

Prioritize player-scale detail and readable, coherent compositions. The checkpoint, maintenance workshop, practical lights, damaged plaster, recessed glazing, real roof edges, drainage, patched roads, gravel and field supplies should feel like one place. Preserve the original mapped world and traversal modes. Detail should be strongest in the playable village rather than distributed evenly over the entire 2.3 km map.

## Ready-made assets

Prefer an existing high-quality model or material when it produces a better result than a quick custom substitute. Inspect its actual geometry, textures, scale and licensing before integration; a small download or a polished preview alone is not enough. Keep provenance and license records in ASSET-LICENSES.md and adjacent manifests. Use assets that can be redistributed with this public source project.

The supplied Poly Haven props, photographic foliage sources, new CC0 HDRIs, and ambientCG Grass004 material are reused in this build. The ready-made tree candidates inspected during the second pass were unsuitable for this scene or its runtime budget; the eight botanical tree profiles therefore use the existing photographic foliage with revised branching, crowns, ages and habitat placement.

## Verification

Check material texel scale, silhouette, ground contact, lighting, overlap, collision clearance and transitions. Validate a grass close-up and the first-person approach, not only the title view. Keep native GPU performance measurements separate from software-rendered verification images; expose quality controls without implying an unmeasured frame rate.
