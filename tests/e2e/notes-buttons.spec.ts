import {test, expect} from "@playwright/test";

/**
 * Plan 368 — verify the per-row "Edit notes" buttons added to the
 * states / provinces / cultures / religions list editors. Each row
 * gets a `<span data-tip="Edit notes" class="icon-edit ..."></span>`
 * that calls `editNotes("<entityType><i>", displayName)`. The notes
 * editor dialog should open and a corresponding entry should be
 * present in `window.notes`.
 */
test.describe("List-editor notes buttons", () => {
  test.beforeEach(async ({context, page}) => {
    await context.clearCookies();

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto("/?seed=test-notes&width=1280&height=720");

    await page.waitForFunction(() => (window as any).mapId !== undefined, {timeout: 60000});
    await page.waitForTimeout(500);
  });

  /**
   * Open the Tools menu (Options → Tools tab). Idempotent — safe to
   * call between editor openings.
   */
  async function openToolsMenu(page: import("@playwright/test").Page) {
    const optionsVisible = await page.locator("#options").isVisible();
    if (!optionsVisible) {
      await page.click("#optionsTrigger");
      await page.waitForTimeout(200);
    }
    await page.click("#toolsTab");
    await page.waitForTimeout(200);
  }

  async function closeJqueryDialog(page: import("@playwright/test").Page, dialogId: string) {
    const closeButton = page.locator(`.ui-dialog:has(#${dialogId}) .ui-dialog-titlebar-close`);
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await page.waitForTimeout(200);
    }
  }

  test("states editor exposes a working Edit notes button per row", async ({page}) => {
    await openToolsMenu(page);
    await page.click("#editStatesButton");
    await page.waitForSelector("#statesEditor", {state: "visible", timeout: 5000});
    await page.waitForTimeout(300);

    // Pick the first non-neutral state row
    const stateInfo = await page.evaluate(() => {
      const row = document.querySelector('#statesBodySection > div[data-id]:not([data-id="0"])') as HTMLElement | null;
      if (!row) return null;
      return {id: parseInt(row.dataset.id!, 10), name: row.dataset.name || ""};
    });
    expect(stateInfo).not.toBeNull();
    expect(stateInfo!.id).toBeGreaterThan(0);

    await page.click(`#statesBodySection > div[data-id="${stateInfo!.id}"] .icon-edit`);
    await page.waitForSelector("#notesEditor", {state: "visible", timeout: 3000});

    // Verify the notes global has an entry for this state
    const noteRecord = await page.evaluate((id: number) => {
      const note = (window as any).notes.find((n: any) => n.id === `state${id}`);
      return note ? {id: note.id, name: note.name} : null;
    }, stateInfo!.id);
    expect(noteRecord).not.toBeNull();
    expect(noteRecord!.id).toBe(`state${stateInfo!.id}`);
    expect(noteRecord!.name).toBeTruthy();

    await closeJqueryDialog(page, "notesEditor");
    await closeJqueryDialog(page, "statesEditor");
  });

  test("provinces editor exposes a working Edit notes button per row", async ({page}) => {
    await openToolsMenu(page);
    await page.click("#editProvincesButton");
    await page.waitForSelector("#provincesEditor", {state: "visible", timeout: 5000});
    await page.waitForTimeout(300);

    // Provinces editor body is `#provincesBodySection`
    const provinceInfo = await page.evaluate(() => {
      const row = document.querySelector("#provincesBodySection > div[data-id]") as HTMLElement | null;
      if (!row) return null;
      return {id: parseInt(row.dataset.id!, 10), name: row.dataset.name || ""};
    });
    expect(provinceInfo).not.toBeNull();
    expect(provinceInfo!.id).toBeGreaterThan(0);

    await page.click(`#provincesBodySection > div[data-id="${provinceInfo!.id}"] .icon-edit`);
    await page.waitForSelector("#notesEditor", {state: "visible", timeout: 3000});

    const noteRecord = await page.evaluate((id: number) => {
      const note = (window as any).notes.find((n: any) => n.id === `province${id}`);
      return note ? {id: note.id, name: note.name} : null;
    }, provinceInfo!.id);
    expect(noteRecord).not.toBeNull();
    expect(noteRecord!.id).toBe(`province${provinceInfo!.id}`);
    expect(noteRecord!.name).toBeTruthy();

    await closeJqueryDialog(page, "notesEditor");
    await closeJqueryDialog(page, "provincesEditor");
  });

  test("cultures editor exposes a working Edit notes button per row", async ({page}) => {
    await openToolsMenu(page);
    await page.click("#editCulturesButton");
    await page.waitForSelector("#culturesEditor", {state: "visible", timeout: 5000});
    await page.waitForTimeout(300);

    const cultureInfo = await page.evaluate(() => {
      const row = document.querySelector('#culturesBody > div[data-id]:not([data-id="0"])') as HTMLElement | null;
      if (!row) return null;
      return {id: parseInt(row.dataset.id!, 10), name: row.dataset.name || ""};
    });
    expect(cultureInfo).not.toBeNull();
    expect(cultureInfo!.id).toBeGreaterThan(0);

    await page.click(`#culturesBody > div[data-id="${cultureInfo!.id}"] .icon-edit`);
    await page.waitForSelector("#notesEditor", {state: "visible", timeout: 3000});

    const noteRecord = await page.evaluate((id: number) => {
      const note = (window as any).notes.find((n: any) => n.id === `culture${id}`);
      return note ? {id: note.id, name: note.name} : null;
    }, cultureInfo!.id);
    expect(noteRecord).not.toBeNull();
    expect(noteRecord!.id).toBe(`culture${cultureInfo!.id}`);
    expect(noteRecord!.name).toBeTruthy();

    await closeJqueryDialog(page, "notesEditor");
    await closeJqueryDialog(page, "culturesEditor");
  });

  test("religions editor exposes a working Edit notes button per row", async ({page}) => {
    await openToolsMenu(page);
    await page.click("#editReligions");
    await page.waitForSelector("#religionsEditor", {state: "visible", timeout: 5000});
    await page.waitForTimeout(300);

    const religionInfo = await page.evaluate(() => {
      const row = document.querySelector('#religionsBody > div[data-id]:not([data-id="0"])') as HTMLElement | null;
      if (!row) return null;
      return {id: parseInt(row.dataset.id!, 10), name: row.dataset.name || ""};
    });
    expect(religionInfo).not.toBeNull();
    expect(religionInfo!.id).toBeGreaterThan(0);

    await page.click(`#religionsBody > div[data-id="${religionInfo!.id}"] .icon-edit`);
    await page.waitForSelector("#notesEditor", {state: "visible", timeout: 3000});

    const noteRecord = await page.evaluate((id: number) => {
      const note = (window as any).notes.find((n: any) => n.id === `religion${id}`);
      return note ? {id: note.id, name: note.name} : null;
    }, religionInfo!.id);
    expect(noteRecord).not.toBeNull();
    expect(noteRecord!.id).toBe(`religion${religionInfo!.id}`);
    expect(noteRecord!.name).toBeTruthy();

    await closeJqueryDialog(page, "notesEditor");
    await closeJqueryDialog(page, "religionsEditor");
  });
});
