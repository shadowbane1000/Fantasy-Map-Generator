import {test, expect} from "@playwright/test";

/**
 * Plan 372 — World Editor (Layer 3 of the world-building feature).
 * Verifies that:
 *  - the editor opens with all six predefined topics shown,
 *  - the `+` button creates a new user-defined world note,
 *  - a user-defined topic can be deleted via the trash icon,
 *  - the pencil icon opens the standard notes editor for any row,
 *  - editing world:premise prompts the user to clear the AI chat
 *    when chat history is non-empty.
 */
test.describe("World Editor", () => {
  test.beforeEach(async ({context, page}) => {
    await context.clearCookies();

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto("/?seed=test-world&width=1280&height=720");

    await page.waitForFunction(() => (window as any).mapId !== undefined, {timeout: 60000});
    await page.waitForTimeout(500);
  });

  async function openToolsMenu(page: import("@playwright/test").Page) {
    const optionsVisible = await page.locator("#options").isVisible();
    if (!optionsVisible) {
      await page.click("#optionsTrigger");
      await page.waitForTimeout(200);
    }
    await page.click("#toolsTab");
    await page.waitForTimeout(200);
  }

  async function openWorldEditor(page: import("@playwright/test").Page) {
    await openToolsMenu(page);
    await page.click("#editWorldButton");
    await page.waitForSelector("#worldEditor", {state: "visible", timeout: 5000});
    await page.waitForTimeout(200);
  }

  async function closeJqueryDialog(page: import("@playwright/test").Page, dialogId: string) {
    const closeButton = page.locator(`.ui-dialog:has(#${dialogId}) .ui-dialog-titlebar-close`);
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await page.waitForTimeout(200);
    }
  }

  test("shows all six predefined topics on first open", async ({page}) => {
    await openWorldEditor(page);

    const topics = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("#worldEditorBody > div[data-topic]")) as HTMLElement[];
      return rows.map(row => row.dataset.topic);
    });

    expect(topics.slice(0, 6)).toEqual(["premise", "cosmology", "pantheon", "magic", "calendar", "history"]);

    await closeJqueryDialog(page, "worldEditor");
  });

  test("'+' button creates a user-defined topic", async ({page}) => {
    await openWorldEditor(page);

    // Stub the prompt to inject a topic id, then click the add button.
    await page.evaluate(() => {
      (window as any).prompt = () => "factions";
    });
    await page.click("#worldAdd");
    await page.waitForTimeout(300);

    // The new note exists.
    const noteRecord = await page.evaluate(() => {
      const note = (window as any).notes.find((n: any) => n.id === "world:factions");
      return note ? {id: note.id, name: note.name} : null;
    });
    expect(noteRecord).not.toBeNull();
    expect(noteRecord!.id).toBe("world:factions");
    expect(noteRecord!.name).toBe("World — Factions");

    // Close the notes editor that auto-opened on add.
    await closeJqueryDialog(page, "notesEditor");

    // Re-open the world editor and ensure the row is present.
    await openWorldEditor(page);
    const hasRow = await page.evaluate(() => {
      return Boolean(document.querySelector('#worldEditorBody > div[data-topic="factions"]'));
    });
    expect(hasRow).toBe(true);

    await closeJqueryDialog(page, "worldEditor");
  });

  test("trash icon deletes a user-defined topic after confirmation", async ({page}) => {
    await openWorldEditor(page);

    // Seed a topic directly in the notes array, then refresh.
    await page.evaluate(() => {
      const notes = (window as any).notes;
      notes.push({id: "world:doomed", name: "World — Doomed", legend: "to be removed"});
    });
    await page.click("#worldEditorRefresh");
    await page.waitForTimeout(200);

    // Click the trash icon on the doomed row.
    await page.click('#worldEditorBody > div[data-topic="doomed"] span.icon-trash-empty');
    await page.waitForSelector("#alert", {state: "visible", timeout: 3000});

    // Click "Remove" in the confirmation dialog.
    await page.click('.ui-dialog:has(#alert) button:has-text("Remove")');
    await page.waitForTimeout(200);

    const stillThere = await page.evaluate(() => {
      return Boolean((window as any).notes.find((n: any) => n.id === "world:doomed"));
    });
    expect(stillThere).toBe(false);

    const rowGone = await page.evaluate(() => {
      return !document.querySelector('#worldEditorBody > div[data-topic="doomed"]');
    });
    expect(rowGone).toBe(true);

    await closeJqueryDialog(page, "worldEditor");
  });

  test("pencil icon opens the standard notes editor for a predefined topic", async ({page}) => {
    await openWorldEditor(page);

    await page.click('#worldEditorBody > div[data-topic="cosmology"] span.icon-edit');
    await page.waitForSelector("#notesEditor", {state: "visible", timeout: 3000});

    const noteRecord = await page.evaluate(() => {
      const note = (window as any).notes.find((n: any) => n.id === "world:cosmology");
      return note ? {id: note.id, name: note.name} : null;
    });
    expect(noteRecord).not.toBeNull();
    expect(noteRecord!.id).toBe("world:cosmology");
    expect(noteRecord!.name).toBe("World — Cosmology");

    await closeJqueryDialog(page, "notesEditor");
    await closeJqueryDialog(page, "worldEditor");
  });

  test("editing world:premise with non-empty chat prompts to reset chat", async ({page}) => {
    await openWorldEditor(page);

    // Install a stub controller with non-empty history and a counted
    // `reset` method.
    await page.evaluate(() => {
      const stub = {
        _reset: 0,
        getHistory: () => [{role: "user", content: "hi"}],
        reset() {
          this._reset += 1;
        }
      };
      (globalThis as any).__aiChatController = stub;
      (window as any).__stubController = stub;
    });

    // Open the premise note via the pencil icon.
    await page.click('#worldEditorBody > div[data-topic="premise"] span.icon-edit');
    await page.waitForSelector("#notesEditor", {state: "visible", timeout: 3000});

    // Mutate the premise note's legend in-place to simulate a real edit.
    await page.evaluate(() => {
      const note = (window as any).notes.find((n: any) => n.id === "world:premise");
      if (note) note.legend = "<p>The world is a flat disc on a turtle.</p>";
    });

    // Close the notes editor — this should fire the dialogclose hook
    // and surface the confirmation dialog.
    await closeJqueryDialog(page, "notesEditor");
    await page.waitForSelector("#alert", {state: "visible", timeout: 3000});

    // Confirm reset.
    await page.click('.ui-dialog:has(#alert) button:has-text("Reset chat")');
    await page.waitForTimeout(200);

    const resetCount = await page.evaluate(() => (window as any).__stubController._reset);
    expect(resetCount).toBe(1);

    await closeJqueryDialog(page, "worldEditor");
  });

  test("editing world:premise with empty chat does not prompt", async ({page}) => {
    await openWorldEditor(page);

    // Install a stub controller with empty history and a `reset` spy.
    await page.evaluate(() => {
      const stub = {
        _reset: 0,
        getHistory: () => [],
        reset() {
          this._reset += 1;
        }
      };
      (globalThis as any).__aiChatController = stub;
      (window as any).__stubController = stub;
    });

    await page.click('#worldEditorBody > div[data-topic="premise"] span.icon-edit');
    await page.waitForSelector("#notesEditor", {state: "visible", timeout: 3000});

    await page.evaluate(() => {
      const note = (window as any).notes.find((n: any) => n.id === "world:premise");
      if (note) note.legend = "<p>Different premise.</p>";
    });

    await closeJqueryDialog(page, "notesEditor");
    await page.waitForTimeout(300);

    // No confirmation dialog should have opened.
    const alertVisible = await page.locator("#alert").isVisible();
    expect(alertVisible).toBe(false);

    const resetCount = await page.evaluate(() => (window as any).__stubController._reset);
    expect(resetCount).toBe(0);

    await closeJqueryDialog(page, "worldEditor");
  });
});
