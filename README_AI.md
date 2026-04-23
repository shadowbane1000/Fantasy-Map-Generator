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
| `remove_province`       | Delete a province (same as the Provinces Editor trash icon). Zeroes every `pack.cells.province[cell]` that referenced it, splices it out of `pack.states[state].provinces`, writes `pack.provinces[i] = { i, removed: true }` (tombstone), removes the COA / province SVG elements, calls `unfog('focusProvince{i}')`, and calls `drawBorders()` to refresh. Rejects id 0 and already-removed provinces. | "Delete province 4", "Remove the North Mark" |
| `remove_religion`       | Delete a religion (same as the Religions Editor trash icon). Zeroes every `pack.cells.religion[cell]` that referenced it, writes `religion.removed = true` (tombstone — other fields preserved), and filters the removed id out of every other religion's `origins` array (resetting any emptied array to `[0]`). Best-effort removes the religion SVG elements. Response reports `cascadedOrigins`. Rejects "No religion" (id 0) and already-removed entries. | "Delete religion 4", "Remove the Old Faith" |
| `remove_culture`        | Delete a culture (same as the Cultures Editor trash icon). Reassigns every active burg and state with `culture === i` to 0 (Wildlands), zeroes matching `pack.cells.culture`, tombstones `pack.cultures[i].removed = true` (name preserved), and filters the removed id out of every other active culture's `origins` array (empty → `[0]`). Best-effort removes the `#culture{i}` / `#cultureCenter{i}` SVG elements. Response reports `cascadedOrigins`, `reassignedBurgs`, `reassignedStates`. Rejects Wildlands (id 0) and already-removed cultures. | "Delete culture 3", "Remove the Highlanders" |
| `remove_state`          | Delete a state (same as the States Editor trash icon). Big cascade: reassigns every burg in the state to neutral (clearing capital flag), zeroes `pack.cells.state`, tombstones every province of the state (including `cells.province` cleanup + province SVG), splices the state's regiments from the global notes, filters the state id out of every other state's `neighbors`, tombstones `pack.states[i]` (replaces the object with `{ i, removed: true }` — wipes the name, matches UI), best-effort removes the state / army SVG and calls `drawStates` / `drawBorders` / `drawProvinces`. Response reports all four cascade counts. Rejects Neutrals (id 0) and already-removed states. | "Delete state 3", "Remove the Kingdom of Altaria" |
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
| `set_marker_type`       | Change a marker's free-form `type` label (the "Type" input in the Markers Editor — groups related markers for shared styling). Metadata-only write: no redraw is triggered, matching the UI. Idempotent. Matches by id or case-insensitive current note name; rejects empty / whitespace-only types. | "Set marker 5's type to 'volcano'", "Change the Rookhold marker's type to lair" |
| `set_marker_icon`       | Change a marker's icon glyph or URL — the icon picker in the Markers Editor. Accepts any non-empty string (typically an emoji like `🌋` but URLs are allowed). Writes `marker.icon` and best-effort calls `drawMarkers()`. **Per-marker scope**: unlike the UI (which propagates to every same-type marker), this tool only updates the one marker — the AI can iterate if bulk behavior is wanted. Idempotent. | "Change the Dragon Lair marker's icon to 🐲", "Set marker 5's icon to 🌋" |
| `set_marker_size`       | Change a marker's size — the Size input in the Markers Editor. Writes `marker.size` (default 30 if unset) and best-effort calls `drawMarkers()`. Size must be a finite number > 0. **Per-marker scope** (same decision as `set_marker_icon`). Idempotent. | "Make the Dragon Lair marker bigger (size 60)", "Shrink marker 5 to size 15" |
| `set_marker_pin`        | Change a marker's pin shape — the Pin Shape dropdown in the Markers Editor. One of `bubble` (default), `pin`, `square`, `squarish`, `diamond`, `hex`, `hexy`, `shieldy`, `shield`, `pentagon`, `heptagon`, `circle`, `no` (case-insensitive). Writes `marker.pin` and best-effort calls `drawMarkers()`. **Per-marker scope**. Idempotent. | "Change the Dragon Lair marker to a shield pin", "Set marker 5's pin shape to circle" |
| `add_marker`            | Place a new marker at `(x, y)`. Optional `type` (default "custom"), `icon` (default 📍), `name` + `legend` (create a `marker{i}` note), `lock`. Uses `findCell(x, y)` for the cell, pushes to `pack.markers`, calls `drawMarkers()`. | "Drop a marker at 500, 300 called Dragon Lair with legend 'Here there be dragons'", "Add a castle icon at the ruin site" |
| `move_marker`           | Relocate an existing marker (same effect as dragging it in the Markers Editor). Writes `marker.x`, `marker.y`, and `marker.cell = findCell(x, y)`. Best-effort updates the `#marker{i}` SVG x/y attrs and calls `drawMarkers()`. Idempotent. Matches by id or case-insensitive current note name. | "Move the Dragon Lair marker to 500, 300", "Relocate marker 5 to 100, 200" |
| `list_rivers`           | List rivers with name, type, length, discharge (m³/s), width, source/mouth cells, and drainage basin (id + name). Paginated. Optional filters: `basin` (id or name — pulls all tributaries), `min_length`, `min_discharge`. | "List the rivers", "Show rivers longer than 200 km", "Which rivers drain into the Great River?" |
| `list_biomes`           | List biomes on the map (13 default — Marine, Hot desert, Cold desert, Savanna, Grassland, Tropical / Temperate forests, Taiga, Tundra, Glacier, Wetland — plus any user-added). Each entry reports id, name, color, habitability, iconsDensity, movement cost. Per-biome stats (cells, area, rural, urban, scaled population) are populated after the Biomes Editor has been opened, else 0. Paginated. | "List the biomes", "Which biome is most habitable?", "How big is the Temperate Deciduous Forest?" |
| `rename_biome`          | Rename a biome (writes `biomesData.name[k]` — same as the Biomes Editor name field). Matches by numeric biome id (0 = Marine) or case-insensitive current name. Biomes whose name slot is the `removed` sentinel (the editor's deletion marker) are hidden from lookups and can't be renamed. Rename-to "removed" is rejected. | "Rename Hot desert to Scorched Waste", "Rename biome 5 to 'Mage-touched Forest'" |
| `set_biome_color`       | Recolor a biome (writes `biomesData.color[k]` and refreshes the `#biome{i}` SVG fill + stroke — same as the Biomes Editor swatch). Accepts hex / rgb() / rgba() / hsl() / hsla() / named CSS colors. Matches by id (0 = Marine) or case-insensitive name; removed biomes are skipped. | "Make Hot desert #ff9933", "Recolor biome 5 to teal" |
| `set_biome_habitability`| Set a biome's habitability (writes `biomesData.habitability[k]` and calls `recalculatePopulation()` — same as the Biomes Editor habitability input). Integer in [0, 9999]; 0 = uninhabitable. Matches by id (0 = Marine) or case-insensitive name; removed biomes skipped. | "Make tundras uninhabitable — habitability 0", "Bump grassland habitability to 40" |
| `remove_biome`          | Remove a **custom** biome (id >= 13) by setting `biomesData.name[k]` to the "removed" sentinel — same as the Biomes Editor trash icon. Default biomes (ids 0–12) are protected because cells may still reference them. Matches by id or case-insensitive current name. | "Remove the Magic Grove custom biome", "Delete biome 14" |
| `rename_river`          | Rename a river (writes `river.name` — same side-effect as the Rivers Editor name field). Matches by `river.i` (non-contiguous ids) or case-insensitive current name. Skips removed rivers. Doesn't regenerate the culture-based name — pass the exact new name. | "Rename river 5 to Ashwater", "Rename the Great River to Blackflow" |
| `set_river_type`        | Reclassify a river (writes `river.type` — same as the Rivers Editor type field). Free-form text: common values are River / Creek / Brook / Stream / Fork / Branch; anything non-empty is allowed (e.g. Canal, Ravine, Ditch). Matches by `river.i` or current name; skips removed rivers. | "Reclassify river 5 as a Stream", "Make the Great River a Canal" |
| `list_routes`           | List routes (roads, trails, sea lanes) with name, length, feature (landmass), and point/cell counts. Paginated. Optional filters: `group` (roads / trails / searoutes — aliases accepted) and `min_length`. Note: name/length are populated lazily by the Routes Overview in the UI. | "List the roads", "Show me the sea lanes", "Which routes are longest?" |
| `rename_route`          | Rename a route (writes `route.name` — same as the Routes Editor name field). Matches by `route.i` (non-contiguous ids) or case-insensitive current name. Skips removed routes. | "Rename route 5 to The King's Road", "Rename the Silk Trail to Iron Passage" |
| `set_route_group`       | Reclassify a route between roads / trails / searoutes (same as the Routes Editor group dropdown). Writes `route.group` and reparents the `#route{i}` SVG under the new group. Accepts canonical values and aliases (road / trail / sea lanes / …). Matches by id or name; removed routes skipped. | "Move route 5 to searoutes", "Turn the coastal trail into a sea lane" |
| `set_route_lock`        | Lock or unlock a route — the lock icon in the Routes Editor / Overview. Locked routes are preserved across regeneration. On lock writes `route.lock = true`; on unlock deletes the key entirely. Idempotent. Matches by id or case-insensitive name; removed routes skipped. | "Lock the Silk Trail", "Unlock route 5" |
| `remove_route`          | Delete a route — delegates to the generator's `Routes.remove()` so the cell adjacency map (`pack.cells.routes`), `pack.routes`, and the `#route{i}` SVG element are all cleaned up together. UI confirm dialog is skipped (tools run non-interactively). Matches by id or case-insensitive current name. | "Remove route 5", "Delete the Silk Trail" |
| `list_regiments`        | List military regiments across all states (the same data the Military Overview reads from `pack.states[*].military`). Each entry reports id, name, state, type, total troops, army, coords, cell, naval flag, and the unit composition map. Paginated. Optional filters: `state` (id or name), `type` (case-insensitive), `naval_only`, `min_total`. | "List all fleets", "How many troops does Rookholm field?", "Show armies of 5000+ troops" |
| `list_notes`            | List every note in `window.notes` (lore attached to burgs, states, provinces, cultures, religions, markers, regiments, rivers, routes, lakes, battles, labels, zones). Each entry reports id, derived `type`, name, and an HTML-stripped legend preview (default 300 chars; pass `full_legend: true` for raw HTML, or `max_legend_length` to adjust). Optional filters: `type` (prefix), `search` (substring in name or legend). | "Read the burg notes", "What notes mention the Ashwater?", "Show me all regiment notes" |
| `set_note`              | Create or update the name / legend of any note in `window.notes` — the general write counterpart to `list_notes`. Upsert: if no note exists for the id, one is created (`name` required). `legend: ""` clears; whitespace-only is rejected. At least one of `name` / `legend` must be supplied. | "Add a legend to the Rookholm burg note", "Update state 3's note with a history paragraph", "Clear the legend on zone 5" |
| `remove_note`           | Delete a note from `window.notes` — same as the Notes Editor Remove button (confirm dialog is skipped; tools run non-interactively). Pass the note id discovered via `list_notes`. Errors when the id doesn't exist so the AI knows the removal actually happened. | "Remove the state 3 note", "Delete the regiment1-2 note" |
| `rename_regiment`       | Rename a specific regiment (same as the Regiment Editor name field). Regiment ids are per-state, so pass both `state` (id or name) and `regiment` (id or current regiment name). Writes `regiment.name` and updates the `#regiment{stateId}-{i}` SVG tooltip attribute. | "Rename Rookhold's 1st Army to Ashguard Legion", "Call regiment 2 of Ashholm 'The Red Phalanx'" |
| `remove_regiment`       | Disband a regiment (same as the Regiment Editor's Remove button — confirm dialog is skipped, tools are non-interactive). Splices the entry out of `pack.states[stateId].military`, drops the matching note, removes the `#regiment{stateId}-{i}` SVG element. Same two-part `(state, regiment)` ref as `rename_regiment`. | "Disband Rookhold's fleet", "Remove regiment 2 from Ashholm" |
| `set_regiment_unit`     | Change the count of a specific unit in a regiment (writes `regiment.u[unit]`, recomputes `regiment.a`, refreshes the on-map total — same as the Regiment Editor's unit inputs). Adds the unit key if not yet present. Same two-part `(state, regiment)` ref. | "Give Rookhold's 1st Army 300 Swordsmen", "Add 50 Cavalry to the Phalanx", "Set Ashholm 1 archers to 0" |
| `set_regiment_naval`    | Flip a regiment's type between naval and land — the anchor / users icon in the Regiment Editor. Writes `regiment.n` to `1` (naval) or `0` (land), best-effort calls `drawMilitary()` to re-render the armies layer. Idempotent. Same two-part `(state, regiment)` ref as the other regiment tools. | "Make Altaria's 2nd Regiment naval", "Turn the flagship fleet back into a land regiment" |
| `list_zones`            | List zones — the overlay regions drawn by the Zones Editor (invasions, rebellions, diseases, crusades, disasters, eruptions, avalanches, etc.). Reports id, name, type, color, cell count, and hidden flag. Paginated. Optional filters: `type` (case-insensitive exact) and `include_hidden` (default false). | "Are there any invasions on the map?", "List all current disease zones", "What zones are active?" |
| `set_zone_visibility`   | Hide or show a single zone on the map — same side-effect as the eye-toggle button in the Zones Overview. Writes `zone.hidden` and calls `drawZones()`. Idempotent (noop if already in the requested state). Zones match on `zone.i` (non-contiguous) or case-insensitive name. | "Hide the Plague zone", "Show zone 5 again", "Hide all invasions" |
| `rename_zone`           | Rename a zone (the Zones Overview calls this the "Description" field). Writes `zone.name` and mirrors it to the `#zone{i}` SVG tooltip attribute. Matches by `zone.i` or current name. | "Rename the Plague zone to Black Death", "Call zone 3 'Ash Invasion'" |
| `set_zone_type`         | Reclassify a zone (writes `zone.type` and the `#zone{i}` SVG `data-type` attribute — same as the Zones Editor type field). Free-form text: generator values are Invasion / Rebels / Proselytism / Crusade / Disease / Disaster / Eruption / Avalanche / Flood; anything non-empty is accepted. | "Reclassify zone 5 as Rebels", "Change the Plague zone to Famine" |
| `set_zone_color`        | Change a zone's color — same side-effect as the swatch in the Zones Overview. Writes `zone.color` and calls `drawZones()`. Accepts hex, rgb()/rgba()/hsl()/hsla(), or named CSS colors. Matches by `zone.i` or current name. | "Make the Plague zone purple", "Recolor zone 3 to #ff8800" |
| `remove_zone`           | Delete a zone — same side-effect as the Zones Overview trash icon (confirm dialog is skipped; tools run non-interactively). Drops the entry from `pack.zones`, removes the `#zone{i}` SVG element, and unfogs any focus overlay. | "Delete the Plague zone", "Remove zone 5" |
| `rename_province`       | Rename a province by id or case-insensitive name / fullName. Optional `formName` (e.g. "Duchy") and `fullName` update together with the short name. Refreshes the province's SVG label automatically. | "Rename Rookwood to Glenhold", "Rename province 3 to Rookhaven and set form to Kingdom" |
| `set_province_capital`  | Promote a burg to be a province's capital (same as the Provinces Editor capital dropdown). Writes `province.burg` and `province.center`. The burg must belong to the same state as the province; cross-state pairs are rejected. Matches province and burg by id (>0) or case-insensitive name. | "Make Rookholm the capital of Rookvale province", "Promote burg 5 to province 3's capital" |
| `set_state_color`       | Change a state's color by id or case-insensitive name. Accepts `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()/hsl()/hsla()`, or named colors. Updates the state's SVG fill, gap stroke, and border halo. Rejects the Neutrals placeholder. | "Make Altaria red", "Set state 3 color to #336699" |
| `save_map`              | Save the current map. Default `target: "download"` triggers the browser to download a `.map` file (same as Ctrl+S). `target: "storage"` persists to IndexedDB so the map can be reloaded later. | "Save the map", "Save a copy to local storage" |
| `load_map`              | Load a saved map. `source: "storage"` reloads the last map from IndexedDB (counterpart of save_map storage). `source: "url"` downloads a `.map` file over http(s). Waits up to 60s for map:generated before returning. | "Load the last saved map", "Load the map at https://example.com/fantasy.map" |
| `export_map`            | Export the current map to a downloadable file: `svg`, `png`, `jpeg`, or a GeoJSON slice (`geojson-cells` / `-routes` / `-rivers` / `-markers` / `-zones`). Common aliases accepted (`jpg`, `cells`, `markers`, …). | "Export the map as SVG", "Save it as a PNG", "Export the rivers as GeoJSON" |
| `set_culture_color`     | Change a culture's color by id or case-insensitive name. Same color formats as `set_state_color`. Updates the culture's SVG fill and center marker. Rejects the Wildlands placeholder. | "Make the Highlanders #336699", "Color culture 2 seagreen" |
| `set_culture_type`      | Change a culture's type (Generic / River / Lake / Naval / Nomadic / Hunting / Highland — same enum as burg types). Writes `culture.type` and calls `recalculateCultures()` so cells redistribute per type-specific expansion rules. Matches by id (>0) or name; Wildlands (0) rejected. | "Make the Highlanders a Highland culture", "Turn the Coastalfolk into a Naval culture" |
| `set_culture_base`      | Set a culture's name-base (language family — same as the Cultures Editor name-base dropdown). `base` accepts a numeric index into `window.nameBases` or a case-insensitive base name ("German", "Norse", "Elven", …). Writes `culture.base`. Matches culture by id (>0) or name; Wildlands (0) rejected. | "Make the Highlanders use Norse names", "Set culture 3's base to 2" |
| `set_culture_shield`    | Change a culture's emblem shield shape (the shield dropdown in the Cultures Editor). Writes `culture.shield` and cascades to every non-custom state/province/burg coat-of-arms that belongs to this culture (provinces match via `pack.cells.culture[province.center]`). Response reports the cascade count. Shapes: ~40 keys from `src/modules/emblem/shields.ts` (basic/regional/historical/specific/banner/simple/fantasy/middleEarth — "heater", "swiss", "wedged", "noldor", "round", …). Data-layer only — existing editor panels aren't re-rendered. | "Give the Highlanders a wedged shield", "Set culture 3's shield to swiss" |
| `set_religion_color`    | Change a religion's color by id or case-insensitive name. Same color formats as `set_state_color`. Updates the religion's SVG fill and center marker. Rejects the "No religion" placeholder. | "Make the Old Faith goldenrod", "Color religion 2 #336699" |
| `set_religion_type`     | Change a religion's type (Folk / Organized / Cult / Heresy — same enum as the Religions Editor dropdown). Writes `religion.type`. Matches by id (>0) or case-insensitive name; "No religion" (0) rejected. | "Turn the Old Faith into a Cult", "Promote the Brightpath to an Organized religion" |
| `set_religion_form`     | Set a religion's form — the free-form narrative descriptor from the Religions Editor (e.g. Druidism, Shamanism, Church of Light, Heterodoxy). Writes `religion.form`. Matches by id (>0) or case-insensitive name; "No religion" (0) rejected. | "Make the Old Faith Animist", "Set the Brightpath form to Orthodoxy" |
| `set_religion_deity`    | Name or clear a religion's supreme deity (free-form — same as the Religions Editor deity input). `""` clears (Folk religions may have no deity); whitespace-only is rejected. Matches by id (>0) or case-insensitive name; "No religion" (0) rejected. | "Name the Old Faith's deity Azoth the Flame-Bearer", "Clear the deity on the Brightpath" |
| `set_religion_expansion`| Set a religion's expansion extent (the Religions Editor Extent dropdown) — one of `global`, `state`, or `culture`. Writes `religion.expansion` and best-effort calls `recalculateReligions()` so cells redistribute. Idempotent. Rejects "No religion" (0) and removed entries. | "Switch the Brightpath to state-bound", "Make the Old Faith spread globally" |
| `set_province_color`    | Change a province's color by id or case-insensitive name/fullName. Same color formats as `set_state_color`. Updates the province's SVG fill and gap stroke. Rejects the placeholder. | "Color Rookwood #336699", "Make province 3 goldenrod" |
| `set_burg_population`   | Set a burg's displayed population (e.g. 50000). Input is in the same user-facing scale the Burg Editor shows; internally divided by `populationRate` and `urbanization` before storage, matching the editor. Allows 0 for abandoned settlements. | "Set Stormport's population to 50000", "Give burg 5 a population of 12500" |
| `set_burg_culture`      | Reassign a burg to a different culture. Both fields accept id or case-insensitive name; Wildlands (culture 0) is allowed. | "Change Stormport's culture to Coastalfolk", "Assign burg 5 to culture 3" |
| `set_state_culture`     | Change a state's dominant culture (same as the States Editor culture dropdown). Writes `state.culture`. Accepts culture id (including 0 = Wildlands) or case-insensitive name. Rejects Neutrals (state 0). | "Make Rookhold's dominant culture the Highlanders", "Switch state 3 to Wildlands" |
| `set_burg_type`         | Change a burg's type category. One of: Generic, River, Lake, Naval, Nomadic, Hunting, Highland. Affects naming style and icon choice. | "Make Stormport a Naval burg", "Change burg 5's type to Highland" |
| `set_burg_feature`      | Toggle one of a burg's structural features — the feature-row buttons in the Burg Editor. Supported: `citadel`, `walls`, `plaza`, `temple`, `shanty` (case-insensitive; common synonyms like `castle` / `wall` / `square` / `shrine` accepted). Writes `burg.<feature> = enabled ? 1 : 0`. Idempotent. `port` and `capital` are NOT supported by this tool (they need haven lookups / state reassignment — use their dedicated tools). | "Give Stormport walls", "Remove the temple from burg 5", "Add a citadel to Rookhold" |
| `set_burg_port`         | Toggle a burg's port status — the Port button in the Burg Editor. Enabling looks up the burg's coastal haven and writes `burg.port` to the sea feature id (or `-1` if no haven — same warn-but-proceed behavior as the UI). Also inserts the anchor glyph into `#anchors #<burg.group>`. Disabling writes `burg.port = 0` and removes the glyph. Idempotent. | "Make Stormport a port", "Disable the port on burg 5" |
| `set_burg_group`        | Reassign a burg to a different group (capital / city / fort / monastery / caravanserai / etc. — the Burg Editor's Group dropdown). Delegates to `Burgs.changeGroup` which writes `burg.group` and reparents the `#burg{i}` / `#burgLabel{i}` SVG elements under the new group container. Validates against the live `Burgs.groups` list (case-insensitive → canonicalized). Idempotent. | "Move Rookhold into the fort group", "Change burg 7's group to monastery" |
| `set_state_capital`     | Promote a burg to be a state's capital (same as ticking the Capital checkbox in the Burg Editor). Burg must belong to the target state. Updates the state's capital+center and flips capital flags on old/new burgs; asks Burgs.changeGroup to refresh icon groups. Idempotent. | "Make Tidegarde the capital of Altaria", "Set state 2's capital to burg 12" |
| `set_entity_expansionism` | Tune expansionism on a `state` / `culture` / `religion` (how aggressively it expands during regeneration). Finite > 0, ≤ 100; typical 0.5–5. Passive — read by `regenerate_map`. | "Double Altaria's expansionism", "Make the Highlanders culture more expansionist" |
| `set_entity_lock`       | Lock or unlock a `state` / `burg` / `culture` / `religion` / `province` to preserve it across regenerations. Ref accepts id or case-insensitive name; type accepts plurals/synonyms. Idempotent. | "Lock Altaria", "Unlock the Stormport burg", "Lock the Highlanders culture" |
| `set_diplomacy`         | Set the diplomatic relation between two states — same as the Diplomacy Editor. Writes `pack.states[a].diplomacy[b]` and its symmetric counterpart (Vassal ↔ Suzerain, otherwise mirrored). Relations: Ally / Friendly / Neutral / Suspicion / Enemy / Unknown / Rival / Vassal / Suzerain. Aliases: "at war" → Enemy, "allied" → Ally, "friend" → Friendly. Neutrals (state 0) is excluded as either party. | "Rookhold and Ashholm are now allies", "Declare war on state 3", "Make state 1 a vassal of state 2" |
| `list_diplomacy`        | List diplomatic relationships between states — the same matrix the Diplomacy Editor shows, flattened to unique pairs with the relation from `state_a`'s view. Paginated. Optional filters: `state` (keeps only pairs touching it), `relation` (alias-aware), `exclude_neutral` (default true — drops Neutral / Unknown / x pairs so only meaningful relations show). | "Who is Rookhold allied with?", "List all ongoing wars", "Which states are vassals?" |
| `set_state_form`        | Change a state's government form (Kingdom, Empire, Republic, Theocracy, …). Sets both `formName` (specific) and `form` (category: Monarchy/Republic/Union/Theocracy/Anarchy). Redraws the state label. Supported formNames match the States Editor dropdown. | "Make Altaria an Empire", "Turn state 3 into a Theocracy" |
| `set_state_type`        | Change a state's type (Generic / River / Lake / Naval / Nomadic / Hunting / Highland — same 7-value enum as burgs and cultures). Writes `state.type` and calls `recalculateStates()` to redistribute cells. Matches by id (>0) or case-insensitive name; Neutrals (0) rejected. | "Make Rookhold a Naval state", "Turn state 3 into a Highland state" |
| `set_world_rates`       | Adjust world-wide population scaling sliders (`population_rate`, `urbanization`, `urban_density`). Updates the Units Editor inputs and dispatches `change` so the existing handlers update the globals. Provide any subset. | "Double the population rate", "Set urbanization to 1.3" |
| `set_heightmap_template` | Pick the heightmap template for the next regeneration (14 built-in: Volcano, High Island, Low Island, Continents, Archipelago, Atoll, Mediterranean, Peninsula, Pangea, Isthmus, Shattered, Taklamakan, Old World, Fractious). Accepts canonical keys or display names. Passive — run `regenerate_map` to apply. | "Switch terrain to Old World", "Use the Archipelago template then regenerate" |
| `set_year_and_era`      | Change the world's in-fiction year and/or era. At least one is required. Updates `window.options.year`, `era`, `eraShort` (auto-derived uppercase initials) and syncs the Options panel inputs. | "Set the year to 1247", "Change the era to Second Age", "Set the date to 1247 Bright Era" |
| `set_measurement_units` | Change Options-panel display units in one call: `distance` (mi / km / lg / vr / nmi / nlg, prose aliases accepted), `area` (free-form label; `square` appends ²), `height` (ft / m / f), `temperature` (°C / °F / K / °R / °De / °N / °Ré). Updates the select / input element and localStorage, matching the UI's own persistence. | "Switch to metric — km, meters, celsius", "Use fahrenheit temperatures", "Area unit is hectares" |
| `set_climate`           | Tune the World Configurator's climate knobs (passive — applied on next `regenerate_map`): `temperature_equator`, `temperature_north_pole`, `temperature_south_pole` (°C, [-50, 50]) and `precipitation` (%, [0, 500]). Writes `window.options.*`, both Input + Output DOM elements, and localStorage — same side-effects as the UI sliders. | "Make the world colder — poles at -40", "Bump precipitation to 180", "Equator 32°C, north pole -30, south pole -20" |
| `set_geography`         | Tune the World Configurator's geographic framing (passive — applied on next `regenerate_map`): `map_size` (%, [1, 100]), `latitude` (0 = north pole, 50 = equator, 100 = south pole), `longitude` (0 = west, 50 = prime meridian, 100 = east). Writes both paired Input + Output elements and localStorage — same side-effects as dragging the sliders. | "Shift the map south — latitude 80", "Make this a tiny slice of the world, map_size: 5", "Center on prime meridian — longitude 50" |
| `set_height_exponent`   | Adjust altitude-change sharpness (Options panel Exponent slider). Number in [1.5, 2.2]; default 2. Lower = flatter, higher = more dramatic peaks. Affects temperature and biomes. Passive — applied on next `regenerate_map`. | "Flatten the terrain — 1.6", "Make the mountains harsher — 2.1" |
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
