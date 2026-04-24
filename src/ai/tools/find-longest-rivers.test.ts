import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindLongestRiversTool,
  DEFAULT_FIND_LONGEST_RIVERS_N,
  defaultFindLongestRiversRuntime,
  type FindLongestRiversResult,
  type FindLongestRiversRuntime,
  findLongestRiversInPack,
  findLongestRiversTool,
  MAX_FIND_LONGEST_RIVERS_N,
} from "./find-longest-rivers";

interface FakeRiver {
  i: number;
  name?: string;
  type?: string;
  length?: number;
  discharge?: number;
  source?: number;
  mouth?: number;
  removed?: boolean;
}

interface FakePack {
  rivers: FakeRiver[];
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findLongestRiversInPack>[0];
}

function makePack(): FakePack {
  // Mixed set so we can test sort / filter / default behaviour.
  //   i=1 length 500 — longest
  //   i=2 length 250
  //   i=3 length 800 — actual longest
  //   i=4 length 100
  //   i=5 length 1000 removed → filtered
  //   i=6 length undefined → treated as 0
  //   i=7 length NaN → treated as 0
  //   i=8 length 400
  //   i=9 length 50
  //   i=10 length 700
  //   i=11 length 300
  //   index 0 placeholder → filtered out (i === 0)
  return {
    rivers: [
      { i: 0, name: "placeholder", length: 99999 },
      {
        i: 1,
        name: "Alpha",
        type: "River",
        length: 500,
        discharge: 12,
        source: 11,
        mouth: 22,
      },
      { i: 2, name: "Beta", type: "Stream", length: 250 },
      { i: 3, name: "Gamma", type: "River", length: 800 },
      { i: 4, name: "Delta", length: 100 },
      {
        i: 5,
        name: "RemovedMonster",
        length: 1000,
        removed: true,
      },
      { i: 6, name: "Iota" }, // length missing
      { i: 7, name: "Kappa", length: Number.NaN }, // length not finite
      { i: 8, name: "Zeta", length: 400 },
      { i: 9, name: "Mu", length: 50 },
      { i: 10, name: "Nu", length: 700 },
      { i: 11, name: "Xi", length: 300 },
    ],
  };
}

function runtimeReturning(
  result: FindLongestRiversResult,
): FindLongestRiversRuntime {
  return { find: () => result };
}

