import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type BiomeInfo,
  type BiomeInfoBiomesData,
  type BiomeInfoPackLike,
  type BiomeInfoRuntime,
  createGetBiomeInfoTool,
  defaultBiomeInfoRuntime,
  getBiomeInfoTool,
  type ReadBiomeInfoResult,
  readBiomeInfoFromPack,
} from "./get-biome-info";

function makeBiomesData(): BiomeInfoBiomesData {
  return {
    i: [0, 1, 2, 3],
    name: ["Marine", "Hot desert", "Grassland", "removed"],
    color: ["#466eab", "#fbe79f", "#c8d68f", "#000000"],
    habitability: [0, 4, 30, 0],
    iconsDensity: [0, 3, 120, 0],
    cost: [10, 200, 50, 0],
    icons: [[], ["dune", "dune", "cactus"], ["grass", "grass"], []],
  };
}

function makePack(): BiomeInfoPackLike {
  // 6 cells: #0,1 Marine (biome 0); #2,3,4 Grassland (biome 2); #5 Hot desert.
  const biome = [0, 0, 2, 2, 2, 1];
  const area = [10, 10, 20, 30, 40, 100];
  const pop = [0, 0, 5, 10, 15, 2];
  return {
    burgs: [
      { i: 0, cell: 0 }, // placeholder (ignored)
      { i: 1, cell: 2 }, // Grassland burg
      { i: 2, cell: 3 }, // Grassland burg
      { i: 3, cell: 3, removed: true }, // removed
      { i: 4, cell: 5 }, // Hot desert burg
      { i: 5, cell: 0 }, // Marine burg (unusual but allowed)
    ],
    cells: { biome, area, pop },
  };
}

function runtimeReturning(result: ReadBiomeInfoResult): BiomeInfoRuntime {
  return { readBiome: () => result };
}

