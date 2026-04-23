import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CULTURES_SETS,
  type CulturesSetRuntime,
  createSetCulturesSetTool,
  resolveCulturesSet,
  setCulturesSetTool,
} from "./set-cultures-set";

describe("resolveCulturesSet", () => {
  it("canonicalizes case-insensitively", () => {
    expect(resolveCulturesSet("World")).toBe("world");
    expect(resolveCulturesSet("EUROPEAN")).toBe("european");
    expect(resolveCulturesSet("darkfantasy")).toBe("darkFantasy");
    expect(resolveCulturesSet("highfantasy")).toBe("highFantasy");
  });

  it("accepts aliases", () => {
    expect(resolveCulturesSet("all-world")).toBe("world");
    expect(resolveCulturesSet("all")).toBe("world");
    expect(resolveCulturesSet("high fantasy")).toBe("highFantasy");
    expect(resolveCulturesSet("high-fantasy")).toBe("highFantasy");
    expect(resolveCulturesSet("dark fantasy")).toBe("darkFantasy");
    expect(resolveCulturesSet("dark-fantasy")).toBe("darkFantasy");
  });

  it("returns null for unknown / non-string", () => {
    expect(resolveCulturesSet("scifi")).toBeNull();
    expect(resolveCulturesSet("")).toBeNull();
    expect(resolveCulturesSet(null)).toBeNull();
    expect(resolveCulturesSet(42)).toBeNull();
  });
});

describe("CULTURES_SETS", () => {
  it("has 8 values", () => {
    expect(CULTURES_SETS).toHaveLength(8);
  });
});

function makeRuntime(currentRead: ReturnType<CulturesSetRuntime["read"]>): {
  runtime: CulturesSetRuntime;
  apply: ReturnType<typeof vi.fn<CulturesSetRuntime["apply"]>>;
} {
  const apply = vi.fn<CulturesSetRuntime["apply"]>();
  return {
    runtime: { read: () => currentRead, apply },
    apply,
  };
}

describe("set_cultures_set tool", () => {
  it("delegates with canonical value", async () => {
    const { runtime, apply } = makeRuntime("world");
    const tool = createSetCulturesSetTool(runtime);
    const result = await tool.execute({ cultures_set: "european" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("european");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      cultures_set: "european",
      previous: "world",
      noop: false,
    });
  });

  it("canonicalizes case and aliases", async () => {
    const { runtime, apply } = makeRuntime(null);
    const tool = createSetCulturesSetTool(runtime);
    await tool.execute({ cultures_set: "HIGH FANTASY" });
    expect(apply).toHaveBeenCalledWith("highFantasy");
  });

  it("rejects unknown cultures_set", async () => {
    const { runtime, apply } = makeRuntime(null);
    const tool = createSetCulturesSetTool(runtime);
    const result = await tool.execute({ cultures_set: "scifi" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.supported).toContain("world");
  });

  it("rejects empty / non-string", async () => {
    const { runtime, apply } = makeRuntime(null);
    const tool = createSetCulturesSetTool(runtime);
    for (const bad of [null, undefined, 42, "", "   "]) {
      const r = await tool.execute({ cultures_set: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("is a noop when current read matches target", async () => {
    const { runtime, apply } = makeRuntime("world");
    const tool = createSetCulturesSetTool(runtime);
    const result = await tool.execute({ cultures_set: "world" });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: CulturesSetRuntime = {
      read: () => null,
      apply: vi.fn(() => {
        throw new Error("document is not available");
      }),
    };
    const tool = createSetCulturesSetTool(runtime);
    const result = await tool.execute({ cultures_set: "world" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/document/);
  });
});

describe("defaultCulturesSetRuntime (integration)", () => {
  const changeCultureSet = vi.fn();
  const selectEl = { value: "world" };
  const getElementById = vi.fn((id: string) =>
    id === "culturesSet" ? selectEl : null,
  );
  const storage: Record<string, string> = {};

  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalLocalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;
  const originalChange = (globalThis as { changeCultureSet?: unknown })
    .changeCultureSet;

  beforeEach(() => {
    changeCultureSet.mockReset();
    selectEl.value = "world";
    for (const k of Object.keys(storage)) delete storage[k];
    getElementById.mockClear();
    (globalThis as { document?: unknown }).document = { getElementById };
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem(key: string, value: string) {
        storage[key] = value;
      },
      getItem(key: string) {
        return storage[key] ?? null;
      },
    };
    (globalThis as { changeCultureSet?: unknown }).changeCultureSet =
      changeCultureSet;
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { localStorage?: unknown }).localStorage =
      originalLocalStorage;
    (globalThis as { changeCultureSet?: unknown }).changeCultureSet =
      originalChange;
  });

  it("writes select + localStorage and calls changeCultureSet", async () => {
    const result = await setCulturesSetTool.execute({
      cultures_set: "european",
    });
    expect(result.isError).toBeFalsy();
    expect(selectEl.value).toBe("european");
    expect(storage.culturesSet).toBe("european");
    expect(changeCultureSet).toHaveBeenCalledTimes(1);
  });

  it("is a noop when the select already matches", async () => {
    selectEl.value = "darkFantasy";
    const result = await setCulturesSetTool.execute({
      cultures_set: "darkFantasy",
    });
    expect(JSON.parse(result.content).noop).toBe(true);
    expect(changeCultureSet).not.toHaveBeenCalled();
    expect(storage.culturesSet).toBeUndefined();
  });
});
