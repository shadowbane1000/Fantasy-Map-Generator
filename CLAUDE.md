# Fantasy Map Generator

Azgaar's open-source fantasy map generator — a Vite-based web app (no backend) that procedurally builds an interactive fantasy world as SVG. Single-page, runs entirely in the browser.

Upstream: https://github.com/Azgaar/Fantasy-Map-Generator. Data-model wiki: https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Data-model.

## Architecture

Conceptual layers (per README):

```
settings → generators → world data → renderer
UI       → editors    → world data → renderer
```

- **world data (state)**: a single `window.pack` object (plus `window.grid`, `window.options`, `window.seed`, `window.mapId`). Source of truth. No logic lives here — just data.
- **generators (model)**: procedural builders for terrain, cells, cultures, states, burgs, religions, rivers, routes, etc. They mutate `pack` directly.
- **editors (controllers)**: interactive UI tools that perform controlled mutations of `pack`. Think of them as interactive generators.
- **renderers (view)**: turn `pack` into SVG. Pure visualization — must not modify world data.

The codebase is **mid-migration from vanilla JS → TypeScript**. Both styles coexist and interoperate via `window` globals. Don't be surprised by either.

## Directory layout

- `src/` — new TypeScript code.
  - `src/modules/` — TS generators (`burgs-generator.ts`, `cultures-generator.ts`, `river-generator.ts`, `states-generator.ts`, `routes-generator.ts`, `heightmap-generator.ts`, `voronoi.ts`, `biomes.ts`, `lakes.ts`, `features.ts`, `zones-generator.ts`, `provinces-generator.ts`, `religions-generator.ts`, `names-generator.ts`, `military-generator.ts`, `markers-generator.ts`, `ice.ts`, `ocean-layers.ts`, `fonts.ts`, `resample.ts`, `emblem/`). `index.ts` is the barrel.
  - `src/renderers/` — TS SVG drawing (`draw-borders.ts`, `draw-burg-icons.ts`, `draw-burg-labels.ts`, `draw-state-labels.ts`, `draw-features.ts`, `draw-heightmap.ts`, `draw-ice.ts`, `draw-markers.ts`, `draw-military.ts`, `draw-relief-icons.ts`, `draw-scalebar.ts`, `draw-temperature.ts`, `draw-emblems.ts`).
  - `src/types/` — `PackedGraph.ts` (shape of `pack`), `global.ts` (declarations for `window` globals). **Read these before touching state.**
  - `src/utils/` — helpers (array, color, graph, probability, language, path, etc.).
  - `src/index.html` — Vite entry HTML.
- `public/` — legacy vanilla-JS app, served as-is by Vite.
  - `public/main.js` — app bootstrap: creates D3 SVG layers, initializes `pack`/`grid`/`options`, wires event handlers, dispatches `map:generated` when a map finishes generating.
  - `public/modules/` — ~185 legacy `.js` files loaded as `<script>` tags.
  - `public/modules/io/` — `save.js`, `load.js`, `export.js`, `cloud.js` (.map file format + exporters).
  - `public/modules/ui/` — ~60 editor UIs (`burg-editor.js`, `lakes-editor.js`, `route-group-editor.js`, `notes-editor.js`, etc.).
  - `public/config/` — `heightmap-templates.js`, `precreated-heightmaps.js`.
  - `public/components/`, `public/styles/`, `public/libs/`, `public/heightmaps/`, `public/images/`, `public/charges/`.
- `tests/` — Vitest unit/browser tests. E2E specs in `tests/e2e/` (Playwright).
- `scripts/` — utility scripts.

## State model (important)

`window.pack` (typed as `PackedGraph` in `src/types/PackedGraph.ts`) holds the entire generated world:

- `cells` — primary terrain grid (indices, neighbors, height `h`, terrain `t`, biome, culture, religion, state, province, burg, routes, area, population, flux, harbor, suitability…).
- `vertices` — Voronoi vertex coords/neighbors.
- `features` — continents/islands/lakes/oceans.
- `burgs` — cities and towns.
- `states` — political entities.
- `provinces` — subdivisions of states.
- `cultures`, `religions` — cultural/religious groups.
- `routes` — roads, trails, sea lanes.
- `rivers` — river network.
- `zones`, `markers`, `ice`.

