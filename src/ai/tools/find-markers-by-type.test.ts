import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawMarker } from "./_shared";
import {
  createFindMarkersByTypeTool,
  DEFAULT_FIND_MARKERS_BY_TYPE_LIMIT,
  defaultFindMarkersByTypeRuntime,
  type FindMarkersByTypeResult,
  type FindMarkersByTypeRuntime,
  findMarkersByTypeInPack,
  findMarkersByTypeTool,
  MAX_FIND_MARKERS_BY_TYPE_LIMIT,
} from "./find-markers-by-type";
import { UNTYPED_MARKER_BUCKET } from "./list-marker-types";

interface FakePack {
  markers: Array<RawMarker | null | undefined>;
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findMarkersByTypeInPack>[0];
}

function makePack(): FakePack {
  //   i=1: type=castle, (100, 100), cell=11
  //   i=2: type=Castle (case variant), (110, 120), cell=12
  //   i=3: type=CASTLE, (120, 130)
  //   i=4: type=battlefield, (200, 200)
  //   i=5: type=mine (no coords)
  //   i=6: type=castle, removed=true (skipped)
  //   i=0: type=castle (skipped: index 0 placeholder)
  //   i=7: missing type (untyped bucket)
  //   i=8: type="" (empty → untyped)
  //   i=9: type="   " (whitespace → untyped)
  //   i=10: type=42 (non-string → untyped)
  //   i=11: type=castle (full coords)
  return {
    markers: [
      { i: 1, type: "castle", icon: "castle", x: 100, y: 100, cell: 11 },
      { i: 2, type: "Castle", icon: "castle", x: 110, y: 120, cell: 12 },
      { i: 3, type: "CASTLE", icon: "castle", x: 120, y: 130 },
      { i: 4, type: "battlefield", icon: "crossed-swords", x: 200, y: 200 },
      { i: 5, type: "mine", icon: "mine" },
      {
        i: 6,
        type: "castle",
        icon: "castle",
        x: 50,
        y: 50,
        removed: true,
      },
      { i: 0, type: "castle", icon: "castle", x: 0, y: 0 },
      { i: 7, icon: "pin", x: 300, y: 300 },
      { i: 8, type: "", icon: "pin", x: 310, y: 310 },
      { i: 9, type: "   ", icon: "pin", x: 320, y: 320 },
      { i: 10, type: 42 as unknown as string, icon: "pin", x: 330, y: 330 },
      { i: 11, type: "castle", icon: "castle", x: 140, y: 140, cell: 14 },
      null as unknown as RawMarker, // tolerated null slot
    ],
  };
}

function runtimeReturning(
  result: FindMarkersByTypeResult,
): FindMarkersByTypeRuntime {
  return { find: () => result };
}