describe("get_biome_info tool — pure / seam", () => {
  it("returns all fields for a populated land biome", async () => {
    const biomesData = makeBiomesData();
    const pack = makePack();
    const info = readBiomeInfoFromPack(biomesData, pack, 1000, 2);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const tool = createGetBiomeInfoTool(runtimeReturning(info));
    const result = await tool.execute({ biome: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.i).toBe(2);
    expect(body.name).toBe("Grassland");
    expect(body.color).toBe("#c8d68f");
    expect(body.habitability).toBe(30);
    expect(body.iconsDensity).toBe(120);
    expect(body.icons).toEqual(["grass", "grass"]);
    expect(body.cost).toBe(50);
    expect(body.cells_count).toBe(3);
    expect(body.area).toBe(90); // 20 + 30 + 40
    // pop sum 5 + 10 + 15 = 30, * 1000 = 30000.
    expect(body.population_total).toBe(30000);
    // burgs on Grassland cells (cell 2, 3) minus the removed one = 2.
    expect(body.burgs_count).toBe(2);
  });

  it("supports Marine (biome 0) as a valid ref", () => {
    const info = readBiomeInfoFromPack(
      makeBiomesData(),
      makePack(),
      1000,
      0,
    ) as BiomeInfo;
    expect(info.i).toBe(0);
    expect(info.name).toBe("Marine");
    expect(info.cells_count).toBe(2);
    expect(info.area).toBe(20);
    expect(info.population_total).toBe(0);
    // One placeholder (ignored) + one real burg on cell 0.
    expect(info.burgs_count).toBe(1);
  });

  it("resolves refs case-insensitively by current biome name", () => {
    const info = readBiomeInfoFromPack(
      makeBiomesData(),
      makePack(),
      1,
      "grassland",
    ) as BiomeInfo;
    expect(info.i).toBe(2);
  });

  it("rejects the 'removed' sentinel as a name or id lookup", () => {
    const biomesData = makeBiomesData();
    const pack = makePack();
    // biome id 3 is marked name='removed'.
    expect(readBiomeInfoFromPack(biomesData, pack, 1, 3)).toBe("not-found");
    expect(readBiomeInfoFromPack(biomesData, pack, 1, "removed")).toBe(
      "not-found",
    );
  });

  it("returns 'not-ready' when biomesData is missing", () => {
    expect(readBiomeInfoFromPack(undefined, makePack(), 1, 0)).toBe(
      "not-ready",
    );
    expect(
      readBiomeInfoFromPack(
        { i: undefined } as BiomeInfoBiomesData,
        makePack(),
        1,
        0,
      ),
    ).toBe("not-ready");
  });

  it("returns 'not-found' for an unknown id / name", () => {
    const biomesData = makeBiomesData();
    const pack = makePack();
    expect(readBiomeInfoFromPack(biomesData, pack, 1, 99)).toBe("not-found");
    expect(readBiomeInfoFromPack(biomesData, pack, 1, "nonexistent")).toBe(
      "not-found",
    );
  });

  it("icons field is always a flat string[] (defaults to [])", () => {
    const biomesData = makeBiomesData();
    // Delete icons for biome k=0.
    if (biomesData.icons) biomesData.icons[0] = undefined;
    const info = readBiomeInfoFromPack(
      biomesData,
      makePack(),
      1,
      0,
    ) as BiomeInfo;
    expect(info.icons).toEqual([]);
  });

  it("color defaults to null when biomesData.color is missing", () => {
    const biomesData = makeBiomesData();
    biomesData.color = undefined;
    const info = readBiomeInfoFromPack(
      biomesData,
      makePack(),
      1,
      2,
    ) as BiomeInfo;
    expect(info.color).toBeNull();
  });

  it("area/pop total to 0 when pack.cells is absent", () => {
    const info = readBiomeInfoFromPack(
      makeBiomesData(),
      { burgs: [] } as BiomeInfoPackLike,
      1000,
      2,
    ) as BiomeInfo;
    expect(info.cells_count).toBe(0);
    expect(info.area).toBe(0);
    expect(info.population_total).toBe(0);
    expect(info.burgs_count).toBe(0);
  });

  it("tool rejects non-integer / missing biome ref via parseBiomeRef", async () => {
    const tool = createGetBiomeInfoTool(runtimeReturning("not-found"));
    for (const bad of [
      {},
      { biome: 1.5 },
      { biome: null },
      { biome: "" },
      { biome: -1 },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /non-negative integer id or a non-empty name/i,
      );
    }
  });

  it("tool surfaces not-found with the ref quoted", async () => {
    const tool = createGetBiomeInfoTool(runtimeReturning("not-found"));
    const result = await tool.execute({ biome: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No biome found/i);
    expect(JSON.parse(result.content).error).toMatch(/"foo"/);
  });

  it("tool surfaces not-ready as a structured error", async () => {
    const tool = createGetBiomeInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ biome: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/i);
  });

  it("is exported as getBiomeInfoTool with the expected schema", () => {
    expect(getBiomeInfoTool.name).toBe("get_biome_info");
    expect(getBiomeInfoTool.input_schema.type).toBe("object");
    expect(getBiomeInfoTool.input_schema.required).toEqual(["biome"]);
    expect(getBiomeInfoTool.input_schema.properties.biome).toBeDefined();
  });
});

// ----- defaultBiomeInfoRuntime integration -----

describe("defaultBiomeInfoRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    biomesData?: unknown;
    pack?: unknown;
    populationRate?: unknown;
  };
  const originalBiomes = globalsRef.biomesData;
  const originalPack = globalsRef.pack;
  const originalRate = globalsRef.populationRate;

  beforeEach(() => {
    globalsRef.biomesData = makeBiomesData() as unknown;
    globalsRef.pack = makePack() as unknown;
    globalsRef.populationRate = 1000;
  });

  afterEach(() => {
    globalsRef.biomesData = originalBiomes;
    globalsRef.pack = originalPack;
    globalsRef.populationRate = originalRate;
  });

  it("reads a real biomesData entry through the default runtime", () => {
    const info = defaultBiomeInfoRuntime.readBiome(2);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const bi = info as BiomeInfo;
    expect(bi.i).toBe(2);
    expect(bi.name).toBe("Grassland");
    expect(bi.cells_count).toBe(3);
    expect(bi.population_total).toBe(30000);
  });

  it("returns 'not-ready' when biomesData is missing", async () => {
    globalsRef.biomesData = undefined;
    expect(defaultBiomeInfoRuntime.readBiome(0)).toBe("not-ready");
    const result = await getBiomeInfoTool.execute({ biome: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/i);
  });

  it("returns 'not-found' for unknown biome id", async () => {
    expect(defaultBiomeInfoRuntime.readBiome(999)).toBe("not-found");
    const result = await getBiomeInfoTool.execute({ biome: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No biome found/i);
  });

  it("defaults populationRate to 1 when it is missing", () => {
    globalsRef.populationRate = undefined;
    const info = defaultBiomeInfoRuntime.readBiome(2) as BiomeInfo;
    // pop sum = 30; rate defaulted to 1 ⇒ 30.
    expect(info.population_total).toBe(30);
  });
});
