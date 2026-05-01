# Tasks 368 — Per-row "Edit notes" buttons

1. **Capture baseline** — `npx tsc --noEmit` (clean), `npm test` (7327
   tests passing). Skip lint (Biome doesn't scan `public/**`).

2. **Edit `public/modules/dynamic/editors/states-editor.js`**:
   - In `statesEditorAddLines` neutral row template (≈ line 209,
     before `</div>`), add: `<span data-tip="Edit notes"
     class="icon-edit hide"></span>`.
   - In the regular row template (≈ line 263, before
     `<span ... icon-trash-empty hide>`), add the same span.
   - In the `$body.on("click")` delegator (≈ line 122), insert before
     the `icon-trash-empty` branch:
     `else if (classList.contains("icon-edit")) editStateNotes(stateId);`.
   - Add the helper near the other `editState*` functions:
     ```js
     function editStateNotes(stateId) {
       const s = pack.states[stateId];
       if (!s) return;
       editNotes("state" + stateId, s.fullName || s.name);
     }
     ```

3. **Edit `public/modules/ui/provinces-editor.js`**:
   - In `provincesEditorAddLines` row template (≈ line 183, before
     the `icon-trash-empty` span), add: `<span data-tip="Edit notes"
     class="icon-edit hide"></span>`.
   - In the `body.on("click")` delegator (≈ line 57), insert before
     the `icon-trash-empty` branch:
     `else if (cl.contains("icon-edit")) editProvinceNotes(p);`.
   - Add the helper near the other `editProvince*` functions:
     ```js
     function editProvinceNotes(p) {
       const province = pack.provinces[p];
       if (!province) return;
       editNotes("province" + p, province.fullName || province.name);
     }
     ```

4. **Edit `public/modules/dynamic/editors/cultures-editor.js`**:
   - In the neutral culture row template (≈ line 172, before
     `</div>`), add: `<span data-tip="Edit notes"
     class="icon-edit hide"></span>`.
   - In the regular culture row template (≈ line 217, before the
     `icon-trash-empty` span), add the same span.
   - After the existing `icon-lock-open` listener attachment (≈ line
     247), add:
     `$body.querySelectorAll("div > span.icon-edit").forEach($el => $el.on("click", cultureEditNotes));`.
   - Add the helper:
     ```js
     function cultureEditNotes() {
       const cultureId = +this.parentNode.dataset.id;
       const c = pack.cultures[cultureId];
       if (!c) return;
       editNotes("culture" + cultureId, c.name);
     }
     ```

5. **Edit `public/modules/dynamic/editors/religions-editor.js`**:
   - In the neutral religion row template (≈ line 178, before
     `</div>`), add: `<span data-tip="Edit notes"
     class="icon-edit hide"></span>`.
   - In the regular religion row template (≈ line 215, before the
     `icon-trash-empty` span), add the same span.
   - After the existing `icon-lock-open` listener attachment (≈ line
     248), add:
     `$body.querySelectorAll("div > span.icon-edit").forEach($el => $el.on("click", religionEditNotes));`.
   - Add the helper:
     ```js
     function religionEditNotes() {
       const religionId = +this.parentNode.dataset.id;
       const r = pack.religions[religionId];
       if (!r) return;
       editNotes("religion" + religionId, r.name);
     }
     ```

6. **Write `tests/e2e/notes-buttons.spec.ts`** following the
   `tests/e2e/states.spec.ts` pattern. One `test.describe`,
   `beforeEach` to load `/?seed=test-notes&width=1280&height=720`,
   one test per editor:
   - Open editor via `#optionsTrigger` → `#toolsTab` → editor button.
   - Find first row with `data-id != "0"`.
   - Click `.icon-edit` on that row.
   - Assert `#notesEditor` becomes visible and `notes` global has a
     matching entry whose id matches the expected
     `<entityType><i>` and whose `name` is non-empty.
   - Close dialogs.

7. **Verify**:
   - `npx tsc --noEmit` — must remain clean.
   - `npm test` — must remain at 7327 passing.
   - Try `npm run test:e2e -- notes-buttons` (or static-review the
     spec if Playwright deps are missing in the sandbox).

8. **Self-review** — re-read plan + tasks + diff. Confirm:
   - Each of the 4 row templates gets exactly one new icon span.
   - Each handler reads the correct id (`state{i}`, `province{i}`,
     `culture{i}`, `religion{i}`).
   - Tooltip is `"Edit notes"` everywhere.
   - No HTML / TS / src changes — only the four `.js` files plus the
     new spec.

9. **Commit** on `plan-368-notes-buttons` with the conventional
   message specified in the plan brief. Do NOT push.
