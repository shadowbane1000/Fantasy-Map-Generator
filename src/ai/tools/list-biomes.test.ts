import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type BiomeSummary,
  type BiomesData,
  type BiomesRuntime,
  createListBiomesTool,
  listBiomesTool,
  readBiomesFromPack,
} from "./list-biomes";

function fullBiomesData(): BiomesData {
  return {
    i: [0, 1, 2],
    name: ["Marine", "Hot desert", "Grassland"],
    color: ["#466eab", "#fbe79f", "#c8d68f"],
    habitability: [0, 4, 30],
    iconsDensity: [0, 3, 120],
    cost: [10, 200, 50],
    cells: [100, 40, 300],
    area: [1000, 400, 2400],
    rural: [0, 50, 500],
    urban: [0, 5, 200],
  };
}

function runtimeOf(summaries: BiomeSummary[] | null): BiomesRuntime {
  return { readBiomes: () => summaries };
}

describe("list_biomes tool", () => {
  it("returns all biomes with full fields", async () => {
    const data = fullBiomesData();
    const summaries = readBiomesFromPack(data, 1000);
    const tool = createListBiomesTool(runtimeOf(summaries));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(3);
    expect(body.biomes[0]).toMatchObject({
      i: 0,
      name: "Marine",
      color: "#466eab",
      habitability: 0,
      iconsDensity: 0,
      cost: 10,
      cells: 100,
      area: 1000,
      rural: 0,
      urban: 0,
      population: 0,
    });
    expect(body.biomes[2]).toMatchObject({
      i: 2,
      name: "Grassland",
      rural: 500,
      urban: 200,
      population: 700_000,
    });
  });

  it("honors pagination", async () => {
    const data = fullBiomesData();
    const summaries = readBiomesFromPack(data, 1);
    const tool = createListBiomesTool(runtimeOf(summaries));
    const result = await tool.execute({ limit: 1, offset: 1 });
    const body = JSON.parse(result.content);
    expect(body.biomes).toHaveLength(1);
    expect(body.biomes[0]?.name).toBe("Hot desert");
  });

  it("returns not-ready when readBiomes returns null", async () => {
    const tool = createListBiomesTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/i);
  });
});

describe("readBiomesFromPack", () => {
  it("returns null when biomesData is missing or malformed", () => {
    expect(readBiomesFromPack(undefined, 1)).toBeNull();
    expect(readBiomesFromPack({} as BiomesData, 1)).toBeNull();
  });

  it("returns empty array when biomesData.i is empty", () => {
    const data: BiomesData = {
      i: [],
      name: [],
      color: [],
      habitability: [],
      iconsDensity: [],
      cost: [],
    };
    expect(readBiomesFromPack(data, 1)).toEqual([]);
  });

  it("defaults missing cells/area/rural/urban to 0", () => {
    const data: BiomesData = {
      i: [0],
      name: ["Marine"],
      color: ["#466eab"],
      habitability: [0],
      iconsDensity: [0],
      cost: [10],
    };
    expect(readBiomesFromPack(data, 1)).toEqual([
      {
        i: 0,
        name: "Marine",
        color: "#466eab",
        habitability: 0,
        iconsDensity: 0,
        cost: 10,
        cells: 0,
        area: 0,
        rural: 0,
        urban: 0,
        population: 0,
      },
    ]);
  });

  it("scales population by populationRate", () => {
    const data: BiomesData = {
      ...fullBiomesData(),
      rural: [0, 10, 0],
      urban: [0, 0, 0],
    };
    const result = readBiomesFromPack(data, 500);
    expect(result?.[1]?.population).toBe(5000);
  });

  it("falls back to rate 1 for invalid populationRate", () => {
    const data: BiomesData = {
      ...fullBiomesData(),
      rural: [0, 100, 0],
      urban: [0, 0, 0],
    };
    const result = readBiomesFromPack(data, 0);
    expect(result?.[1]?.population).toBe(100);
  });
});

describe("defaultBiomesRuntime (integration)", () => {
  const originalBiomes = (globalThis as { biomesData?: unknown }).biomesData;
  const originalRate = (globalThis as { populationRate?: unknown })
    .populationRate;

  beforeEach(() => {
    (globalThis as { biomesData?: unknown }).biomesData = fullBiomesData();
    (globalThis as { populationRate?: unknown }).populationRate = 1;
  });

  afterEach(() => {
    (globalThis as { biomesData?: unknown }).biomesData = originalBiomes;
    (globalThis as { populationRate?: unknown }).populationRate = originalRate;
  });

  it("reads biomesData from globalThis via the default runtime", async () => {
    const result = await listBiomesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(3);
    expect(body.biomes.map((b: BiomeSummary) => b.name)).toEqual([
      "Marine",
      "Hot desert",
      "Grassland",
    ]);
  });
});
