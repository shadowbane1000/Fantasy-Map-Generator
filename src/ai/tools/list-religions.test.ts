import { describe, expect, it } from "vitest";
import {
  createListReligionsTool,
  type ReligionPackLike,
  type ReligionSummary,
  type ReligionsRuntime,
  readReligionsFromPack,
} from "./list-religions";

function fakeReligions(): ReligionSummary[] {
  return [
    {
      i: 1,
      name: "Old Faith",
      type: "Folk",
      form: "Shamanism",
      deity: "Spirits",
      color: "#336699",
      culture: "Highlanders",
      cultureId: 1,
      cells: 40,
      area: 300,
      population: 5000,
      expansion: "culture",
      code: "OF",
    },
    {
      i: 2,
      name: "Sun Cult",
      type: "Organized",
      form: "Monotheism",
      deity: "Helios",
      color: "#ffcc00",
      culture: "Coastalfolk",
      cultureId: 2,
      cells: 60,
      area: 500,
      population: 15000,
      expansion: "global",
      code: "SC",
    },
  ];
}

function runtimeOf(list: ReligionSummary[] | null): ReligionsRuntime {
  return { readReligions: () => list };
}

describe("list_religions tool", () => {
  it("returns the full list by default", async () => {
    const list = fakeReligions();
    const tool = createListReligionsTool(runtimeOf(list));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.religions).toEqual(list);
  });

  it("honors limit/offset", async () => {
    const list = fakeReligions();
    const tool = createListReligionsTool(runtimeOf(list));
    const result = await tool.execute({ limit: 1, offset: 1 });
    const body = JSON.parse(result.content);
    expect(body.religions).toEqual(list.slice(1, 2));
  });

  it("rejects invalid paging", async () => {
    const tool = createListReligionsTool(runtimeOf(fakeReligions()));
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
    const tool = createListReligionsTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});

describe("readReligionsFromPack", () => {
  it("skips index 0 and removed, resolves culture, scales population", () => {
    const pack: ReligionPackLike = {
      religions: [
        { i: 0, name: "No religion" },
        {
          i: 1,
          name: "Old Faith",
          type: "Folk",
          form: "Shamanism",
          deity: "Spirits",
          color: "#abc",
          culture: 1,
          cells: 10,
          area: 100,
          rural: 50,
          urban: 25,
          expansion: "culture",
          code: "OF",
        },
        { i: 2, name: "Gone", removed: true, rural: 9999 },
      ],
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Highlanders" },
      ],
    };
    const out = readReligionsFromPack(pack, 10);
    expect(out).toHaveLength(1);
    const [r] = out ?? [];
    expect(r).toEqual({
      i: 1,
      name: "Old Faith",
      type: "Folk",
      form: "Shamanism",
      deity: "Spirits",
      color: "#abc",
      culture: "Highlanders",
      cultureId: 1,
      cells: 10,
      area: 100,
      population: 750, // 75 * 10
      expansion: "culture",
      code: "OF",
    });
  });

  it("falls back to raw rural+urban when rate is non-positive", () => {
    const pack: ReligionPackLike = {
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "A", rural: 7, urban: 3, culture: 0 },
      ],
      cultures: [{ i: 0, name: "Wildlands" }],
    };
    expect(readReligionsFromPack(pack, 0)?.[0].population).toBe(10);
    expect(readReligionsFromPack(pack, Number.NaN)?.[0].population).toBe(10);
  });

  it("returns null when pack/religions are missing", () => {
    expect(readReligionsFromPack(undefined, 1)).toBeNull();
    expect(readReligionsFromPack({}, 1)).toBeNull();
  });

  it("maps missing fields to null", () => {
    const pack: ReligionPackLike = {
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Bare", culture: 999 },
      ],
    };
    const [r] = readReligionsFromPack(pack, 1) ?? [];
    expect(r).toMatchObject({
      i: 1,
      name: "Bare",
      type: null,
      form: null,
      deity: null,
      color: null,
      culture: null,
      cultureId: 999,
      expansion: null,
      code: null,
    });
  });
});
