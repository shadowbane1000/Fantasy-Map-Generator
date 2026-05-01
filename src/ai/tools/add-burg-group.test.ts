import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AddBurgGroupGroup,
  type AddBurgGroupRuntime,
  addBurgGroupTool,
  clearAllDefaults,
  computeDefaultOrder,
  createAddBurgGroupTool,
  defaultAddBurgGroupRuntime,
  hasExistingDefault,
} from "./add-burg-group";
import { ToolRegistry } from "./index";

function parse(content: string): Record<string, unknown> {
  return JSON.parse(content) as Record<string, unknown>;
}

function makeRuntime(
  groups: AddBurgGroupGroup[] | undefined,
  persistImpl?: (g: AddBurgGroupGroup[]) => void,
): {
  runtime: AddBurgGroupRuntime;
  persist: ReturnType<typeof vi.fn>;
} {
  const persist = vi.fn(persistImpl ?? (() => {}));
  return {
    runtime: {
      getGroups: () => groups,
      persist: persist as (g: AddBurgGroupGroup[]) => void,
    },
    persist,
  };
}

describe("add_burg_group — happy path", () => {
  it("appends a minimal new group with default order/active", async () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "cities", order: 3, active: true, isDefault: true },
      { name: "villages", order: 7, active: true },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "Marsh towns" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.persisted).toBe(true);

    // sanitizeId behavior: spaces are stripped, not hyphenated.
    const grp = body.group as AddBurgGroupGroup;
    expect(grp.name).toBe("marshtowns");
    expect(grp.order).toBe(8); // max existing 7, +1
    expect(grp.active).toBe(true);
    expect(grp.isDefault).toBeUndefined();

    expect(groups).toHaveLength(3);
    expect(groups[2]?.name).toBe("marshtowns");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(groups);
  });

  it("appends a fully-specified new group", async () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "cities", order: 1, active: true, isDefault: true },
    ];
    const { runtime } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({
      name: "Outposts",
      order: 5,
      active: false,
      preview: "watabou-village",
      min: 10,
      max: 500,
      percentile: 25,
      biomes: "1,2,3",
      states: "4,5",
      cultures: "6",
      religions: "7,8,9",
      features: { ocean: false, lake: true },
      is_default: true,
    });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    const grp = body.group as AddBurgGroupGroup;

    expect(grp.name).toBe("outposts");
    expect(grp.order).toBe(5);
    expect(grp.active).toBe(false);
    expect(grp.preview).toBe("watabou-village");
    expect(grp.min).toBe(10);
    expect(grp.max).toBe(500);
    expect(grp.percentile).toBe(25);
    expect(grp.biomes).toBe("1,2,3");
    expect(grp.states).toBe("4,5");
    expect(grp.cultures).toBe("6");
    expect(grp.religions).toBe("7,8,9");
    expect(grp.features).toEqual({ ocean: false, lake: true });
    expect(grp.isDefault).toBe(true);

    // is_default cleared the prior default
    expect(groups[0]?.isDefault).toBe(false);
    // and the new entry got isDefault:true
    expect(groups[1]?.isDefault).toBe(true);
  });

  it("is_default=true clears existing defaults and promotes the new group", async () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "a", order: 1, active: true, isDefault: true },
      { name: "b", order: 2, active: true },
    ];
    const { runtime } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "c", is_default: true });
    expect(result.isError).toBeFalsy();
    expect(groups[0]?.isDefault).toBe(false);
    expect(groups[1]?.isDefault ?? false).toBe(false);
    expect(groups[2]?.isDefault).toBe(true);
  });

  it("emits no-default note when no prior default and is_default=false", async () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "a", order: 1, active: true },
      { name: "b", order: 2, active: true },
    ];
    const { runtime } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "c" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.note).toMatch(/No group is currently set as default/);
  });

  it("omits no-default note when is_default=true (new group is now default)", async () => {
    const groups: AddBurgGroupGroup[] = [{ name: "a", order: 1, active: true }];
    const { runtime } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "c", is_default: true });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.note).toBeUndefined();
  });

  it("omits no-default note when a prior default already exists", async () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "a", order: 1, active: true, isDefault: true },
    ];
    const { runtime } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "c" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.note).toBeUndefined();
  });
});

