import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createRegenerateReliefIconsTool,
  defaultRegenerateReliefIconsRuntime,
  type RegenerateReliefIconsRuntime,
  regenerateReliefIconsTool,
} from "./regenerate-relief-icons";

/**
 * Fake terrain root: implements just enough Element surface for the
 * tool's `querySelectorAll("use").length` count, plus an `addUses`
 * test-helper to simulate `drawReliefIcons` clearing + re-populating.
 */
interface FakeRoot {
  uses: number;
  querySelectorAll: (selector: string) => { length: number };
  setUses: (n: number) => void;
}

function makeRoot(initial = 0): FakeRoot {
  const root: FakeRoot = {
    uses: initial,
    querySelectorAll(selector: string) {
      // Match the tool's selector exactly.
      if (selector !== "use") return { length: 0 };
      return { length: root.uses };
    },
    setUses(n) {
      root.uses = n;
    },
  };
  return root;
}

function makeStubRuntime(
  root: FakeRoot | null,
  /** Side-effect simulating drawReliefIcons mutating the same root. */
  regenerateImpl: () => void = () => {
    /* default: no-op */
  },
): {
  runtime: RegenerateReliefIconsRuntime;
  regenerate: ReturnType<typeof vi.fn>;
} {
  const regenerate = vi.fn(regenerateImpl);
  const runtime: RegenerateReliefIconsRuntime = {
    getTerrainRoot: () =>
      root as unknown as ReturnType<
        RegenerateReliefIconsRuntime["getTerrainRoot"]
      >,
    regenerate,
  };
  return { runtime, regenerate };
}

describe("regenerate_relief_icons tool metadata", () => {
  it("has the right name and an empty schema", () => {
    expect(regenerateReliefIconsTool.name).toBe("regenerate_relief_icons");
    expect(regenerateReliefIconsTool.input_schema.type).toBe("object");
    expect(regenerateReliefIconsTool.input_schema.properties).toEqual({});
    expect(regenerateReliefIconsTool.input_schema.required).toBeUndefined();
  });

  it("description mentions regenerate, relief, and drawReliefIcons", () => {
    const desc = regenerateReliefIconsTool.description;
    expect(desc.toLowerCase()).toContain("regenerate");
    expect(desc.toLowerCase()).toContain("relief");
    expect(desc).toContain("drawReliefIcons");
  });

  it("createRegenerateReliefIconsTool produces an equivalent tool", () => {
    const built = createRegenerateReliefIconsTool();
    expect(built.name).toBe(regenerateReliefIconsTool.name);
    expect(built.input_schema).toEqual(regenerateReliefIconsTool.input_schema);
    expect(built.description).toBe(regenerateReliefIconsTool.description);
  });

  it("registers cleanly in a ToolRegistry round-trip", () => {
    const registry = new ToolRegistry();
    registry.register(regenerateReliefIconsTool);
    const schemas = registry.toAnthropicSchemas();
    expect(
      schemas.find((s) => s.name === "regenerate_relief_icons"),
    ).toBeDefined();
  });
});

describe("regenerate_relief_icons (stub runtime)", () => {
  it("captures previous_count BEFORE regenerate runs (5 → 8)", async () => {
    const root = makeRoot(5);
    // Simulates drawReliefIcons: clear then re-populate with 8 icons.
    const { runtime, regenerate } = makeStubRuntime(root, () => {
      root.setUses(0);
      root.setUses(8);
    });
    const tool = createRegenerateReliefIconsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(regenerate).toHaveBeenCalledTimes(1);
    // Load-bearing: previous_count must be the PRE-regenerate count.
    // A buggy implementation that counts after would report 8 here.
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 5,
      count: 8,
    });
  });

  it("handles empty terrain → empty regenerate (0 → 0)", async () => {
    const root = makeRoot(0);
    const { runtime, regenerate } = makeStubRuntime(root, () => {
      /* renderer adds nothing */
    });
    const tool = createRegenerateReliefIconsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 0,
      count: 0,
    });
  });

  it("handles empty terrain → non-empty regenerate (0 → 12)", async () => {
    const root = makeRoot(0);
    const { runtime } = makeStubRuntime(root, () => {
      root.setUses(12);
    });
    const tool = createRegenerateReliefIconsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 0,
      count: 12,
    });
  });

  it("handles non-empty terrain → empty regenerate (4 → 0)", async () => {
    const root = makeRoot(4);
    const { runtime } = makeStubRuntime(root, () => {
      root.setUses(0);
    });
    const tool = createRegenerateReliefIconsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 4,
      count: 0,
    });
  });

  it("errors when getTerrainRoot returns null", async () => {
    const { runtime, regenerate } = makeStubRuntime(null);
    const tool = createRegenerateReliefIconsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/terrain/);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("surfaces Error thrown from regenerate()", async () => {
    const root = makeRoot(2);
    const runtime: RegenerateReliefIconsRuntime = {
      getTerrainRoot: () =>
        root as unknown as ReturnType<
          RegenerateReliefIconsRuntime["getTerrainRoot"]
        >,
      regenerate: () => {
        throw new Error("window.drawReliefIcons is not available.");
      },
    };
    const tool = createRegenerateReliefIconsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/drawReliefIcons/);
  });

  it("surfaces non-Error throws from regenerate()", async () => {
    const root = makeRoot(0);
    const runtime: RegenerateReliefIconsRuntime = {
      getTerrainRoot: () =>
        root as unknown as ReturnType<
          RegenerateReliefIconsRuntime["getTerrainRoot"]
        >,
      regenerate: () => {
        throw "boom";
      },
    };
    const tool = createRegenerateReliefIconsTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("boom");
  });
});

