import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawZone } from "./_shared";
import {
  createFindZonesByTypeTool,
  DEFAULT_FIND_ZONES_BY_TYPE_LIMIT,
  defaultFindZonesByTypeRuntime,
  type FindZonesByTypeResult,
  type FindZonesByTypeRuntime,
  findZonesByTypeInPack,
  findZonesByTypeTool,
  MAX_FIND_ZONES_BY_TYPE_LIMIT,
} from "./find-zones-by-type";

interface FakePack {
  zones: Array<RawZone | null | undefined>;
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findZonesByTypeInPack>[0];
}

function makePack(): FakePack {
  //   i=0: type=Invasion (real zone — zone ids start at 0, not placeholder)
  //   i=1: type=invasion (case variant)
  //   i=2: type=INVASION (case variant, cells count 60)
  //   i=3: type=Disease (different type)
  //   i=4: type=Crusade (no cells array)
  //   i=5: type=Invasion removed (skipped)
  //   i=6: type=Invasion hidden (included, hidden=true)
  //   i=7: missing type (never matches)
  //   i=8: non-string type (never matches)
  //   i=9: type=Invasion (cells array for cells_count)
  return {
    zones: [
      {
        i: 0,
        name: "Rookwood Invasion",
        type: "Invasion",
        color: "#ff0000",
        cells: [1, 2, 3, 4],
        hidden: false,
      },
      {
        i: 1,
        name: "Southern Incursion",
        type: "invasion",
        color: "#ff3333",
        cells: [10, 11],
        hidden: false,
      },
      {
        i: 2,
        name: "Third Invasion",
        type: "INVASION",
        color: "#cc0000",
        cells: new Array(60).fill(0).map((_, idx) => 100 + idx),
        hidden: false,
      },
      {
        i: 3,
        name: "Black Plague",
        type: "Disease",
        color: "#550055",
        cells: [200, 201, 202],
        hidden: false,
      },
      {
        i: 4,
        name: "Crusade of Light",
        type: "Crusade",
        color: "#ffff00",
        hidden: false,
      },
      {
        i: 5,
        name: "Cancelled Invasion",
        type: "Invasion",
        color: "#aa0000",
        cells: [1],
        hidden: false,
        removed: true,
      },
      {
        i: 6,
        name: "Hidden Invasion",
        type: "Invasion",
        color: "#990000",
        cells: [50, 51],
        hidden: true,
      },
      {
        i: 7,
        name: "Untyped Zone",
        color: "#ccc",
        cells: [300],
        hidden: false,
      } as unknown as RawZone,
      {
        i: 8,
        name: "Bad-type Zone",
        type: 42 as unknown as string,
        color: "#ddd",
        cells: [400],
        hidden: false,
      },
      {
        i: 9,
        name: "Late Invasion",
        type: "Invasion",
        color: "#bb0000",
        cells: [500, 501, 502],
        hidden: false,
      },
      null as unknown as RawZone, // tolerated null slot
    ],
  };
}

function runtimeReturning(
  result: FindZonesByTypeResult,
): FindZonesByTypeRuntime {
  return { find: () => result };
}