describe("add_burg_group — default order computation", () => {
  it("uses (max existing order) + 1", async () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "a", order: 3, active: true },
      { name: "b", order: 7, active: true },
      { name: "c", order: 1, active: true },
    ];
    const { runtime } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "z" });
    expect(result.isError).toBeFalsy();
    const grp = parse(result.content).group as AddBurgGroupGroup;
    expect(grp.order).toBe(8);
  });

  it("falls back to 1 when no group has a finite numeric order", async () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "a", active: true },
      { name: "b", order: "bad", active: true },
    ];
    const { runtime } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "z" });
    expect(result.isError).toBeFalsy();
    const grp = parse(result.content).group as AddBurgGroupGroup;
    expect(grp.order).toBe(1);
  });

  it("respects the explicit `order` input over the default", async () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "a", order: 50, active: true },
    ];
    const { runtime } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "z", order: 2 });
    expect(result.isError).toBeFalsy();
    const grp = parse(result.content).group as AddBurgGroupGroup;
    expect(grp.order).toBe(2);
  });
});

describe("add_burg_group — sanitizeId behavior", () => {
  it("strips spaces (not hyphenates) — sanitizeId regex order matters", async () => {
    const groups: AddBurgGroupGroup[] = [{ name: "a", order: 1, active: true }];
    const { runtime } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "Marsh towns" });
    expect(result.isError).toBeFalsy();
    const grp = parse(result.content).group as AddBurgGroupGroup;
    expect(grp.name).toBe("marshtowns");
  });

  it("prefixes underscore on leading-digit name", async () => {
    const groups: AddBurgGroupGroup[] = [{ name: "a", order: 1, active: true }];
    const { runtime } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "42villages" });
    expect(result.isError).toBeFalsy();
    const grp = parse(result.content).group as AddBurgGroupGroup;
    expect(grp.name).toBe("_42villages");
  });

  it("strips special chars", async () => {
    const groups: AddBurgGroupGroup[] = [{ name: "a", order: 1, active: true }];
    const { runtime } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "#%! foo" });
    expect(result.isError).toBeFalsy();
    const grp = parse(result.content).group as AddBurgGroupGroup;
    expect(grp.name).toBe("foo");
  });

  it("lowercases mixed case", async () => {
    const groups: AddBurgGroupGroup[] = [{ name: "a", order: 1, active: true }];
    const { runtime } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "FoOBaR" });
    expect(result.isError).toBeFalsy();
    const grp = parse(result.content).group as AddBurgGroupGroup;
    expect(grp.name).toBe("foobar");
  });

  it("rejects empty post-sanitize names", async () => {
    const groups: AddBurgGroupGroup[] = [{ name: "a", order: 1, active: true }];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "!!!" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name sanitizes to an empty string.",
    );
    expect(groups).toHaveLength(1);
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("add_burg_group — collision detection", () => {
  it("rejects when sanitized name collides with an existing group", async () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "cities", order: 1, active: true },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    // "Cities" sanitizes to "cities", collides
    const result = await tool.execute({ name: "Cities" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      'Burg group "cities" already exists.',
    );
    expect(groups).toHaveLength(1);
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects identical sanitized name even with different special chars", async () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "myvillage", order: 1, active: true },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "My Village!!!" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      'Burg group "myvillage" already exists.',
    );
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("add_burg_group — groups array missing/wrong-type", () => {
  it("errors when getGroups returns undefined", async () => {
    const { runtime, persist } = makeRuntime(undefined);
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "z" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "options.burgs.groups is missing or not an array.",
    );
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("add_burg_group — input validation", () => {
  function withGroups(): {
    runtime: AddBurgGroupRuntime;
    persist: ReturnType<typeof vi.fn>;
  } {
    return makeRuntime([{ name: "a", order: 1, active: true }]);
  }

  it("rejects missing name", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });

  it("rejects empty/whitespace name", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);
    for (const bad of ["", "   "]) {
      const result = await tool.execute({ name: bad });
      expect(result.isError).toBe(true);
      expect(parse(result.content).error).toBe(
        "name must be a non-empty string.",
      );
    }
  });

  it("rejects non-string name", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);
    for (const bad of [42, null, true, {}, []]) {
      const result = await tool.execute({ name: bad });
      expect(result.isError).toBe(true);
      expect(parse(result.content).error).toBe(
        "name must be a non-empty string.",
      );
    }
  });

  it("rejects bad order", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);
    for (const bad of [0, -1, 1.5, "5", NaN, Infinity, -Infinity]) {
      const result = await tool.execute({ name: "z", order: bad });
      expect(result.isError).toBe(true);
      expect(parse(result.content).error).toBe(
        "order must be a positive integer.",
      );
    }
  });

  it("accepts null/undefined order (default applies)", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);
    const r1 = await tool.execute({ name: "z1", order: null });
    expect(r1.isError).toBeFalsy();
    const r2 = await tool.execute({ name: "z2", order: undefined });
    expect(r2.isError).toBeFalsy();
  });

  it("rejects bad active", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);
    for (const bad of ["true", 1, 0, {}, []]) {
      const result = await tool.execute({ name: "z", active: bad });
      expect(result.isError).toBe(true);
      expect(parse(result.content).error).toBe("active must be a boolean.");
    }
  });

  it("rejects bad preview", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);
    const result = await tool.execute({ name: "z", preview: 42 });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe("preview must be a string.");
  });

  it("rejects bad min/max/percentile", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);

    let r = await tool.execute({ name: "z", min: "10" });
    expect(r.isError).toBe(true);
    expect(parse(r.content).error).toBe("min must be a finite number.");

    r = await tool.execute({ name: "z", max: NaN });
    expect(r.isError).toBe(true);
    expect(parse(r.content).error).toBe("max must be a finite number.");

    r = await tool.execute({ name: "z", percentile: "50" });
    expect(r.isError).toBe(true);
    expect(parse(r.content).error).toBe("percentile must be a finite number.");
  });

  it("rejects out-of-range percentile", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);
    for (const bad of [-1, 101, 200]) {
      const r = await tool.execute({ name: "z", percentile: bad });
      expect(r.isError).toBe(true);
      expect(parse(r.content).error).toBe(
        "percentile must be between 0 and 100.",
      );
    }
  });

  it("accepts boundary percentiles 0 and 100", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);
    const r0 = await tool.execute({ name: "z0", percentile: 0 });
    expect(r0.isError).toBeFalsy();
    const r1 = await tool.execute({ name: "z1", percentile: 100 });
    expect(r1.isError).toBeFalsy();
  });

  it("rejects bad biomes/states/cultures/religions", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);
    for (const field of ["biomes", "states", "cultures", "religions"]) {
      const r = await tool.execute({ name: "z", [field]: 42 });
      expect(r.isError).toBe(true);
      expect(parse(r.content).error).toBe(`${field} must be a string.`);
    }
  });

  it("rejects bad features (non-object)", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);
    for (const bad of ["str", 42, [1, 2]]) {
      const r = await tool.execute({ name: "z", features: bad });
      expect(r.isError).toBe(true);
      expect(parse(r.content).error).toBe("features must be an object.");
    }
  });

  it("rejects bad is_default", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);
    for (const bad of ["yes", 1, 0, {}, "true"]) {
      const r = await tool.execute({ name: "z", is_default: bad });
      expect(r.isError).toBe(true);
      expect(parse(r.content).error).toBe("is_default must be a boolean.");
    }
  });

  it("accepts null as input (treated as defaults; required name missing)", async () => {
    const { runtime } = withGroups();
    const tool = createAddBurgGroupTool(runtime);
    const r = await tool.execute(null);
    expect(r.isError).toBe(true);
    expect(parse(r.content).error).toBe("name must be a non-empty string.");
  });
});

