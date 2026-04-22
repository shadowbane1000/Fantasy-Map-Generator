import { describe, expect, it } from "vitest";
import {
  createListRiversTool,
  type RiverPackLike,
  type RiverSummary,
  type RiversRuntime,
  readRiversFromPack,
  resolveBasinRef,
} from "./list-rivers";

function fakeRivers(): RiverSummary[] {
  return [
    {
      i: 1,
      name: "Great River",
      type: "River",
      length: 500,
      discharge: 5000,
      width: 0.6,
      sourceWidth: 0.1,
      source: 10,
      mouth: 20,
      parent: 0,
      basin: 1,
      basinName: "Great River",
    },
    {
      i: 2,
      name: "Small Creek",
      type: "Stream",
      length: 50,
      discharge: 30,
      width: 0.05,
      sourceWidth: 0.01,
      source: 30,
      mouth: 15,
      parent: 1,
      basin: 1,
      basinName: "Great River",
    },
    {
      i: 3,
      name: "Lone River",
      type: "River",
      length: 200,
      discharge: 800,
      width: 0.2,
      sourceWidth: 0.05,
      source: 40,
      mouth: 50,
      parent: 0,
      basin: 3,
      basinName: "Lone River",
    },
  ];
}

function runtimeOf(rivers: RiverSummary[] | null): RiversRuntime {
  return { readRivers: () => rivers };
}

describe("list_rivers tool", () => {
  it("returns the full list by default", async () => {
    const rivers = fakeRivers();
    const tool = createListRiversTool(runtimeOf(rivers));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(3);
    expect(body.rivers).toEqual(rivers);
  });

  it("honors limit/offset", async () => {
    const rivers = fakeRivers();
    const tool = createListRiversTool(runtimeOf(rivers));
    const result = await tool.execute({ limit: 1, offset: 1 });
    const body = JSON.parse(result.content);
    expect(body.rivers).toEqual(rivers.slice(1, 2));
  });

  it("rejects invalid paging", async () => {
    const tool = createListRiversTool(runtimeOf(fakeRivers()));
    for (const bad of [{ limit: 0 }, { limit: 501 }, { limit: 1.5 }]) {
      expect((await tool.execute(bad)).isError).toBe(true);
    }
  });

  it("filters by basin id", async () => {
    const tool = createListRiversTool(runtimeOf(fakeRivers()));
    const result = await tool.execute({ basin: 1 });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.rivers.every((r: RiverSummary) => r.basin === 1)).toBe(true);
    expect(body.filters.basin).toBe(1);
  });

  it("filters by basin name (case-insensitive)", async () => {
    const tool = createListRiversTool(runtimeOf(fakeRivers()));
    const result = await tool.execute({ basin: "great river" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.filters.basin).toBe(1);
  });

  it("errors on an unresolved basin ref", async () => {
    const tool = createListRiversTool(runtimeOf(fakeRivers()));
    const result = await tool.execute({ basin: "nowhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/resolve/i);
  });

  it("filters by min_length", async () => {
    const tool = createListRiversTool(runtimeOf(fakeRivers()));
    const result = await tool.execute({ min_length: 100 });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.rivers.every((r: RiverSummary) => r.length >= 100)).toBe(true);
  });

  it("filters by min_discharge", async () => {
    const tool = createListRiversTool(runtimeOf(fakeRivers()));
    const result = await tool.execute({ min_discharge: 1000 });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.rivers[0].name).toBe("Great River");
  });

  it("errors when the map isn't ready", async () => {
    const tool = createListRiversTool(runtimeOf(null));
    expect((await tool.execute({})).isError).toBe(true);
  });

  it("rejects bad filter types", async () => {
    const tool = createListRiversTool(runtimeOf(fakeRivers()));
    for (const bad of [
      { basin: true },
      { basin: "" },
      { min_length: -1 },
      { min_length: "50" },
      { min_discharge: Number.NaN },
    ]) {
      expect((await tool.execute(bad)).isError).toBe(true);
    }
  });
});

describe("readRiversFromPack", () => {
  it("resolves basinName from the basin river", () => {
    const pack: RiverPackLike = {
      rivers: [
        {
          i: 1,
          name: "Main",
          type: "River",
          length: 100,
          discharge: 500,
          width: 0.3,
          sourceWidth: 0.05,
          source: 1,
          mouth: 2,
          parent: 0,
          basin: 1,
        },
        {
          i: 2,
          name: "Trib",
          type: "Stream",
          length: 20,
          discharge: 50,
          width: 0.05,
          sourceWidth: 0.01,
          source: 3,
          mouth: 4,
          parent: 1,
          basin: 1,
        },
      ],
    };
    const out = readRiversFromPack(pack);
    expect(out).toHaveLength(2);
    expect(out?.[1].basinName).toBe("Main");
  });

  it("returns null basinName for a missing basin id", () => {
    const pack: RiverPackLike = {
      rivers: [
        {
          i: 1,
          name: "Orphan",
          type: "River",
          basin: 99,
        },
      ],
    };
    const out = readRiversFromPack(pack);
    expect(out?.[0].basinName).toBeNull();
  });

  it("skips removed rivers", () => {
    const pack: RiverPackLike = {
      rivers: [
        { i: 1, name: "A" },
        { i: 2, name: "B", removed: true },
      ],
    };
    const out = readRiversFromPack(pack);
    expect(out).toHaveLength(1);
    expect(out?.[0].i).toBe(1);
  });

  it("returns null when pack/rivers are missing", () => {
    expect(readRiversFromPack(undefined)).toBeNull();
    expect(readRiversFromPack({})).toBeNull();
  });
});

describe("resolveBasinRef", () => {
  const rivers = fakeRivers();

  it("accepts numeric ids that exist", () => {
    expect(resolveBasinRef(rivers, 1)).toBe(1);
    expect(resolveBasinRef(rivers, 99)).toBeNull();
  });
  it("accepts case-insensitive names", () => {
    expect(resolveBasinRef(rivers, "LONE RIVER")).toBe(3);
    expect(resolveBasinRef(rivers, "nowhere")).toBeNull();
  });
  it("rejects invalid inputs", () => {
    expect(resolveBasinRef(rivers, -1)).toBeNull();
    expect(resolveBasinRef(rivers, 1.5)).toBeNull();
    expect(resolveBasinRef(rivers, "")).toBeNull();
    expect(resolveBasinRef(rivers, "   ")).toBeNull();
    expect(resolveBasinRef(rivers, null as unknown as number)).toBeNull();
  });
});
