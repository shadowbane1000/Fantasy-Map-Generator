import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetOptionsLockTool,
  defaultOptionsLockRuntime,
  OPTIONS_LOCK_DISPLAY_NAMES,
  OPTIONS_LOCK_KEYS,
  type OptionsLockKey,
  type OptionsLockRuntime,
  REGENERATION_GATING_LOCKS,
  resolveOptionsLockKey,
} from "./set-options-lock";

function makeRuntime(initial: Partial<Record<OptionsLockKey, boolean>> = {}) {
  const state = new Map<OptionsLockKey, boolean>();
  for (const k of OPTIONS_LOCK_KEYS) state.set(k, initial[k] ?? false);
  const runtime: OptionsLockRuntime = {
    isLocked: vi.fn((id: OptionsLockKey) => state.get(id) ?? false),
    setLocked: vi.fn((id: OptionsLockKey, locked: boolean) => {
      state.set(id, locked);
    }),
  };
  return { runtime, state };
}

describe("set_options_lock tool", () => {
  it("locks an unlocked canonical id", async () => {
    const { runtime, state } = makeRuntime();
    const tool = createSetOptionsLockTool(runtime);
    const result = await tool.execute({ id: "template", locked: true });
    expect(result.isError).toBeFalsy();
    expect(state.get("template")).toBe(true);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "template",
      displayName: "Heightmap template",
      previouslyLocked: false,
      locked: true,
    });
  });

  it("unlocks a locked id", async () => {
    const { runtime, state } = makeRuntime({ statesNumber: true });
    const tool = createSetOptionsLockTool(runtime);
    const result = await tool.execute({ id: "statesNumber", locked: false });
    expect(result.isError).toBeFalsy();
    expect(state.get("statesNumber")).toBe(false);
    expect(JSON.parse(result.content).previouslyLocked).toBe(true);
    expect(JSON.parse(result.content).locked).toBe(false);
  });

  it("is idempotent (no-op when already in target state)", async () => {
    const { runtime, state } = makeRuntime({ template: true });
    const tool = createSetOptionsLockTool(runtime);
    const result = await tool.execute({ id: "template", locked: true });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).noop).toBe(true);
    expect(runtime.setLocked).not.toHaveBeenCalled();
    expect(state.get("template")).toBe(true);
  });

  it("accepts snake_case aliases", async () => {
    const { runtime, state } = makeRuntime();
    const tool = createSetOptionsLockTool(runtime);
    for (const [alias, canonical] of [
      ["states_number", "statesNumber"],
      ["heightmap_template", "template"],
      ["heightmap", "template"],
      ["burgs_number", "manors"],
      ["precipitation", "prec"],
      ["map_size", "mapSize"],
      ["temperature_north_pole", "temperatureNorthPole"],
    ] as const) {
      state.set(canonical, false);
      vi.mocked(runtime.setLocked).mockClear();
      const result = await tool.execute({ id: alias, locked: true });
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content).id).toBe(canonical);
      expect(state.get(canonical)).toBe(true);
    }
  });

  it("accepts display names case-insensitively", async () => {
    const { runtime } = makeRuntime();
    const tool = createSetOptionsLockTool(runtime);
    for (const input of [
      "Heightmap template",
      "  HEIGHTMAP  TEMPLATE  ",
      "heightmap template",
    ]) {
      const result = await tool.execute({ id: input, locked: true });
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content).id).toBe("template");
    }
  });

  it("rejects unknown ids with a supported list", async () => {
    const { runtime } = makeRuntime();
    const tool = createSetOptionsLockTool(runtime);
    const result = await tool.execute({ id: "saturnian", locked: true });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.supported).toEqual([...OPTIONS_LOCK_KEYS]);
    expect(body.displayNames).toContain("Heightmap template");
  });

  it("rejects non-string / empty ids and non-boolean locked", async () => {
    const { runtime } = makeRuntime();
    const tool = createSetOptionsLockTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      expect((await tool.execute({ id: bad, locked: true })).isError).toBe(
        true,
      );
    }
    for (const bad of [null, undefined, "true", 1, 0]) {
      expect(
        (await tool.execute({ id: "template", locked: bad })).isError,
      ).toBe(true);
    }
    expect(runtime.setLocked).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime();
    runtime.setLocked = vi.fn(() => {
      throw new Error("window.lock is not available yet");
    });
    const tool = createSetOptionsLockTool(runtime);
    const result = await tool.execute({ id: "template", locked: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });

  it("covers every canonical key with a display name", () => {
    for (const key of OPTIONS_LOCK_KEYS) {
      expect(OPTIONS_LOCK_DISPLAY_NAMES[key]).toBeTruthy();
    }
  });

  it("regeneration-gating set is a subset of all lockable keys", () => {
    for (const key of REGENERATION_GATING_LOCKS) {
      expect(OPTIONS_LOCK_KEYS).toContain(key);
    }
  });
});