describe("find_zones_by_type — pure scanner", () => {
  it("matches zones by type case-insensitively (all invasions, any casing)", () => {
    const result = findZonesByTypeInPack(asPack(makePack()), {
      type: "invasion",
      limit: 100,
    }) as {
      type: string;
      zones: Array<{ i: number; type: string | null }>;
      count: number;
    };
    const ids = new Set(result.zones.map((z) => z.i));
    // 0 (Invasion) + 1 (invasion) + 2 (INVASION) + 6 (hidden but matches) + 9 (Invasion);
    // 5 is removed, 7 is untyped, 8 is non-string
    expect(ids).toEqual(new Set([0, 1, 2, 6, 9]));
    expect(result.count).toBe(5);
    expect(result.type).toBe("invasion");
  });

  it("preserves the original casing of each zone's type in the hit", () => {
    const result = findZonesByTypeInPack(asPack(makePack()), {
      type: "invasion",
      limit: 100,
    }) as {
      zones: Array<{ i: number; type: string | null }>;
    };
    const byId = new Map(result.zones.map((z) => [z.i, z.type]));
    expect(byId.get(0)).toBe("Invasion");
    expect(byId.get(1)).toBe("invasion");
    expect(byId.get(2)).toBe("INVASION");
    expect(byId.get(6)).toBe("Invasion");
    expect(byId.get(9)).toBe("Invasion");
  });

  it("includes zone with i === 0 (non-contiguous ids — 0 is a real zone)", () => {
    const result = findZonesByTypeInPack(asPack(makePack()), {
      type: "invasion",
      limit: 100,
    }) as { zones: Array<{ i: number }> };
    const ids = new Set(result.zones.map((z) => z.i));
    expect(ids.has(0)).toBe(true);
  });

  it("skips removed zones", () => {
    const result = findZonesByTypeInPack(asPack(makePack()), {
      type: "invasion",
      limit: 100,
    }) as { zones: Array<{ i: number }> };
    const ids = new Set(result.zones.map((z) => z.i));
    expect(ids.has(5)).toBe(false);
  });

  it("tolerates null entries in the zones array", () => {
    const result = findZonesByTypeInPack(asPack(makePack()), {
      type: "disease",
      limit: 100,
    }) as { zones: Array<{ i: number }>; count: number };
    expect(result.zones.map((z) => z.i)).toEqual([3]);
    expect(result.count).toBe(1);
  });

  it("does not match zones with missing or non-string type", () => {
    const result = findZonesByTypeInPack(asPack(makePack()), {
      type: "invasion",
      limit: 100,
    }) as { zones: Array<{ i: number }> };
    const ids = new Set(result.zones.map((z) => z.i));
    expect(ids.has(7)).toBe(false); // missing type
    expect(ids.has(8)).toBe(false); // non-string type
  });

  it("reports cells_count from zone.cells array length (0 when missing)", () => {
    const result = findZonesByTypeInPack(asPack(makePack()), {
      type: "crusade",
      limit: 100,
    }) as {
      zones: Array<{ i: number; cells_count: number }>;
    };
    expect(result.zones).toEqual([
      expect.objectContaining({ i: 4, cells_count: 0 }),
    ]);
  });

  it("reports cells_count matching the actual cells array length", () => {
    const result = findZonesByTypeInPack(asPack(makePack()), {
      type: "invasion",
      limit: 100,
    }) as {
      zones: Array<{ i: number; cells_count: number }>;
    };
    const byId = new Map(result.zones.map((z) => [z.i, z.cells_count]));
    expect(byId.get(0)).toBe(4);
    expect(byId.get(1)).toBe(2);
    expect(byId.get(2)).toBe(60);
    expect(byId.get(6)).toBe(2);
    expect(byId.get(9)).toBe(3);
  });

  it("echoes hidden flag for each matching zone", () => {
    const result = findZonesByTypeInPack(asPack(makePack()), {
      type: "invasion",
      limit: 100,
    }) as {
      zones: Array<{ i: number; hidden: boolean }>;
    };
    const byId = new Map(result.zones.map((z) => [z.i, z.hidden]));
    expect(byId.get(0)).toBe(false);
    expect(byId.get(6)).toBe(true);
  });

  it("limit truncates zones but count reports the full total", () => {
    const result = findZonesByTypeInPack(asPack(makePack()), {
      type: "invasion",
      limit: 2,
    }) as { zones: Array<{ i: number }>; count: number };
    expect(result.zones.length).toBe(2);
    expect(result.count).toBe(5);
  });

  it("returns empty zones and count 0 when no zone matches", () => {
    const result = findZonesByTypeInPack(asPack(makePack()), {
      type: "eruption",
      limit: 100,
    }) as { type: string; zones: unknown[]; count: number };
    expect(result.zones).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.type).toBe("eruption");
  });

  it("returns 'not-ready' when pack is undefined", () => {
    expect(
      findZonesByTypeInPack(undefined, {
        type: "invasion",
        limit: 100,
      }),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.zones is missing", () => {
    expect(
      findZonesByTypeInPack(
        {} as unknown as Parameters<typeof findZonesByTypeInPack>[0],
        { type: "invasion", limit: 100 },
      ),
    ).toBe("not-ready");
  });
});

