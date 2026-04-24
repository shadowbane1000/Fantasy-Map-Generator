import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type BiomeDistributionBiomesData,
  type BiomeDistributionPackLike,
  type BiomeDistributionPayload,
  type BiomeDistributionResult,
  type BiomeDistributionRuntime,
  createGetBiomeDistributionTool,
  defaultBiomeDistributionRuntime,
  getBiomeDistributionTool,
  readBiomeDistributionFromPack,
} from "./get-biome-distribution";

function makeBiomesData(): BiomeDistributionBiomesData {
  return {
    i: [0, 1, 2, 3],
    name: ["Marine", "Hot desert", "Grassland", "removed"],
    color: ["#466eab", "#fbe79f", "#c8d68f", "#000000"],
  };
}

function makePack(): BiomeDistributionPackLike {
  // 6 cells: #0,1 Marine (biome 0); #2,3,4 Grassland (biome 2); #5 Hot desert.
  const biome = [0, 0, 2, 2, 2, 1];
  const area = [10, 10, 20, 30, 40, 100];
  return {
    burgs: [
      { i: 0, cell: 0 }, // index-0 placeholder — ignored
      { i: 1, cell: 2 }, // Grassland
      { i: 2, cell: 3 }, // Grassland
      { i: 3, cell: 3, removed: true }, // removed — ignored
      { i: 4, cell: 5 }, // Hot desert
      { i: 5, cell: 0 }, // Marine (unusual but allowed)
    ],
    cells: { biome, area },
  };
}

function runtimeReturning(
  result: BiomeDistributionResult,
): BiomeDistributionRuntime {
  return { read: () => result };
}

