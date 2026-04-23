# Plan 202 — `list_marker_pins` AI tool

## Goal

Add a read-only AI tool `list_marker_pins` that lists the marker pin shape
identifiers accepted by `set_marker_pin`. This is the discovery companion to
`set_marker_pin`, letting the assistant enumerate pin shapes before changing
a marker.

## Motivation

`set_marker_pin` hard-codes a closed set of 13 canonical pin shapes, defined
in `src/ai/tools/set-marker-pin.ts` as `MARKER_PIN_SHAPES`:

```ts
export const MARKER_PIN_SHAPES = [
  "bubble", "pin", "square", "squarish", "diamond",
  "hex", "hexy", "shieldy", "shield",
  "pentagon", "heptagon", "circle", "no"
] as const;
```

These mirror the Pin Shape dropdown in the Markers Editor
(`public/modules/ui/markers-editor.js`), which uses
`markerPin.value = marker.pin || "bubble"` as its selector model. Because
every marker uses `marker.pin` as a free-form string that falls back to the
default `"bubble"`, callers need a reliable enumeration to avoid stale /
misspelled values. `list_marker_pins` mirrors the discovery pattern already
established by `list_style_presets` (plan 200) and
`list_heightmap_templates` (plan 199).

## Data source

- Reuse the `MARKER_PIN_SHAPES` constant already exported from
  `src/ai/tools/set-marker-pin.ts`. We must NOT duplicate the constant (per
  the project's "Do NOT duplicate-export shared constants" rule).

Unlike `list_style_presets`, there are no custom / user-saved pin shapes —
the set is closed. No runtime seam for external state is required, but we
still expose one so tests can exercise the factory like other tools.

## Output shape

```
{
  ok: true,
  pins: [
    { id: "bubble", name: "bubble" },
    { id: "pin", name: "pin" },
    …
    { id: "no", name: "no" }
  ],
  count: 13
}
```

- `id` — the exact string `set_marker_pin` expects (case-insensitive).
- `name` — human label (same as `id` for these built-in shapes).
- Order — canonical `MARKER_PIN_SHAPES` order (same order the Markers
  Editor dropdown renders).

## Runtime seam

Trivial — the tool has no external state to read, but we still expose a
seam for symmetry with sibling discovery tools:

```ts
export interface MarkerPinListRuntime {
  readPinIds(): readonly string[];
}

export const defaultMarkerPinListRuntime: MarkerPinListRuntime = {
  readPinIds: () => MARKER_PIN_SHAPES,
};
```

Tests override the runtime to confirm the factory uses whatever the runtime
returns (keeps the pattern consistent and makes it trivially mockable if we
ever want to e.g. filter by capability).

## Registration

- Create `src/ai/tools/list-marker-pins.ts` following the
  `list-style-presets.ts` pattern.
- Create `src/ai/tools/list-marker-pins.test.ts` with a
  `defaultMarkerPinListRuntime (integration)` describe block that exercises
  the real default runtime.
- Register `listMarkerPinsTool` in `src/ai/index.ts` near
  `setMarkerPinTool`; re-export the create-fn, tool, runtime type, default
  runtime, and entry type.
- Do NOT duplicate-export `MARKER_PIN_SHAPES` — it's already exported from
  `set-marker-pin`.
- Add a README_AI.md row right after `set_marker_pin`.

## Tests

Unit tests (no globals touched):

- returns the 13 canonical pin shapes in canonical order.
- `count` matches `pins.length`.
- every entry has `id === name` (built-ins only).
- accepts `{}`, `null`, `undefined` as input uniformly.
- honours a stubbed runtime that returns a custom list (confirms the
  factory doesn't hard-code the ids).
- runtime that throws propagates — the ToolRegistry wraps errors at a
  higher level, matching the `list-style-presets` test convention.

Integration block (`defaultMarkerPinListRuntime`):

- exercises the real default tool; asserts all 13 canonical ids / order.

## Non-goals

- Listing per-marker pin overrides.
- Categorising pin shapes (all are simple, flat strings).
- Validating that the marker editor UI still renders each shape — the
  renderer's `getPin(pin, fill, stroke)` handles unknowns by falling back.