`window.grid` is the pre-Voronoi base grid. `window.options` holds the generation parameters (size, latitude, temperature, precipitation, urbanization, etc.) and is what gets persisted into `.map` files.

**Mutation pattern**: generators and editors write to `pack` in place, then call redraw/recalc helpers (`reGraph`, `calculateTemperatures`, layer-specific draw functions). There is no reactive layer — DOM updates are imperative.

## Save format

`.map` files are gzip-compressed, pipe-delimited text with a typed-array data block:

```
VERSION | License | Date | Seed | GraphWidth | GraphHeight | MapID
<settings line: distanceUnit | distanceScale | … | options (JSON) | … >
<pack data: cells, vertices, rivers, burgs, states, cultures, …>
```

Serialization lives in `public/modules/io/save.js` (`prepareMapData`, `saveToMachine`, `saveToStorage`, `saveToDropbox`). Deserialization in `public/modules/io/load.js` (`uploadMap`). JSON/PNG/SVG exporters in `export.js`.

## Build, test, lint

- `npm run dev` — Vite dev server (http://localhost:5173).
- `npm run build` — `tsc && vite build`.
- `npm run preview` — preview a production build (port 4173).
- `npm test` — Vitest (node).
- `npm run test:browser` — Vitest in a real browser (Playwright-driven).
- `npm run test:e2e` — Playwright E2E (see `playwright.config.ts`; specs under `tests/e2e/`, e.g. `burgs.spec.ts`, `load-map.spec.ts`, `layers.spec.ts`, `states.spec.ts`, `zones-export.spec.ts`).
- `npm run lint` — Biome check + autofix.
- `npm run format` — Biome format.

Requires Node >= 24. TypeScript is strict (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`). Biome enforces 2-space indent and double quotes; `noExplicitAny` is off and `noNonNullAssertion` is off (both are used liberally in the legacy surface). Biome only scans `src/**/*.ts` — `public/**` JS is not linted.

## Conventions

- File naming: kebab-case for modules/editors/renderers (`burgs-generator.ts`, `draw-state-labels.ts`, `burg-editor.js`).
- Types: PascalCase (`Burg`, `Culture`, `State`, `River`, `PackedGraph`).
- Functions/variables: camelCase.
- Imports go through barrels where they exist (`src/modules/index.ts`, `src/renderers/index.ts`).
- Tests: Playwright specs wait for the `map:generated` event on `window` before asserting.

## Gotchas

- **Globals everywhere.** `pack`, `grid`, `options`, `seed`, `mapId`, D3 selections (`svg`, `rivers`, `labels`, `burgLabels`, `markers`, `provs`, `routes`, `ice`, `temperature`), and helpers (`tip`, `byId`, `$`, `locked`, `layerIsOn`) live on `window`. TS declarations are in `src/types/global.ts`.
- **Two `routes`**: `window.routes` is a D3 SVG selection; `window.Routes` is the route config module. Don't confuse them.
- **Legacy JS is not typed or linted.** Mutating it is fine but won't be caught by `tsc`/Biome.
- **Rendering is imperative.** After mutating `pack`, you must call the right draw function (or `reGraph()`) for the change to appear.
- **Service worker** (`public/sw.js`) aggressively caches — hard-reload during dev.
- **Legacy script tags** in `public/main.js` pin asset versions with `?v=…` query strings; bump these when a cached asset changes.

## Key files for agent work on map state

- `src/types/PackedGraph.ts` — the world-state schema. Start here.
- `src/types/global.ts` — what's on `window`.
- `public/main.js` — bootstrap, SVG layer setup, `map:generated` event.
- `src/modules/index.ts` — generator entry points.
- `public/modules/io/save.js` and `load.js` — serialization.
- `public/modules/ui/*-editor.js` — reference implementations for how to mutate `pack` and trigger redraws.
