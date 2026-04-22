import { describe, expect, it } from "vitest";
import {
  type CulturePackLike,
  type CultureSummary,
  type CulturesRuntime,
  createListCulturesTool,
  readCulturesFromPack,
} from "./list-cultures";

function fakeCultures(): CultureSummary[] {
  return [
    {
      i: 1,
      name: "Highlanders",
      color: "#aabbcc",
      type: "Highland",
      cells: 50,
      area: 500,
      population: 2000,
      base: 1,
      shield: "heater",
      code: "Hi",
    },
    {
      i: 2,
      name: "Coastalfolk",
      color: "#336699",
      type: "Naval",
      cells: 30,
      area: 200,
      population: 1500,
      base: 2,
      shield: "heater",
      code: "Co",
    },
  ];
}

function runtimeOf(cultures: CultureSummary[] | null): CulturesRuntime {
  return { readCultures: () => cultures };
}

describe("list_cultures tool", () => {
  it("returns the full list by default", async () => {
    const cultures = fakeCultures();
    const tool = createListCulturesTool(runtimeOf(cultures));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.cultures).toEqual(cultures);
  });

  it("honors limit/offset", async () => {
    const cultures = fakeCultures();
    const tool = createListCulturesTool(runtimeOf(cultures));
    const result = await tool.execute({ limit: 1, offset: 1 });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.cultures).toEqual(cultures.slice(1, 2));
  });

  it("rejects bad paging", async () => {
    const tool = createListCulturesTool(runtimeOf(fakeCultures()));
    for (const bad of [{ limit: 0 }, { limit: 501 }, { limit: 1.5 }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
    }
    for (const bad of [{ offset: -1 }, { offset: 1.5 }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
    }
  });

  it("errors when the map isn't ready", async () => {
    const tool = createListCulturesTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});

describe("readCulturesFromPack", () => {
  it("skips index 0 and removed, maps fields, scales population", () => {
    const pack: CulturePackLike = {
      cultures: [
        { i: 0, name: "Wildlands" },
        {
          i: 1,
          name: "Highlanders",
          color: "#abc",
          type: "Highland",
          cells: 10,
          area: 100,
          rural: 100,
          urban: 50,
          base: 1,
          shield: "heater",
          code: "Hi",
        },
        {
          i: 2,
          name: "Gone",
          removed: true,
          rural: 9999,
        },
      ],
    };
    const summaries = readCulturesFromPack(pack, 10);
    expect(summaries).toHaveLength(1);
    const [c] = summaries ?? [];
    expect(c).toEqual({
      i: 1,
      name: "Highlanders",
      color: "#abc",
      type: "Highland",
      cells: 10,
      area: 100,
      population: 1500, // (100 + 50) * 10
      base: 1,
      shield: "heater",
      code: "Hi",
    });
  });

  it("falls back to raw rural+urban when the rate is non-positive", () => {
    const pack: CulturePackLike = {
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "A", rural: 7, urban: 3 },
      ],
    };
    expect(readCulturesFromPack(pack, 0)?.[0].population).toBe(10);
    expect(readCulturesFromPack(pack, Number.NaN)?.[0].population).toBe(10);
  });

  it("returns null when pack/cultures are missing", () => {
    expect(readCulturesFromPack(undefined, 1)).toBeNull();
    expect(readCulturesFromPack({}, 1)).toBeNull();
  });

  it("preserves null for unset optional fields", () => {
    const pack: CulturePackLike = {
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Minimal" },
      ],
    };
    const [c] = readCulturesFromPack(pack, 1) ?? [];
    expect(c).toMatchObject({
      i: 1,
      name: "Minimal",
      color: null,
      type: null,
      cells: 0,
      area: 0,
      population: 0,
      base: null,
      shield: null,
      code: null,
    });
  });
});
