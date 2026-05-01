import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createSetBurgGroupActiveTool,
  defaultSetBurgGroupActiveRuntime,
  type SetBurgGroupActiveRuntime,
  setBurgGroupActiveTool,
} from "./set-burg-group-active";

interface BurgGroupFixture {
  name?: unknown;
  active?: unknown;
  isDefault?: boolean;
  // arbitrary other fields
  [k: string]: unknown;
}

function parse(content: string): Record<string, unknown> {
  return JSON.parse(content) as Record<string, unknown>;
}

function makeRuntime(
  groups: unknown,
  persistImpl?: (g: unknown[]) => boolean,
): {
  runtime: SetBurgGroupActiveRuntime;
  persist: ReturnType<typeof vi.fn>;
} {
  const persist = vi.fn(persistImpl ?? (() => true));
  return {
    runtime: {
      getGroups: () => groups,
      persist: persist as (g: unknown[]) => boolean,
    },
    persist,
  };
}

describe("set_burg_group_active — happy path", () => {
  it("deactivates one of three active groups", async () => {
    const groups: BurgGroupFixture[] = [
      { name: "cities", active: true },
      { name: "towns", active: true },
      { name: "villages", active: true },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "towns", active: false });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      name: "towns",
      old_active: true,
      new_active: false,
      changed: true,
      persisted: true,
    });
    expect(body.note).toBeUndefined();

    expect(groups[1]?.active).toBe(false);
    expect(groups[0]?.active).toBe(true);
    expect(groups[2]?.active).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(groups);
  });

  it("activates an inactive group with no rule blocking", async () => {
    const groups: BurgGroupFixture[] = [
      { name: "cities", active: true },
      { name: "ruins", active: false },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "ruins", active: true });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body).toMatchObject({
      old_active: false,
      new_active: true,
      changed: true,
      persisted: true,
    });
    expect(groups[1]?.active).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("activates a group when ALL are currently inactive", async () => {
    // Degenerate state: nothing currently active. Last-active rule
    // only fires on deactivation, so activating any group is fine.
    const groups: BurgGroupFixture[] = [
      { name: "a", active: false },
      { name: "b", active: false },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "a", active: true });
    expect(result.isError).toBeFalsy();
    expect(groups[0]?.active).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("treats missing `active` field as false (activating it succeeds)", async () => {
    const groups: BurgGroupFixture[] = [
      { name: "cities", active: true },
      { name: "missing-field" },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "missing-field", active: true });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body).toMatchObject({
      old_active: false,
      new_active: true,
      changed: true,
    });
    expect(groups[1]?.active).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("treats truthy non-bool `active` as false (per list_burg_groups rule)", async () => {
    const groups: BurgGroupFixture[] = [
      { name: "cities", active: true },
      { name: "weird", active: 1 },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    // Strict-equal rule: `active: 1` reads as inactive. Setting
    // active=true is therefore a real state change (changed: true).
    const result = await tool.execute({ name: "weird", active: true });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body).toMatchObject({
      old_active: false,
      new_active: true,
      changed: true,
    });
    expect(groups[1]?.active).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });
});

describe("set_burg_group_active — no-op short-circuit", () => {
  it("true→true: changed=false, persist NOT called, group untouched", async () => {
    const groups: BurgGroupFixture[] = [
      { name: "cities", active: true },
      { name: "towns", active: true },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "cities", active: true });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      name: "cities",
      old_active: true,
      new_active: true,
      changed: false,
    });
    expect(body.persisted).toBeUndefined();
    expect(body.note).toBeUndefined();

    expect(groups[0]?.active).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("false→false: changed=false, persist NOT called", async () => {
    const groups: BurgGroupFixture[] = [
      { name: "cities", active: true },
      { name: "ruins", active: false },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "ruins", active: false });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body).toMatchObject({
      old_active: false,
      new_active: false,
      changed: false,
    });
    expect(body.persisted).toBeUndefined();
    expect(persist).not.toHaveBeenCalled();
  });

  it("no-op false→false on a group with all-inactive array (no last-active error)", async () => {
    // No-op precedes the last-active check, so this should succeed.
    const groups: BurgGroupFixture[] = [
      { name: "a", active: false },
      { name: "b", active: false },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "a", active: false });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body).toMatchObject({ changed: false });
    expect(persist).not.toHaveBeenCalled();
  });
});

