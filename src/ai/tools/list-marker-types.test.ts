import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawMarker } from "./_shared";
import {
  createListMarkerTypesTool,
  listMarkerTypesTool,
  type MarkerTypeCount,
  type MarkerTypesPackLike,
  type MarkerTypesRuntime,
  type MarkerTypesSummary,
  readMarkerTypesFromPack,
  UNTYPED_MARKER_BUCKET,
} from "./list-marker-types";

function makeRuntime(result: MarkerTypesSummary | null): MarkerTypesRuntime {
  return { readMarkerTypes: () => result };
}

describe("readMarkerTypesFromPack (pure scanner)", () => {
  it("returns null when pack is undefined", () => {
    expect(readMarkerTypesFromPack(undefined)).toBeNull();
  });

  it("returns null when pack.markers is missing", () => {
    expect(readMarkerTypesFromPack({} as MarkerTypesPackLike)).toBeNull();
  });

  it("returns empty types and total 0 for an empty marker list", () => {
    expect(readMarkerTypesFromPack({ markers: [] })).toEqual({
      types: [],
      total: 0,
    });
  });

  it("groups a mix of typed markers and sorts descending by count", () => {
    const markers: RawMarker[] = [
      { i: 1, type: "castle" },
      { i: 2, type: "castle" },
      { i: 3, type: "castle" },
      { i: 4, type: "battlefield" },
      { i: 5, type: "battlefield" },
      { i: 6, type: "volcano" },
    ];
    const result = readMarkerTypesFromPack({ markers });
    expect(result).not.toBeNull();
    expect(result?.total).toBe(6);
    expect(result?.types).toEqual<MarkerTypeCount[]>([
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
    const result = readMarkerTypesFromPack({ markers });
    expect(result?.types.map((t) => t.type)).toEqual(["alpha", "mu", "zeta"]);
  });

  it("preserves the original casing of type strings", () => {
    const markers: RawMarker[] = [
      { i: 1, type: "Castle" },
      { i: 2, type: "CASTLE" },
      { i: 3, type: "castle" },
    ];
    const result = readMarkerTypesFromPack({ markers });
    // Case-sensitive grouping: three distinct buckets
    expect(result?.total).toBe(3);
    const keys = result?.types.map((t) => t.type);
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
    const result = readMarkerTypesFromPack({ markers });
    expect(result?.total).toBe(8);
    const untyped = result?.types.find((t) => t.type === UNTYPED_MARKER_BUCKET);
    expect(untyped?.count).toBe(7);
    const castle = result?.types.find((t) => t.type === "castle");
    expect(castle?.count).toBe(1);
  });

  it("skips markers with removed: true", () => {
    const markers: RawMarker[] = [
      { i: 1, type: "castle" },
      { i: 2, type: "castle", removed: true },
      { i: 3, type: "volcano", removed: true },
    ];
    const result = readMarkerTypesFromPack({ markers });
    expect(result?.total).toBe(1);
    expect(result?.types).toEqual([{ type: "castle", count: 1 }]);
  });

  it("skips markers with i === 0", () => {
    const markers: RawMarker[] = [
      { i: 0, type: "castle" },
      { i: 1, type: "castle" },
    ];
    const result = readMarkerTypesFromPack({ markers });
    expect(result?.total).toBe(1);
    expect(result?.types).toEqual([{ type: "castle", count: 1 }]);
  });

  it("ensures total matches the sum of per-type counts", () => {
    const markers: RawMarker[] = [
      { i: 1, type: "a" },
      { i: 2, type: "a" },
      { i: 3, type: "b" },
      { i: 4 }, // untyped
      { i: 5, type: "b" },
    ];
    const result = readMarkerTypesFromPack({ markers });
    const sum = result?.types.reduce((acc, t) => acc + t.count, 0) ?? -1;
    expect(sum).toBe(result?.total);
    expect(result?.total).toBe(5);
  });

  it("tolerates null entries in markers array", () => {
    const markers = [null, { i: 1, type: "castle" }] as unknown as RawMarker[];
    const result = readMarkerTypesFromPack({ markers });
    expect(result?.total).toBe(1);
    expect(result?.types).toEqual([{ type: "castle", count: 1 }]);
  });
});

describe("list_marker_types tool", () => {
  it("accepts no-args / {} / null / undefined uniformly", async () => {
    const tool = createListMarkerTypesTool(
      makeRuntime({
        types: [{ type: "castle", count: 2 }],
        total: 2,
      }),
    );
    for (const input of [undefined, null, {}]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content) as {
        ok: boolean;
        types: MarkerTypeCount[];
        total: number;
      };
      expect(body.ok).toBe(true);
      expect(body.total).toBe(2);
      expect(body.types).toEqual([{ type: "castle", count: 2 }]);
    }
  });

  it("ignores unknown extra input keys", async () => {
    const tool = createListMarkerTypesTool(
      makeRuntime({ types: [], total: 0 }),
    );
    const result = await tool.execute({
      foo: "bar",
      limit: 99,
      offset: 5,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content) as {
      ok: boolean;
      total: number;
    };
    expect(body.ok).toBe(true);
    expect(body.total).toBe(0);
  });

  it("surfaces a structured not-ready error when the runtime returns null", async () => {
    const tool = createListMarkerTypesTool(makeRuntime(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content) as {
      ok: boolean;
      error: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
    expect(body.error).toMatch(/marker types/i);
  });

  it("returns empty types + total 0 when the map has no markers", async () => {
    const tool = createListMarkerTypesTool(
      makeRuntime({ types: [], total: 0 }),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content) as {
      ok: boolean;
      types: MarkerTypeCount[];
      total: number;
    };
    expect(body.ok).toBe(true);
    expect(body.types).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("happy path passes through the runtime-sorted types verbatim", async () => {
    const tool = createListMarkerTypesTool(
      makeRuntime({
        types: [
          { type: "castle", count: 4 },
          { type: "volcano", count: 2 },
          { type: UNTYPED_MARKER_BUCKET, count: 1 },
        ],
        total: 7,
      }),
    );
    const body = JSON.parse((await tool.execute({})).content) as {
      types: MarkerTypeCount[];
      total: number;
    };
    expect(body.types.map((t) => t.type)).toEqual([
      "castle",
      "volcano",
      UNTYPED_MARKER_BUCKET,
    ]);
    expect(body.total).toBe(7);
  });

  it("exposes the expected tool surface", () => {
    expect(listMarkerTypesTool.name).toBe("list_marker_types");
    expect(listMarkerTypesTool.input_schema).toEqual({
      type: "object",
      properties: {},
    });
  });
});

describe("defaultMarkerTypesRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = {
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
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
  });

  it("reads the live pack, honours removed + i=0 skips, and sorts by count desc", async () => {
    const result = await listMarkerTypesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content) as {
      ok: boolean;
      types: MarkerTypeCount[];
      total: number;
    };
    expect(body.ok).toBe(true);
    expect(body.total).toBe(6);
    expect(body.types).toEqual([
      { type: "castle", count: 2 },
      { type: UNTYPED_MARKER_BUCKET, count: 2 },
      { type: "battlefield", count: 1 },
      { type: "volcano", count: 1 },
    ]);
  });

  it("surfaces the not-ready error when pack is cleared", async () => {
    (globalThis as unknown as { pack?: unknown }).pack = undefined;
    const result = await listMarkerTypesTool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content) as {
      ok: boolean;
      error: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("surfaces the not-ready error when pack has no markers collection", async () => {
    (globalThis as unknown as { pack?: unknown }).pack = {};
    const result = await listMarkerTypesTool.execute({});
    expect(result.isError).toBe(true);
  });
});
