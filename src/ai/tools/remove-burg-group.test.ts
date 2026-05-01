import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createRemoveBurgGroupTool,
  type RemoveBurgGroupBurg,
  type RemoveBurgGroupGroup,
  type RemoveBurgGroupRuntime,
  removeBurgGroupTool,
} from "./remove-burg-group";

function parse(content: string): Record<string, unknown> {
  return JSON.parse(content) as Record<string, unknown>;
}

function makeRuntime(args: {
  groups?: RemoveBurgGroupGroup[];
  burgs?: RemoveBurgGroupBurg[];
}): {
  runtime: RemoveBurgGroupRuntime;
  persist: ReturnType<typeof vi.fn>;
} {
  const persist = vi.fn<(groups: RemoveBurgGroupGroup[]) => void>();
  return {
    runtime: {
      getGroups: () => args.groups,
      getBurgs: () => args.burgs,
      persist,
    },
    persist,
  };
}

describe("remove_burg_group — happy path: non-default group with burgs", () => {
  it("splices the group, migrates burgs to current default, persists", async () => {
    const groups: RemoveBurgGroupGroup[] = [
      { name: "cities", active: true, isDefault: true },
      { name: "villages", active: true, isDefault: false },
      { name: "outposts", active: true, isDefault: false },
    ];
    const burgs: RemoveBurgGroupBurg[] = [
      { i: 0 }, // dummy index 0 placeholder
      { i: 1, group: "villages" },
      { i: 2, group: "villages" },
      { i: 3, group: "cities" },
      { i: 4, group: "outposts" },
    ];
    const persist = vi.fn();
    const tool = createRemoveBurgGroupTool({
      getGroups: () => groups,
      getBurgs: () => burgs,
      persist,
    });

    const result = await tool.execute({ name: "villages" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.name).toBe("villages");
    expect(body.new_default).toBe("cities");
    expect(body.migrated_burg_count).toBe(2);
    expect(body.changed).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.removed).toEqual({
      name: "villages",
      active: true,
      isDefault: false,
    });

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.name)).toEqual(["cities", "outposts"]);

    expect(burgs[1].group).toBe("cities");
    expect(burgs[2].group).toBe("cities");
    expect(burgs[3].group).toBe("cities");
    expect(burgs[4].group).toBe("outposts");

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(groups);
  });
});

describe("remove_burg_group — happy path: removing the default group", () => {
  it("auto-promotes the first remaining group; migrates burgs to it", async () => {
    const groups: RemoveBurgGroupGroup[] = [
      { name: "cities", active: true, isDefault: true },
      { name: "villages", active: true, isDefault: false },
      { name: "outposts", active: true, isDefault: false },
    ];
    const burgs: RemoveBurgGroupBurg[] = [
      { i: 0 },
      { i: 1, group: "cities" },
      { i: 2, group: "cities" },
      { i: 3, group: "outposts" },
    ];
    const tool = createRemoveBurgGroupTool(
      makeRuntime({ groups, burgs }).runtime,
    );

    const result = await tool.execute({ name: "cities" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.new_default).toBe("villages");
    expect(body.migrated_burg_count).toBe(2);
    expect(body.removed).toEqual({
      name: "cities",
      active: true,
      isDefault: true,
    });

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.name)).toEqual(["villages", "outposts"]);
    // villages is the new default; outposts must be cleared (defensively).
    expect(groups[0].isDefault).toBe(true);
    expect(groups[1].isDefault).toBe(false);

    expect(burgs[1].group).toBe("villages");
    expect(burgs[2].group).toBe("villages");
    expect(burgs[3].group).toBe("outposts");
  });

  it("self-heals when survivors have multiple isDefault: true", async () => {
    // Anomalous input: removing the default leaves two flagged-default
    // groups in survivors. We must normalise to exactly one.
    const groups: RemoveBurgGroupGroup[] = [
      { name: "A", active: true, isDefault: true },
      { name: "B", active: true, isDefault: true },
      { name: "C", active: true, isDefault: true },
    ];
    const tool = createRemoveBurgGroupTool(
      makeRuntime({ groups, burgs: [] }).runtime,
    );

    const result = await tool.execute({ name: "A" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.new_default).toBe("B");
    expect(groups[0].isDefault).toBe(true);
    expect(groups[1].isDefault).toBe(false);
  });
});

