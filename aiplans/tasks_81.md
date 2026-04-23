# Tasks 81 — set_marker_type AI tool

- [ ] Create `src/ai/tools/set-marker-type.ts`:
  - Imports from `./_shared`: `errorResult`, `getNotes`,
    `getPack`, `okResult`, `parseEntityRef`, type
    `RawMarker`, type `RawNote`.
  - Import `findMarkerNoteRef`, type `MarkerNotePackLike`
    from `./set-marker-note`.
  - Export `MarkerTypeRef { i, name, previousType }`.
  - Export `MarkerTypeRuntime { find, setType }`.
  - Export `defaultMarkerTypeRuntime`:
    - `find`: use findMarkerNoteRef to resolve, read
      `marker.type ?? ""`.
    - `setType(i, type)`: resolve marker in `pack.markers`,
      assign `m.type = type` (or delete when empty —
      but we reject empty input so just assign).
  - Export `createSetMarkerTypeTool(runtime?)`.
  - Export `setMarkerTypeTool = createSetMarkerTypeTool()`.
  - Name: `set_marker_type`.
  - Description: mentions Markers Editor type input, that
    it's a free-form label, and that it's metadata-only.
  - Schema: `marker` (int|string, required), `type`
    (string, required, non-empty after trim).
  - Validation errors:
    - parseEntityRef failure
    - type not a string or empty-after-trim
    - marker not found
  - Noop when `previousType` equals trimmed new value.
  - Return payload: `{ i, name, previousType, type, noop }`.

- [ ] Register in `src/ai/index.ts`:
  - Add import near the other `set-marker-*`.
  - Add barrel re-export block.
  - Call `registry.register(setMarkerTypeTool)` in
    `buildDefaultRegistry()` near other `set-marker-*`.

- [ ] Write `src/ai/tools/set-marker-type.test.ts`
  parallel to `set-marker-pinned.test.ts`:
  - `set_marker_type tool` describe:
    - sets by numeric id (checks apply + return payload)
    - sets by case-insensitive note name
    - is a noop when already the same value
    - errors when marker is unknown
    - rejects invalid marker refs (`null, undefined, 0, -1, 1.5, ""`)
    - rejects non-string type
    - rejects empty / whitespace-only type
    - surfaces runtime failures
  - `defaultMarkerTypeRuntime (integration)` describe:
    - stubs `globalThis.pack = { markers: [...] }` and
      `globalThis.notes = [{ id: "marker5", name: "Dragon Lair" }]`.
    - writes the type to the real marker via
      `setMarkerTypeTool`.
    - verifies `drawMarkers` is not called (stub it and
      assert zero calls).

- [ ] Update `README_AI.md` — add a row near
  `set_marker_pinned` describing `set_marker_type`.

- [ ] Run `npm test -- --run` — all tests pass
  (expected 998+ tests after adding new ones).

- [ ] Run `npm run lint` — still 7 warnings / 1 info.

- [ ] Run `npm run build` — succeeds.

- [ ] Commit all changes with a single focused commit
  message: `feat(ai): add set_marker_type tool`.

## Verification that the tasks accomplish the plan

- Adding the file with the documented exports + the
  registration step makes the tool callable from the chat
  registry — matches the plan's "Tool registered and
  callable" success criterion.
- The unit tests cover the noop path, invalid inputs, and
  runtime failures — satisfying the "Idempotent",
  "Rejects empty", validation criteria.
- The integration test exercises the real pack mutation
  and verifies no drawMarkers call — satisfying "Does not
  call drawMarkers".
- README row documents the tool — satisfies the
  in-repo documentation requirement consistent with every
  prior tool.

## Verification that plan accomplishes the use case

- The UI user-action is `marker.type = this.value`.
- The tool's `setType` does the same thing.
- Resolving by id OR name matches the AI chat convention
  and aligns with the rest of the marker tools.
- Noop semantics match other set-* tools.
- No drawMarkers matches the UI (it does not redraw on
  type change either).

## Verification that tests would catch regressions

- If `setType` accidentally mutated the wrong marker, the
  integration test's `pack.markers[i].type` assertion would
  fail.
- If someone added a drawMarkers call, the integration
  test's zero-call assertion catches it.
- If the noop path were removed, the unit test would fail.
- If input validation loosened, the invalid-ref and
  empty-string tests would fail.
