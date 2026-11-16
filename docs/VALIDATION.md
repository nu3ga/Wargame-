# Visual upgrade verification

The initial import commit preserves the complete supplied AI Studio export. The following commits contain the rendering upgrade and the subsequent denser landscape/village art pass. The original download archive was not modified.

## Automated checks

- `npm ci`: reproducible npm dependency installation; the original Vite/esbuild peer-version conflict was corrected.
- `npm run lint`: TypeScript passes.
- `npm test`: all 32 world, movement, collision, weapon, geometry, foliage and asset tests pass.
- `npm run build`: production client builds. Vite reports a large-chunk advisory; the existing geographic dataset is included in the client.
- All original literal asset paths and GLTF external dependencies resolve.
- All 34 simplified GLTFs reload with valid finite attributes/indices and unchanged material settings, texture references, node transforms, plus verified geometric bounds. The 234 original textures and four low-poly GLBs remain unchanged. See `asset-optimization.json`.
- Browser module checks cover finite viewmodel geometry/poses, ADS centerline, impact misses/hits, transformed normals, bounded effect pools, lifetime and disposal.
- Failure-path checks preserve successful props when other models fail, and provide procedural grass when its model is unavailable.

## Production browser checks

Chromium using software WebGL2 (SwiftShader), 1280×800 viewport:

- Initial loading completes and both photographic lighting environments and both pure-sky panoramas load.
- Title quality selection with Space preserves the title screen.
- Movement, shooting ammo, ADS and reload reserve accounting work.
- Tactical dialog traps focus, weather controls activate with Space, and Escape closes the map without pausing.
- All three render quality paths draw successfully. Cinematic enables contact occlusion, four-sample MSAA and a 4096-pixel sun shadow map; switching back disables the added occlusion pass.
- The selected quality preference is saved in local storage.
- Village approach, continuous grass, title and workshop views captured from the actual 3D scene.
- No page errors, shader errors or failed requests in the successful integrated run.

`browser-validation.json` records the render calls and checks. The browser harness temporarily exposed its own engine instance and paused continuous rendering between explicit frames to allow repeatable screenshots and deterministic input checks on this CPU-only machine. Render counts include postprocessing/shadow passes. They are not a hardware frame-rate benchmark, and should not be compared as FPS figures.

Desktop/mobile UI layout and keyboard focus were also tested separately at 1440×900 and 390×844, with no overflow. Those isolated layout tests used a photograph as a fixture; only screenshots from the real game are included here.

## Practical limits

Hardware-accelerated desktop GPU performance and mobile sustained frame rate have not been measured. Native accelerated devices retain denser foliage than the software fallback. Cinematic costs more GPU time, and the existing world still has a substantial scene/asset budget. The landscape, model, shader/material and presentation pass improves the existing game; it does not turn its procedural architecture and character assets into scanned AAA production assets.

The game can be built and played without Gemini credentials. Optional AI generation features were not exercised against a live paid API.

## Denser landscape and village checks

The second art pass has eight populated botanical profiles in the actual mapped world: 1,665 pine, 443 spruce, 468 birch, 430 oak, 75 alder, 166 aspen, 40 linden and 120 ash records. These are model families with procedural branch/crown/age variation and photographic foliage, not eight new photogrammetry scans.

The new near-field turf uses 32 modeled blades per cluster, with a lighter eight-blade layer farther out. The final height calibration is 7–21 cm near the player and 6–18 cm in the middle band; final in-game renders were checked after this adjustment. The CC0 ambientCG grass material is loaded at its physical 1.4 m scale.

Additional browser assertions passed for a clear walking and driving route through the checkpoint, longitudinal car-bumper clearance against the new barriers, workshop entrance passage, walking up its ramp onto the level floor, and correct vehicle height on the slab. The 38 dressing colliders are handled separately from original building colliders. Original fixed scenery batches reduce 401 source mesh draws to 38 spatial batches; these figures describe that batchable subset, not every draw in the scene.

A focused browser check verifies that customizing an original building hides only its new augmentation and that reset restores exact vertex positions; the workshop, other buildings, collisions and floor are unaffected. Street, atmosphere, checkpoint and workshop modules were also checked independently for finite geometry, rendering, weather updates and disposal.
