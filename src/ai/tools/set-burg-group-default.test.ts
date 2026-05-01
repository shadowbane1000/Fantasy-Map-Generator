import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  applyDefault,
  createSetBurgGroupDefaultTool,
  findPreviousDefault,
  type SetBurgGroupDefaultGroup,
  type SetBurgGroupDefaultRuntime,
  setBurgGroupDefaultTool,
} from "./set-burg-group-default";

function parse(content: string): Record<string, unknown> {
  return JSON.parse(content) as Record<string, unknown>;
}

function makeRuntime(groups: SetBurgGroupDefaultGroup[] | undefined): {
  runtime: SetBurgGroupDefaultRuntime;
  persist: ReturnType<typeof vi.fn>;
} {
  const persist = vi.fn<(groups: SetBurgGroupDefaultGroup[]) => void>();
  return {
    runtime: {
      getGroups: () => groups,
      persist,
    },
    persist,
  };
}

describe("set_burg_group_default — happy path", () => {
  it("flips a different group default; clears previous default; persists", async () => {
    const groups: SetBurgGroupDefaultGroup[] = [
      { name: "A", isDefault: false, active: true },
      { name: "B", isDefault: false, active: true },
      { name: "C", isDefault: true, active: true },
    ];
    const persist = vi.fn();
    const tool = createSetBurgGroupDefaultTool({
      getGroups: () => groups,
      persist,
    });

    const result = await tool.execute({ name: "A" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body).toEqual({
      ok: true,
      name: "A",
      previous_default: "C",
      changed: true,
      persisted: true,
    });

    expect(groups[0].isDefault).toBe(true);
    expect(groups[1].isDefault).toBe(false);
    expect(groups[2].isDefault).toBe(false);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(groups);
  });

  it("preserves other group fields when flipping isDefault", async () => {
    const groups: SetBurgGroupDefaultGroup[] = [
      {
        name: "A",
        isDefault: false,
        active: true,
        order: 1,
        preview: "watabou-city",
      },
      { name: "B", isDefault: true, active: true, order: 2, biomes: "5,6" },
    ];
    const tool = createSetBurgGroupDefaultTool(makeRuntime(groups).runtime);

    await tool.execute({ name: "A" });
    expect(groups[0]).toEqual({
      name: "A",
      isDefault: true,
      active: true,
      order: 1,
      preview: "watabou-city",
    });
    expect(groups[1]).toEqual({
      name: "B",
      isDefault: false,
      active: true,
      order: 2,
      biomes: "5,6",
    });
  });
});

describe("set_burg_group_default — strict no-op", () => {
  it("does not call persist when already in desired state", async () => {
    const groups: SetBurgGroupDefaultGroup[] = [
      { name: "A", isDefault: true },
      { name: "B", isDefault: false },
      { name: "C", isDefault: false },
    ];
    const persist = vi.fn();
    const tool = createSetBurgGroupDefaultTool({
      getGroups: () => groups,
      persist,
    });

    const result = await tool.execute({ name: "A" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body).toEqual({
      ok: true,
      name: "A",
      previous_default: "A",
      changed: false,
    });
    expect(body.persisted).toBeUndefined();
    expect(persist).not.toHaveBeenCalled();

    // Array unchanged.
    expect(groups[0].isDefault).toBe(true);
    expect(groups[1].isDefault).toBe(false);
    expect(groups[2].isDefault).toBe(false);
  });
});

describe("set_burg_group_default — self-heal multiple defaults", () => {
  it("returns previous_default as an array and clears the others", async () => {
    const groups: SetBurgGroupDefaultGroup[] = [
      { name: "A", isDefault: true },
      { name: "B", isDefault: false },
      { name: "C", isDefault: true },
    ];
    const persist = vi.fn();
    const tool = createSetBurgGroupDefaultTool({
      getGroups: () => groups,
      persist,
    });

    const result = await tool.execute({ name: "A" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.previous_default).toEqual(["A", "C"]);
    expect(body.changed).toBe(true);
    expect(body.persisted).toBe(true);

    expect(groups[0].isDefault).toBe(true);
    expect(groups[1].isDefault).toBe(false);
    expect(groups[2].isDefault).toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("self-heals when picking a non-anomalous group as default", async () => {
    const groups: SetBurgGroupDefaultGroup[] = [
      { name: "A", isDefault: true },
      { name: "B", isDefault: false },
      { name: "C", isDefault: true },
    ];
    const tool = createSetBurgGroupDefaultTool(makeRuntime(groups).runtime);

    const result = await tool.execute({ name: "B" });
    const body = parse(result.content);
    expect(body.previous_default).toEqual(["A", "C"]);
    expect(body.changed).toBe(true);

    expect(groups[0].isDefault).toBe(false);
    expect(groups[1].isDefault).toBe(true);
    expect(groups[2].isDefault).toBe(false);
  });
});

describe("set_burg_group_default — no prior default", () => {
  it("returns previous_default null when nobody had isDefault", async () => {
    const groups: SetBurgGroupDefaultGroup[] = [
      { name: "A", isDefault: false },
      { name: "B", isDefault: false },
      { name: "C", isDefault: false },
    ];
    const tool = createSetBurgGroupDefaultTool(makeRuntime(groups).runtime);

    const result = await tool.execute({ name: "B" });
    const body = parse(result.content);
    expect(body.previous_default).toBeNull();
    expect(body.changed).toBe(true);

    expect(groups[1].isDefault).toBe(true);
    expect(groups[0].isDefault).toBe(false);
    expect(groups[2].isDefault).toBe(false);
  });

  it("treats missing isDefault field as not-default", async () => {
    const groups: SetBurgGroupDefaultGroup[] = [{ name: "A" }, { name: "B" }];
    const tool = createSetBurgGroupDefaultTool(makeRuntime(groups).runtime);

    const result = await tool.execute({ name: "A" });
    const body = parse(result.content);
    expect(body.previous_default).toBeNull();
    expect(body.changed).toBe(true);
    expect(groups[0].isDefault).toBe(true);
    expect(groups[1].isDefault).toBe(false);
  });
});

describe("set_burg_group_default — group not found", () => {
  it("errors when name not in array; array unchanged; persist not called", async () => {
    const groups: SetBurgGroupDefaultGroup[] = [
      { name: "A", isDefault: true },
      { name: "B", isDefault: false },
    ];
    const before = JSON.parse(JSON.stringify(groups));
    const persist = vi.fn();
    const tool = createSetBurgGroupDefaultTool({
      getGroups: () => groups,
      persist,
    });

    const result = await tool.execute({ name: "Z" });
    expect(result.isError).toBe(true);
    const body = parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('Burg group "Z" not found.');
    expect(persist).not.toHaveBeenCalled();
    expect(groups).toEqual(before);
  });

  it("is case-sensitive (uppercase != lowercase)", async () => {
    const groups: SetBurgGroupDefaultGroup[] = [
      { name: "Cities", isDefault: true },
    ];
    const tool = createSetBurgGroupDefaultTool(makeRuntime(groups).runtime);

    const result = await tool.execute({ name: "cities" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe('Burg group "cities" not found.');
  });
});

describe("set_burg_group_default — groups array missing or invalid", () => {
  it("errors when getGroups returns undefined", async () => {
    const tool = createSetBurgGroupDefaultTool(makeRuntime(undefined).runtime);
    const result = await tool.execute({ name: "A" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "options.burgs.groups is missing or not an array.",
    );
  });
});

describe("set_burg_group_default — input validation", () => {
  const groups: SetBurgGroupDefaultGroup[] = [{ name: "A", isDefault: true }];

  it("errors when name missing", async () => {
    const tool = createSetBurgGroupDefaultTool(makeRuntime(groups).runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });

  it("errors when name is not a string", async () => {
    const tool = createSetBurgGroupDefaultTool(makeRuntime(groups).runtime);
    const result = await tool.execute({ name: 42 });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });

  it("errors when name is empty string", async () => {
    const tool = createSetBurgGroupDefaultTool(makeRuntime(groups).runtime);
    const result = await tool.execute({ name: "" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });

  it("errors when name is whitespace only", async () => {
    const tool = createSetBurgGroupDefaultTool(makeRuntime(groups).runtime);
    const result = await tool.execute({ name: "   " });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });

  it("accepts null input as missing fields", async () => {
    const tool = createSetBurgGroupDefaultTool(makeRuntime(groups).runtime);
    const result = await tool.execute(null);
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });
});

describe("set_burg_group_default — persist failure", () => {
  it("succeeds with persisted: false and a note when persist throws", async () => {
    const groups: SetBurgGroupDefaultGroup[] = [
      { name: "A", isDefault: false },
      { name: "B", isDefault: true },
    ];
    const persist = vi.fn(() => {
      throw new Error("localStorage is not available.");
    });
    const tool = createSetBurgGroupDefaultTool({
      getGroups: () => groups,
      persist,
    });

    const result = await tool.execute({ name: "A" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.changed).toBe(true);
    expect(body.persisted).toBe(false);
    expect(typeof body.note).toBe("string");
    expect(body.note).toMatch(/localStorage/);
    // Mutation still happened.
    expect(groups[0].isDefault).toBe(true);
    expect(groups[1].isDefault).toBe(false);
  });

  it("non-Error thrown values are stringified into the note", async () => {
    const groups: SetBurgGroupDefaultGroup[] = [
      { name: "A", isDefault: false },
    ];
    const persist = vi.fn(() => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "raw string failure";
    });
    const tool = createSetBurgGroupDefaultTool({
      getGroups: () => groups,
      persist,
    });

    const result = await tool.execute({ name: "A" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.persisted).toBe(false);
    expect(body.note).toMatch(/raw string failure/);
  });
});

describe("findPreviousDefault — pure helper", () => {
  it("returns null when none flagged", () => {
    expect(
      findPreviousDefault([
        { name: "A", isDefault: false },
        { name: "B", isDefault: false },
      ]),
    ).toBeNull();
  });

  it("returns single name when exactly one flagged", () => {
    expect(
      findPreviousDefault([
        { name: "A", isDefault: true },
        { name: "B", isDefault: false },
      ]),
    ).toBe("A");
  });

  it("returns array when multiple flagged", () => {
    expect(
      findPreviousDefault([
        { name: "A", isDefault: true },
        { name: "B", isDefault: true },
        { name: "C", isDefault: false },
      ]),
    ).toEqual(["A", "B"]);
  });

  it("treats truthy non-true values as not-flagged (strict equal)", () => {
    expect(
      findPreviousDefault([
        { name: "A", isDefault: 1 as unknown as boolean },
        { name: "B", isDefault: true },
      ]),
    ).toBe("B");
  });

  it("uses empty string when name is missing on a flagged group", () => {
    expect(
      findPreviousDefault([
        { isDefault: true },
        { name: "B", isDefault: false },
      ]),
    ).toBe("");
  });
});

describe("applyDefault — pure helper", () => {
  it("returns changed: false when already in desired state", () => {
    const groups: SetBurgGroupDefaultGroup[] = [
      { name: "A", isDefault: true },
      { name: "B", isDefault: false },
    ];
    const result = applyDefault(groups, "A");
    expect(result.changed).toBe(false);
  });

  it("returns changed: true when normalising stray non-boolean isDefault", () => {
    const groups: SetBurgGroupDefaultGroup[] = [
      { name: "A", isDefault: "yes" },
      { name: "B", isDefault: 0 },
    ];
    const result = applyDefault(groups, "A");
    expect(result.changed).toBe(true);
    expect(groups[0].isDefault).toBe(true);
    expect(groups[1].isDefault).toBe(false);
  });
});

describe("set_burg_group_default — registry round-trip", () => {
  it("registers under name `set_burg_group_default` and is callable via registry.run", async () => {
    expect(setBurgGroupDefaultTool.name).toBe("set_burg_group_default");
    const registry = new ToolRegistry();
    registry.register(setBurgGroupDefaultTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "set_burg_group_default",
    );

    const originalOptions = (globalThis as Record<string, unknown>).options;
    const originalLocalStorage = (globalThis as { localStorage?: unknown })
      .localStorage;
    const setItem = vi.fn();
    try {
      (globalThis as Record<string, unknown>).options = {
        burgs: {
          groups: [
            { name: "A", isDefault: false, active: true },
            { name: "B", isDefault: true, active: true },
          ],
        },
      };
      (globalThis as unknown as { localStorage: unknown }).localStorage = {
        setItem,
        getItem: () => null,
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      };

      const result = await registry.run("set_burg_group_default", {
        name: "A",
      });
      expect(result.isError).toBeFalsy();
      const body = parse(result.content);
      expect(body.ok).toBe(true);
      expect(body.changed).toBe(true);
      expect(body.persisted).toBe(true);
      expect(body.previous_default).toBe("B");
      expect(setItem).toHaveBeenCalledTimes(1);
      expect(setItem.mock.calls[0][0]).toBe("burg-groups");
      const stored = JSON.parse(setItem.mock.calls[0][1]) as Array<{
        name: string;
        isDefault: boolean;
      }>;
      expect(stored[0].isDefault).toBe(true);
      expect(stored[1].isDefault).toBe(false);
    } finally {
      (globalThis as Record<string, unknown>).options = originalOptions;
      (globalThis as { localStorage?: unknown }).localStorage =
        originalLocalStorage;
    }
  });
});

describe("setBurgGroupDefaultTool — default runtime smoke", () => {
  let originalOptions: unknown;
  let originalLocalStorage: unknown;
  beforeEach(() => {
    originalOptions = (globalThis as Record<string, unknown>).options;
    originalLocalStorage = (globalThis as { localStorage?: unknown })
      .localStorage;
  });
  afterEach(() => {
    (globalThis as Record<string, unknown>).options = originalOptions;
    (globalThis as { localStorage?: unknown }).localStorage =
      originalLocalStorage;
  });

  it("reads from globalThis.options.burgs.groups and persists to localStorage", async () => {
    const setItem = vi.fn();
    (globalThis as Record<string, unknown>).options = {
      burgs: {
        groups: [
          { name: "cities", isDefault: false },
          { name: "villages", isDefault: true },
        ],
      },
    };
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      setItem,
      getItem: () => null,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };

    const result = await setBurgGroupDefaultTool.execute({ name: "cities" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.previous_default).toBe("villages");
    expect(body.changed).toBe(true);
    expect(body.persisted).toBe(true);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0][0]).toBe("burg-groups");
  });

  it("errors when window.options.burgs.groups is missing", async () => {
    (globalThis as Record<string, unknown>).options = {};
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      setItem: vi.fn(),
    };
    const result = await setBurgGroupDefaultTool.execute({ name: "A" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "options.burgs.groups is missing or not an array.",
    );
  });

  it("errors when options.burgs.groups is the wrong type", async () => {
    (globalThis as Record<string, unknown>).options = {
      burgs: { groups: { 0: "not-array" } },
    };
    const result = await setBurgGroupDefaultTool.execute({ name: "A" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "options.burgs.groups is missing or not an array.",
    );
  });

  it("soft-fails with persisted: false when localStorage is missing", async () => {
    const groups = [
      { name: "A", isDefault: false },
      { name: "B", isDefault: true },
    ];
    (globalThis as Record<string, unknown>).options = {
      burgs: { groups },
    };
    delete (globalThis as { localStorage?: unknown }).localStorage;

    const result = await setBurgGroupDefaultTool.execute({ name: "A" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.changed).toBe(true);
    expect(body.persisted).toBe(false);
    expect(typeof body.note).toBe("string");
    // In-memory mutation still happened.
    expect(groups[0].isDefault).toBe(true);
    expect(groups[1].isDefault).toBe(false);
  });
});
