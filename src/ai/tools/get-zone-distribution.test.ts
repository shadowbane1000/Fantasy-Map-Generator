import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawZone } from "./_shared";
import {
  createGetZoneDistributionTool,
  defaultZoneDistributionRuntime,
  getZoneDistributionTool,
  readZoneDistributionFromPack,
  UNTYPED_ZONE_BUCKET,
  type ZoneDistribution,
  type ZoneDistributionPackLike,
  type ZoneDistributionRuntime,
} from "./get-zone-distribution";

interface FakePack {
  zones: Array<RawZone | null | undefined>;
}

function asPack(p: FakePack): ZoneDistributionPackLike {
  return p as unknown as ZoneDistributionPackLike;
}

function makePack(): FakePack {
  // Zones:
  //   i=0: Invasion, 4 cells (zone ids start at 0 — real zone)
  //   i=1: Invasion, 2 cells
  //   i=2: Disease, 3 cells
  //   i=3: Disease, 1 cell
  //   i=4: Crusade, no cells array
  //   i=5: Invasion, 5 cells, removed=true (skipped)
  //   i=6: invasion (lower-case), 2 cells — separate bucket (no canonicalization)
  //   i=7: missing type — "untyped"
  //   i=8: non-string type — "untyped"
  //   i=9: empty string type — "untyped"
  //   i=10: whitespace-only type — "untyped"
  //   i=11: Invasion, 1 cell
  return {
    zones: [
      {
        i: 0,
        name: "Rookwood",
        type: "Invasion",
        cells: [1, 2, 3, 4],
        hidden: false,
      },
      {
        i: 1,
        name: "Southern",
        type: "Invasion",
        cells: [10, 11],
        hidden: false,
      },
      {
        i: 2,
        name: "Plague A",
        type: "Disease",
        cells: [20, 21, 22],
        hidden: false,
      },
      {
        i: 3,
        name: "Plague B",
        type: "Disease",
        cells: [30],
        hidden: false,
      },
      { i: 4, name: "Crusade", type: "Crusade", hidden: false },
      {
        i: 5,
        name: "Cancelled",
        type: "Invasion",
        cells: [100, 101, 102, 103, 104],
        removed: true,
      },
      {
        i: 6,
        name: "lower",
        type: "invasion",
        cells: [50, 51],
        hidden: false,
      },
      {
        i: 7,
        name: "Orphan",
        cells: [60],
        hidden: false,
      } as unknown as RawZone,
      {
        i: 8,
        name: "Bad",
        type: 42 as unknown as string,
        cells: [70],
        hidden: false,
      },
      {
        i: 9,
        name: "Empty",
        type: "",
        cells: [80, 81],
        hidden: false,
      },
      {
        i: 10,
        name: "Blank",
        type: "   ",
        cells: [90],
        hidden: false,
      },
      {
        i: 11,
        name: "Another Invasion",
        type: "Invasion",
        cells: [200],
        hidden: false,
      },
      null as unknown as RawZone, // tolerated null slot
      undefined as unknown as RawZone, // tolerated undefined slot
    ],
  };
}

function runtimeReturning(
  result: ZoneDistribution | "not-ready",
): ZoneDistributionRuntime {
  return { readDistribution: () => result };
}

function realRuntime(): ZoneDistributionRuntime {
  const pack = asPack(makePack());
  return {
    readDistribution: () => readZoneDistributionFromPack(pack),
  };
}

