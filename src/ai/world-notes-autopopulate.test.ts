import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

// Resolve path to the classic-JS file under public/modules so the test
// runs the production source verbatim (no duplicated logic).
const here = dirname(fileURLToPath(import.meta.url));
const initFile = resolve(
  here,
  "..",
  "..",
  "public",
  "modules",
  "world-notes-init.js",
);
const source = readFileSync(initFile, "utf8");

interface WorldNote {
  id: string;
  name: string;
  legend: string;
}

interface AutoPopulateApi {
  PREDEFINED: string[];
  buildDefaults: () => WorldNote[];
  decideAutoPopulate: (notes: unknown) => WorldNote[];
  ensureWorldNotes: () => void;
}

interface SandboxWindow {
  notes?: WorldNote[];
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  dispatchEvent: (event: { type: string }) => void;
  __worldNotesAutoPopulate?: AutoPopulateApi;
}

function makeSandbox(): { window: SandboxWindow } {
  const listeners: Record<string, Array<(event: unknown) => void>> = {};
  const window: SandboxWindow = {
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    dispatchEvent(event) {
      const fns = listeners[event.type] || [];
      for (const fn of fns) fn(event);
    },
  };
  return { window };
}

function loadInitInto(sandboxWindow: SandboxWindow): AutoPopulateApi {
  // The classic-JS file references `window` as a global, so we expose
  // the sandbox window as `window` in the vm context and also as the
  // top-level `globalThis`.
  const ctx: Record<string, unknown> = { window: sandboxWindow };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  if (!sandboxWindow.__worldNotesAutoPopulate) {
    throw new Error(
      "world-notes-init.js did not expose __worldNotesAutoPopulate",
    );
  }
  return sandboxWindow.__worldNotesAutoPopulate;
}

describe("world-notes-init: pure helpers", () => {
  let api: AutoPopulateApi;

  beforeEach(() => {
    const { window } = makeSandbox();
    api = loadInitInto(window);
  });

  it("PREDEFINED has the 6 topics in the user-stated order", () => {
    expect(api.PREDEFINED).toEqual([
      "premise",
      "cosmology",
      "pantheon",
      "magic",
      "calendar",
      "history",
    ]);
  });

  it("buildDefaults returns 6 notes with the exact ids and names", () => {
    expect(api.buildDefaults()).toEqual([
      { id: "world:premise", name: "World — Premise", legend: "" },
      { id: "world:cosmology", name: "World — Cosmology", legend: "" },
      { id: "world:pantheon", name: "World — Pantheon", legend: "" },
      { id: "world:magic", name: "World — Magic", legend: "" },
      { id: "world:calendar", name: "World — Calendar", legend: "" },
      { id: "world:history", name: "World — History", legend: "" },
    ]);
  });

  it("decideAutoPopulate([]) returns the 6 defaults", () => {
    expect(api.decideAutoPopulate([])).toHaveLength(6);
    expect(api.decideAutoPopulate([])[0].id).toBe("world:premise");
  });

  it("decideAutoPopulate(undefined) returns the 6 defaults (early-fire fallback)", () => {
    expect(api.decideAutoPopulate(undefined)).toHaveLength(6);
  });

  it("decideAutoPopulate ignores non-world:* ids and still returns the 6 defaults", () => {
    const notes = [
      { id: "burg7", legend: "X" },
      { id: "regiment3", legend: "Y" },
      { id: "marker12", legend: "Z" },
    ];
    expect(api.decideAutoPopulate(notes)).toHaveLength(6);
  });

  it("decideAutoPopulate returns [] when ANY world:* note exists (preserves user deletion intent)", () => {
    expect(
      api.decideAutoPopulate([{ id: "world:premise", name: "X", legend: "" }]),
    ).toEqual([]);
    // Even if only one of the 6 remains (user deleted the other 5):
    expect(
      api.decideAutoPopulate([
        { id: "world:history", name: "H", legend: "user wrote stuff" },
      ]),
    ).toEqual([]);
  });

  it("decideAutoPopulate(buildDefaults()) returns [] (idempotent on the canonical defaults)", () => {
    expect(api.decideAutoPopulate(api.buildDefaults())).toEqual([]);
  });

  it("decideAutoPopulate ignores malformed entries (no id / non-string id)", () => {
    const notes: unknown[] = [null, undefined, {}, { id: 42 }, { id: "burg1" }];
    // None of these have a string id starting with "world:", so the 6 defaults are returned.
    expect(api.decideAutoPopulate(notes)).toHaveLength(6);
  });
});

describe("world-notes-init: end-to-end map:generated wiring", () => {
  it("populates 6 notes on first map:generated and does not duplicate on subsequent dispatches", () => {
    const { window } = makeSandbox();
    loadInitInto(window);

    // Initial state: no notes at all.
    expect(window.notes).toBeUndefined();

    // First dispatch — should populate 6.
    window.dispatchEvent({ type: "map:generated" });
    expect(window.notes).toHaveLength(6);
    expect((window.notes as WorldNote[])[0].id).toBe("world:premise");

    // Second dispatch (regenerate map) — should be a no-op.
    window.dispatchEvent({ type: "map:generated" });
    expect(window.notes).toHaveLength(6);

    // Third dispatch — still no-op.
    window.dispatchEvent({ type: "map:generated" });
    expect(window.notes).toHaveLength(6);
  });

  it("preserves a user-deleted state: only 1 of 6 present and a regenerate does not auto-recreate the missing 5", () => {
    const { window } = makeSandbox();
    loadInitInto(window);

    // User has deleted 5 of 6, leaving only "world:history" with hand-written content.
    window.notes = [
      {
        id: "world:history",
        name: "World — History",
        legend: "Once upon a time...",
      },
    ];

    window.dispatchEvent({ type: "map:generated" });

    // Auto-populate must NOT have run — the 5 missing should still be missing.
    expect(window.notes).toHaveLength(1);
    expect(window.notes![0].id).toBe("world:history");
    expect(window.notes![0].legend).toBe("Once upon a time...");
  });

  it("populates from non-world:* notes only (e.g. burg/marker notes don't block)", () => {
    const { window } = makeSandbox();
    loadInitInto(window);

    // User has some entity-attached notes from a loaded map but no world:* notes.
    window.notes = [
      { id: "burg7", name: "Some Town", legend: "details" },
      { id: "marker12", name: "X", legend: "details" },
    ];

    window.dispatchEvent({ type: "map:generated" });

    // 6 world notes added; the 2 existing entity notes are preserved.
    expect(window.notes).toHaveLength(8);
    const ids = (window.notes as WorldNote[]).map((n) => n.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "burg7",
        "marker12",
        "world:premise",
        "world:cosmology",
        "world:pantheon",
        "world:magic",
        "world:calendar",
        "world:history",
      ]),
    );
  });
});
