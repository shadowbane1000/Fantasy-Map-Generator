import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindLargestProvincesTool,
  DEFAULT_FIND_LARGEST_PROVINCES_BY,
  DEFAULT_FIND_LARGEST_PROVINCES_N,
  defaultFindLargestProvincesRuntime,
  FIND_LARGEST_PROVINCES_METRICS,
  type FindLargestProvincesMetric,
  type FindLargestProvincesResult,
  type FindLargestProvincesRuntime,
  findLargestProvincesInPack,
  findLargestProvincesTool,
  MAX_FIND_LARGEST_PROVINCES_N,
} from "./find-largest-provinces";

interface FakeProvince {
  i: number;
  name?: string;
  fullName?: string;
  formName?: string;
  color?: string;
  removed?: boolean;
}

interface FakeBurg {
  i: number;
  name?: string;
  cell?: number;
  population?: number;
  removed?: boolean;
}

interface FakePack {
  provinces: Array<FakeProvince | undefined>;
  burgs?: Array<FakeBurg | undefined>;
  cells?: {
    province?: number[];
    pop?: number[];
    area?: number[];
  };
}

// Test world:
// Province layout (cells 0..19):
//   Province 1 "Rookmark":  cells 1..4  (4 cells, areas 10+20+30+40=100, rural pop 1+2+3+4=10, burgs: #1 pop 5, #2 pop 3)
//   Province 2 "Elsewhere": cells 5..10 (6 cells, areas 5+5+5+5+5+5=30,   rural pop 2+2+2+2+2+2=12, burgs: #3 pop 100)
//   Province 3 "Removed":   marked removed (should be skipped even if cells exist)
//   Province 4 "Small":     cells 11..12 (2 cells, areas 1+1=2, rural pop 0+0=0, no burgs)
//   Province 5 "Empty":     no cells, no burgs (0/0/0)
// Province 0 placeholder must be skipped.
function makePack(): FakePack {
  const province = new Array<number>(20).fill(0);
  const area = new Array<number>(20).fill(0);
  const pop = new Array<number>(20).fill(0);

  // Province 1 cells 1..4
  for (let i = 1; i <= 4; i++) {
    province[i] = 1;
    area[i] = i * 10; // 10, 20, 30, 40
    pop[i] = i; // 1, 2, 3, 4
  }
  // Province 2 cells 5..10
  for (let i = 5; i <= 10; i++) {
    province[i] = 2;
    area[i] = 5;
    pop[i] = 2;
  }
  // Province 4 cells 11..12
  province[11] = 4;
  province[12] = 4;
  area[11] = 1;
  area[12] = 1;
  // Cells 13..15 are assigned to a removed province (3) to check we skip it.
  province[13] = 3;
  province[14] = 3;
  province[15] = 3;
  area[13] = 1000;
  area[14] = 1000;
  area[15] = 1000;

  return {
    provinces: [
      { i: 0, name: "placeholder" },
      {
        i: 1,
        name: "Rookmark",
        fullName: "Principality of Rookmark",
        formName: "Principality",
        color: "#aabbcc",
      },
      {
        i: 2,
        name: "Elsewhere",
        fullName: "The Elsewhere",
        formName: "Duchy",
        color: "#112233",
      },
      { i: 3, name: "Removed", removed: true },
      { i: 4, name: "Small", formName: "County", color: "#445566" },
      { i: 5, name: "Empty", formName: "March", color: "#778899" },
    ],
    burgs: [
      { i: 0 },
      { i: 1, name: "Ironhold", cell: 2, population: 5 },
      { i: 2, name: "Stormport", cell: 3, population: 3 },
      { i: 3, name: "Bigcity", cell: 7, population: 100 },
      { i: 4, name: "Ghost", cell: 14, population: 9999, removed: true },
    ],
    cells: { province, pop, area },
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findLargestProvincesInPack>[0];
}

function runtimeReturning(
  result: FindLargestProvincesResult,
): FindLargestProvincesRuntime {
  return { find: () => result };
}

function realRuntime(): FindLargestProvincesRuntime {
  const pack = makePack();
  return {
    find: (n, by) => findLargestProvincesInPack(asPack(pack), n, by),
  };
}

describe("find_largest_provinces — pure ranker", () => {
  it("ranks by area descending (default)", () => {
    const result = findLargestProvincesInPack(
      asPack(makePack()),
      DEFAULT_FIND_LARGEST_PROVINCES_N,
      "area",
    ) as { provinces: Array<{ i: number; area: number }> };
    // Active: 1(100), 2(30), 4(2), 5(0)
    expect(result.provinces.map((p) => p.i)).toEqual([1, 2, 4, 5]);
    expect(result.provinces[0].area).toBe(100);
  });

  it("ranks by cells descending", () => {
    const result = findLargestProvincesInPack(
      asPack(makePack()),
      10,
      "cells",
    ) as { provinces: Array<{ i: number; cells_count: number }> };
    // Active: 2(6), 1(4), 4(2), 5(0)
    expect(result.provinces.map((p) => p.i)).toEqual([2, 1, 4, 5]);
    expect(result.provinces[0].cells_count).toBe(6);
  });

  it("ranks by population (raw rural+urban) descending", () => {
    const result = findLargestProvincesInPack(
      asPack(makePack()),
      10,
      "population",
    ) as { provinces: Array<{ i: number; population: number }> };
    // Province 1: rural 10 + urban (5+3) = 18
    // Province 2: rural 12 + urban 100     = 112
    // Province 4: rural 0  + urban 0       = 0
    // Province 5: rural 0  + urban 0       = 0
    expect(result.provinces[0].i).toBe(2);
    expect(result.provinces[0].population).toBe(112);
    expect(result.provinces[1].i).toBe(1);
    expect(result.provinces[1].population).toBe(18);
  });

  it("excludes the removed burg from urban pop", () => {
    // Burg 4 (cell 14) is removed + belongs to removed province 3 anyway —
    // its population (9999) must not leak into any hit.
    const result = findLargestProvincesInPack(
      asPack(makePack()),
      10,
      "population",
    ) as { provinces: Array<{ i: number; population: number }> };
    for (const p of result.provinces) {
      expect(p.population).toBeLessThan(9999);
    }
  });

  it("slices to top n", () => {
    const result = findLargestProvincesInPack(
      asPack(makePack()),
      2,
      "area",
    ) as { provinces: Array<{ i: number }> };
    expect(result.provinces.map((p) => p.i)).toEqual([1, 2]);
  });

  it("n larger than population returns all active provinces", () => {
    const result = findLargestProvincesInPack(
      asPack(makePack()),
      500,
      "area",
    ) as { provinces: Array<{ i: number }> };
    expect(result.provinces).toHaveLength(4);
  });

  it("skips i=0 placeholder and removed provinces", () => {
    const result = findLargestProvincesInPack(
      asPack(makePack()),
      500,
      "area",
    ) as { provinces: Array<{ i: number }> };
    const ids = new Set(result.provinces.map((p) => p.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(3)).toBe(false); // removed
  });

  it("populates name, fullName, formName, color from the raw province", () => {
    const result = findLargestProvincesInPack(
      asPack(makePack()),
      1,
      "area",
    ) as {
      provinces: Array<{
        i: number;
        name: string;
        fullName: string | null;
        formName: string | null;
        color: string | null;
      }>;
    };
    expect(result.provinces[0]).toMatchObject({
      i: 1,
      name: "Rookmark",
      fullName: "Principality of Rookmark",
      formName: "Principality",
      color: "#aabbcc",
    });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(findLargestProvincesInPack(undefined, 10, "area")).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.provinces is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findLargestProvincesInPack
    >[0];
    expect(findLargestProvincesInPack(pack, 10, "area")).toBe("not-ready");
  });

  it("empty pack.provinces yields empty result", () => {
    const pack = { provinces: [] } as unknown as Parameters<
      typeof findLargestProvincesInPack
    >[0];
    const result = findLargestProvincesInPack(pack, 10, "area") as {
      provinces: unknown[];
    };
    expect(result.provinces).toEqual([]);
  });

  it("treats missing cells/burgs gracefully (zero area/cells/population)", () => {
    const pack = {
      provinces: [{ i: 0 }, { i: 1, name: "A" }, { i: 2, name: "B" }],
    } as unknown as Parameters<typeof findLargestProvincesInPack>[0];
    const result = findLargestProvincesInPack(pack, 10, "area") as {
      provinces: Array<{
        i: number;
        area: number;
        cells_count: number;
        population: number;
      }>;
    };
    expect(result.provinces).toHaveLength(2);
    for (const p of result.provinces) {
      expect(p.area).toBe(0);
      expect(p.cells_count).toBe(0);
      expect(p.population).toBe(0);
    }
  });

  it("ignores burgs whose cell is out of range", () => {
    const pack = makePack();
    if (pack.burgs?.[3]) pack.burgs[3] = { ...pack.burgs[3], cell: 99999 };
    const result = findLargestProvincesInPack(
      asPack(pack),
      10,
      "population",
    ) as { provinces: Array<{ i: number; population: number }> };
    const p2 = result.provinces.find((p) => p.i === 2);
    // Province 2 originally 112; without the 100-pop burg it's just rural 12.
    expect(p2?.population).toBe(12);
  });

  it("ignores burgs whose cell sits on province 0 (placeholder)", () => {
    const pack = makePack();
    // Move burg #3 (pop 100) to a placeholder cell (cell 0 has province 0).
    if (pack.burgs?.[3]) pack.burgs[3] = { ...pack.burgs[3], cell: 0 };
    const result = findLargestProvincesInPack(
      asPack(pack),
      10,
      "population",
    ) as { provinces: Array<{ i: number; population: number }> };
    // Province 2 urban drops to 0 → just rural 12.
    const p2 = result.provinces.find((p) => p.i === 2);
    expect(p2?.population).toBe(12);
  });
});

describe("find_largest_provinces — tool surface", () => {
  it("returns ok=true with top N ranked provinces (default by=area)", async () => {
    const tool = createFindLargestProvincesTool(realRuntime());
    const result = await tool.execute({ n: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.requested_n).toBe(3);
    expect(body.by).toBe("area");
    expect(body.provinces.map((p: { i: number }) => p.i)).toEqual([1, 2, 4]);
    expect(body.count).toBe(3);
  });

  it("defaults n to DEFAULT_FIND_LARGEST_PROVINCES_N when omitted", async () => {
    let receivedN = -1;
    const runtime: FindLargestProvincesRuntime = {
      find: (n, _by) => {
        receivedN = n;
        return { provinces: [] };
      },
    };
    const tool = createFindLargestProvincesTool(runtime);
    await tool.execute({});
    expect(receivedN).toBe(DEFAULT_FIND_LARGEST_PROVINCES_N);
  });

  it("defaults by to DEFAULT_FIND_LARGEST_PROVINCES_BY when omitted", async () => {
    let receivedBy: FindLargestProvincesMetric | null = null;
    const runtime: FindLargestProvincesRuntime = {
      find: (_n, by) => {
        receivedBy = by;
        return { provinces: [] };
      },
    };
    const tool = createFindLargestProvincesTool(runtime);
    await tool.execute({});
    expect(receivedBy).toBe(DEFAULT_FIND_LARGEST_PROVINCES_BY);
  });

  it("accepts case-insensitive by", async () => {
    const tool = createFindLargestProvincesTool(realRuntime());
    for (const input of ["POPULATION", "Population", " population "]) {
      const r = await tool.execute({ by: input, n: 1 });
      expect(r.isError).toBeFalsy();
      const body = JSON.parse(r.content);
      expect(body.by).toBe("population");
      expect(body.provinces[0].i).toBe(2); // Elsewhere has highest raw pop
    }
  });

  it("ranks by cells when by='cells'", async () => {
    const tool = createFindLargestProvincesTool(realRuntime());
    const r = await tool.execute({ by: "cells" });
    const body = JSON.parse(r.content);
    expect(body.by).toBe("cells");
    expect(body.provinces.map((p: { i: number }) => p.i)).toEqual([2, 1, 4, 5]);
  });

  it("rejects invalid by", async () => {
    const tool = createFindLargestProvincesTool(realRuntime());
    for (const bad of ["size", "", "pop", 42, true]) {
      const r = await tool.execute({ by: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/by must be one of/);
    }
  });

  it("rejects invalid n", async () => {
    const tool = createFindLargestProvincesTool(realRuntime());
    for (const bad of [
      { n: 0 },
      { n: -1 },
      { n: 1.5 },
      { n: "10" },
      { n: MAX_FIND_LARGEST_PROVINCES_N + 1 },
      { n: Number.NaN },
      { n: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/n must be an integer/);
    }
  });

  it("returns empty provinces for pack with only placeholder/removed", async () => {
    const runtime: FindLargestProvincesRuntime = {
      find: () => ({ provinces: [] }),
    };
    const t = createFindLargestProvincesTool(runtime);
    const r = await t.execute({});
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.provinces).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindLargestProvincesTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ n: 10 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("is exported as findLargestProvincesTool with the expected schema", () => {
    expect(findLargestProvincesTool.name).toBe("find_largest_provinces");
    expect(findLargestProvincesTool.input_schema.type).toBe("object");
    expect(findLargestProvincesTool.input_schema.properties.n).toBeDefined();
    expect(findLargestProvincesTool.input_schema.properties.by).toBeDefined();
    const bySchema = findLargestProvincesTool.input_schema.properties
      .by as unknown as { enum?: string[] };
    expect(bySchema.enum).toEqual([...FIND_LARGEST_PROVINCES_METRICS]);
  });

  it("exposes DEFAULT and MAX n + metric constants", () => {
    expect(DEFAULT_FIND_LARGEST_PROVINCES_N).toBe(10);
    expect(MAX_FIND_LARGEST_PROVINCES_N).toBe(500);
    expect(DEFAULT_FIND_LARGEST_PROVINCES_BY).toBe("area");
    expect(FIND_LARGEST_PROVINCES_METRICS).toEqual([
      "area",
      "cells",
      "population",
    ]);
  });

  it("echoes requested_n and by on the response", async () => {
    const tool = createFindLargestProvincesTool(realRuntime());
    const result = await tool.execute({ n: 2, by: "cells" });
    const body = JSON.parse(result.content);
    expect(body.requested_n).toBe(2);
    expect(body.by).toBe("cells");
    expect(body.provinces).toHaveLength(2);
  });
});

// ----- defaultFindLargestProvincesRuntime integration -----

describe("defaultFindLargestProvincesRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
  };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads real pack via the default runtime (happy path)", () => {
    const result = defaultFindLargestProvincesRuntime.find(3, "area") as {
      provinces: Array<{ i: number }>;
    };
    expect(result.provinces.map((p) => p.i)).toEqual([1, 2, 4]);
  });

  it("ranks by population via the default runtime", () => {
    const result = defaultFindLargestProvincesRuntime.find(1, "population") as {
      provinces: Array<{ i: number; population: number }>;
    };
    expect(result.provinces[0].i).toBe(2);
    expect(result.provinces[0].population).toBe(112);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findLargestProvincesTool.execute({
      n: 1,
      by: "area",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.provinces).toHaveLength(1);
    expect(body.provinces[0].i).toBe(1);
    expect(body.provinces[0].name).toBe("Rookmark");
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindLargestProvincesRuntime.find(10, "area")).toBe(
      "not-ready",
    );
    const result = await findLargestProvincesTool.execute({ n: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