describe("defaultRegenerateReliefIconsRuntime (integration)", () => {
  const drawReliefIcons = vi.fn();
  const originalTerrain = (globalThis as { terrain?: unknown }).terrain;
  const originalDraw = (globalThis as { drawReliefIcons?: unknown })
    .drawReliefIcons;
  const originalDocument = (globalThis as { document?: unknown }).document;

  let root: FakeRoot;

  beforeEach(() => {
    drawReliefIcons.mockReset();
    root = makeRoot(3);
  });

  afterEach(() => {
    (globalThis as { terrain?: unknown }).terrain = originalTerrain;
    (globalThis as { drawReliefIcons?: unknown }).drawReliefIcons =
      originalDraw;
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("uses globalThis.terrain.node() and calls globalThis.drawReliefIcons", async () => {
    (globalThis as { terrain?: unknown }).terrain = { node: () => root };
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    drawReliefIcons.mockImplementation(() => {
      // Wipe + re-populate with 7 icons.
      root.setUses(0);
      root.setUses(7);
    });
    (globalThis as { drawReliefIcons?: unknown }).drawReliefIcons =
      drawReliefIcons;

    const result = await regenerateReliefIconsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(drawReliefIcons).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 3,
      count: 7,
    });
  });

  it("falls back to document.getElementById('terrain')", async () => {
    (globalThis as { terrain?: unknown }).terrain = undefined;
    (globalThis as { document?: unknown }).document = {
      getElementById(id: string) {
        return id === "terrain" ? root : null;
      },
    };
    drawReliefIcons.mockImplementation(() => {
      root.setUses(11);
    });
    (globalThis as { drawReliefIcons?: unknown }).drawReliefIcons =
      drawReliefIcons;

    const result = await regenerateReliefIconsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(drawReliefIcons).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 3,
      count: 11,
    });
  });

  it("errors when globalThis.drawReliefIcons is missing", async () => {
    (globalThis as { terrain?: unknown }).terrain = { node: () => root };
    (globalThis as { drawReliefIcons?: unknown }).drawReliefIcons = undefined;

    const result = await regenerateReliefIconsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/drawReliefIcons/);
  });

  it("errors when globalThis.drawReliefIcons is not a function", async () => {
    (globalThis as { terrain?: unknown }).terrain = { node: () => root };
    (globalThis as { drawReliefIcons?: unknown }).drawReliefIcons = "hello";

    const result = await regenerateReliefIconsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/drawReliefIcons/);
  });

  it("errors when neither globalThis.terrain nor #terrain element exists", async () => {
    (globalThis as { terrain?: unknown }).terrain = undefined;
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    (globalThis as { drawReliefIcons?: unknown }).drawReliefIcons =
      drawReliefIcons;

    const result = await regenerateReliefIconsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/terrain/);
    expect(drawReliefIcons).not.toHaveBeenCalled();
  });

  it("defaultRegenerateReliefIconsRuntime.getTerrainRoot returns null when nothing is present", () => {
    (globalThis as { terrain?: unknown }).terrain = undefined;
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    expect(defaultRegenerateReliefIconsRuntime.getTerrainRoot()).toBeNull();
  });
});
