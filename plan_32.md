# Plan 32 — Use Case: Choose the heightmap template

## Status

Iteration 32. 31 AI tools. Baseline 7 warnings / 1 info / 0 errors.
405 tests pass.

## Use Case

**"Pick the heightmap template used when regenerating the map."**

The Options panel has a "Heightmap" row with `#templateInput` — a
`<select>` populated from `window.heightmapTemplates`
(`public/config/heightmap-templates.js:150-165`) plus any
precreated heightmaps. The 14 built-in templates are:

| key            | display name    |
| -------------- | --------------- |
| volcano        | Volcano         |
| highIsland     | High Island     |
| lowIsland      | Low Island      |
| continents     | Continents      |
| archipelago    | Archipelago     |
| atoll          | Atoll           |
| mediterranean  | Mediterranean   |
| peninsula      | Peninsula       |
| pangea         | Pangea          |
| isthmus        | Isthmus         |
| shattered      | Shattered       |
| taklamakan     | Taklamakan      |
| oldWorld       | Old World       |
| fractious      | Fractious       |

The UI opens a dialog to pick one, but the underlying change is just
`#templateInput.value = <key>`. The change is passive — it's read
the next time `regenerateMap` runs.

Prompts:
- *"Set the heightmap to Archipelago."*
- *"Use the Pangea template."*
- *"Change terrain to Old World before regenerating."*

### Success criteria

1. `set_heightmap_template({template: "archipelago"})` sets
   `#templateInput.value = "archipelago"`.
2. `set_heightmap_template({template: "Old World"})` resolves the
   human name (case-insensitive, whitespace-flexible) back to the
   canonical key `"oldWorld"`.
3. Unknown template → structured error with the list of canonical
   keys.
4. Missing `templateInput` → error (map hasn't loaded).
5. Returns `{previousTemplate, template}` (both canonical keys).

## Scope

In-scope:
- `set_heightmap_template` tool with `HeightmapTemplateRuntime` seam.
- Pure helpers: `TEMPLATE_KEYS`, `DISPLAY_NAMES`, `resolveTemplateKey`.
- Registry + README + tests.

Out-of-scope:
- Precreated heightmaps (separate entries appended to `#templateInput`
  at runtime — would need a different lookup path).
- Triggering regeneration — that's already `regenerate_map`.
- Uploading custom heightmap images.

## Design

New file: `src/ai/tools/set-heightmap-template.ts`.

```ts
export const TEMPLATE_KEYS = [
  "volcano","highIsland","lowIsland","continents","archipelago",
  "atoll","mediterranean","peninsula","pangea","isthmus",
  "shattered","taklamakan","oldWorld","fractious",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export interface HeightmapTemplateRuntime {
  read(): { template: string | null };
  write(key: TemplateKey): void;
}
```

Default runtime:
- `read()`: returns `{template: #templateInput.value || null}`.
- `write(key)`: sets `#templateInput.value = key`. Throws if the
  element is missing.

Pure `resolveTemplateKey(input)`:
- Trim + lowercase.
- Match against canonical keys directly, OR against a
  lowercased-display-name lookup table ("old world" → "oldWorld",
  "high island" → "highIsland", etc.).
- Returns the canonical key or null.

## Files

Create: `plan_32.md`, `tasks_32.md`,
`src/ai/tools/set-heightmap-template.ts`,
`src/ai/tools/set-heightmap-template.test.ts`.

Modify: `src/ai/index.ts`, `README_AI.md`.

## Testing

Unit (`set-heightmap-template.test.ts`):

1. `{template: "archipelago"}` → `write("archipelago")`.
2. `{template: "Old World"}` resolves to `"oldWorld"`.
3. Case-insensitive / whitespace-flexible ("  old world  ").
4. Unknown template → error + `supported` list.
5. Runtime throws → error.
6. Invalid input type → error.
7. Response reports `previousTemplate` from `runtime.read()`.

Pure helper tests:

8. `resolveTemplateKey` for all 14 canonical keys (loop).
9. `resolveTemplateKey` for all 14 display names.
10. Invalid inputs → null.

## Plan ↔ tasks ↔ tests verification

Each criterion has a matching test.

Lint / test / build gates in tasks_32.md.