describe("set_burg_group_active — last-active rule", () => {
  it("rejects deactivating the only active group (singleton)", async () => {
    const groups: BurgGroupFixture[] = [{ name: "cities", active: true }];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "cities", active: false });
    expect(result.isError).toBe(true);
    const body = parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Cannot deactivate the last active group.");

    expect(groups[0]?.active).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects deactivating the last active when others are inactive", async () => {
    const groups: BurgGroupFixture[] = [
      { name: "cities", active: true },
      { name: "ruins", active: false },
      { name: "abandoned", active: false },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "cities", active: false });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "Cannot deactivate the last active group.",
    );
    expect(groups[0]?.active).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it("allows deactivating one of multiple active groups", async () => {
    const groups: BurgGroupFixture[] = [
      { name: "a", active: true },
      { name: "b", active: true },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "a", active: false });
    expect(result.isError).toBeFalsy();
    expect(groups[0]?.active).toBe(false);
    expect(groups[1]?.active).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });
});

describe("set_burg_group_active — group lookup", () => {
  it("errors when no group has the requested name", async () => {
    const groups: BurgGroupFixture[] = [
      { name: "cities", active: true },
      { name: "towns", active: true },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "missing", active: false });
    expect(result.isError).toBe(true);
    const body = parse(result.content);
    expect(body.error).toBe('No burg group found with name "missing".');
    expect(persist).not.toHaveBeenCalled();
  });

  it("name match is case-sensitive", async () => {
    const groups: BurgGroupFixture[] = [
      { name: "Cities", active: true },
      { name: "Towns", active: true },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "cities", active: false });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      'No burg group found with name "cities".',
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it("survives null entries in the groups array", async () => {
    const groups = [
      null,
      { name: "cities", active: true },
      { name: "towns", active: true },
    ];
    const { runtime, persist } = makeRuntime(groups);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "cities", active: false });
    expect(result.isError).toBeFalsy();
    expect(persist).toHaveBeenCalledOnce();
    expect((groups[1] as BurgGroupFixture).active).toBe(false);
  });
});

describe("set_burg_group_active — input validation", () => {
  it("errors when name is missing", async () => {
    const { runtime, persist } = makeRuntime([
      { name: "a", active: true },
      { name: "b", active: true },
    ]);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ active: false });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it("errors when name is empty string", async () => {
    const { runtime } = makeRuntime([{ name: "a", active: true }]);
    const tool = createSetBurgGroupActiveTool(runtime);
    const result = await tool.execute({ name: "", active: true });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });

  it("errors when name is whitespace-only", async () => {
    const { runtime } = makeRuntime([{ name: "a", active: true }]);
    const tool = createSetBurgGroupActiveTool(runtime);
    const result = await tool.execute({ name: "   ", active: true });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });

  it("errors when name is non-string", async () => {
    const { runtime } = makeRuntime([{ name: "a", active: true }]);
    const tool = createSetBurgGroupActiveTool(runtime);

    for (const bad of [42, null, true, {}, []]) {
      const result = await tool.execute({ name: bad, active: true });
      expect(result.isError).toBe(true);
      expect(parse(result.content).error).toBe(
        "name must be a non-empty string.",
      );
    }
  });

  it("errors when active is missing", async () => {
    const { runtime, persist } = makeRuntime([
      { name: "a", active: true },
      { name: "b", active: true },
    ]);
    const tool = createSetBurgGroupActiveTool(runtime);
    const result = await tool.execute({ name: "a" });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe("active must be a boolean.");
    expect(persist).not.toHaveBeenCalled();
  });

  it("errors when active is non-boolean", async () => {
    const { runtime } = makeRuntime([{ name: "a", active: true }]);
    const tool = createSetBurgGroupActiveTool(runtime);
    for (const bad of ["true", "false", 1, 0, null, {}]) {
      const result = await tool.execute({ name: "a", active: bad });
      expect(result.isError).toBe(true);
      expect(parse(result.content).error).toBe("active must be a boolean.");
    }
  });

  it("accepts null as input (treated as defaults; both required missing)", async () => {
    const { runtime } = makeRuntime([{ name: "a", active: true }]);
    const tool = createSetBurgGroupActiveTool(runtime);
    const result = await tool.execute(null);
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "name must be a non-empty string.",
    );
  });
});