describe("add_burg_group — persistence", () => {
  it("persist throwing is treated as soft-fail (persisted:false + note)", async () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "a", order: 1, active: true, isDefault: true },
    ];
    const { runtime, persist } = makeRuntime(groups, () => {
      throw new Error("localStorage is not available.");
    });
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "z" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.persisted).toBe(false);
    expect(body.note).toMatch(/Persist failed/);
    expect(body.note).toMatch(/localStorage/);

    // Mutation still applied
    expect(groups).toHaveLength(2);
    expect(groups[1]?.name).toBe("z");
    expect(persist).toHaveBeenCalledOnce();
  });

  it("persist throwing a non-Error still produces a note", async () => {
    const groups: AddBurgGroupGroup[] = [{ name: "a", order: 1, active: true }];
    const { runtime } = makeRuntime(groups, () => {
      // Throw a non-Error to verify the tool stringifies it.
      throw "raw string failure";
    });
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "z" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.persisted).toBe(false);
    expect(body.note).toBe("Persist failed: raw string failure");
  });

  it("persist note takes precedence over no-default note", async () => {
    const groups: AddBurgGroupGroup[] = [{ name: "a", order: 1, active: true }];
    const { runtime } = makeRuntime(groups, () => {
      throw new Error("oops");
    });
    const tool = createAddBurgGroupTool(runtime);

    const result = await tool.execute({ name: "z" }); // is_default unset
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.note).toMatch(/Persist failed/);
    expect(body.note).not.toMatch(/No group is currently set as default/);
  });
});