describe("get_zone_distribution — pure aggregator", () => {
  it("skips removed zones and null / undefined slots", () => {
    const result = readZoneDistributionFromPack(
      asPack(makePack()),
    ) as ZoneDistribution;
    // Active: 0,1,2,3,4,6,7,8,9,10,11 = 11. 5 removed. Two null/undef slots.
    expect(result.total_zones).toBe(11);
  });

  it("includes zone with i === 0 (zone ids are non-contiguous, 0 is real)", () => {
    const result = readZoneDistributionFromPack(
      asPack({
        zones: [
          { i: 0, type: "Invasion", cells: [1, 2], hidden: false },
          { i: 1, type: "Disease", cells: [3], hidden: false },
        ],
      }),
    ) as ZoneDistribution;
    expect(result.total_zones).toBe(2);
    const byType = new Map(result.by_type.map((e) => [e.type, e]));
    expect(byType.get("Invasion")?.count).toBe(1);
    expect(byType.get("Disease")?.count).toBe(1);
  });

  it("preserves casing — 'Invasion' and 'invasion' are separate buckets", () => {
    const result = readZoneDistributionFromPack(
      asPack(makePack()),
    ) as ZoneDistribution;
    const byType = new Map(result.by_type.map((e) => [e.type, e]));
    // Zones 0,1,11 → "Invasion" (count 3); zone 6 → "invasion" (count 1)
    expect(byType.get("Invasion")?.count).toBe(3);
    expect(byType.get("invasion")?.count).toBe(1);
  });

  it("buckets missing / non-string / empty / whitespace types as 'untyped'", () => {
    const result = readZoneDistributionFromPack(
      asPack(makePack()),
    ) as ZoneDistribution;
    const byType = new Map(result.by_type.map((e) => [e.type, e]));
    // Zones 7 (missing), 8 (non-string), 9 (empty), 10 (whitespace) = 4
    expect(byType.get(UNTYPED_ZONE_BUCKET)?.count).toBe(4);
  });

  it("exposes UNTYPED_ZONE_BUCKET as lower-case 'untyped'", () => {
    expect(UNTYPED_ZONE_BUCKET).toBe("untyped");
  });

  it("aggregates cells as the sum of zone.cells.length per bucket", () => {
    const result = readZoneDistributionFromPack(
      asPack(makePack()),
    ) as ZoneDistribution;
    const byType = new Map(result.by_type.map((e) => [e.type, e]));
    // Invasion: 4 + 2 + 1 = 7
    expect(byType.get("Invasion")?.cells).toBe(7);
    // Disease: 3 + 1 = 4
    expect(byType.get("Disease")?.cells).toBe(4);
    // Crusade: no cells array on the only member → 0
    expect(byType.get("Crusade")?.cells).toBe(0);
    // invasion (lower): 2
    expect(byType.get("invasion")?.cells).toBe(2);
    // untyped: 1 (i=7) + 1 (i=8) + 2 (i=9) + 1 (i=10) = 5
    expect(byType.get(UNTYPED_ZONE_BUCKET)?.cells).toBe(5);
  });

  it("reports total_cells as the global sum of cells array lengths", () => {
    const result = readZoneDistributionFromPack(
      asPack(makePack()),
    ) as ZoneDistribution;
    // 7 + 4 + 0 + 2 + 5 = 18
    expect(result.total_cells).toBe(18);
  });

  it("treats missing / non-array zone.cells as 0", () => {
    const result = readZoneDistributionFromPack(
      asPack({
        zones: [
          { i: 0, type: "A" }, // no cells
          { i: 1, type: "A", cells: "nope" as unknown as number[] }, // non-array
          { i: 2, type: "A", cells: [1, 2, 3] },
        ],
      }),
    ) as ZoneDistribution;
    expect(result.total_zones).toBe(3);
    expect(result.total_cells).toBe(3);
    expect(result.by_type[0].cells).toBe(3);
  });

  it("computes percentage as count / total_zones * 100 and sums to ~100", () => {
    const result = readZoneDistributionFromPack(
      asPack(makePack()),
    ) as ZoneDistribution;
    const byType = new Map(result.by_type.map((e) => [e.type, e.percentage]));
    // Total active = 11
    expect(byType.get("Invasion")).toBeCloseTo((3 / 11) * 100);
    expect(byType.get("Disease")).toBeCloseTo((2 / 11) * 100);
    expect(byType.get("Crusade")).toBeCloseTo((1 / 11) * 100);
    expect(byType.get("invasion")).toBeCloseTo((1 / 11) * 100);
    expect(byType.get(UNTYPED_ZONE_BUCKET)).toBeCloseTo((4 / 11) * 100);

    const sum = result.by_type.reduce((acc, e) => acc + e.percentage, 0);
    expect(sum).toBeCloseTo(100);
  });

  it("sorts by_type by count desc, ties broken by type asc (lex)", () => {
    const result = readZoneDistributionFromPack(
      asPack({
        zones: [
          { i: 0, type: "Zeta", cells: [1] },
          { i: 1, type: "Zeta", cells: [2] },
          { i: 2, type: "Alpha", cells: [3] },
          { i: 3, type: "Alpha", cells: [4] },
          { i: 4, type: "Mid", cells: [5] },
          { i: 5, type: "Mid", cells: [6] },
          { i: 6, type: "Solo", cells: [7] },
        ],
      }),
    ) as ZoneDistribution;
    expect(result.by_type.map((e) => e.type)).toEqual([
      "Alpha",
      "Mid",
      "Zeta",
      "Solo",
    ]);
  });

  it("returns zero totals and empty by_type for a zones-empty pack", () => {
    const result = readZoneDistributionFromPack(
      asPack({ zones: [] }),
    ) as ZoneDistribution;
    expect(result.total_zones).toBe(0);
    expect(result.total_cells).toBe(0);
    expect(result.by_type).toEqual([]);
  });

  it("returns zero totals when every zone is removed", () => {
    const result = readZoneDistributionFromPack(
      asPack({
        zones: [
          { i: 0, type: "Invasion", cells: [1], removed: true },
          { i: 1, type: "Disease", cells: [2], removed: true },
        ],
      }),
    ) as ZoneDistribution;
    expect(result.total_zones).toBe(0);
    expect(result.total_cells).toBe(0);
    expect(result.by_type).toEqual([]);
  });

  it("returns 'not-ready' when pack is undefined", () => {
    expect(readZoneDistributionFromPack(undefined)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.zones is missing", () => {
    expect(readZoneDistributionFromPack({} as ZoneDistributionPackLike)).toBe(
      "not-ready",
    );
  });
});

describe("get_zone_distribution — tool surface", () => {
  it("returns ok=true with a well-formed payload", async () => {
    const tool = createGetZoneDistributionTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_zones).toBe(11);
    expect(body.total_cells).toBe(18);
    expect(Array.isArray(body.by_type)).toBe(true);
    // Invasion (3) and untyped (4) are the top buckets. untyped wins on count.
    expect(body.by_type[0].type).toBe(UNTYPED_ZONE_BUCKET);
    expect(body.by_type[0].count).toBe(4);
    expect(body.by_type[1].type).toBe("Invasion");
    expect(body.by_type[1].count).toBe(3);
  });

  it("ignores unrelated input keys", async () => {
    const tool = createGetZoneDistributionTool(realRuntime());
    const result = await tool.execute({ foo: 1, bar: "baz" });
    expect(result.isError).toBeFalsy();
  });

  it("tolerates null / undefined input", async () => {
    const tool = createGetZoneDistributionTool(realRuntime());
    expect((await tool.execute(null)).isError).toBeFalsy();
    expect((await tool.execute(undefined)).isError).toBeFalsy();
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetZoneDistributionTool(runtimeReturning("not-ready"));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("is exported as getZoneDistributionTool with the expected schema", () => {
    expect(getZoneDistributionTool.name).toBe("get_zone_distribution");
    expect(getZoneDistributionTool.input_schema.type).toBe("object");
    expect(getZoneDistributionTool.input_schema.required).toBeUndefined();
    expect(getZoneDistributionTool.input_schema.properties).toEqual({});
  });
});

// ----- defaultZoneDistributionRuntime integration -----

describe("defaultZoneDistributionRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads the real distribution through the default runtime", () => {
    const result =
      defaultZoneDistributionRuntime.readDistribution() as ZoneDistribution;
    expect(result.total_zones).toBe(11);
    expect(result.total_cells).toBe(18);
    const byType = new Map(result.by_type.map((e) => [e.type, e]));
    expect(byType.get("Invasion")?.count).toBe(3);
    expect(byType.get("Disease")?.count).toBe(2);
    expect(byType.get(UNTYPED_ZONE_BUCKET)?.count).toBe(4);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await getZoneDistributionTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_zones).toBe(11);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultZoneDistributionRuntime.readDistribution()).toBe("not-ready");
    const result = await getZoneDistributionTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-ready' when pack.zones is missing → tool surfaces error", async () => {
    globalsRef.pack = {} as unknown;
    expect(defaultZoneDistributionRuntime.readDistribution()).toBe("not-ready");
    const result = await getZoneDistributionTool.execute({});
    expect(result.isError).toBe(true);
  });
});