describe("find_longest_rivers — pure / seam", () => {
  it("returns top-n rivers sorted by length descending", () => {
    const result = findLongestRiversInPack(asPack(makePack()), 5) as {
      rivers: Array<{ i: number; length: number }>;
      count: number;
      requested_n: number;
    };
    expect(result.rivers.map((r) => r.i)).toEqual([3, 10, 1, 8, 11]);
    expect(result.rivers.map((r) => r.length)).toEqual([
      800, 700, 500, 400, 300,
    ]);
    expect(result.count).toBe(5);
    expect(result.requested_n).toBe(5);
  });

  it("skips index-0 placeholder and removed rivers", () => {
    const result = findLongestRiversInPack(asPack(makePack()), 100) as {
      rivers: Array<{ i: number }>;
      count: number;
    };
    const ids = new Set(result.rivers.map((r) => r.i));
    expect(ids.has(0)).toBe(false); // placeholder
    expect(ids.has(5)).toBe(false); // removed
    // Active rivers: 1,2,3,4,6,7,8,9,10,11 = 10 total
    expect(result.count).toBe(10);
  });

  it("treats missing / non-finite length as 0 and sorts to end", () => {
    const result = findLongestRiversInPack(asPack(makePack()), 100) as {
      rivers: Array<{ i: number; length: number }>;
    };
    const tail = result.rivers
      .slice(-2)
      .map((r) => r.i)
      .sort();
    expect(tail).toEqual([6, 7]);
    for (const r of result.rivers) {
      expect(Number.isFinite(r.length)).toBe(true);
    }
    const missing = result.rivers.find((r) => r.i === 6);
    const nan = result.rivers.find((r) => r.i === 7);
    expect(missing?.length).toBe(0);
    expect(nan?.length).toBe(0);
  });

  it("count equals rivers.length (may be < n when fewer actives)", () => {
    const result = findLongestRiversInPack(asPack(makePack()), 100) as {
      rivers: unknown[];
      count: number;
      requested_n: number;
    };
    expect(result.count).toBe(result.rivers.length);
    expect(result.count).toBe(10);
    expect(result.requested_n).toBe(100);
  });

  it("returns empty rivers array when pack has only placeholder / removed", () => {
    const result = findLongestRiversInPack(
      asPack({
        rivers: [
          { i: 0, name: "placeholder" },
          { i: 1, name: "Gone", length: 1, removed: true },
        ],
      }),
      10,
    ) as { rivers: unknown[]; count: number };
    expect(result.rivers).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("maps each hit to the documented shape", () => {
    const result = findLongestRiversInPack(asPack(makePack()), 1) as {
      rivers: Array<{
        i: number;
        name: string;
        type: string | null;
        length: number;
        discharge: number;
        source: number;
        mouth: number;
      }>;
    };
    const top = result.rivers[0];
    expect(top.i).toBe(3);
    expect(top.name).toBe("Gamma");
    expect(top.type).toBe("River");
    expect(top.length).toBe(800);
    // Gamma has no discharge/source/mouth in the fake → fallbacks.
    expect(top.discharge).toBe(0);
    expect(top.source).toBe(0);
    expect(top.mouth).toBe(0);
  });

  it("fills source / mouth / discharge when present", () => {
    const result = findLongestRiversInPack(asPack(makePack()), 100) as {
      rivers: Array<{
        i: number;
        discharge: number;
        source: number;
        mouth: number;
      }>;
    };
    const alpha = result.rivers.find((r) => r.i === 1);
    expect(alpha).toMatchObject({ discharge: 12, source: 11, mouth: 22 });
  });

  it("returns 'not-ready' when pack is undefined", () => {
    expect(findLongestRiversInPack(undefined, 10)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.rivers is missing", () => {
    expect(
      findLongestRiversInPack(
        {} as unknown as Parameters<typeof findLongestRiversInPack>[0],
        10,
      ),
    ).toBe("not-ready");
  });
});

describe("find_longest_rivers — tool surface", () => {
  function realRuntime(): FindLongestRiversRuntime {
    const pack = asPack(makePack());
    return { find: (n) => findLongestRiversInPack(pack, n) };
  }

  it("defaults n to 10 when omitted", async () => {
    const tool = createFindLongestRiversTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.requested_n).toBe(DEFAULT_FIND_LONGEST_RIVERS_N);
    // 10 actives total, default 10 → all of them
    expect(body.count).toBe(10);
    expect(body.rivers.length).toBe(10);
  });

  it("honors n=3 end-to-end (sorted desc)", async () => {
    const tool = createFindLongestRiversTool(realRuntime());
    const result = await tool.execute({ n: 3 });
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(3);
    expect(body.rivers.map((r: { i: number }) => r.i)).toEqual([3, 10, 1]);
    expect(body.requested_n).toBe(3);
  });

  it("rejects out-of-range / non-integer n", async () => {
    const tool = createFindLongestRiversTool(realRuntime());
    for (const bad of [
      { n: 0 },
      { n: -1 },
      { n: MAX_FIND_LONGEST_RIVERS_N + 1 },
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
    const tool = createFindLongestRiversTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ n: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("is exported as findLongestRiversTool with the expected schema", () => {
    expect(findLongestRiversTool.name).toBe("find_longest_rivers");
    expect(findLongestRiversTool.input_schema.type).toBe("object");
    expect(findLongestRiversTool.input_schema.required).toBeUndefined();
    expect(findLongestRiversTool.input_schema.properties.n).toBeDefined();
    // No area / filter properties
    expect(findLongestRiversTool.input_schema.properties.basin).toBeUndefined();
    expect(findLongestRiversTool.input_schema.properties.limit).toBeUndefined();
  });

  it("exposes DEFAULT / MAX constants", () => {
    expect(DEFAULT_FIND_LONGEST_RIVERS_N).toBe(10);
    expect(MAX_FIND_LONGEST_RIVERS_N).toBe(500);
  });
});

// ----- defaultFindLongestRiversRuntime integration -----

describe("defaultFindLongestRiversRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via default runtime and returns top-n sorted desc", () => {
    const result = defaultFindLongestRiversRuntime.find(3) as {
      rivers: Array<{ i: number; length: number }>;
      count: number;
      requested_n: number;
    };
    expect(result.rivers.map((r) => r.i)).toEqual([3, 10, 1]);
    expect(result.count).toBe(3);
    expect(result.requested_n).toBe(3);
  });

  it("returns 'not-ready' when pack is missing → tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindLongestRiversRuntime.find(5)).toBe("not-ready");
    const result = await findLongestRiversTool.execute({ n: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
