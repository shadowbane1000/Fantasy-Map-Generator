# Tasks 32 — Execution checklist for Plan 32

## Setup

- [ ] T1. Baseline: 7 warnings / 1 info / 0 errors; 405 tests.

## Implementation

- [ ] T2. `src/ai/tools/set-heightmap-template.ts`
      - `TEMPLATE_KEYS` tuple + `TemplateKey` type.
      - `DISPLAY_NAMES` object mapping canonical key → human name.
      - Pure `resolveTemplateKey(input)` with key + display-name
        lookup.
      - `HeightmapTemplateRuntime` with `read()`/`write()`.
      - `defaultHeightmapTemplateRuntime` that reads/writes
        `#templateInput`.
      - `createSetHeightmapTemplateTool(runtime?)` +
        `setHeightmapTemplateTool`.

- [ ] T3. Register + export in `src/ai/index.ts`.

- [ ] T4. README_AI.md tool-table row.

## Testing

- [ ] T5. `src/ai/tools/set-heightmap-template.test.ts` — 10 cases.

## Gates

- [ ] T6. lint baseline unchanged.
- [ ] T7. `npm test -- --run` green.
- [ ] T8. `npm run build` succeeds.
