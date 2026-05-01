# Tasks 327: `set_burg_link` tool

## 1. Lint baseline (done)

- [x] Run `npm run lint 2>&1 | tail -50` and record the existing
      warnings as the baseline (0 warnings, 0 info, 0 errors). See
      `aiplans/plan_327.md` § "Lint baseline".

## 2. Plan + self-review (done)

- [x] Author `aiplans/plan_327.md`.
- [x] Author `aiplans/tasks_327.md` (this file).
- [x] Self-review section appended to plan.

## 3. Extend `_shared/pack-types.ts`

- [ ] Add `link?: string;` to `RawBurg` (after `removed?: boolean;`),
      mirroring the canonical `Burg` interface in
      `src/modules/burgs-generator.ts` line 29.

## 4. Implement `src/ai/tools/set-burg-link.ts`

- [ ] Imports: `errorResult`, `findEntityByRef`, `getGlobal`,
      `getPackCollection`, `okResult`, `parseEntityRef`, `RawBurg`
      from `./_shared`; `Tool`, `ToolResult` from `./index`.
- [ ] `interface SetBurgLinkRef { i: number; name: string;
      previousLink: string | null; }`.
- [ ] `interface SetBurgLinkRuntime { find(ref: number | string):
      SetBurgLinkRef | null; apply(i: number, link: string | null):
      void; }`.
- [ ] `defaultSetBurgLinkRuntime`:
      - `find(ref)`: delegate to `findEntityByRef(getPackCollection<
        RawBurg>("burgs"), ref)`. Reject if missing, `i <= 0`, or
        `removed`. Read `previousLink = typeof entry.link === "string"
        && entry.link ? entry.link : null` (treat empty/non-string
        as `null`). Return `{ i, name, previousLink }`.
      - `apply(i, link)`: read the burgs collection, locate burg.
        If `link === null` → `delete burg.link`. Else `burg.link =
        link`. Then, best-effort: `const fn = getGlobal<(b:
        unknown) => void>("updateBurgPreview");` if function, call
        inside try/catch and swallow.
- [ ] `createSetBurgLinkTool(runtime?)`:
      - name: `"set_burg_link"`.
      - description: terse summary referencing the legacy
        `setCustomPreview` button. Note the link is the burg
        preview-popup URL (image or generator URL); `null` clears
        via `delete burg.link`.
      - schema: `{ burg: ["integer","string"], link: ["string","null"]
        }`, both required.
      - `execute`:
        1. `parseEntityRef(input.burg, "burg")` — bail on error.
        2. Validate `link`:
           - `if (input.link === null)` → `linkValue = null`.
           - `else if (typeof input.link === "string" &&
             input.link.trim() !== "")` → `linkValue =
             input.link.trim()`.
           - `else` → `errorResult("link must be a non-empty string
             or null.")`.
        3. `runtime.find(ref)` — if `null`, error
           ``"No burg found matching ${JSON.stringify(ref)}."``.
        4. Noop check: if `current.previousLink === linkValue` →
           return ok with `noop: true`, no `apply` call.
        5. `try { runtime.apply(current.i, linkValue) } catch (err)
           { return errorResult(...) }`.
        6. Return `okResult({ ok: true, i: current.i, name:
           current.name, previousLink: current.previousLink, link:
           linkValue, noop: false })`.
- [ ] Export `setBurgLinkTool = createSetBurgLinkTool()`.

## 5. Tests `src/ai/tools/set-burg-link.test.ts`

- [ ] `makeRuntime(find)` helper using `vi.fn`, mirroring
      set-burg-coa-custom.test.ts.
- [ ] Mock-runtime tests (per plan §Tests 1-12):
      - happy path set (id);
      - happy path set (name, case-insensitive);
      - happy path set trims input;
      - happy path clear (id, link: null) — verify apply called with
        (i, null);
      - noop when already cleared (previousLink null + link null);
      - noop when same string;
      - empty / whitespace string rejected;
      - wrong link types rejected (number, boolean, object, array,
        undefined);
      - bad burg ref rejected (0, -1, 1.5, "", null, undefined);
      - unknown burg → `"No burg found matching ..."`;
      - apply throw → error surfaced;
      - tool name === `"set_burg_link"`.
- [ ] Default-runtime integration `describe` block (per plan §13-19):
      - beforeEach/afterEach swap `globalThis.pack` (mirror coa-custom
        test) and `globalThis.updateBurgPreview`.
      - Sets non-empty string on burg 5;
      - **CRITICAL**: clear `delete`s the field — assert
        `'link' in pack.burgs[5] === false`, NOT `=== null` and NOT
        `=== ""`;
      - Rejects burg 0;
      - Rejects removed burg;
      - Rejects when `pack` is missing (set globalThis.pack =
        undefined);
      - Resolves by case-insensitive name;
      - `updateBurgPreview` best-effort:
        - present + happy → called once with the burg object;
        - absent → no throw;
        - throws → error swallowed, payload unaffected.

## 6. Wire into `src/ai/index.ts`

- [ ] Add `import { setBurgLinkTool } from "./tools/set-burg-link";`
      between line 238 (`setBurgGroupDefaultTool`) and line 239
      (`setBurgPopulationTool`).
- [ ] Add re-export block (createTool + tool) between
      `set-burg-group-default` (lines 2108-2113) and
      `set-burg-population` (lines 2114-2119) re-export blocks.
- [ ] Add `registry.register(setBurgLinkTool);` near
      `registry.register(setBurgPortTool);` (line 2820) — append
      after the burg-group/burg-port cluster.

## 7. Verify

- [ ] `npm test` — green.
- [ ] `npm run lint 2>&1 | tail -50` — still 0 warnings, 0 info, 0
      errors.
- [ ] `npx tsc --noEmit` — clean.

## 8. Commit

- [ ] Stage only:
      `src/ai/tools/set-burg-link.ts`,
      `src/ai/tools/set-burg-link.test.ts`,
      `src/ai/tools/_shared/pack-types.ts`,
      `src/ai/index.ts`,
      `aiplans/plan_327.md`,
      `aiplans/tasks_327.md`.
- [ ] Commit message:
      `feat(ai): add set_burg_link tool`
      with body explaining mirrors editor's "Set preview link" button.
- [ ] Do NOT commit `.claude/`, `current-ralph-loop.prompt`, or
      pre-existing dirty files.
- [ ] Do NOT push.
