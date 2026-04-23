import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetDefaultEmblemShapeTool,
  DEFAULT_EMBLEM_SHAPES,
  type DefaultEmblemShapeRuntime,
  DIVERSIFORM_SHAPES,
  resolveEmblemShape,
  setDefaultEmblemShapeTool,
} from "./set-default-emblem-shape";

describe("resolveEmblemShape", () => {
  it("canonicalizes diversiform shapes case-insensitively", () => {
    expect(resolveEmblemShape("Culture")).toBe("culture");
    expect(resolveEmblemShape("STATE")).toBe("state");
    expect(resolveEmblemShape("random")).toBe("random");
  });

  it("canonicalizes specific shields", () => {
    expect(resolveEmblemShape("Heater")).toBe("heater");
    expect(resolveEmblemShape("SWISS")).toBe("swiss");
    expect(resolveEmblemShape("wedged")).toBe("wedged");
  });

  it("returns null for unknown / non-string", () => {
    expect(resolveEmblemShape("notashape")).toBeNull();
    expect(resolveEmblemShape("")).toBeNull();
    expect(resolveEmblemShape(null)).toBeNull();
    expect(resolveEmblemShape(42)).toBeNull();
  });
});

describe("DEFAULT_EMBLEM_SHAPES", () => {
  it("includes the 3 diversiform shapes first", () => {
    for (const s of DIVERSIFORM_SHAPES) {
      expect(DEFAULT_EMBLEM_SHAPES).toContain(s);
    }
  });

  it("includes specific shields (heater, swiss, etc.)", () => {
    expect(DEFAULT_EMBLEM_SHAPES).toContain("heater");
    expect(DEFAULT_EMBLEM_SHAPES).toContain("swiss");
  });
});

function makeRuntime(
  currentRead: ReturnType<DefaultEmblemShapeRuntime["read"]>,
): {
  runtime: DefaultEmblemShapeRuntime;
  apply: ReturnType<typeof vi.fn<DefaultEmblemShapeRuntime["apply"]>>;
} {
  const apply = vi.fn<DefaultEmblemShapeRuntime["apply"]>();
  return {
    runtime: { read: () => currentRead, apply },
    apply,
  };
}

describe("set_default_emblem_shape tool", () => {
  it("delegates with canonical diversiform shape", async () => {
    const { runtime, apply } = makeRuntime("culture");
    const tool = createSetDefaultEmblemShapeTool(runtime);
    const result = await tool.execute({ shape: "random" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("random");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      shape: "random",
      previous: "culture",
      noop: false,
    });
  });

  it("delegates with specific shield", async () => {
    const { runtime, apply } = makeRuntime("culture");
    const tool = createSetDefaultEmblemShapeTool(runtime);
    await tool.execute({ shape: "SWISS" });
    expect(apply).toHaveBeenCalledWith("swiss");
  });

  it("rejects unknown shape", async () => {
    const { runtime, apply } = makeRuntime(null);
    const tool = createSetDefaultEmblemShapeTool(runtime);
    const result = await tool.execute({ shape: "notashape" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects empty / non-string", async () => {
    const { runtime, apply } = makeRuntime(null);
    const tool = createSetDefaultEmblemShapeTool(runtime);
    for (const bad of [null, undefined, 42, "", "   "]) {
      const r = await tool.execute({ shape: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("is a noop when current matches target", async () => {
    const { runtime, apply } = makeRuntime("culture");
    const tool = createSetDefaultEmblemShapeTool(runtime);
    const result = await tool.execute({ shape: "culture" });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: DefaultEmblemShapeRuntime = {
      read: () => null,
      apply: vi.fn(() => {
        throw new Error("options is not available");
      }),
    };
    const tool = createSetDefaultEmblemShapeTool(runtime);
    const result = await tool.execute({ shape: "random" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/options/);
  });
});

describe("defaultDefaultEmblemShapeRuntime (integration)", () => {
  const changeEmblemShape = vi.fn();
  const selectEl = { value: "culture" };
  const getElementById = vi.fn((id: string) =>
    id === "emblemShape" ? selectEl : null,
  );
  const storage: Record<string, string> = {};

  const originalOptions = (globalThis as { options?: unknown }).options;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalLocalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;
  const originalChange = (globalThis as { changeEmblemShape?: unknown })
    .changeEmblemShape;

  beforeEach(() => {
    changeEmblemShape.mockReset();
    selectEl.value = "culture";
    for (const k of Object.keys(storage)) delete storage[k];
    getElementById.mockClear();
    (globalThis as { options?: unknown }).options = { emblemShape: "culture" };
    (globalThis as { document?: unknown }).document = { getElementById };
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem(key: string, value: string) {
        storage[key] = value;
      },
      getItem(key: string) {
        return storage[key] ?? null;
      },
    };
    (globalThis as { changeEmblemShape?: unknown }).changeEmblemShape =
      changeEmblemShape;
  });

  afterEach(() => {
    (globalThis as { options?: unknown }).options = originalOptions;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { localStorage?: unknown }).localStorage =
      originalLocalStorage;
    (globalThis as { changeEmblemShape?: unknown }).changeEmblemShape =
      originalChange;
  });

  it("writes options + DOM + localStorage and calls changeEmblemShape", async () => {
    const result = await setDefaultEmblemShapeTool.execute({ shape: "random" });
    expect(result.isError).toBeFalsy();
    const options = (
      globalThis as unknown as { options: { emblemShape?: string } }
    ).options;
    expect(options.emblemShape).toBe("random");
    expect(selectEl.value).toBe("random");
    expect(storage.emblemShape).toBe("random");
    expect(changeEmblemShape).toHaveBeenCalledWith("random");
  });

  it("succeeds when changeEmblemShape is missing", async () => {
    (globalThis as { changeEmblemShape?: unknown }).changeEmblemShape =
      undefined;
    const result = await setDefaultEmblemShapeTool.execute({
      shape: "heater",
    });
    expect(result.isError).toBeFalsy();
    const options = (
      globalThis as unknown as { options: { emblemShape?: string } }
    ).options;
    expect(options.emblemShape).toBe("heater");
  });

  it("is a noop when the current selection matches", async () => {
    const options = (globalThis as { options?: { emblemShape?: string } })
      .options;
    if (options) options.emblemShape = "wedged";
    const result = await setDefaultEmblemShapeTool.execute({
      shape: "wedged",
    });
    expect(JSON.parse(result.content).noop).toBe(true);
    expect(changeEmblemShape).not.toHaveBeenCalled();
  });
});