describe("find_zones_by_type — tool surface", () => {
  function realRuntime(): FindZonesByTypeRuntime {
    const pack = asPack(makePack());
    return { find: (q) => findZonesByTypeInPack(pack, q) };
  }

  it("rejects missing type", async () => {
    const tool = createFindZonesByTypeTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/type is required/i);
  });

  it("rejects non-string type", async () => {
    const tool = createFindZonesByTypeTool(realRuntime());
    for (const bad of [{ type: 42 }, { type: true }, { type: [] }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/must be a string/i);
    }
  });

  it("rejects empty / whitespace-only type", async () => {
    const tool = createFindZonesByTypeTool(realRuntime());
    for (const input of [{ type: "" }, { type: "   " }, { type: "\t\n" }]) {
      const r = await tool.execute(input);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/non-empty string/i);
    }
  });

  it("rejects out-of-range limit", async () => {
    const tool = createFindZonesByTypeTool(realRuntime());
    for (const bad of [
      { type: "invasion", limit: 0 },
      { type: "invasion", limit: MAX_FIND_ZONES_BY_TYPE_LIMIT + 1 },
      { type: "invasion", limit: 1.5 },
      { type: "invasion", limit: "10" },
      { type: "invasion", limit: -1 },
      { type: "invasion", limit: Number.NaN },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit/i);
    }
  });

  it("accepts limit at the boundaries (1 and MAX)", async () => {
    const tool = createFindZonesByTypeTool(realRuntime());
    const r1 = await tool.execute({ type: "invasion", limit: 1 });
    expect(r1.isError).toBeFalsy();
    const b1 = JSON.parse(r1.content);
    expect(b1.zones.length).toBe(1);
    expect(b1.count).toBe(5);
    const r2 = await tool.execute({
      type: "invasion",
      limit: MAX_FIND_ZONES_BY_TYPE_LIMIT,
    });
    expect(r2.isError).toBeFalsy();
    expect(JSON.parse(r2.content).zones.length).toBe(5);
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindZonesByTypeTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ type: "invasion" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns ok with invasion results (case-insensitive)", async () => {
    const tool = createFindZonesByTypeTool(realRuntime());
    const result = await tool.execute({ type: "INVASION" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("invasion");
    expect(new Set(body.zones.map((z: { i: number }) => z.i))).toEqual(
      new Set([0, 1, 2, 6, 9]),
    );
    expect(body.count).toBe(5);
  });

  it("honors limit end-to-end", async () => {
    const tool = createFindZonesByTypeTool(realRuntime());
    const result = await tool.execute({ type: "invasion", limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.zones.length).toBe(2);
    expect(body.count).toBe(5);
  });

  it("returns empty zones for a type with no matches", async () => {
    const tool = createFindZonesByTypeTool(realRuntime());
    const result = await tool.execute({ type: "eruption" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.zones).toEqual([]);
    expect(body.count).toBe(0);
    expect(body.type).toBe("eruption");
  });

  it("is exported as findZonesByTypeTool with the expected schema", () => {
    expect(findZonesByTypeTool.name).toBe("find_zones_by_type");
    expect(findZonesByTypeTool.input_schema.type).toBe("object");
    expect(findZonesByTypeTool.input_schema.required).toEqual(["type"]);
    expect(findZonesByTypeTool.input_schema.properties.type).toBeDefined();
    expect(findZonesByTypeTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_ZONES_BY_TYPE_LIMIT).toBe(10000);
    expect(MAX_FIND_ZONES_BY_TYPE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindZonesByTypeRuntime integration -----

describe("defaultFindZonesByTypeRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads the real pack via default runtime for a typed query", () => {
    const result = defaultFindZonesByTypeRuntime.find({
      type: "invasion",
      limit: 100,
    }) as { zones: Array<{ i: number }>; count: number };
    expect(new Set(result.zones.map((z) => z.i))).toEqual(
      new Set([0, 1, 2, 6, 9]),
    );
    expect(result.count).toBe(5);
  });

  it("reads the real pack via default runtime and matches disease", () => {
    const result = defaultFindZonesByTypeRuntime.find({
      type: "disease",
      limit: 100,
    }) as { zones: Array<{ i: number }>; count: number };
    expect(result.zones.map((z) => z.i)).toEqual([3]);
    expect(result.count).toBe(1);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindZonesByTypeRuntime.find({
        type: "invasion",
        limit: 100,
      }),
    ).toBe("not-ready");
    const result = await findZonesByTypeTool.execute({ type: "invasion" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