describe("add_burg_group — pure helpers", () => {
  it("computeDefaultOrder returns max+1 when groups have orders", () => {
    expect(
      computeDefaultOrder([
        { name: "a", order: 1 },
        { name: "b", order: 9 },
        { name: "c", order: 3 },
      ]),
    ).toBe(10);
  });

  it("computeDefaultOrder returns 1 on empty array", () => {
    expect(computeDefaultOrder([])).toBe(1);
  });

  it("computeDefaultOrder ignores non-finite numeric orders", () => {
    expect(
      computeDefaultOrder([{ name: "a", order: NaN }, { name: "b" }]),
    ).toBe(1);
  });

  it("hasExistingDefault — strict-equal true match", () => {
    expect(hasExistingDefault([{ name: "a", isDefault: true }])).toBe(true);
    expect(hasExistingDefault([{ name: "a", isDefault: false }])).toBe(false);
    expect(
      hasExistingDefault([{ name: "a", isDefault: "yes" as unknown as true }]),
    ).toBe(false);
    expect(hasExistingDefault([])).toBe(false);
  });

  it("clearAllDefaults flips only `=== true` entries", () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "a", isDefault: true },
      { name: "b", isDefault: false },
      { name: "c", isDefault: "yes" as unknown as true },
      { name: "d" },
      { name: "e", isDefault: true },
    ];
    const cleared = clearAllDefaults(groups);
    expect(cleared).toBe(2);
    expect(groups[0]?.isDefault).toBe(false);
    expect(groups[1]?.isDefault).toBe(false);
    expect(groups[2]?.isDefault).toBe("yes"); // not strict true, untouched
    expect(groups[3]?.isDefault).toBeUndefined();
    expect(groups[4]?.isDefault).toBe(false);
  });
});

