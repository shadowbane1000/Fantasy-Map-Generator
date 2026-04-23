# Plan 131 — Use Case: Set "On page load" behavior

## Status

Iteration 131. Baseline 7 warnings / 1 info / 0 errors. 1623 tests pass
(142 files). Existing Options-backed selector tools include
`set_state_labels_mode`, `set_style_preset`, `set_measurement_units`,
`set_cultures_set`, `set_default_emblem_shape`. This plan adds
`set_onload_behavior`.

## Use Case

**"Control what the Generator does when the page is reloaded."**

The Options dialog (Options → General tab) has a selector labelled
**"Onload behavior"** that determines which side the app takes on a
cold start: generate a random map, or try to restore the last saved
map from IndexedDB.

Markup lives in `src/index.html` around line 1904:

```html
<tr data-tip="Set what Generator should do on load">
  <td></td>
  <td>Onload behavior</td>
  <td>
    <select id="onloadBehavior" data-stored="onloadBehavior">
      <option value="random" selected>Generate random map</option>
      <option value="lastSaved">Open last saved map</option>
    </select>
  </td>
  <td></td>
</tr>
```

The `data-stored` pattern means that on change the UI calls `lock()`
(see `public/modules/ui/options.js:106`), which writes the element's
value to `localStorage` under the key named in `data-stored` — so the
key is literally `"onloadBehavior"`.

On reload, `public/main.js:334` reads it:

```js
if (byId("onloadBehavior").value === "lastSaved") {
  try {
    const blob = await ldb.get("lastMap");
    if (blob) { uploadMap(blob); return; }
  } catch (error) { ERROR && console.error(error); }
}
```

`window.options` does **not** track `onloadBehavior` (the select is
driven entirely by the DOM + localStorage round-trip).

Prompts:
- *"Restore my last map when I reload."*
- *"Always start with a new random map."*
- *"Set the onload behaviour to lastSaved."*

### Success criteria

1. `set_onload_behavior({behavior: "lastSaved"})` sets
   `#onloadBehavior.value = "lastSaved"` and writes
   `localStorage.setItem("onloadBehavior", "lastSaved")`.
2. `set_onload_behavior({behavior: "random"})` does the same for
   `"random"`.
3. Accepts canonical values plus common aliases:
   - `"new"`, `"generate"`, `"new-map"`, `"random-map"` → `random`
   - `"saved"`, `"last-saved"`, `"last"`, `"restore"` → `lastSaved`
   - Case-insensitive.
4. Rejects unknown / empty / non-string.
5. Returns `{ ok, behavior, previousBehavior, noop }` where
   `previousBehavior` is the value read at tool entry (may be `null`).
6. Noop when `previousBehavior === behavior`.
7. The DOM write is best-effort (wrapped in the runtime; tool surfaces
   runtime errors as `errorResult`).

## Tool shape

```ts
export const ONLOAD_BEHAVIORS = ["random", "lastSaved"] as const;
export type OnloadBehavior = (typeof ONLOAD_BEHAVIORS)[number];

export interface SetOnloadBehaviorRuntime {
  readCurrent: () => string | null;
  apply: (value: string) => void;
}
```

`defaultRuntime.readCurrent`:
1. If `document` is defined and `#onloadBehavior` exists, return its
   `.value` (falsy → `null`).
2. Otherwise fall back to `localStorage.getItem("onloadBehavior")`.
3. Returns `null` if neither source has it.

`defaultRuntime.apply(value)`:
1. Best-effort write to `#onloadBehavior.value` (try/catch — DOM
   absence shouldn't break the tool).
2. `localStorage.setItem("onloadBehavior", value)`.
   (Left bare so obvious misconfiguration — e.g. no localStorage — is
   surfaced.)

## Files touched

- **new** `src/ai/tools/set-onload-behavior.ts`
- **new** `src/ai/tools/set-onload-behavior.test.ts`
- `src/ai/index.ts` — import + register + export
- `README_AI.md` — add row in the options/settings block next to
  `set_measurement_units` / `set_state_labels_mode`.

## Verification

- `npm run build` succeeds.
- `npm test` — expect 1623 → 1623 + N.
- `npm run lint` — baseline 7 warnings / 1 info / 0 errors.
