import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AddBiomeInput,
  type AddBiomeRuntime,
  addBiomeTool,
  createAddBiomeTool,
  MAX_BIOMES,
  type NewBiome,
} from "./add-biome";

function makeRuntime(
  overrides: { add?: (input: AddBiomeInput) => NewBiome } = {},
): {
  runtime: AddBiomeRuntime;
  add: ReturnType<typeof vi.fn<AddBiomeRuntime["add"]>>;
} {
  const add = vi.fn<AddBiomeRuntime["add"]>(
    overrides.add ??
      ((input) => ({
        i: 13,
        name: input.name,
        color: input.color,
        habitability: input.habitability,
        cost: input.cost,
        iconsDensity: input.iconsDensity,
        icons: input.icons,
      })),
  );
  return { runtime: { add }, add };
}

describe("add_biome tool", () => {
  it("minimal call delegates with default iconsDensity=0 and icons=[]", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddBiomeTool(runtime);
    const result = await tool.execute({
      name: "Magic Grove",
      color: "#3388cc",
      habitability: 75,
      cost: 40,
    });
    expect(result.isError).toBeFalsy();
    expect(add).toHaveBeenCalledWith({
      name: "Magic Grove",
      color: "#3388cc",
      habitability: 75,
      cost: 40,
      iconsDensity: 0,
      icons: [],
    });
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      i: 13,
      name: "Magic Grove",
      color: "#3388cc",
      habitability: 75,
      cost: 40,
      iconsDensity: 0,
    });
  });

  it("preserves explicit iconsDensity and icons", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddBiomeTool(runtime);
    await tool.execute({
      name: "Mangrove",
      color: "#225533",
      habitability: 30,
      cost: 120,
      iconsDensity: 80,
      icons: ["swamp", "palm"],
    });
    expect(add).toHaveBeenCalledWith({
      name: "Mangrove",
      color: "#225533",
      habitability: 30,
      cost: 120,
      iconsDensity: 80,
      icons: ["swamp", "palm"],
    });
  });

  it("trims strings on name, color, and each icon entry", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddBiomeTool(runtime);
    await tool.execute({
      name: "  Mangrove  ",
      color: "  #225533  ",
      habitability: 30,
      cost: 120,
      icons: ["  swamp  ", "palm"],
    });
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Mangrove",
        color: "#225533",
        icons: ["swamp", "palm"],
      }),
    );
  });

  it("rejects missing / empty / non-string name", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddBiomeTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42, {}]) {
      const r = await tool.execute({
        name: bad,
        color: "#333",
        habitability: 10,
        cost: 10,
      });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects name === 'removed'", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddBiomeTool(runtime);
    const r = await tool.execute({
      name: "removed",
      color: "#333",
      habitability: 10,
      cost: 10,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/reserved sentinel/);
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects missing / invalid color", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddBiomeTool(runtime);
    for (const bad of [undefined, null, "", "   ", "not-a-color", 42]) {
      const r = await tool.execute({
        name: "X",
        color: bad,
        habitability: 10,
        cost: 10,
      });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects habitability out of range or non-integer", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddBiomeTool(runtime);
    for (const bad of [-1, 10000, 1.5, "10", null, undefined]) {
      const r = await tool.execute({
        name: "X",
        color: "#333",
        habitability: bad,
        cost: 10,
      });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects cost out of range or non-integer", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddBiomeTool(runtime);
    for (const bad of [-1, 100001, 1.5, "10", null, undefined]) {
      const r = await tool.execute({
        name: "X",
        color: "#333",
        habitability: 10,
        cost: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects iconsDensity out of range or non-integer when provided", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddBiomeTool(runtime);
    for (const bad of [-1, 10000, 1.5, "10"]) {
      const r = await tool.execute({
        name: "X",
        color: "#333",
        habitability: 10,
        cost: 10,
        iconsDensity: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects non-array / invalid icons", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddBiomeTool(runtime);
    const badSets: unknown[] = [
      "not-an-array",
      42,
      [1, "swamp"],
      ["swamp", ""],
      ["swamp", "   "],
      ["swamp", null],
    ];
    for (const bad of badSets) {
      const r = await tool.execute({
        name: "X",
        color: "#333",
        habitability: 10,
        cost: 10,
        icons: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("surfaces runtime.add failures", async () => {
    const { runtime } = makeRuntime({
      add: () => {
        throw new Error("biomesData.i is not an array.");
      },
    });
    const tool = createAddBiomeTool(runtime);
    const result = await tool.execute({
      name: "X",
      color: "#333",
      habitability: 10,
      cost: 10,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/biomesData\.i/);
  });

  it("treats iconsDensity=undefined/null as default 0", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddBiomeTool(runtime);
    await tool.execute({
      name: "X",
      color: "#333",
      habitability: 10,
      cost: 10,
      iconsDensity: null,
    });
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ iconsDensity: 0 }),
    );
  });
});

describe("defaultAddBiomeRuntime (integration)", () => {
  const originalBiomes = (globalThis as { biomesData?: unknown }).biomesData;

  function installBiomesData(extras: Record<string, unknown> = {}): void {
    (globalThis as unknown as { biomesData?: unknown }).biomesData = {
      i: Array.from({ length: 13 }, (_, k) => k),
      name: [
        "Marine",
        "Hot desert",
        "Cold desert",
        "Savanna",
        "Grassland",
        "Tropical seasonal forest",
        "Temperate deciduous forest",
        "Tropical rainforest",
        "Temperate rainforest",
        "Taiga",
        "Tundra",
        "Glacier",
        "Wetland",
      ],
      color: Array.from({ length: 13 }, () => "#000000"),
      habitability: Array.from({ length: 13 }, () => 0),
      iconsDensity: Array.from({ length: 13 }, () => 0),
      icons: Array.from({ length: 13 }, () => [] as string[]),
      cost: Array.from({ length: 13 }, () => 0),
      ...extras,
    };
  }

  beforeEach(() => {
    installBiomesData({
      rural: Array.from({ length: 13 }, () => 0),
      urban: Array.from({ length: 13 }, () => 0),
      cells: Array.from({ length: 13 }, () => 0),
      area: Array.from({ length: 13 }, () => 0),
    });
  });

  afterEach(() => {
    (globalThis as unknown as { biomesData?: unknown }).biomesData =
      originalBiomes;
  });

  it("appends a new biome at i=13 extending every parallel array", async () => {
    const result = await addBiomeTool.execute({
      name: "Magic Grove",
      color: "#2b8a4a",
      habitability: 75,
      cost: 40,
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (
      globalThis as unknown as { biomesData: Record<string, unknown[]> }
    ).biomesData;
    expect(biomesData.i).toHaveLength(14);
    expect(biomesData.i[13]).toBe(13);
    expect(biomesData.name[13]).toBe("Magic Grove");
    expect(biomesData.color[13]).toBe("#2b8a4a");
    expect(biomesData.habitability[13]).toBe(75);
    expect(biomesData.cost[13]).toBe(40);
    expect(biomesData.iconsDensity[13]).toBe(0);
    expect(biomesData.icons[13]).toEqual([]);
    // stat arrays zero-extended
    expect(biomesData.rural).toHaveLength(14);
    expect(biomesData.rural[13]).toBe(0);
    expect(biomesData.urban[13]).toBe(0);
    expect(biomesData.cells[13]).toBe(0);
    expect(biomesData.area[13]).toBe(0);

    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      i: 13,
      name: "Magic Grove",
      color: "#2b8a4a",
      habitability: 75,
      cost: 40,
      iconsDensity: 0,
    });
  });

  it("second add appends at i=14 with arrays still aligned", async () => {
    await addBiomeTool.execute({
      name: "Alpha",
      color: "#111111",
      habitability: 10,
      cost: 10,
    });
    await addBiomeTool.execute({
      name: "Beta",
      color: "#222222",
      habitability: 20,
      cost: 20,
    });
    const biomesData = (
      globalThis as unknown as { biomesData: Record<string, unknown[]> }
    ).biomesData;
    expect(biomesData.i).toHaveLength(15);
    expect(biomesData.i[14]).toBe(14);
    expect(biomesData.name[14]).toBe("Beta");
    expect(biomesData.color).toHaveLength(15);
    expect(biomesData.cost).toHaveLength(15);
    expect(biomesData.icons).toHaveLength(15);
  });

  it("preserves explicit iconsDensity and icons", async () => {
    await addBiomeTool.execute({
      name: "Mangrove",
      color: "#225533",
      habitability: 40,
      cost: 120,
      iconsDensity: 200,
      icons: ["swamp", "palm", "palm"],
    });
    const biomesData = (
      globalThis as unknown as { biomesData: Record<string, unknown[]> }
    ).biomesData;
    expect(biomesData.iconsDensity[13]).toBe(200);
    expect(biomesData.icons[13]).toEqual(["swamp", "palm", "palm"]);
  });

  it("succeeds when optional stat arrays are missing and does not synthesise them", async () => {
    installBiomesData(); // no rural/urban/cells/area
    const result = await addBiomeTool.execute({
      name: "Magic Grove",
      color: "#2b8a4a",
      habitability: 75,
      cost: 40,
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (
      globalThis as unknown as { biomesData: Record<string, unknown> }
    ).biomesData;
    expect(biomesData.rural).toBeUndefined();
    expect(biomesData.urban).toBeUndefined();
    expect(biomesData.cells).toBeUndefined();
    expect(biomesData.area).toBeUndefined();
    expect((biomesData.i as number[]).length).toBe(14);
  });

  it("errors when biomesData is missing", async () => {
    (globalThis as unknown as { biomesData?: unknown }).biomesData = undefined;
    const result = await addBiomeTool.execute({
      name: "X",
      color: "#333",
      habitability: 10,
      cost: 10,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/biomesData/);
  });

  it("errors when biomesData.i is missing", async () => {
    const biomesData = (
      globalThis as unknown as { biomesData: Record<string, unknown> }
    ).biomesData;
    biomesData.i = undefined;
    const result = await addBiomeTool.execute({
      name: "X",
      color: "#333",
      habitability: 10,
      cost: 10,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/biomesData\.i/);
  });

  it(`enforces the ${MAX_BIOMES}-biome cap`, async () => {
    const biomesData = (
      globalThis as unknown as { biomesData: Record<string, unknown[]> }
    ).biomesData;
    // Pad i-array length to MAX_BIOMES (=255) so the cap triggers on next push.
    biomesData.i = Array.from({ length: MAX_BIOMES }, (_, k) => k);
    const priorNameLen = biomesData.name.length;
    const result = await addBiomeTool.execute({
      name: "Overflow",
      color: "#ffffff",
      habitability: 10,
      cost: 10,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Maximum number of biomes/,
    );
    // Other arrays untouched.
    expect(biomesData.name).toHaveLength(priorNameLen);
  });
});
