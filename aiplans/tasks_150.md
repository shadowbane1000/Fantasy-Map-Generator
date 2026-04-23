# Tasks 150 — set_culture_origins

1. Confirm UI + existing patterns
   - `public/modules/dynamic/editors/cultures-editor.js` — origin
     cascade & generator parsing (done during study).
   - `src/ai/tools/set-culture-center.ts` — runtime seam shape.
   - `src/ai/tools/remove-culture.ts` — cascade/reset-to-[0]
     convention.
   - `src/ai/tools/_shared/pack-types.ts` — `RawCulture.origins`
     already `number[]`.

2. Implement `src/ai/tools/set-culture-origins.ts`
   - Interfaces: `CultureOriginsRef`, `CultureOriginsRuntime`.
   - `defaultCultureOriginsRuntime` pulling from `getPack` /
     `getPackCollection<RawCulture>`.
   - Validators: parseEntityRef, array type, element type, bounds,
     self-loop, removed, locked, not culture 0.
   - Dedup + normalise empty-to-`[0]`.
   - Response: `{ ok, i, name, previousOrigins, origins }`.

3. Tests `src/ai/tools/set-culture-origins.test.ts`
   - Mock-runtime unit tests covering each branch.
   - `defaultCultureOriginsRuntime (integration)` block using a
     seeded `(globalThis as unknown as { pack?: unknown }).pack`.

4. Register in `src/ai/index.ts`
   - Import + register next to `setCultureCenterTool`.
   - Re-export `createSetCultureOriginsTool` + `setCultureOriginsTool`.

5. README_AI.md row near `set_culture_center`.

6. Verify
   - `npm run build` succeeds.
   - `npm test` passes, count +N (unit + integration tests from the
     new file).
   - `npm run lint` matches baseline (7 warnings / 1 info / 0
     errors).

7. Commit `feat(ai): add set_culture_origins tool` with 1-2 line
   body, stage specific files.
