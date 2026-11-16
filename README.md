# RENDA · Abava Valley

A browser-based first-person world set in Renda, Latvia, built with Three.js, React and Vite. Includes walking and shooting, driving, canoeing, landmark exploration, and the original architectural studio.

## Run locally

Requires Node.js 22.12+ (Node.js 24 recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The game and bundled assets work without an API key. The optional AI material/building tools require `GEMINI_API_KEY` in `.env.local`; see `.env.example`.

```sh
npm run lint       # TypeScript
npm test           # World, movement, foliage and weapon math checks
npm run build      # Production client
npm run preview    # Preview the production client
```

For the full server in production, run `npm run build` followed by `NODE_ENV=production npm start`. The static client can also be hosted separately; the optional AI studio needs the server's `/api` routes.

## Visual upgrade

- Photographic outdoor HDR lighting, sky panoramas and reflections, filmic color grading and restrained bloom.
- Cinematic quality adds short-range contact occlusion and 4096-pixel sun shadows. Balanced uses 2048-pixel shadows, while Performance reduces rendering resolution and postprocessing cost.
- Revised water, wet roads, terrain, building weathering and material responses.
- Detailed first-person carbine, sleeves, optic, muzzle flash and smoother weapon motion.
- Pooled surface impacts/dust, a cinematic title menu and a minimal tactical HUD.
- View-aware distant trees, smoother LOD updates, graceful asset-loading fallbacks and a loading screen.

Choose **Performance**, **Balanced**, or **Cinematic** on the title or pause menu. The preference is saved on this browser. Software renderers default to Performance; accelerated devices default to Balanced. For repeatable comparisons, use `?quality=cinematic`, `?quality=balanced`, or `?quality=performance` (the URL overrides the saved preference on reload). `?autostart=1` skips the title.

Cinematic quality costs more GPU time. Browser performance depends on device, viewport and scene density; no desktop-GPU frame-rate claim is implied by the presets. The upgrade keeps the original world and game modes rather than replacing the project with an unrelated demo.

## Controls

WASD to move; mouse to look after clicking the scene; Shift to sprint; Space to jump; C/Ctrl to crouch; Q/E to lean; left mouse to fire; right mouse/F to aim; R to reload; B to switch fire mode; I to inspect; V to change perspective; Tab for map, travel, weather and modes; Escape to pause. Touch controls are preserved.

See [third-party asset credits](docs/ASSET-LICENSES.md) for the newly sourced CC0 HDRIs and notes on the assets supplied in the original export.

## Preview and verification

![In-game title screen](docs/screenshots/title.png)

See [verification notes](docs/VALIDATION.md) and the actual [Cinematic gameplay](docs/screenshots/cinematic.png) and [river](docs/screenshots/river.png) captures. The screenshots were rendered on the software fallback; they are not promotional reference images.