describe("set_burg_group_active — groups array missing/wrong-type", () => {
  it("errors when groups is undefined", async () => {
    const { runtime, persist } = makeRuntime(undefined);
    const tool = createSetBurgGroupActiveTool(runtime);
    const result = await tool.execute({ name: "a", active: true });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "options.burgs.groups is missing or not an array.",
    );
    expect(persist).not.toHaveBeenCalled();
  });

  it("errors when groups is null", async () => {
    const { runtime } = makeRuntime(null);
    const tool = createSetBurgGroupActiveTool(runtime);
    const result = await tool.execute({ name: "a", active: true });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "options.burgs.groups is missing or not an array.",
    );
  });

  it("errors when groups is a non-array object", async () => {
    const { runtime } = makeRuntime({ 0: "not-an-array" });
    const tool = createSetBurgGroupActiveTool(runtime);
    const result = await tool.execute({ name: "a", active: true });
    expect(result.isError).toBe(true);
    expect(parse(result.content).error).toBe(
      "options.burgs.groups is missing or not an array.",
    );
  });

  it("errors when groups is a string", async () => {
    const { runtime } = makeRuntime("groups");
    const tool = createSetBurgGroupActiveTool(runtime);
    const result = await tool.execute({ name: "a", active: true });
    expect(result.isError).toBe(true);
  });
});