describe("add_burg_group — default runtime (globalThis)", () => {
  let originalOptions: unknown;
  let originalLocalStorage: Storage | undefined;

  beforeEach(() => {
    originalOptions = (globalThis as Record<string, unknown>).options;
    originalLocalStorage = (globalThis as { localStorage?: Storage })
      .localStorage;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).options = originalOptions;
    (globalThis as { localStorage?: Storage }).localStorage =
      originalLocalStorage;
  });

  function installLocalStorage(): {
    setItem: ReturnType<typeof vi.fn>;
    storage: Storage;
  } {
    const setItem = vi.fn(() => {});
    const storage = {
      getItem: vi.fn(() => null),
      setItem,
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as unknown as Storage;
    (globalThis as { localStorage?: Storage }).localStorage = storage;
    return { setItem, storage };
  }

  it("reads from globalThis.options.burgs.groups; writes localStorage", () => {
    const groups: AddBurgGroupGroup[] = [{ name: "a", order: 1, active: true }];
    (globalThis as Record<string, unknown>).options = {
      burgs: { groups },
    };
    const { setItem } = installLocalStorage();

    expect(defaultAddBurgGroupRuntime.getGroups()).toBe(groups);
    defaultAddBurgGroupRuntime.persist(groups);
    expect(setItem).toHaveBeenCalledWith("burg-groups", JSON.stringify(groups));
  });

  it("default getGroups returns undefined when options absent", () => {
    (globalThis as Record<string, unknown>).options = undefined;
    expect(defaultAddBurgGroupRuntime.getGroups()).toBeUndefined();
  });

  it("default getGroups returns undefined when groups not array", () => {
    (globalThis as Record<string, unknown>).options = {
      burgs: { groups: { not: "array" } },
    };
    expect(defaultAddBurgGroupRuntime.getGroups()).toBeUndefined();
  });

  it("default persist throws when localStorage missing", () => {
    (globalThis as { localStorage?: Storage }).localStorage = undefined;
    expect(() =>
      defaultAddBurgGroupRuntime.persist([{ name: "a", order: 1 }]),
    ).toThrow(/localStorage is not available/);
  });

  it("end-to-end via addBurgGroupTool: appends + writes localStorage", async () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "a", order: 1, active: true, isDefault: true },
    ];
    (globalThis as Record<string, unknown>).options = {
      burgs: { groups },
    };
    const { setItem } = installLocalStorage();

    const result = await addBurgGroupTool.execute({ name: "newgroup" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.persisted).toBe(true);
    const grp = body.group as AddBurgGroupGroup;
    expect(grp.name).toBe("newgroup");
    expect(groups).toHaveLength(2);
    expect(setItem).toHaveBeenCalledWith("burg-groups", JSON.stringify(groups));
  });

  it("end-to-end persist soft-fail when localStorage missing", async () => {
    const groups: AddBurgGroupGroup[] = [
      { name: "a", order: 1, active: true, isDefault: true },
    ];
    (globalThis as Record<string, unknown>).options = {
      burgs: { groups },
    };
    (globalThis as { localStorage?: Storage }).localStorage = undefined;

    const result = await addBurgGroupTool.execute({ name: "z" });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body.persisted).toBe(false);
    expect(typeof body.note).toBe("string");
    // Mutation still applied:
    expect(groups).toHaveLength(2);
  });
});

describe("add_burg_group — registry round-trip", () => {
  it("registers under name `add_burg_group`", () => {
    expect(addBurgGroupTool.name).toBe("add_burg_group");
  });

  it("is callable via ToolRegistry.run", async () => {
    const registry = new ToolRegistry();
    registry.register(addBurgGroupTool);
    expect(registry.list().map((t) => t.name)).toContain("add_burg_group");

    const groups: AddBurgGroupGroup[] = [
      { name: "a", order: 1, active: true, isDefault: true },
    ];
    const originalOptions = (globalThis as Record<string, unknown>).options;
    const originalLs = (globalThis as { localStorage?: Storage }).localStorage;
    try {
      (globalThis as Record<string, unknown>).options = {
        burgs: { groups },
      };
      (globalThis as { localStorage?: Storage }).localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      } as Storage;

      const result = await registry.run("add_burg_group", { name: "z" });
      expect(result.isError).toBeFalsy();
      const body = parse(result.content);
      expect(body.ok).toBe(true);
      expect((body.group as AddBurgGroupGroup).name).toBe("z");
      expect(groups).toHaveLength(2);
    } finally {
      (globalThis as Record<string, unknown>).options = originalOptions;
      (globalThis as { localStorage?: Storage }).localStorage = originalLs;
    }
  });
});
