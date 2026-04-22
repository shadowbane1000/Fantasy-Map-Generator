# AI Chat Assistant

This repository includes an optional collapsible AI chat window that lets
an assistant work inside the Fantasy Map Generator as a regular user — using
the same UI affordances you would. The assistant is powered by the
[Anthropic Claude API](https://docs.anthropic.com/).

## What it can do today

Each iteration of development adds one new capability ("use case"). The
currently implemented tools are:

| Tool                    | What the AI can do                                                            | Example prompt                            |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- |
| `set_map_name`          | Rename the current map (updates `#mapName` field)                             | "Rename my map to Eldoria"                |
| `set_layer_visibility`  | Show or hide a named map layer (rivers, borders, states, religions, cultures, heightmap, biomes, ice, labels, burgs, routes, markers, relief, emblems, zones, grid, coordinates, compass, temperature, precipitation, population, scale bar, vignette, texture, rulers). Idempotent. | "Turn off the rivers", "Show religions", "Hide state borders" |
| `apply_layers_preset`   | Apply a named preset: political, cultural, religions, provinces, biomes, heightmap, physical, poi, military, emblems, landmass. Accepts aliases like "culture map", "religion", "minimalist". | "Switch to the political map", "Show me the cultural view" |
| `get_map_info`          | Read a summary of the current map: name, seed, mapId, dimensions, year/era, and counts of states, provinces, burgs, religions, cultures, rivers, markers, zones, cells. | "What's this map called?", "How many states are there?", "Summarize the world" |
| `regenerate_map`        | Generate a new map (same as the "New Map" button, F2). Optional `seed` reproduces a specific map. Waits up to 60s for the `map:generated` event before returning. | "Generate a new map", "Regenerate with seed 12345" |
| `list_states`           | List states on the current map with name, fullName, form, type, color, culture, capital, burgs count, cells, area, and population. Paginated: `limit` 1–500 (default 100), `offset` ≥ 0. Skips the Neutrals placeholder. | "List the states", "Which state has the most burgs?" |
| `list_burgs`            | List burgs (cities/towns) with coords, population, state/culture names, capital/port flags, and type. Pagination (`limit` 1–500, `offset` ≥ 0) and filters: `state` (id or name), `capital_only`, `port_only`. | "List the biggest cities", "Show ports in Altaria", "Which burgs are capitals?" |
| `rename_burg`           | Rename a specific burg by id or case-insensitive current name. Updates the burg's label on the map automatically. | "Rename Stormport to Tidegarde", "Rename burg 7 to Arkhaven" |
| `remove_burg`           | Delete a burg (same as Remove in the Burg Editor). Clears the cell link, note, emblem, and SVG icon/label. Refuses state capitals — run `set_state_capital` first to pick a new capital. | "Delete burg 7", "Remove Stormport" |
| `list_cultures`         | List cultures with name, color, type, cells, area, population, name base, shield, and code. Paginated (`limit` 1–500, `offset` ≥ 0). Skips the index-0 Wildlands placeholder. | "List the cultures", "Which culture has the biggest population?" |
| `rename_culture`        | Rename a culture by id or case-insensitive name. Regenerates the short code via the same abbreviation algorithm the Cultures Editor uses. Rejects the Wildlands placeholder. | "Rename Highlanders to Pinegarde", "Rename culture 2 to Wayfarers" |
| `list_religions`        | List religions with name, type (Folk/Organized/Cult/Heresy), form, deity, color, culture, cells, area, population, expansion, and code. Paginated (`limit` 1–500, `offset` ≥ 0). Skips the index-0 placeholder. | "List the religions", "Which faith has the most followers?" |
| `rename_religion`       | Rename a religion by id or case-insensitive name. Regenerates the short code via the same abbreviation algorithm the Religions Editor uses. Rejects the 'No religion' placeholder. | "Rename Old Faith to Wildshrine", "Rename religion 2 to Dawnkeepers" |
| `list_provinces`        | List provinces with name, fullName, formName, color, parent state, capital burg, and pole coordinates. Paginated (`limit` 1–500, `offset` ≥ 0) and optional `state` filter (id or name). Skips the index-0 placeholder. | "List provinces", "Which provinces are in Altaria?" |
| `list_markers`          | List map markers (points of interest) with type, icon, name/legend (from Notes), coords, cell, and pinned/lock flags. Paginated. Optional filters: `type` (case-insensitive exact) and `pinned_only`. | "List the markers", "Show me all the castles", "Which POIs are pinned?" |
| `set_marker_note`       | Rename a marker / POI and/or update its legend. Writes to the same global `notes[]` the Notes Editor uses; creates a note if one doesn't exist yet. Ref accepts marker id or current name (case-insensitive). `legend: ""` clears, whitespace-only is rejected. | "Rename the Rookhold marker to Dragon's Keep", "Add a legend to marker 5: 'Seat of the red king'" |
| `remove_marker`         | Delete a marker from the map (same as the trash icon in the Markers Overview). Removes the marker from `pack.markers`, its note from `window.notes`, and the SVG `#marker{i}` element. | "Delete marker 3", "Remove the Rookhold marker" |
| `set_marker_pinned`     | Pin or unpin a marker — same side-effect as the pin icon in the Markers Overview. Idempotent. Writes `marker.pinned`, keeps the `#markers` SVG group's `pinned` attribute in sync, and calls `drawMarkers()`. Matches by id or case-insensitive current note name. | "Pin the Rookhold marker", "Unpin marker 5" |
| `set_marker_lock`       | Lock or unlock a marker — same side-effect as the lock icon in the Markers Overview. Locked markers are preserved across regeneration. Idempotent. Writes `marker.lock` on lock, deletes the key on unlock. Matches by id or case-insensitive current note name. | "Lock the Rookhold marker", "Unlock marker 5" |
| `list_rivers`           | List rivers with name, type, length, discharge (m³/s), width, source/mouth cells, and drainage basin (id + name). Paginated. Optional filters: `basin` (id or name — pulls all tributaries), `min_length`, `min_discharge`. | "List the rivers", "Show rivers longer than 200 km", "Which rivers drain into the Great River?" |
| `rename_river`          | Rename a river (writes `river.name` — same side-effect as the Rivers Editor name field). Matches by `river.i` (non-contiguous ids) or case-insensitive current name. Skips removed rivers. Doesn't regenerate the culture-based name — pass the exact new name. | "Rename river 5 to Ashwater", "Rename the Great River to Blackflow" |
| `set_river_type`        | Reclassify a river (writes `river.type` — same as the Rivers Editor type field). Free-form text: common values are River / Creek / Brook / Stream / Fork / Branch; anything non-empty is allowed (e.g. Canal, Ravine, Ditch). Matches by `river.i` or current name; skips removed rivers. | "Reclassify river 5 as a Stream", "Make the Great River a Canal" |
| `list_routes`           | List routes (roads, trails, sea lanes) with name, length, feature (landmass), and point/cell counts. Paginated. Optional filters: `group` (roads / trails / searoutes — aliases accepted) and `min_length`. Note: name/length are populated lazily by the Routes Overview in the UI. | "List the roads", "Show me the sea lanes", "Which routes are longest?" |
| `list_regiments`        | List military regiments across all states (the same data the Military Overview reads from `pack.states[*].military`). Each entry reports id, name, state, type, total troops, army, coords, cell, naval flag, and the unit composition map. Paginated. Optional filters: `state` (id or name), `type` (case-insensitive), `naval_only`, `min_total`. | "List all fleets", "How many troops does Rookholm field?", "Show armies of 5000+ troops" |
| `list_notes`            | List every note in `window.notes` (lore attached to burgs, states, provinces, cultures, religions, markers, regiments, rivers, routes, lakes, battles, labels, zones). Each entry reports id, derived `type`, name, and an HTML-stripped legend preview (default 300 chars; pass `full_legend: true` for raw HTML, or `max_legend_length` to adjust). Optional filters: `type` (prefix), `search` (substring in name or legend). | "Read the burg notes", "What notes mention the Ashwater?", "Show me all regiment notes" |
| `rename_regiment`       | Rename a specific regiment (same as the Regiment Editor name field). Regiment ids are per-state, so pass both `state` (id or name) and `regiment` (id or current regiment name). Writes `regiment.name` and updates the `#regiment{stateId}-{i}` SVG tooltip attribute. | "Rename Rookhold's 1st Army to Ashguard Legion", "Call regiment 2 of Ashholm 'The Red Phalanx'" |
| `remove_regiment`       | Disband a regiment (same as the Regiment Editor's Remove button — confirm dialog is skipped, tools are non-interactive). Splices the entry out of `pack.states[stateId].military`, drops the matching note, removes the `#regiment{stateId}-{i}` SVG element. Same two-part `(state, regiment)` ref as `rename_regiment`. | "Disband Rookhold's fleet", "Remove regiment 2 from Ashholm" |
| `list_zones`            | List zones — the overlay regions drawn by the Zones Editor (invasions, rebellions, diseases, crusades, disasters, eruptions, avalanches, etc.). Reports id, name, type, color, cell count, and hidden flag. Paginated. Optional filters: `type` (case-insensitive exact) and `include_hidden` (default false). | "Are there any invasions on the map?", "List all current disease zones", "What zones are active?" |
| `set_zone_visibility`   | Hide or show a single zone on the map — same side-effect as the eye-toggle button in the Zones Overview. Writes `zone.hidden` and calls `drawZones()`. Idempotent (noop if already in the requested state). Zones match on `zone.i` (non-contiguous) or case-insensitive name. | "Hide the Plague zone", "Show zone 5 again", "Hide all invasions" |
| `rename_zone`           | Rename a zone (the Zones Overview calls this the "Description" field). Writes `zone.name` and mirrors it to the `#zone{i}` SVG tooltip attribute. Matches by `zone.i` or current name. | "Rename the Plague zone to Black Death", "Call zone 3 'Ash Invasion'" |
| `set_zone_color`        | Change a zone's color — same side-effect as the swatch in the Zones Overview. Writes `zone.color` and calls `drawZones()`. Accepts hex, rgb()/rgba()/hsl()/hsla(), or named CSS colors. Matches by `zone.i` or current name. | "Make the Plague zone purple", "Recolor zone 3 to #ff8800" |
| `remove_zone`           | Delete a zone — same side-effect as the Zones Overview trash icon (confirm dialog is skipped; tools run non-interactively). Drops the entry from `pack.zones`, removes the `#zone{i}` SVG element, and unfogs any focus overlay. | "Delete the Plague zone", "Remove zone 5" |
| `rename_province`       | Rename a province by id or case-insensitive name / fullName. Optional `formName` (e.g. "Duchy") and `fullName` update together with the short name. Refreshes the province's SVG label automatically. | "Rename Rookwood to Glenhold", "Rename province 3 to Rookhaven and set form to Kingdom" |
| `set_state_color`       | Change a state's color by id or case-insensitive name. Accepts `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()/hsl()/hsla()`, or named colors. Updates the state's SVG fill, gap stroke, and border halo. Rejects the Neutrals placeholder. | "Make Altaria red", "Set state 3 color to #336699" |
| `save_map`              | Save the current map. Default `target: "download"` triggers the browser to download a `.map` file (same as Ctrl+S). `target: "storage"` persists to IndexedDB so the map can be reloaded later. | "Save the map", "Save a copy to local storage" |
| `load_map`              | Load a saved map. `source: "storage"` reloads the last map from IndexedDB (counterpart of save_map storage). `source: "url"` downloads a `.map` file over http(s). Waits up to 60s for map:generated before returning. | "Load the last saved map", "Load the map at https://example.com/fantasy.map" |
| `export_map`            | Export the current map to a downloadable file: `svg`, `png`, `jpeg`, or a GeoJSON slice (`geojson-cells` / `-routes` / `-rivers` / `-markers` / `-zones`). Common aliases accepted (`jpg`, `cells`, `markers`, …). | "Export the map as SVG", "Save it as a PNG", "Export the rivers as GeoJSON" |
| `set_culture_color`     | Change a culture's color by id or case-insensitive name. Same color formats as `set_state_color`. Updates the culture's SVG fill and center marker. Rejects the Wildlands placeholder. | "Make the Highlanders #336699", "Color culture 2 seagreen" |
| `set_religion_color`    | Change a religion's color by id or case-insensitive name. Same color formats as `set_state_color`. Updates the religion's SVG fill and center marker. Rejects the "No religion" placeholder. | "Make the Old Faith goldenrod", "Color religion 2 #336699" |
| `set_province_color`    | Change a province's color by id or case-insensitive name/fullName. Same color formats as `set_state_color`. Updates the province's SVG fill and gap stroke. Rejects the placeholder. | "Color Rookwood #336699", "Make province 3 goldenrod" |
| `set_burg_population`   | Set a burg's displayed population (e.g. 50000). Input is in the same user-facing scale the Burg Editor shows; internally divided by `populationRate` and `urbanization` before storage, matching the editor. Allows 0 for abandoned settlements. | "Set Stormport's population to 50000", "Give burg 5 a population of 12500" |
| `set_burg_culture`      | Reassign a burg to a different culture. Both fields accept id or case-insensitive name; Wildlands (culture 0) is allowed. | "Change Stormport's culture to Coastalfolk", "Assign burg 5 to culture 3" |
| `set_burg_type`         | Change a burg's type category. One of: Generic, River, Lake, Naval, Nomadic, Hunting, Highland. Affects naming style and icon choice. | "Make Stormport a Naval burg", "Change burg 5's type to Highland" |
| `set_state_capital`     | Promote a burg to be a state's capital (same as ticking the Capital checkbox in the Burg Editor). Burg must belong to the target state. Updates the state's capital+center and flips capital flags on old/new burgs; asks Burgs.changeGroup to refresh icon groups. Idempotent. | "Make Tidegarde the capital of Altaria", "Set state 2's capital to burg 12" |
| `set_entity_expansionism` | Tune expansionism on a `state` / `culture` / `religion` (how aggressively it expands during regeneration). Finite > 0, ≤ 100; typical 0.5–5. Passive — read by `regenerate_map`. | "Double Altaria's expansionism", "Make the Highlanders culture more expansionist" |
| `set_entity_lock`       | Lock or unlock a `state` / `burg` / `culture` / `religion` / `province` to preserve it across regenerations. Ref accepts id or case-insensitive name; type accepts plurals/synonyms. Idempotent. | "Lock Altaria", "Unlock the Stormport burg", "Lock the Highlanders culture" |
| `set_state_form`        | Change a state's government form (Kingdom, Empire, Republic, Theocracy, …). Sets both `formName` (specific) and `form` (category: Monarchy/Republic/Union/Theocracy/Anarchy). Redraws the state label. Supported formNames match the States Editor dropdown. | "Make Altaria an Empire", "Turn state 3 into a Theocracy" |
| `set_world_rates`       | Adjust world-wide population scaling sliders (`population_rate`, `urbanization`, `urban_density`). Updates the Units Editor inputs and dispatches `change` so the existing handlers update the globals. Provide any subset. | "Double the population rate", "Set urbanization to 1.3" |
| `set_heightmap_template` | Pick the heightmap template for the next regeneration (14 built-in: Volcano, High Island, Low Island, Continents, Archipelago, Atoll, Mediterranean, Peninsula, Pangea, Isthmus, Shattered, Taklamakan, Old World, Fractious). Accepts canonical keys or display names. Passive — run `regenerate_map` to apply. | "Switch terrain to Old World", "Use the Archipelago template then regenerate" |
| `set_year_and_era`      | Change the world's in-fiction year and/or era. At least one is required. Updates `window.options.year`, `era`, `eraShort` (auto-derived uppercase initials) and syncs the Options panel inputs. | "Set the year to 1247", "Change the era to Second Age", "Set the date to 1247 Bright Era" |
| `rename_state`          | Rename a specific state by id or by current name (case-insensitive). Optional `fullName` updates the ceremonial name. Redraws the state label on the map automatically. Rejects the Neutrals placeholder. | "Rename Altaria to Valorin", "Rename state 3 to Zephyr" |
| `focus_on_map`          | Zoom the map to a burg or state by id or case-insensitive name, or reset to the world view. Uses the same zoomTo/resetZoom helpers the UI uses. | "Zoom to Stormport", "Focus on state 3", "Reset the zoom" |

If you ask the AI to do something it doesn't have a tool for yet, it will
tell you instead of inventing the action.

## Getting an API key

1. Sign in at <https://console.anthropic.com/>.
2. Go to **API Keys** and click **Create Key**.
3. Copy the generated key (it starts with `sk-ant-…`).

You will be billed for your own usage on your own Anthropic account.

## Using the chat in the app

1. Start the app (`npm run dev`, then open <http://localhost:5173>) or use a
   built version.
2. In the bottom-right corner, click the small circular **AI** button.
3. The first time the panel opens, an API-key row is expanded. Paste your
   `sk-ant-…` key and click **Save**. The key is stored in your browser's
   `localStorage` under the name `ai-chat-anthropic-api-key` — nothing is
   sent anywhere except directly to Anthropic.
4. Type a request in the input box (Shift+Enter for a newline, Enter to
   send). Example: `rename the map to Eldoria`.
5. You'll see:
   - your message (blue bubble),
   - any tool calls the AI makes (`→ set_map_name({"name":"Eldoria"})`,
     `✓ set_map_name → {"ok":true,...}`),
   - the assistant's reply.
6. Click the `–` in the header to collapse the panel back to the AI button.
7. Click the **⚙** in the header to show/hide the API-key row (to change or
   clear the stored key).

## Specifying the API key — other options

The built-in flow uses `localStorage`. For advanced usage:

- **Programmatic override**: call `setApiKey(key)` from the `src/ai/api-key`
  module (exported from `src/ai`).
- **Clearing the key**: call `clearApiKey()` from the same module, or open
  DevTools and run
  `localStorage.removeItem("ai-chat-anthropic-api-key")`.

There is intentionally no support for bundling an API key at build time —
that would ship the key to every visitor of the site.

## Security & limitations

- The API key is visible to any script running in the same page. Do not use
  the feature on a shared computer or on a page where you don't trust the
  other scripts.
- The key is sent directly from your browser to
  `https://api.anthropic.com/v1/messages`. The app has no backend
  intermediary.
- Anthropic requires the header
  `anthropic-dangerous-direct-browser-access: true` for browser calls. We
  set it automatically — it is a deliberate acknowledgement that direct
  browser calls are not the recommended deployment pattern.
- Each message consumes tokens on your Anthropic account. Keep conversations
  focused.

## Troubleshooting

- **"No API key set. Click ⚙…"** — you haven't saved a key yet.
- **401 / authentication_error** — the key is wrong, revoked, or your
  account has no credits.
- **429 / rate limit** — too many requests; slow down or upgrade your plan.
- **CORS errors in DevTools** — make sure you are not proxying the request
  through another host; the call must go directly to
  `api.anthropic.com`.
- **Tool call says `#mapName not found`** — the map input element is only
  present after the main map loads; reload the page and wait for the map to
  finish generating before issuing rename commands.

## Developing new tools

Use cases are implemented one per Ralph-loop iteration. See
`plan_N.md` and `tasks_N.md` at the root of the repo for the active plan.
To add a new tool:

1. Create a file in `src/ai/tools/your-tool.ts` that exports a `Tool`
   (matching the `Tool` interface in `src/ai/tools/index.ts`).
2. Register it from `src/ai/index.ts` inside `buildDefaultRegistry()`.
3. Add a unit test under `src/ai/tools/your-tool.test.ts`.
4. Update this README's tool table with the new capability.

## Files

- `src/ai/index.ts` — entry point + bootstrap.
- `src/ai/chat-window.ts` — the collapsible UI.
- `src/ai/chat-controller.ts` — tool-use conversation loop.
- `src/ai/anthropic-client.ts` — Messages API wrapper.
- `src/ai/api-key.ts` — `localStorage` helpers.
- `src/ai/tools/*` — tool definitions.
- `public/styles/ai-chat.css` — panel/bubble styles.
