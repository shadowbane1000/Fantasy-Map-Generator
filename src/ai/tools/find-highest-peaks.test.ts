import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindHighestPeaksTool,
  DEFAULT_FIND_HIGHEST_PEAKS_N,
  defaultFindHighestPeaksRuntime,
  type FindHighestPeaksResult,
  type FindHighestPeaksRuntime,
  findHighestPeaksInPack,
  findHighestPeaksTool,
  LAND_HEIGHT_MIN,
  MAX_FIND_HIGHEST_PEAKS_N,
} from "./find-highest-peaks";

interface FakePack {
  cells: {
    h: number[];
    p: Array<[number, number] | undefined>;
  };
}

function makePack(): FakePack {
  // 10 cells:
  //   i=0 h=0   water
  //   i=1 h=5   water
  //   i=2 h=19  water (just below shore)
  //   i=3 h=20  land — shore (counts)
  //   i=4 h=35  land
  //   i=5 h=60  land
  //   i=6 h=80  land
  //   i=7 h=95  land — peak
  //   i=8 h=50  land
  //   i=9 h=15  water
  return {
    cells: {
      h: [0, 5, 19, 20, 35, 60, 80, 95, 50, 15],
      p: [
        [0, 0],
        [10, 10],
        [20, 20],
        [30, 30],
        [40, 40],
        [50, 50],
        [60, 60],
        [70, 70],
        [80, 80],
        [90, 90],
      ],
    },
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findHighestPeaksInPack>[0];
}

function runtimeReturning(
  result: FindHighestPeaksResult,
): FindHighestPeaksRuntime {
  return { find: () => result };
}

function realRuntime(): FindHighestPeaksRuntime {
  const pack = asPack(makePack());
  return { find: (n) => findHighestPeaksInPack(pack, n) };
}

describe("find_highest_peaks — pure scanner", () => {
  it("returns top-n land cells sorted by height descending", () => {
    const result = findHighestPeaksInPack(asPack(makePack()), 3) as {
      peaks: Array<{ cell: number; height: number }>;
      count: number;
      requested_n: number;
    };
    expect(result.peaks.map((r) => r.cell)).toEqual([7, 6, 5]);
    expect(result.peaks.map((r) => r.height)).toEqual([95, 80, 60]);
    expect(result.count).toBe(3);
    expect(result.requested_n).toBe(3);
  });

  it("excludes water cells (h < 20) — shore (h=20) is included", () => {
    const result = findHighestPeaksInPack(asPack(makePack()), 100) as {
      peaks: Array<{ cell: number; height: number }>;
      count: number;
    };
    const cells = new Set(result.peaks.map((r) => r.cell));
    // Water cells (0, 1, 2, 9) excluded.
    expect(cells.has(0)).toBe(false);
    expect(cells.has(1)).toBe(false);
    expect(cells.has(2)).toBe(false);
    expect(cells.has(9)).toBe(false);
    // Shore cell (3, h=20) included (LAND_HEIGHT_MIN is inclusive).
    expect(cells.has(3)).toBe(true);
    // All 6 land cells present (3, 4, 5, 6, 7, 8).
    expect(result.count).toBe(6);
  });

  it("attaches x, y coordinates from pack.cells.p", () => {
    const result = findHighestPeaksInPack(asPack(makePack()), 1) as {
      peaks: Array<{ cell: number; x: number; y: number }>;
    };
    const top = result.peaks[0];
    expect(top.cell).toBe(7);
    expect(top.x).toBe(70);
    expect(top.y).toBe(70);
  });

  it("falls back to 0 when a coordinate pair is missing / malformed", () => {
    const pack: FakePack = {
      cells: {
        h: [0, 50, 60],
        p: [[0, 0], undefined, [Number.NaN, 42]],
      },
    };
    const result = findHighestPeaksInPack(asPack(pack), 10) as {
      peaks: Array<{ cell: number; x: number; y: number }>;
    };
    const byCell = new Map(result.peaks.map((p) => [p.cell, p]));
    expect(byCell.get(1)).toMatchObject({ x: 0, y: 0 });
    // NaN x falls back to 0, finite y is preserved.
    expect(byCell.get(2)).toMatchObject({ x: 0, y: 42 });
  });

  it("preserves cell-index order on ties (stable sort)", () => {
    const pack: FakePack = {
      cells: {
        h: [80, 80, 80, 80],
        p: [
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
        ],
      },
    };
    const result = findHighestPeaksInPack(asPack(pack), 4) as {
      peaks: Array<{ cell: number }>;
    };
    expect(result.peaks.map((r) => r.cell)).toEqual([0, 1, 2, 3]);
  });

  it("returns empty peaks and count=0 when no land cells exist", () => {
    const pack: FakePack = {
      cells: {
        h: [0, 5, 10, 19],
        p: [
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
        ],
      },
    };
    const result = findHighestPeaksInPack(asPack(pack), 10) as {
      peaks: unknown[];
      count: number;
    };
    expect(result.peaks).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("count may be less than n when fewer land cells exist", () => {
    const result = findHighestPeaksInPack(asPack(makePack()), 50) as {
      peaks: unknown[];
      count: number;
      requested_n: number;
    };
    expect(result.count).toBe(6);
    expect(result.peaks.length).toBe(6);
    expect(result.requested_n).toBe(50);
  });

  it("returns 'not-ready' when pack is undefined", () => {
    expect(findHighestPeaksInPack(undefined, 10)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells is missing", () => {
    const pack = {} as unknown as Parameters<typeof findHighestPeaksInPack>[0];
    expect(findHighestPeaksInPack(pack, 10)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.h is missing", () => {
    const pack = { cells: { p: [] } } as unknown as Parameters<
      typeof findHighestPeaksInPack
    >[0];
    expect(findHighestPeaksInPack(pack, 10)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cells.p is missing", () => {
    const pack = { cells: { h: [20, 50, 80] } } as unknown as Parameters<
      typeof findHighestPeaksInPack
    >[0];
    expect(findHighestPeaksInPack(pack, 10)).toBe("not-ready");
  });
});

describe("find_highest_peaks — tool surface", () => {
  it("defaults n to 10 when omitted", async () => {
    let received = -1;
    const runtime: FindHighestPeaksRuntime = {
      find: (n) => {
        received = n;
        return { peaks: [], count: 0, requested_n: n };
      },
    };
    const tool = createFindHighestPeaksTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(received).toBe(DEFAULT_FIND_HIGHEST_PEAKS_N);
    const body = JSON.parse(result.content);
    expect(body.requested_n).toBe(DEFAULT_FIND_HIGHEST_PEAKS_N);
  });

  it("honors n=3 end-to-end (sorted desc)", async () => {
    const tool = createFindHighestPeaksTool(realRuntime());
    const result = await tool.execute({ n: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(3);
    expect(body.peaks.map((p: { cell: number }) => p.cell)).toEqual([7, 6, 5]);
    expect(body.requested_n).toBe(3);
  });

  it("returns peaks with { cell, height, x, y } shape", async () => {
    const tool = createFindHighestPeaksTool(realRuntime());
    const result = await tool.execute({ n: 1 });
    const body = JSON.parse(result.content);
    expect(body.peaks).toHaveLength(1);
    const top = body.peaks[0];
    expect(Object.keys(top).sort()).toEqual(["cell", "height", "x", "y"]);
    expect(top).toEqual({ cell: 7, height: 95, x: 70, y: 70 });
  });

  it("rejects out-of-range / non-integer n", async () => {
    const tool = createFindHighestPeaksTool(realRuntime());
    for (const bad of [
      { n: 0 },
      { n: -1 },
      { n: MAX_FIND_HIGHEST_PEAKS_N + 1 },
      { n: 1.5 },
      { n: "10" },
      { n: Number.NaN },
      { n: Number.POSITIVE_INFINITY },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/n must be an integer/i);
    }
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindHighestPeaksTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ n: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("is exported as findHighestPeaksTool with the expected schema", () => {
    expect(findHighestPeaksTool.name).toBe("find_highest_peaks");
    expect(findHighestPeaksTool.input_schema.type).toBe("object");
    expect(findHighestPeaksTool.input_schema.required).toBeUndefined();
    expect(findHighestPeaksTool.input_schema.properties.n).toBeDefined();
    // No filter / limit properties
    expect(findHighestPeaksTool.input_schema.properties.limit).toBeUndefined();
    expect(findHighestPeaksTool.input_schema.properties.min).toBeUndefined();
  });

  it("exposes DEFAULT / MAX / LAND_HEIGHT_MIN constants", () => {
    expect(DEFAULT_FIND_HIGHEST_PEAKS_N).toBe(10);
    expect(MAX_FIND_HIGHEST_PEAKS_N).toBe(500);
    expect(LAND_HEIGHT_MIN).toBe(20);
  });
});

// ----- defaultFindHighestPeaksRuntime integration -----

describe("defaultFindHighestPeaksRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via default runtime and returns top-n sorted desc", () => {
    const result = defaultFindHighestPeaksRuntime.find(3) as {
      peaks: Array<{ cell: number; height: number }>;
      count: number;
      requested_n: number;
    };
    expect(result.peaks.map((p) => p.cell)).toEqual([7, 6, 5]);
    expect(result.count).toBe(3);
    expect(result.requested_n).toBe(3);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findHighestPeaksTool.execute({ n: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.peaks.map((p: { cell: number }) => p.cell)).toEqual([7, 6]);
    expect(body.count).toBe(2);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindHighestPeaksRuntime.find(5)).toBe("not-ready");
    const result = await findHighestPeaksTool.execute({ n: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
