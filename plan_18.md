# Plan 18 — Use Case: Change a state's color

## Status

Iteration 18. 17 tools implemented (`rename_province` added last).
Baseline 7 warnings / 1 info / 0 errors. 223 tests pass.

## Use Case

**"Change the color of a specific state."**

The user does this by clicking the color swatch in a state row of the
States Editor; `stateChangeFill` in
`public/modules/dynamic/editors/states-editor.js:342-353` runs:

```js
pack.states[i].color = newFill;
statesBody.select("#state" + i).attr("fill", newFill);
statesBody.select("#state-gap" + i).attr("stroke", newFill);
statesHalo.select("#state-border" + i).attr("stroke", darker(newFill));
```

Prompts:
- *"Make Altaria red."*
- *"Change state 3 color to #336699."*
- *"Color the Borgnia state #8b0000."*

### Success criteria

1. `set_state_color({state: 2, color: "#abcdef"})` sets
   `pack.states[2].color = "#abcdef"`, updates
   `#state2[fill]`, `#state-gap2[stroke]`, and
   `#state-border2[stroke]` (with a darker-tinted stroke when possible).
2. `set_state_color({state: "altaria", color: "red"})` resolves
   case-insensitively and accepts named CSS colors.
3. Rejects state 0 (Neutrals).
4. Rejects unknown ref.
5. Validates the color (hex #rgb/#rrggbb or a known named-color-like
   identifier) — too loose validation would let the UI end up with
   a visible white fill. We'll accept:
   - `#rgb` / `#rrggbb` / `#rrggbbaa` (case-insensitive).
   - `rgb(...)` / `rgba(...)` / `hsl(...)` / `hsla(...)` strings.
   - Named colors (letters-only strings — we'll trust the browser,
     and document that named colors work).
6. Runtime throws → structured error.

## Scope

In-scope: `set_state_color` tool with `StateColorRuntime` seam,
pure validator, registry + README + tests.

Out-of-scope: changing form, capital, provinces, emblems.

## Design

New file: `src/ai/tools/set-state-color.ts`.

```ts
export interface StateColorRef { i: number; name: string; previousColor: string | null; }
export interface StateColorRuntime {
  find(ref: number | string): StateColorRef | null;
  applyColor(i: number, color: string): void;
}
```

Default runtime:
- `find(ref)` — same algorithm as rename-state's find.
- `applyColor(i, color)`:
  - `pack.states[i].color = color`.
  - If `document.getElementById("state" + i)` → `setAttribute("fill", color)`.
  - If `document.getElementById("state-gap" + i)` →
    `setAttribute("stroke", color)`.
  - Compute halo stroke via `window.d3?.color(color)?.darker()?.hex()`,
    fallback to the color itself; set
    `document.getElementById("state-border" + i).setAttribute("stroke", halo)`.

Pure helper `isValidCssColor(str)` — a pragmatic validator:
- Accepts `#` + 3, 4, 6, or 8 hex digits.
- Accepts `rgb(` / `rgba(` / `hsl(` / `hsla(` prefix + closing paren.
- Accepts lowercase-letter-only strings length 3..30 (names like
  `red`, `mediumseagreen`, `rebeccapurple`).
- Rejects anything else — in particular, empty, whitespace, or
  symbol-heavy strings.

Executor:
1. Validate `state` ref (integer > 0 or non-empty string).
2. Validate `color` string via `isValidCssColor`.
3. Find → error if unknown or state 0.
4. Call `applyColor` → catch throws.
5. Return `{ok, i, name, previousColor, color}`.

## Files

Create: `plan_18.md`, `tasks_18.md`,
`src/ai/tools/set-state-color.ts`,
`src/ai/tools/set-state-color.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`set-state-color.test.ts`):

1. Numeric id + `#rrggbb` → runtime.applyColor called with trimmed
   lowercase color; result reports previous + new.
2. String lookup + named color (`red`).
3. Reject state 0.
4. Reject unknown ref.
5. Invalid color (empty, `foo bar`, `rgb(abc)`) → error.
6. Runtime throw → error.
7. Invalid ref types rejected.
8. `isValidCssColor` helper:
   - Accepts `#abc`, `#abcd`, `#abcdef`, `#abcdef12`, `RGB(1,2,3)`,
     `rgba(1,2,3,0.5)`, `hsl(0,100%,50%)`, `red`,
     `mediumseagreen`.
   - Rejects `""`, `"not a color"`, `"#gggggg"`, `"#12"`, `" #abc"`
     (leading space — executor trims before validation), `123`,
     `null`, 30+ random characters.

## Plan ↔ tasks ↔ tests verification

| Criterion | Implementation | Test |
| --------- | -------------- | ---- |
| #1 applies fill + stroke | runtime.applyColor | 1 |
| #2 named colors / string ref | validator + find | 2 |
| #3 reject 0 | guard | 3 |
| #4 unknown ref | runtime.find → null | 4 |
| #5 color validation | `isValidCssColor` | 5, 8 |
| #6 runtime throw | catch | 6 |

Lint / test / build gates in tasks_18.md.