describe("resolveOptionsLockKey", () => {
  it("resolves canonical keys, snake_case, and display names", () => {
    expect(resolveOptionsLockKey("template")).toBe("template");
    expect(resolveOptionsLockKey("Heightmap template")).toBe("template");
    expect(resolveOptionsLockKey("heightmap_template")).toBe("template");
    expect(resolveOptionsLockKey("HEIGHTMAP")).toBe("template");
    expect(resolveOptionsLockKey("states_number")).toBe("statesNumber");
    expect(resolveOptionsLockKey(" States  Number ")).toBe("statesNumber");
  });

  it("returns null for invalid input", () => {
    expect(resolveOptionsLockKey("saturnian")).toBeNull();
    expect(resolveOptionsLockKey("")).toBeNull();
    expect(resolveOptionsLockKey(null)).toBeNull();
    expect(resolveOptionsLockKey(undefined)).toBeNull();
    expect(resolveOptionsLockKey(42)).toBeNull();
  });
});

describe("defaultOptionsLockRuntime", () => {
  type Globals = {
    document?: unknown;
    window?: unknown;
  };
  const original: Globals = {};
  let lockCalls: string[];
  let unlockCalls: string[];
  let lockState: Record<string, boolean>;

  beforeEach(() => {
    const g = globalThis as Globals;
    original.document = g.document;
    original.window = g.window;

    lockCalls = [];
    unlockCalls = [];
    lockState = {};

    g.document = {
      getElementById(id: string) {
        if (id.startsWith("lock_")) {
          const key = id.slice(5);
          return {
            dataset: {
              get locked() {
                return lockState[key] ? "1" : "0";
              },
            },
          };
        }
        return null;
      },
    };

    g.window = {
      lock(id: string) {
        lockCalls.push(id);
        lockState[id] = true;
      },
      unlock(id: string) {
        unlockCalls.push(id);
        lockState[id] = false;
      },
    };
  });

  afterEach(() => {
    const g = globalThis as Globals;
    g.document = original.document;
    g.window = original.window;
  });

  it("isLocked reads #lock_<id> data-locked", () => {
    lockState.template = true;
    expect(defaultOptionsLockRuntime.isLocked("template")).toBe(true);
    expect(defaultOptionsLockRuntime.isLocked("statesNumber")).toBe(false);
  });

  it("setLocked(true) calls window.lock and verifies", () => {
    defaultOptionsLockRuntime.setLocked("template", true);
    expect(lockCalls).toEqual(["template"]);
    expect(unlockCalls).toEqual([]);
    expect(lockState.template).toBe(true);
  });

  it("setLocked(false) calls window.unlock and verifies", () => {
    lockState.template = true;
    defaultOptionsLockRuntime.setLocked("template", false);
    expect(unlockCalls).toEqual(["template"]);
    expect(lockState.template).toBe(false);
  });

  it("throws when window.lock / unlock is missing", () => {
    (globalThis as Globals).window = {};
    expect(() => defaultOptionsLockRuntime.setLocked("template", true)).toThrow(
      /window\.lock is not available/,
    );
    expect(() =>
      defaultOptionsLockRuntime.setLocked("template", false),
    ).toThrow(/window\.unlock is not available/);
  });

  it("throws when the icon does not flip (silent failure)", () => {
    (globalThis as Globals).window = {
      lock: () => {
        // no-op — simulates lock() bailing because #lock_template isn't wired
      },
    };
    expect(() => defaultOptionsLockRuntime.setLocked("template", true)).toThrow(
      /did not update/,
    );
  });
});