describe("find_markers_by_type — pure scanner", () => {
  it("matches markers by type case-insensitively (all castles, any casing)", () => {
    const result = findMarkersByTypeInPack(asPack(makePack()), {
      type: "castle",
      limit: 100,
    }) as {
      type: string;
      markers: Array<{ i: number; type: string | null }>;
      count: number;
    };
    const ids = new Set(result.markers.map((m) => m.i));
    // 1 (castle) + 2 (Castle) + 3 (CASTLE) + 11 (castle); 6 removed; 0 placeholder
    expect(ids).toEqual(new Set([1, 2, 3, 11]));
    expect(result.count).toBe(4);
    expect(result.type).toBe("castle");
  });

  it("preserves the original casing of each marker's type in the hit", () => {
    const result = findMarkersByTypeInPack(asPack(makePack()), {
      type: "castle",
      limit: 100,
    }) as {
      markers: Array<{ i: number; type: string | null }>;
    };
    const byId = new Map(result.markers.map((m) => [m.i, m.type]));
    expect(byId.get(1)).toBe("castle");
    expect(byId.get(2)).toBe("Castle");
    expect(byId.get(3)).toBe("CASTLE");
    expect(byId.get(11)).toBe("castle");
  });

  it("untyped bucket captures missing / empty / whitespace / non-string types", () => {
    const result = findMarkersByTypeInPack(asPack(makePack()), {
      type: UNTYPED_MARKER_BUCKET,
      limit: 100,
    }) as {
      type: string;
      markers: Array<{ i: number; type: string | null }>;
      count: number;
    };
    const ids = new Set(result.markers.map((m) => m.i));
    // 7 (missing), 8 (""), 9 ("   "), 10 (non-string 42)
    expect(ids).toEqual(new Set([7, 8, 9, 10]));
    expect(result.count).toBe(4);
    for (const m of result.markers) expect(m.type).toBeNull();
    expect(result.type).toBe(UNTYPED_MARKER_BUCKET);
  });

  it("skips removed markers and the index-0 placeholder", () => {
    const result = findMarkersByTypeInPack(asPack(makePack()), {
      type: "castle",
      limit: 100,
    }) as { markers: Array<{ i: number }> };
    const ids = new Set(result.markers.map((m) => m.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(6)).toBe(false);
  });

  it("tolerates null entries in the markers array", () => {
    const result = findMarkersByTypeInPack(asPack(makePack()), {
      type: "battlefield",
      limit: 100,
    }) as { markers: Array<{ i: number }>; count: number };
    expect(result.markers.map((m) => m.i)).toEqual([4]);
    expect(result.count).toBe(1);
  });

  it("returns x/y/cell as null when the marker has no / malformed coords", () => {
    const result = findMarkersByTypeInPack(asPack(makePack()), {
      type: "mine",
      limit: 100,
    }) as {
      markers: Array<{
        i: number;
        x: number | null;
        y: number | null;
        cell: number | null;
      }>;
    };
    expect(result.markers).toEqual([
      { i: 5, type: "mine", icon: "mine", x: null, y: null, cell: null },
    ]);
  });

  it("limit truncates markers but count reports the full total", () => {
    const result = findMarkersByTypeInPack(asPack(makePack()), {
      type: "castle",
      limit: 2,
    }) as { markers: Array<{ i: number }>; count: number };
    expect(result.markers.length).toBe(2);
    expect(result.count).toBe(4);
  });

  it("returns empty markers and count 0 when no marker matches", () => {
    const result = findMarkersByTypeInPack(asPack(makePack()), {
      type: "dragonlair",
      limit: 100,
    }) as { type: string; markers: unknown[]; count: number };
    expect(result.markers).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.type).toBe("dragonlair");
  });

  it("returns 'not-ready' when pack is undefined", () => {
    expect(
      findMarkersByTypeInPack(undefined, {
        type: "castle",
        limit: 100,
      }),
    ).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.markers is missing", () => {
    expect(
      findMarkersByTypeInPack(
        {} as unknown as Parameters<typeof findMarkersByTypeInPack>[0],
        { type: "castle", limit: 100 },
      ),
    ).toBe("not-ready");
  });
});

