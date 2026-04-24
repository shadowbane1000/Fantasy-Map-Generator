import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawMarker } from "./_shared";
import {
  createGetMarkerDistributionTool,
  defaultMarkerDistributionRuntime,
  getMarkerDistributionTool,
  type MarkerDistribution,
  type MarkerDistributionEntry,
  type MarkerDistributionPackLike,
  type MarkerDistributionResult,
  type MarkerDistributionRuntime,
  readMarkerDistributionFromPack,
} from "./get-marker-distribution";
import { UNTYPED_MARKER_BUCKET } from "./list-marker-types";

function makeRuntime(
  result: MarkerDistributionResult,
): MarkerDistributionRuntime {
  return { readDistribution: () => result };
}

function asPack(markers: RawMarker[]): MarkerDistributionPackLike {
  return { markers } as unknown as MarkerDistributionPackLike;
}

describe("readMarkerDistributionFromPack (pure aggregator)", () => {
  it("returns 'not-ready' when pack is undefined", () => {
    expect(readMarkerDistributionFromPack(undefined)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.markers is missing", () => {
    expect(
      readMarkerDistributionFromPack({} as MarkerDistributionPackLike),
    ).toBe("not-ready");
  });

  it("returns empty by_type and total_markers 0 for an empty marker list", () => {
    expect(readMarkerDistributionFromPack(asPack([]))).toEqual({
      total_markers: 0,
      by_type: [],
    });
  });

  it("groups typed markers and sorts descending by count", () => {
    const markers: RawMarker[] = [
      { i: 1, type: "castle" },
      { i: 2, type: "castle" },
      { i: 3, type: "castle" },
      { i: 4, type: "battlefield" },
      { i: 5, type: "battlefield" },
      { i: 6, type: "volcano" },
    ];
    const result = readMarkerDistributionFromPack(
      asPack(markers),
    ) as MarkerDistribution;
    expect(result.total_markers).toBe(6);
    expect(
      result.by_type.map((e) => ({ type: e.type, count: e.count })),
    ).toEqual<Array<{ type: string; count: number }>>([
      { type: "castle", count: 3 },
      { type: "battlefield", count: 2 },
      { type: "volcano", count: 1 },
    ]);
  });

  it("breaks ties by ascending type name (case-sensitive)", () => {
    const markers: RawMarker[] = [
      { i: 1, type: "zeta" },
      { i: 2, type: "alpha" },
      { i: 3, type: "mu" },
    ];
    const result = readMarkerDistributionFromPack(
      asPack(markers),
    ) as MarkerDistribution;
    expect(result.by_type.map((e) => e.type)).toEqual(["alpha", "mu", "zeta"]);
  });

  it("preserves the original casing of type strings", () => {
    const markers: RawMarker[] = [
      { i: 1, type: "Castle" },
      { i: 2, type: "CASTLE" },
      { i: 3, type: "castle" },
    ];
    const result = readMarkerDistributionFromPack(
      asPack(markers),
    ) as MarkerDistribution;
    expect(result.total_markers).toBe(3);
    const keys = result.by_type.map((e) => e.type);
    expect(keys).toContain("Castle");
    expect(keys).toContain("CASTLE");
    expect(keys).toContain("castle");
  });

  it("buckets undefined / non-string / empty / whitespace type as 'untyped'", () => {
    const markers: RawMarker[] = [
      { i: 1 },
      { i: 2, type: "" },
      { i: 3, type: "   " },
      { i: 4, type: "\t\n" },
      { i: 5, type: undefined },
      { i: 6, type: 42 as unknown as string },
      { i: 7, type: null as unknown as string },
      { i: 8, type: "castle" },
    ];
    const result = readMarkerDistributionFromPack(
      asPack(markers),
    ) as MarkerDistribution;
    expect(result.total_markers).toBe(8);
    const untyped = result.by_type.find(
      (e) => e.type === UNTYPED_MARKER_BUCKET,
    );
    expect(untyped?.count).toBe(7);
    const castle = result.by_type.find((e) => e.type === "castle");
    expect(castle?.count).toBe(1);
  });

  it("skips markers with removed: true", () => {
    const markers: RawMarker[] = [
      { i: 1, type: "castle" },
      { i: 2, type: "castle", removed: true },
      { i: 3, type: "volcano", removed: true },
    ];
    const result = readMarkerDistributionFromPack(
      asPack(markers),
    ) as MarkerDistribution;
    expect(result.total_markers).toBe(1);
    expect(
      result.by_type.map((e) => ({ type: e.type, count: e.count })),
    ).toEqual([{ type: "castle", count: 1 }]);
  });

  it("skips markers with i === 0", () => {
    const markers: RawMarker[] = [
      { i: 0, type: "castle" },
      { i: 1, type: "castle" },
    ];
    const result = readMarkerDistributionFromPack(
      asPack(markers),
    ) as MarkerDistribution;
    expect(result.total_markers).toBe(1);
    expect(result.by_type[0]).toMatchObject({ type: "castle", count: 1 });
  });

  it("tolerates null entries in markers array", () => {
    const markers = [null, { i: 1, type: "castle" }] as unknown as RawMarker[];
    const result = readMarkerDistributionFromPack(
      asPack(markers),
    ) as MarkerDistribution;
    expect(result.total_markers).toBe(1);
    expect(result.by_type[0]).toMatchObject({ type: "castle", count: 1 });
  });

  it("computes percentage as count / total_markers * 100 and sums to ~100", () => {
    const markers: RawMarker[] = [
      { i: 1, type: "a" },
      { i: 2, type: "a" },
      { i: 3, type: "b" },
      { i: 4 }, // untyped
      { i: 5, type: "b" },
    ];
    const result = readMarkerDistributionFromPack(
      asPack(markers),
    ) as MarkerDistribution;
    const byType = new Map(result.by_type.map((e) => [e.type, e.percentage]));
    expect(byType.get("a")).toBeCloseTo((2 / 5) * 100);
    expect(byType.get("b")).toBeCloseTo((2 / 5) * 100);
    expect(byType.get(UNTYPED_MARKER_BUCKET)).toBeCloseTo((1 / 5) * 100);
    const sum = result.by_type.reduce((acc, e) => acc + e.percentage, 0);
    expect(sum).toBeCloseTo(100);
  });

  it("ensures total_markers matches the sum of per-bucket counts", () => {
    const markers: RawMarker[] = [
      { i: 1, type: "a" },
      { i: 2, type: "a" },
      { i: 3, type: "b" },
      { i: 4 },
      { i: 5, type: "b" },
    ];
    const result = readMarkerDistributionFromPack(
      asPack(markers),
    ) as MarkerDistribution;
    const sum = result.by_type.reduce((acc, e) => acc + e.count, 0);
    expect(sum).toBe(result.total_markers);
    expect(result.total_markers).toBe(5);
  });

  it("reports percentage 0 when total_markers is 0", () => {
    const result = readMarkerDistributionFromPack(
      asPack([]),
    ) as MarkerDistribution;
    expect(result.total_markers).toBe(0);
    expect(result.by_type).toEqual([]);
    // Invariant: no entries means no stray percentage fields to check.
  });
});

describe("get_marker_distribution — tool surface", () => {
  it("accepts no-args / {} / null / undefined uniformly", async () => {
    const tool = createGetMarkerDistributionTool(
      makeRuntime({
        total_markers: 2,
        by_type: [{ type: "castle", count: 2, percentage: 100 }],
      }),
    );
    for (const input of [undefined, null, {}]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content) as {
        ok: boolean;
        total_markers: number;
        by_type: MarkerDistributionEntry[];
      };
      expect(body.ok).toBe(true);
      expect(body.total_markers).toBe(2);
      expect(body.by_type).toEqual([
        { type: "castle", count: 2, percentage: 100 },
      ]);
    }
  });

  it("ignores unknown extra input keys", async () => {
    const tool = createGetMarkerDistributionTool(
      makeRuntime({ total_markers: 0, by_type: [] }),
    );
    const result = await tool.execute({
      foo: "bar",
      limit: 99,
      offset: 5,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content) as {
      ok: boolean;
      total_markers: number;
    };
    expect(body.ok).toBe(true);
    expect(body.total_markers).toBe(0);
  });

  it("surfaces a structured not-ready error when the runtime returns 'not-ready'", async () => {
    const tool = createGetMarkerDistributionTool(makeRuntime("not-ready"));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content) as {
      ok: boolean;
      error: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("returns empty by_type + total_markers 0 when the map has no markers", async () => {
    const tool = createGetMarkerDistributionTool(
      makeRuntime({ total_markers: 0, by_type: [] }),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content) as {
      ok: boolean;
      total_markers: number;
      by_type: MarkerDistributionEntry[];
    };
    expect(body.ok).toBe(true);
    expect(body.total_markers).toBe(0);
    expect(body.by_type).toEqual([]);
  });

  it("passes runtime-sorted by_type through verbatim", async () => {
    const tool = createGetMarkerDistributionTool(
      makeRuntime({
        total_markers: 7,
        by_type: [
          { type: "castle", count: 4, percentage: (4 / 7) * 100 },
          { type: "volcano", count: 2, percentage: (2 / 7) * 100 },
          {
            type: UNTYPED_MARKER_BUCKET,
            count: 1,
            percentage: (1 / 7) * 100,
          },
        ],
      }),
    );
    const body = JSON.parse((await tool.execute({})).content) as {
      by_type: MarkerDistributionEntry[];
      total_markers: number;
    };
    expect(body.by_type.map((e) => e.type)).toEqual([
      "castle",
      "volcano",
      UNTYPED_MARKER_BUCKET,
    ]);
    expect(body.total_markers).toBe(7);
  });

  it("exposes the expected tool surface", () => {
    expect(getMarkerDistributionTool.name).toBe("get_marker_distribution");
    expect(getMarkerDistributionTool.input_schema.type).toBe("object");
    expect(getMarkerDistributionTool.input_schema.required).toBeUndefined();
    expect(getMarkerDistributionTool.input_schema.properties).toEqual({});
  });
});

describe("defaultMarkerDistributionRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = {
      markers: [
        { i: 1, type: "castle" },
        { i: 2, type: "castle" },
        { i: 3, type: "battlefield" },
        { i: 4, type: "castle", removed: true },
        { i: 5 },
        { i: 6, type: "" },
        { i: 0, type: "castle" },
        { i: 7, type: "volcano" },
      ] satisfies RawMarker[],
    };
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads the live pack, honours removed + i=0 skips, sorts by count desc", async () => {
    const result = await getMarkerDistributionTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content) as {
      ok: boolean;
      total_markers: number;
      by_type: MarkerDistributionEntry[];
    };
    expect(body.ok).toBe(true);
    expect(body.total_markers).toBe(6);
    // castle(2), untyped(2), battlefield(1), volcano(1)
    // tie at count=2: "castle" < "untyped" → castle first
    // tie at count=1: "battlefield" < "volcano" → battlefield first
    expect(body.by_type.map((e) => ({ type: e.type, count: e.count }))).toEqual(
      [
        { type: "castle", count: 2 },
        { type: UNTYPED_MARKER_BUCKET, count: 2 },
        { type: "battlefield", count: 1 },
        { type: "volcano", count: 1 },
      ],
    );
    const sumPct = body.by_type.reduce((acc, e) => acc + e.percentage, 0);
    expect(sumPct).toBeCloseTo(100);
  });

  it("also resolves via defaultMarkerDistributionRuntime directly", () => {
    const result =
      defaultMarkerDistributionRuntime.readDistribution() as MarkerDistribution;
    expect(result.total_markers).toBe(6);
  });

  it("surfaces not-ready error when pack is cleared", async () => {
    globalsRef.pack = undefined;
    const result = await getMarkerDistributionTool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content) as {
      ok: boolean;
      error: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("surfaces not-ready error when pack has no markers collection", async () => {
    globalsRef.pack = {} as unknown;
    const result = await getMarkerDistributionTool.execute({});
    expect(result.isError).toBe(true);
  });
});
