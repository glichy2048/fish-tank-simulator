# Pelagic

A quiet home aquarium, viewed through clear glass. This React simulator shows a compact saltwater tank on a walnut cabinet, with a visible waterline, LED fixture, circulation pump, small corals, and individual animals.

“Pelagic” refers to the open water. The name remains, while the scene now brings a small reef into a living room.

## Run locally

Requires Node.js 22.12+ (Node 24 LTS recommended).

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. To verify and preview a production build:

```sh
npm test
npm run build
npm run preview
```

## Deploy to GitHub Pages

Repository: [glichy2048/fish-tank-simulator](https://github.com/glichy2048/fish-tank-simulator). Live site: [Pelagic](https://glichy2048.github.io/fish-tank-simulator/).

Every push to `main` runs `.github/workflows/deploy.yml`, which installs locked dependencies, runs the simulation tests, builds the app, and publishes `dist` to GitHub Pages. A failed test or build prevents publication. Local commits deploy once pushed to GitHub.

Link previews use Open Graph and large-image Twitter card metadata in `index.html`, with the bundled aquarium artwork as the preview image. The canonical page and image URLs are absolute GitHub Pages URLs; update them if the site moves to another domain or path. Crawlers can read this metadata without running JavaScript.

Pages uses **Settings → Pages → Build and deployment → Source → GitHub Actions**. To redeploy manually, open **Actions → Deploy aquarium to GitHub Pages → Run workflow**. The deployment URL also appears in the completed workflow and in **Settings → Pages**.

The app has no backend, credentials, API calls, or paid services. Vite uses relative asset paths, so the build works at both a domain root and a repository subdirectory without editing the configuration. If your default branch has a different name, update the workflow's `branches` entry.

The workflow follows the [official Vite GitHub Pages deployment guide](https://vite.dev/guide/static-deploy#github-pages). All required artwork and model code are included in the repository. Fonts load from Google Fonts with local sans-serif fallbacks.

## Enjoy the reef

- Choose daylight, golden hour, or moonlight from the lighting menu.
- Text and controls start hidden. Use the faint eye icon or **H** to reveal them.
- Sound is enabled by default: a softly mixed, seamless loop of a real aquarium filter, recorded by [DudeAwesome](https://freesound.org/people/DudeAwesome/sounds/386023/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). Autoplay is attempted immediately. If the browser blocks it, the first click/tap or ordinary keypress starts it. **M** mutes or unmutes. A mute choice is respected by subsequent clicks. The recording is bundled with the app; playback needs no connection to Freesound. Credits are also available in Settings.
- Adjust current, ambient light, and fish population with the sliders. Defaults are gentle current (0.5×), 70% ambient light, and twelve swimming animals; Reset restores these values. Surface crests move at a faster, steady pace independent of the current slider and stop when the reef is paused.
- After two minutes without pointer, touch, wheel, or keyboard activity, the controls automatically fade away for an uninterrupted aquarium screensaver. Moving the pointer or interacting restores them; the timer pauses while the tab is hidden.
- Pause the reef, go fullscreen, or hide the controls for an uninterrupted view.
- Keyboard: **Space** pauses, **M** toggles sound, **F** toggles fullscreen, **H** hides/shows controls, **Escape** closes a panel or restores controls.

Twelve swimming animals and four bottom creatures appear by default. The population slider allows three to twelve swimmers, always one of each species. The swimmers are clownfish, cardinalfish, royal gramma, firefish, wrasse, watchman goby, chromis, mandarin dragonet, blenny, lionfish, betta, and cuttlefish. A cleaner shrimp, cerith snail, hermit crab, and starfish stay around the aquascape.

The aquarium starts paused when your system requests reduced motion. Rendering stops while the browser tab is hidden; audio is suspended too. A static tank and retry control remain available if WebGL or an asset fails to load. The entire glass tank stays visible at every screen size; landscape gives the closest view on a phone.

The audio behavior follows [browser autoplay rules](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay); no browser setting changes are needed.

## How it works

React + TypeScript + Vite handle the interface. Three.js renders solid 3D animals inside the original photographic glass tank and coral aquascape. Each fish has a rounded body, paired eyes and pectoral fins, a flexible tail, translucent fin membranes, gill lines, and species-specific skin markings. Physical materials, overhead lighting, soft reflections, and a perspective camera reveal their shape during smooth turns through depth. The lionfish has striped spines and broad paired pectoral fins; the betta has flowing, rippling fins. The cuttlefish has a broad mantle, undulating side fins, eight short arms, and W-shaped pupils. The shrimp has articulated legs and antennae; the snail and hermit crab have coiled shells; the starfish has thick arms and raised surface detail.

Fish independently alternate between hovering, exploring, inspecting, and short darts. Species have different cruising speeds and preferred levels. Movement has three velocity components in one fixed tank volume: fish turn toward their actual direction, recede into the water, and grow in perspective as they approach the glass. They steer around approximate rock collision envelopes, with swimming lanes both in front of and behind the two rock islands. A static mask of the photographed reef writes depth at the reef plane, hiding distant fish while nearby fish remain visible in front.

The original rocks, plants, and corals remain photographic and still. Bottom creatures use the same world depth as the swimmers, with constant physical sizes and perspective projection. The shrimp, snail, and hermit crab creep over a smooth approximation of the photographed sand and rock contours; their body orientation, feet, and contact shadows follow the local slope. The starfish rests on the sand in one position and only curls one arm tip for a few seconds between long still intervals. Pause freezes both crawling and arm motion. A moving waterline and a small microbubble stream add subtle motion. This is a fixed-view visual simulation, not a biological model or a freely orbitable tank.

The simulation uses elapsed time and small integration steps, with capped frame deltas. Tests cover long-running bounds and numerical stability, independent activities and speeds, unique species, bottom-dweller movement, pause, frame-rate independence, delayed frames, positive mesh volume, and finite geometry through 3D turns. Additional tests cover front/back travel for every species, rock clearance during spawning and long swims, perspective size changes, surface contact during bottom-creature depth travel, occasional starfish arm motion, and distinct anatomy for the added species. Pixel ratio is capped for mobile devices.

Original artwork was created with built-in image generation. Assets and exact generation prompts are in `public/assets/`; their provenance is documented in `ASSETS.md`.

## License

Project code is licensed under the [MIT License](LICENSE), copyright © 2026 Ron Picard. Third-party dependencies and assets retain their own licenses; the aquarium recording is licensed under CC BY 4.0. See [ASSETS.md](ASSETS.md) for attribution and asset license details.