describe("remove_burg_group — happy path: no burgs in the group", () => {
  it("succeeds with migrated_burg_count: 0", async () => {
    const groups: RemoveBurgGroupGroup[] = [
      { name: "cities", active: true, isDefault: true },
      { name: "ghost", active: true, isDefault: false },
    ];
    const burgs: RemoveBurgGroupBurg[] = [{ i: 0 }, { i: 1, group: "cities" }];
    const tool = createRemoveBurgGroupTool(
      makeRuntime({ groups, burgs }).runtime,
    );

    const result = await tool.execute({ name: "ghost" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.migrated_burg_count).toBe(0);
    expect(body.new_default).toBe("cities");
    expect(groups).toHaveLength(1);
    expect(burgs[1].group).toBe("cities");
  });
});

describe("remove_burg_group — invariant rejections", () => {
  it("rejects removing the last group", async () => {
    const groups: RemoveBurgGroupGroup[] = [
      { name: "only", active: true, isDefault: true },
    ];
    const persist = vi.fn();
    const tool = createRemoveBurgGroupTool({
      getGroups: () => groups,
      getBurgs: () => [],
      persist,
    });

    const result = await tool.execute({ name: "only" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe("Cannot remove the last group.");
    expect(groups).toHaveLength(1);
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects removing the last active group", async () => {
    const groups: RemoveBurgGroupGroup[] = [
      { name: "active-one", active: true, isDefault: true },
      { name: "inactive-a", active: false, isDefault: false },
      { name: "inactive-b", active: false, isDefault: false },
    ];
    const persist = vi.fn();
    const tool = createRemoveBurgGroupTool({
      getGroups: () => groups,
      getBurgs: () => [],
      persist,
    });

    const result = await tool.execute({ name: "active-one" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "Cannot remove the last active group; activate another first.",
    );
    expect(groups).toHaveLength(3);
    expect(persist).not.toHaveBeenCalled();
  });

  it("allows removing an inactive group when no other group is active", async () => {
    // Tests the conditional: the rule fires only when target.active === true.
    const groups: RemoveBurgGroupGroup[] = [
      { name: "active-one", active: true, isDefault: true },
      { name: "inactive-orphan", active: false, isDefault: false },
    ];
    const tool = createRemoveBurgGroupTool(
      makeRuntime({ groups, burgs: [] }).runtime,
    );

    const result = await tool.execute({ name: "inactive-orphan" });
    expect(result.isError).toBeFalsy();
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("active-one");
  });
});

describe("remove_burg_group — group not found", () => {
  it("errors when name is not in the array; persist not called", async () => {
    const groups: RemoveBurgGroupGroup[] = [
      { name: "A", active: true, isDefault: true },
      { name: "B", active: true, isDefault: false },
    ];
    const before = JSON.parse(JSON.stringify(groups));
    const persist = vi.fn();
    const tool = createRemoveBurgGroupTool({
      getGroups: () => groups,
      getBurgs: () => [],
      persist,
    });

    const result = await tool.execute({ name: "Z" });
    expect(result.isError).toBe(true);
    const body = parse(result.content);
    expect(body.error).toBe('Burg group "Z" not found.');
    expect(persist).not.toHaveBeenCalled();
    expect(groups).toEqual(before);
  });

  it("is case-sensitive", async () => {
    const groups: RemoveBurgGroupGroup[] = [
      { name: "Cities", active: true, isDefault: true },
      { name: "Villages", active: true, isDefault: false },
    ];
    const tool = createRemoveBurgGroupTool(
      makeRuntime({ groups, burgs: [] }).runtime,
    );

    const result = await tool.execute({ name: "cities" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe('Burg group "cities" not found.');
  });
});

describe("remove_burg_group — groups array missing or invalid", () => {
  it("errors when getGroups returns undefined", async () => {
    const tool = createRemoveBurgGroupTool({
      getGroups: () => undefined,
      getBurgs: () => undefined,
      persist: vi.fn(),
    });
    const result = await tool.execute({ name: "A" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "options.burgs.groups is missing or not an array.",
    );
  });
});

describe("remove_burg_group — pack.burgs missing", () => {
  it("succeeds with migrated_burg_count: 0 and a note", async () => {
    const groups: RemoveBurgGroupGroup[] = [
      { name: "A", active: true, isDefault: true },
      { name: "B", active: true, isDefault: false },
    ];
    const tool = createRemoveBurgGroupTool({
      getGroups: () => groups,
      getBurgs: () => undefined,
      persist: vi.fn(),
    });

    const result = await tool.execute({ name: "B" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.migrated_burg_count).toBe(0);
    expect(body.persisted).toBe(true);
    expect(typeof body.note).toBe("string");
    expect(body.note).toMatch(/pack\.burgs/);
    expect(groups).toHaveLength(1);
  });
});

describe("remove_burg_group — burgs with removed: true", () => {
  it("does not migrate removed burgs, even if their group matches", async () => {
    const groups: RemoveBurgGroupGroup[] = [
      { name: "cities", active: true, isDefault: true },
      { name: "villages", active: true, isDefault: false },
    ];
    const burgs: RemoveBurgGroupBurg[] = [
      { i: 0 },
      { i: 1, group: "villages", removed: false },
      { i: 2, group: "villages", removed: true },
      { i: 3, group: "villages" }, // missing field counts as not-removed
    ];
    const tool = createRemoveBurgGroupTool(
      makeRuntime({ groups, burgs }).runtime,
    );

    const result = await tool.execute({ name: "villages" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.migrated_burg_count).toBe(2);
    // The removed burg keeps its (now-stale) group string.
    expect(burgs[2].group).toBe("villages");
    expect(burgs[1].group).toBe("cities");
    expect(burgs[3].group).toBe("cities");
  });
});

describe("remove_burg_group — persist failures", () => {
  it("succeeds with persisted: false and a note when persist throws", async () => {
    const groups: RemoveBurgGroupGroup[] = [
      { name: "A", active: true, isDefault: true },
      { name: "B", active: true, isDefault: false },
    ];
    const persist = vi.fn(() => {
      throw new Error("localStorage is not available.");
    });
    const tool = createRemoveBurgGroupTool({
      getGroups: () => groups,
      getBurgs: () => [],
      persist,
    });

    const result = await tool.execute({ name: "B" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.persisted).toBe(false);
    expect(body.changed).toBe(true);
    expect(typeof body.note).toBe("string");
    expect(body.note).toMatch(/localStorage/);
    // Mutation still happened.
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("A");
  });

  it("non-Error thrown values are stringified into the note", async () => {
    const groups: RemoveBurgGroupGroup[] = [
      { name: "A", active: true, isDefault: true },
      { name: "B", active: true, isDefault: false },
    ];
    const persist = vi.fn(() => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw "raw string failure";
    });
    const tool = createRemoveBurgGroupTool({
      getGroups: () => groups,
      getBurgs: () => [],
      persist,
    });

    const result = await tool.execute({ name: "B" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.persisted).toBe(false);
    expect(body.note).toMatch(/raw string failure/);
  });
});

describe("remove_burg_group — input validation", () => {
  const groups: RemoveBurgGroupGroup[] = [
    { name: "A", active: true, isDefault: true },
    { name: "B", active: true, isDefault: false },
  ];

  it("errors when name missing", async () => {
    const tool = createRemoveBurgGroupTool(
      makeRuntime({ groups, burgs: [] }).runtime,
    );
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });

  it("errors when name is not a string", async () => {
    const tool = createRemoveBurgGroupTool(
      makeRuntime({ groups, burgs: [] }).runtime,
    );
    const result = await tool.execute({ name: 42 });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });

  it("errors when name is empty string", async () => {
    const tool = createRemoveBurgGroupTool(
      makeRuntime({ groups, burgs: [] }).runtime,
    );
    const result = await tool.execute({ name: "" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });

  it("errors when name is whitespace only", async () => {
    const tool = createRemoveBurgGroupTool(
      makeRuntime({ groups, burgs: [] }).runtime,
    );
    const result = await tool.execute({ name: "   " });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });

  it("accepts null input as missing fields", async () => {
    const tool = createRemoveBurgGroupTool(
      makeRuntime({ groups, burgs: [] }).runtime,
    );
    const result = await tool.execute(null);
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });
});

describe("remove_burg_group — `removed` field captures full pre-removal config", () => {
  it("preserves arbitrary extra fields like `preview` and `colors`", async () => {
    const groups: RemoveBurgGroupGroup[] = [
      { name: "A", active: true, isDefault: true },
      {
        name: "B",
        active: true,
        isDefault: false,
        preview: "watabou-city",
        colors: { fill: "#fff" },
        order: 7,
      },
    ];
    const tool = createRemoveBurgGroupTool(
      makeRuntime({ groups, burgs: [] }).runtime,
    );

    const result = await tool.execute({ name: "B" });
    const body = parse(result.content);
    expect(body.removed).toEqual({
      name: "B",
      active: true,
      isDefault: false,
      preview: "watabou-city",
      colors: { fill: "#fff" },
      order: 7,
    });
  });
});

describe("remove_burg_group — registry round-trip", () => {
  it("registers under name `remove_burg_group` and runs end-to-end via globals", async () => {
    expect(removeBurgGroupTool.name).toBe("remove_burg_group");
    const registry = new ToolRegistry();
    registry.register(removeBurgGroupTool);
    expect(registry.list().map((t) => t.name)).toContain("remove_burg_group");

    const originalOptions = (globalThis as Record<string, unknown>).options;
    const originalPack = (globalThis as Record<string, unknown>).pack;
    const originalLocalStorage = (globalThis as { localStorage?: unknown })
      .localStorage;
    const setItem = vi.fn();
    try {
      (globalThis as Record<string, unknown>).options = {
        burgs: {
          groups: [
            { name: "cities", active: true, isDefault: true },
            { name: "villages", active: true, isDefault: false },
          ],
        },
      };
      (globalThis as Record<string, unknown>).pack = {
        burgs: [
          { i: 0 },
          { i: 1, group: "villages" },
          { i: 2, group: "cities" },
        ],
      };
      (globalThis as unknown as { localStorage: unknown }).localStorage = {
        setItem,
        getItem: () => null,
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      };

      const result = await registry.run("remove_burg_group", {
        name: "villages",
      });
      expect(result.isError).toBeFalsy();
      const body = parse(result.content);
      expect(body.ok).toBe(true);
      expect(body.migrated_burg_count).toBe(1);
      expect(body.new_default).toBe("cities");
      expect(body.persisted).toBe(true);
      expect(setItem).toHaveBeenCalledTimes(1);
      expect(setItem.mock.calls[0][0]).toBe("burg-groups");
      const stored = JSON.parse(setItem.mock.calls[0][1]) as Array<{
        name: string;
      }>;
      expect(stored.map((g) => g.name)).toEqual(["cities"]);
    } finally {
      (globalThis as Record<string, unknown>).options = originalOptions;
      (globalThis as Record<string, unknown>).pack = originalPack;
      (globalThis as { localStorage?: unknown }).localStorage =
        originalLocalStorage;
    }
  });
});

describe("removeBurgGroupTool — default runtime smoke", () => {
  let originalOptions: unknown;
  let originalPack: unknown;
  let originalLocalStorage: unknown;
  beforeEach(() => {
    originalOptions = (globalThis as Record<string, unknown>).options;
    originalPack = (globalThis as Record<string, unknown>).pack;
    originalLocalStorage = (globalThis as { localStorage?: unknown })
      .localStorage;
  });
  afterEach(() => {
    (globalThis as Record<string, unknown>).options = originalOptions;
    (globalThis as Record<string, unknown>).pack = originalPack;
    (globalThis as { localStorage?: unknown }).localStorage =
      originalLocalStorage;
  });

  it("reads from globalThis.options.burgs.groups + globalThis.pack.burgs and persists to localStorage", async () => {
    const setItem = vi.fn();
    (globalThis as Record<string, unknown>).options = {
      burgs: {
        groups: [
          { name: "cities", active: true, isDefault: true },
          { name: "villages", active: true, isDefault: false },
        ],
      },
    };
    (globalThis as Record<string, unknown>).pack = {
      burgs: [{ i: 0 }, { i: 1, group: "villages" }],
    };
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      setItem,
      getItem: () => null,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };

    const result = await removeBurgGroupTool.execute({ name: "villages" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.new_default).toBe("cities");
    expect(body.migrated_burg_count).toBe(1);
    expect(body.persisted).toBe(true);
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem.mock.calls[0][0]).toBe("burg-groups");
  });

  it("errors when window.options.burgs.groups is missing", async () => {
    (globalThis as Record<string, unknown>).options = {};
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      setItem: vi.fn(),
    };
    const result = await removeBurgGroupTool.execute({ name: "A" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "options.burgs.groups is missing or not an array.",
    );
  });

  it("errors when options.burgs.groups is the wrong type", async () => {
    (globalThis as Record<string, unknown>).options = {
      burgs: { groups: { 0: "not-array" } },
    };
    const result = await removeBurgGroupTool.execute({ name: "A" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "options.burgs.groups is missing or not an array.",
    );
  });

  it("soft-fails with persisted: false when localStorage is missing", async () => {
    const groups = [
      { name: "A", active: true, isDefault: true },
      { name: "B", active: true, isDefault: false },
    ];
    (globalThis as Record<string, unknown>).options = {
      burgs: { groups },
    };
    (globalThis as Record<string, unknown>).pack = { burgs: [] };
    delete (globalThis as { localStorage?: unknown }).localStorage;

    const result = await removeBurgGroupTool.execute({ name: "B" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.changed).toBe(true);
    expect(body.persisted).toBe(false);
    expect(typeof body.note).toBe("string");
    // In-memory mutation still happened.
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("A");
  });

  it("succeeds with note when pack.burgs is missing in default runtime", async () => {
    const setItem = vi.fn();
    (globalThis as Record<string, unknown>).options = {
      burgs: {
        groups: [
          { name: "A", active: true, isDefault: true },
          { name: "B", active: true, isDefault: false },
        ],
      },
    };
    (globalThis as Record<string, unknown>).pack = {};
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      setItem,
      getItem: () => null,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };

    const result = await removeBurgGroupTool.execute({ name: "B" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.migrated_burg_count).toBe(0);
    expect(body.persisted).toBe(true);
    expect(typeof body.note).toBe("string");
    expect(body.note).toMatch(/pack\.burgs/);
  });
});