describe("find_markers_by_type — tool surface", () => {
  function realRuntime(): FindMarkersByTypeRuntime {
    const pack = asPack(makePack());
    return { find: (q) => findMarkersByTypeInPack(pack, q) };
  }

  it("rejects missing type", async () => {
    const tool = createFindMarkersByTypeTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/type is required/i);
  });

  it("rejects non-string type", async () => {
    const tool = createFindMarkersByTypeTool(realRuntime());
    for (const bad of [{ type: 42 }, { type: true }, { type: [] }]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/must be a string/i);
    }
  });

  it("accepts empty / whitespace type as the untyped sentinel", async () => {
    const tool = createFindMarkersByTypeTool(realRuntime());
    for (const input of [{ type: "" }, { type: "   " }, { type: "\t\n" }]) {
      const r = await tool.execute(input);
      expect(r.isError).toBeFalsy();
      const body = JSON.parse(r.content);
      expect(body.ok).toBe(true);
      expect(body.type).toBe(UNTYPED_MARKER_BUCKET);
      expect(new Set(body.markers.map((m: { i: number }) => m.i))).toEqual(
        new Set([7, 8, 9, 10]),
      );
    }
  });

  it("accepts the literal 'untyped' / 'UNTYPED' as the untyped sentinel", async () => {
    const tool = createFindMarkersByTypeTool(realRuntime());
    for (const input of [{ type: "untyped" }, { type: "UNTYPED" }]) {
      const r = await tool.execute(input);
      expect(r.isError).toBeFalsy();
      const body = JSON.parse(r.content);
      expect(body.ok).toBe(true);
      expect(body.type).toBe(UNTYPED_MARKER_BUCKET);
      expect(body.count).toBe(4);
    }
  });

  it("rejects out-of-range limit", async () => {
    const tool = createFindMarkersByTypeTool(realRuntime());
    for (const bad of [
      { type: "castle", limit: 0 },
      { type: "castle", limit: MAX_FIND_MARKERS_BY_TYPE_LIMIT + 1 },
      { type: "castle", limit: 1.5 },
      { type: "castle", limit: "10" },
      { type: "castle", limit: -1 },
      { type: "castle", limit: Number.NaN },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/limit/i);
    }
  });

  it("accepts limit at the boundaries (1 and MAX)", async () => {
    const tool = createFindMarkersByTypeTool(realRuntime());
    const r1 = await tool.execute({ type: "castle", limit: 1 });
    expect(r1.isError).toBeFalsy();
    const b1 = JSON.parse(r1.content);
    expect(b1.markers.length).toBe(1);
    expect(b1.count).toBe(4);
    const r2 = await tool.execute({
      type: "castle",
      limit: MAX_FIND_MARKERS_BY_TYPE_LIMIT,
    });
    expect(r2.isError).toBeFalsy();
    expect(JSON.parse(r2.content).markers.length).toBe(4);
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindMarkersByTypeTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ type: "castle" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns ok with castle results (case-insensitive)", async () => {
    const tool = createFindMarkersByTypeTool(realRuntime());
    const result = await tool.execute({ type: "CASTLE" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe("castle");
    expect(new Set(body.markers.map((m: { i: number }) => m.i))).toEqual(
      new Set([1, 2, 3, 11]),
    );
    expect(body.count).toBe(4);
  });

  it("honors limit end-to-end", async () => {
    const tool = createFindMarkersByTypeTool(realRuntime());
    const result = await tool.execute({ type: "castle", limit: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.markers.length).toBe(2);
    expect(body.count).toBe(4);
  });

  it("returns ok with untyped sentinel", async () => {
    const tool = createFindMarkersByTypeTool(realRuntime());
    const result = await tool.execute({ type: "untyped" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.type).toBe(UNTYPED_MARKER_BUCKET);
    expect(body.count).toBe(4);
    for (const m of body.markers) expect(m.type).toBeNull();
  });

  it("is exported as findMarkersByTypeTool with the expected schema", () => {
    expect(findMarkersByTypeTool.name).toBe("find_markers_by_type");
    expect(findMarkersByTypeTool.input_schema.type).toBe("object");
    expect(findMarkersByTypeTool.input_schema.required).toEqual(["type"]);
    expect(findMarkersByTypeTool.input_schema.properties.type).toBeDefined();
    expect(findMarkersByTypeTool.input_schema.properties.limit).toBeDefined();
  });

  it("exposes DEFAULT / MAX limit constants", () => {
    expect(DEFAULT_FIND_MARKERS_BY_TYPE_LIMIT).toBe(10000);
    expect(MAX_FIND_MARKERS_BY_TYPE_LIMIT).toBe(100000);
  });
});

// ----- defaultFindMarkersByTypeRuntime integration -----

describe("defaultFindMarkersByTypeRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads the real pack via default runtime for a typed query", () => {
    const result = defaultFindMarkersByTypeRuntime.find({
      type: "castle",
      limit: 100,
    }) as { markers: Array<{ i: number }>; count: number };
    expect(new Set(result.markers.map((m) => m.i))).toEqual(
      new Set([1, 2, 3, 11]),
    );
    expect(result.count).toBe(4);
  });

  it("reads the real pack via default runtime for an untyped query", () => {
    const result = defaultFindMarkersByTypeRuntime.find({
      type: UNTYPED_MARKER_BUCKET,
      limit: 100,
    }) as { markers: Array<{ i: number }>; count: number };
    expect(new Set(result.markers.map((m) => m.i))).toEqual(
      new Set([7, 8, 9, 10]),
    );
    expect(result.count).toBe(4);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(
      defaultFindMarkersByTypeRuntime.find({
        type: "castle",
        limit: 100,
      }),
    ).toBe("not-ready");
    const result = await findMarkersByTypeTool.execute({ type: "castle" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