describe("set_burg_group_active — persistence failure modes", () => {
  it("persist returning false → result has persisted:false plus note; mutation still applied", async () => {
    const groups: BurgGroupFixture[] = [
      { name: "a", active: true },
      { name: "b", active: true },
    ];
    const { runtime, persist } = makeRuntime(groups, () => false);
    const tool = createSetBurgGroupActiveTool(runtime);

    const result = await tool.execute({ name: "a", active: false });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body).toMatchObject({
      changed: true,
      persisted: false,
    });
    expect(typeof body.note).toBe("string");

    expect(groups[0]?.active).toBe(false);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("persist throwing is NOT caught by the tool — caller seam must swallow", () => {
    // This documents the contract: SetBurgGroupActiveRuntime.persist
    // MUST NOT throw. The default implementation swallows; the tool
    // itself does not wrap. If a custom runtime throws, the throw
    // propagates synchronously (the tool's `execute` returns a
    // ToolResult synchronously, no Promise). The ToolRegistry's outer
    // try/catch is what would surface it for an end-user.
    const groups: BurgGroupFixture[] = [
      { name: "a", active: true },
      { name: "b", active: true },
    ];
    const { runtime } = makeRuntime(groups, () => {
      throw new Error("boom");
    });
    const tool = createSetBurgGroupActiveTool(runtime);
    expect(() => tool.execute({ name: "a", active: false })).toThrow("boom");
    // Mutation was applied before the persist call:
    expect(groups[0]?.active).toBe(false);
  });
});

describe("set_burg_group_active — default runtime (globalThis)", () => {
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

  function installLocalStorage(stub: Partial<Storage>): {
    setItem: ReturnType<typeof vi.fn>;
    storage: Storage;
  } {
    const setItem = vi.fn(stub.setItem ?? (() => {}));
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

  it("reads from globalThis.options.burgs.groups and writes to localStorage", () => {
    const groups: BurgGroupFixture[] = [
      { name: "a", active: true },
      { name: "b", active: true },
    ];
    (globalThis as Record<string, unknown>).options = {
      burgs: { groups },
    };
    const { setItem } = installLocalStorage({});

    expect(defaultSetBurgGroupActiveRuntime.getGroups()).toBe(groups);
    const ok = defaultSetBurgGroupActiveRuntime.persist(groups);
    expect(ok).toBe(true);
    expect(setItem).toHaveBeenCalledWith("burg-groups", JSON.stringify(groups));
  });

  it("persist returns false when localStorage is absent", () => {
    (globalThis as { localStorage?: Storage }).localStorage = undefined;
    const ok = defaultSetBurgGroupActiveRuntime.persist([
      { name: "a", active: true },
    ]);
    expect(ok).toBe(false);
  });

  it("persist returns false when setItem throws (quota exception)", () => {
    installLocalStorage({
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    const ok = defaultSetBurgGroupActiveRuntime.persist([
      { name: "a", active: true },
    ]);
    expect(ok).toBe(false);
  });

  it("end-to-end via setBurgGroupActiveTool: mutates globalThis options + writes localStorage", async () => {
    const groups: BurgGroupFixture[] = [
      { name: "a", active: true },
      { name: "b", active: true },
    ];
    (globalThis as Record<string, unknown>).options = {
      burgs: { groups },
    };
    const { setItem } = installLocalStorage({});

    const result = await setBurgGroupActiveTool.execute({
      name: "a",
      active: false,
    });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body).toMatchObject({
      changed: true,
      persisted: true,
      old_active: true,
      new_active: false,
    });
    expect(groups[0]?.active).toBe(false);
    expect(setItem).toHaveBeenCalledWith("burg-groups", JSON.stringify(groups));
  });

  it("end-to-end persisted:false when localStorage missing; mutation still lands", async () => {
    const groups: BurgGroupFixture[] = [
      { name: "a", active: true },
      { name: "b", active: true },
    ];
    (globalThis as Record<string, unknown>).options = {
      burgs: { groups },
    };
    (globalThis as { localStorage?: Storage }).localStorage = undefined;

    const result = await setBurgGroupActiveTool.execute({
      name: "a",
      active: false,
    });
    expect(result.isError).toBeFalsy();
    const body = parse(result.content);
    expect(body).toMatchObject({
      changed: true,
      persisted: false,
    });
    expect(typeof body.note).toBe("string");
    expect(groups[0]?.active).toBe(false);
  });
});

describe("set_burg_group_active — registry round-trip", () => {
  it("registers under name `set_burg_group_active`", () => {
    expect(setBurgGroupActiveTool.name).toBe("set_burg_group_active");
  });

  it("is callable via ToolRegistry.run", async () => {
    const registry = new ToolRegistry();
    registry.register(setBurgGroupActiveTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "set_burg_group_active",
    );

    const groups: BurgGroupFixture[] = [
      { name: "a", active: true },
      { name: "b", active: true },
    ];
    const originalOptions = (globalThis as Record<string, unknown>).options;
    const originalLs = (globalThis as { localStorage?: Storage }).localStorage;
    try {
      (globalThis as Record<string, unknown>).options = {
        burgs: { groups },
      };
      // Use a stub so the registry call doesn't depend on a real
      // jsdom/browser Storage being present.
      (globalThis as { localStorage?: Storage }).localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      } as Storage;

      const result = await registry.run("set_burg_group_active", {
        name: "a",
        active: false,
      });
      expect(result.isError).toBeFalsy();
      expect(parse(result.content)).toMatchObject({
        ok: true,
        name: "a",
        old_active: true,
        new_active: false,
        changed: true,
      });
      expect(groups[0]?.active).toBe(false);
    } finally {
      (globalThis as Record<string, unknown>).options = originalOptions;
      (globalThis as { localStorage?: Storage }).localStorage = originalLs;
    }
  });
});