describe("get_biome_distribution tool — pure / seam", () => {
  it("aggregates counts, area, burgs, and percentages", () => {
    const res = readBiomeDistributionFromPack(
      makeBiomesData(),
      makePack(),
      false,
    );
    expect(res).not.toBe("not-ready");
    const payload = res as BiomeDistributionPayload;
    expect(payload.total_cells).toBe(6);
    // Grassland 3, Marine 2, Hot desert 1.
    expect(payload.biomes.map((b) => b.i)).toEqual([2, 0, 1]);
    const grass = payload.biomes[0];
    expect(grass.name).toBe("Grassland");
    expect(grass.color).toBe("#c8d68f");
    expect(grass.cells_count).toBe(3);
    expect(grass.percentage).toBe(50);
    expect(grass.area).toBe(90); // 20+30+40
    expect(grass.burgs_count).toBe(2);

    const marine = payload.biomes[1];
    expect(marine.i).toBe(0);
    expect(marine.cells_count).toBe(2);
    expect(marine.percentage).toBeCloseTo(33.33, 2);
    expect(marine.area).toBe(20);
    expect(marine.burgs_count).toBe(1);

    const desert = payload.biomes[2];
    expect(desert.i).toBe(1);
    expect(desert.cells_count).toBe(1);
    expect(desert.percentage).toBeCloseTo(16.67, 2);
    expect(desert.area).toBe(100);
    expect(desert.burgs_count).toBe(1);
  });

  it("percentages sum to ~100 when no 'removed' slots are shown", () => {
    const payload = readBiomeDistributionFromPack(
      makeBiomesData(),
      makePack(),
      false,
    ) as BiomeDistributionPayload;
    const sum = payload.biomes.reduce((acc, b) => acc + b.percentage, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it("skips 'removed' sentinel slots by default", () => {
    const payload = readBiomeDistributionFromPack(
      makeBiomesData(),
      makePack(),
      false,
    ) as BiomeDistributionPayload;
    expect(payload.biomes.some((b) => b.name === "removed")).toBe(false);
    expect(payload.biomes).toHaveLength(3);
  });

  it("includes 'removed' slots with zero counts when include_removed is true", () => {
    const payload = readBiomeDistributionFromPack(
      makeBiomesData(),
      makePack(),
      true,
    ) as BiomeDistributionPayload;
    expect(payload.biomes).toHaveLength(4);
    const removed = payload.biomes.find((b) => b.name === "removed");
    expect(removed).toBeDefined();
    expect(removed?.cells_count).toBe(0);
    expect(removed?.area).toBe(0);
    expect(removed?.burgs_count).toBe(0);
    expect(removed?.percentage).toBe(0);
    // Still sorted by cells_count desc; the removed slot ties at 0 with none
    // other, so it comes last — tie-break would be by id.
    expect(payload.biomes[payload.biomes.length - 1]?.name).toBe("removed");
  });

  it("handles a zero-cell pack (total_cells=0, all percentages 0)", () => {
    const pack: BiomeDistributionPackLike = {
      burgs: [],
      cells: { biome: [], area: [] },
    };
    const payload = readBiomeDistributionFromPack(
      makeBiomesData(),
      pack,
      false,
    ) as BiomeDistributionPayload;
    expect(payload.total_cells).toBe(0);
    for (const b of payload.biomes) {
      expect(b.cells_count).toBe(0);
      expect(b.percentage).toBe(0);
      expect(b.burgs_count).toBe(0);
    }
  });

  it("sort is stable on id ascending when cells_count ties", () => {
    // All cells belong to biome 5 (unknown to biomesData) — biomes listed
    // tie at 0 cells and should fall back to ascending id order.
    const biomesData: BiomeDistributionBiomesData = {
      i: [3, 1, 2],
      name: ["Three", "One", "Two"],
      color: ["#333", "#111", "#222"],
    };
    const pack: BiomeDistributionPackLike = {
      burgs: [],
      cells: { biome: [5, 5, 5], area: [1, 1, 1] },
    };
    const payload = readBiomeDistributionFromPack(
      biomesData,
      pack,
      false,
    ) as BiomeDistributionPayload;
    expect(payload.biomes.map((b) => b.i)).toEqual([1, 2, 3]);
  });

  it("returns 'not-ready' when biomesData is missing", () => {
    expect(readBiomeDistributionFromPack(undefined, makePack(), false)).toBe(
      "not-ready",
    );
    expect(
      readBiomeDistributionFromPack(
        { i: undefined } as BiomeDistributionBiomesData,
        makePack(),
        false,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.biome is missing", () => {
    expect(
      readBiomeDistributionFromPack(makeBiomesData(), undefined, false),
    ).toBe("not-ready");
    expect(
      readBiomeDistributionFromPack(
        makeBiomesData(),
        { burgs: [] } as BiomeDistributionPackLike,
        false,
      ),
    ).toBe("not-ready");
  });

  it("defaults color to null when biomesData.color is missing or non-string", () => {
    const biomesData: BiomeDistributionBiomesData = {
      i: [0, 1],
      name: ["A", "B"],
    };
    const pack: BiomeDistributionPackLike = {
      burgs: [],
      cells: { biome: [0, 1], area: [1, 1] },
    };
    const payload = readBiomeDistributionFromPack(
      biomesData,
      pack,
      false,
    ) as BiomeDistributionPayload;
    expect(payload.biomes.every((b) => b.color === null)).toBe(true);
  });

  it("coerces missing per-cell area to 0", () => {
    const pack: BiomeDistributionPackLike = {
      burgs: [],
      cells: { biome: [0, 0, 2] },
    };
    const payload = readBiomeDistributionFromPack(
      makeBiomesData(),
      pack,
      false,
    ) as BiomeDistributionPayload;
    for (const b of payload.biomes) expect(b.area).toBe(0);
  });

  it("tolerates missing pack.burgs (burgs_count = 0)", () => {
    const pack: BiomeDistributionPackLike = {
      cells: { biome: [0, 2, 2, 1], area: [1, 1, 1, 1] },
    };
    const payload = readBiomeDistributionFromPack(
      makeBiomesData(),
      pack,
      false,
    ) as BiomeDistributionPayload;
    for (const b of payload.biomes) expect(b.burgs_count).toBe(0);
  });
});

describe("get_biome_distribution tool — tool surface", () => {
  it("default invocation returns ok with sorted biomes", async () => {
    const payload: BiomeDistributionPayload = {
      total_cells: 6,
      biomes: [
        {
          i: 2,
          name: "Grassland",
          color: "#c8d68f",
          cells_count: 3,
          percentage: 50,
          area: 90,
          burgs_count: 2,
        },
      ],
    };
    const tool = createGetBiomeDistributionTool(runtimeReturning(payload));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_cells).toBe(6);
    expect(body.biomes).toHaveLength(1);
    expect(body.biomes[0].i).toBe(2);
  });

  it("accepts include_removed as true", async () => {
    let receivedFlag = false;
    const runtime: BiomeDistributionRuntime = {
      read(flag: boolean) {
        receivedFlag = flag;
        return { total_cells: 0, biomes: [] };
      },
    };
    const tool = createGetBiomeDistributionTool(runtime);
    const result = await tool.execute({ include_removed: true });
    expect(result.isError).toBeFalsy();
    expect(receivedFlag).toBe(true);
  });

  it("defaults include_removed to false when omitted", async () => {
    let receivedFlag: boolean | null = null;
    const runtime: BiomeDistributionRuntime = {
      read(flag: boolean) {
        receivedFlag = flag;
        return { total_cells: 0, biomes: [] };
      },
    };
    const tool = createGetBiomeDistributionTool(runtime);
    await tool.execute({});
    expect(receivedFlag).toBe(false);
  });

  it("rejects non-boolean include_removed", async () => {
    const tool = createGetBiomeDistributionTool(
      runtimeReturning({ total_cells: 0, biomes: [] }),
    );
    for (const bad of [
      { include_removed: "true" },
      { include_removed: 1 },
      { include_removed: 0 },
      { include_removed: {} },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/boolean/i);
    }
  });

  it("surfaces not-ready as a structured error", async () => {
    const tool = createGetBiomeDistributionTool(runtimeReturning("not-ready"));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("tolerates null / undefined input", async () => {
    const tool = createGetBiomeDistributionTool(
      runtimeReturning({ total_cells: 0, biomes: [] }),
    );
    expect((await tool.execute(null)).isError).toBeFalsy();
    expect((await tool.execute(undefined)).isError).toBeFalsy();
  });

  it("is exported as getBiomeDistributionTool with the expected schema", () => {
    expect(getBiomeDistributionTool.name).toBe("get_biome_distribution");
    expect(getBiomeDistributionTool.input_schema.type).toBe("object");
    expect(getBiomeDistributionTool.input_schema.required).toBeUndefined();
    expect(
      getBiomeDistributionTool.input_schema.properties.include_removed,
    ).toBeDefined();
  });
});

// ----- defaultBiomeDistributionRuntime integration -----

describe("defaultBiomeDistributionRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    biomesData?: unknown;
    pack?: unknown;
  };
  const originalBiomes = globalsRef.biomesData;
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.biomesData = makeBiomesData() as unknown;
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.biomesData = originalBiomes;
    globalsRef.pack = originalPack;
  });

  it("reads real biomesData + pack through the default runtime", () => {
    const result = defaultBiomeDistributionRuntime.read(false);
    expect(result).not.toBe("not-ready");
    const payload = result as BiomeDistributionPayload;
    expect(payload.total_cells).toBe(6);
    expect(payload.biomes.map((b) => b.i)).toEqual([2, 0, 1]);
  });

  it("returns 'not-ready' when biomesData is missing", async () => {
    globalsRef.biomesData = undefined;
    expect(defaultBiomeDistributionRuntime.read(false)).toBe("not-ready");
    const result = await getBiomeDistributionTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-ready' when pack.cells is missing", () => {
    globalsRef.pack = { burgs: [] } as unknown;
    expect(defaultBiomeDistributionRuntime.read(false)).toBe("not-ready");
  });

  it("include_removed toggles removed slot visibility through the tool", async () => {
    const withRemoved = await getBiomeDistributionTool.execute({
      include_removed: true,
    });
    expect(withRemoved.isError).toBeFalsy();
    const body = JSON.parse(withRemoved.content);
    expect(body.biomes).toHaveLength(4);
    expect(
      body.biomes.some((b: { name: string }) => b.name === "removed"),
    ).toBe(true);
  });
});
