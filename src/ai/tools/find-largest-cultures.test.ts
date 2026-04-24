import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindLargestCulturesTool,
  DEFAULT_FIND_LARGEST_CULTURES_BY,
  DEFAULT_FIND_LARGEST_CULTURES_N,
  defaultFindLargestCulturesRuntime,
  FIND_LARGEST_CULTURES_METRICS,
  type FindLargestCulturesMetric,
  type FindLargestCulturesResult,
  type FindLargestCulturesRuntime,
  findLargestCulturesInPack,
  findLargestCulturesTool,
  MAX_FIND_LARGEST_CULTURES_N,
} from "./find-largest-cultures";

interface FakeCulture {
  i: number;
  name?: string;
  color?: string;
  type?: string;
  area?: number;
  cells?: number;
  rural?: number;
  urban?: number;
  removed?: boolean;
}

interface FakePack {
  cultures: FakeCulture[];
}

function makePack(): FakePack {
  // Cultures (active unless noted):
  //   0: Wildlands placeholder (skipped even without removed)
  //   1: Altarian  area=100  cells=20  rural=50   urban=30
  //   2: Valorin   area=80   cells=30  rural=10   urban=5
  //   3: Gone      removed (large values to confirm it's skipped)
  //   4: Brightfolk area=60  cells=25  rural=100  urban=100
  //   5: Shadowkin area=150  cells=15  rural=5    urban=1
  return {
    cultures: [
      { i: 0, name: "Wildlands" },
      {
        i: 1,
        name: "Altarian",
        type: "Generic",
        color: "#ff0000",
        area: 100,
        cells: 20,
        rural: 50,
        urban: 30,
      },
      {
        i: 2,
        name: "Valorin",
        type: "Highland",
        color: "#00ff00",
        area: 80,
        cells: 30,
        rural: 10,
        urban: 5,
      },
      {
        i: 3,
        name: "Gone",
        removed: true,
        area: 9999,
        cells: 9999,
        rural: 9999,
        urban: 9999,
      },
      {
        i: 4,
        name: "Brightfolk",
        type: "River",
        color: "#0000ff",
        area: 60,
        cells: 25,
        rural: 100,
        urban: 100,
      },
      {
        i: 5,
        name: "Shadowkin",
        type: "Nomadic",
        color: "#888888",
        area: 150,
        cells: 15,
        rural: 5,
        urban: 1,
      },
    ],
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findLargestCulturesInPack>[0];
}

function runtimeReturning(
  result: FindLargestCulturesResult,
): FindLargestCulturesRuntime {
  return {
    find: () => result,
  };
}

function realRuntime(): FindLargestCulturesRuntime {
  const pack = makePack();
  return {
    find: (n, by) => findLargestCulturesInPack(asPack(pack), n, by),
  };
}

describe("find_largest_cultures — pure ranker", () => {
  it("ranks by area descending (default)", () => {
    const result = findLargestCulturesInPack(
      asPack(makePack()),
      DEFAULT_FIND_LARGEST_CULTURES_N,
      "area",
    ) as { cultures: Array<{ i: number; area: number }> };
    // Active: 5(150), 1(100), 2(80), 4(60)
    expect(result.cultures.map((c) => c.i)).toEqual([5, 1, 2, 4]);
    expect(result.cultures[0].area).toBe(150);
  });

  it("ranks by cells descending", () => {
    const result = findLargestCulturesInPack(
      asPack(makePack()),
      10,
      "cells",
    ) as { cultures: Array<{ i: number; cells: number }> };
    // Active: 2(30), 4(25), 1(20), 5(15)
    expect(result.cultures.map((c) => c.i)).toEqual([2, 4, 1, 5]);
    expect(result.cultures[0].cells).toBe(30);
  });

  it("ranks by population (raw rural+urban) descending", () => {
    const result = findLargestCulturesInPack(
      asPack(makePack()),
      10,
      "population",
    ) as { cultures: Array<{ i: number; population: number }> };
    // Active population = rural+urban: 4(200), 1(80), 2(15), 5(6)
    expect(result.cultures.map((c) => c.i)).toEqual([4, 1, 2, 5]);
    expect(result.cultures[0].population).toBe(200);
    expect(result.cultures[1].population).toBe(80);
  });

  it("slices to top n", () => {
    const result = findLargestCulturesInPack(asPack(makePack()), 2, "area") as {
      cultures: Array<{ i: number }>;
    };
    expect(result.cultures.map((c) => c.i)).toEqual([5, 1]);
  });

  it("n larger than population returns all active cultures", () => {
    const result = findLargestCulturesInPack(
      asPack(makePack()),
      500,
      "area",
    ) as { cultures: Array<{ i: number }> };
    expect(result.cultures).toHaveLength(4);
  });

  it("skips i=0 Wildlands placeholder and removed cultures", () => {
    const result = findLargestCulturesInPack(
      asPack(makePack()),
      500,
      "area",
    ) as { cultures: Array<{ i: number }> };
    const ids = new Set(result.cultures.map((c) => c.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(3)).toBe(false); // removed
  });

  it("populates name, color, type from the raw culture", () => {
    const result = findLargestCulturesInPack(asPack(makePack()), 1, "area") as {
      cultures: Array<{
        i: number;
        name: string;
        color: string | null;
        type: string | null;
      }>;
    };
    expect(result.cultures[0]).toMatchObject({
      i: 5,
      name: "Shadowkin",
      color: "#888888",
      type: "Nomadic",
    });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(findLargestCulturesInPack(undefined, 10, "area")).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.cultures is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findLargestCulturesInPack
    >[0];
    expect(findLargestCulturesInPack(pack, 10, "area")).toBe("not-ready");
  });

  it("empty pack.cultures yields empty result", () => {
    const pack = { cultures: [] } as unknown as Parameters<
      typeof findLargestCulturesInPack
    >[0];
    const result = findLargestCulturesInPack(pack, 10, "area") as {
      cultures: unknown[];
    };
    expect(result.cultures).toEqual([]);
  });

  it("treats missing numeric fields as 0", () => {
    const pack = {
      cultures: [
        { i: 0 },
        { i: 1, name: "A" }, // no area/cells/rural/urban
        { i: 2, name: "B", area: 5 },
      ],
    } as unknown as Parameters<typeof findLargestCulturesInPack>[0];
    const result = findLargestCulturesInPack(pack, 10, "area") as {
      cultures: Array<{ i: number; area: number; cells: number }>;
    };
    expect(result.cultures[0].i).toBe(2);
    expect(result.cultures[0].area).toBe(5);
    expect(result.cultures[1].area).toBe(0);
    expect(result.cultures[1].cells).toBe(0);
  });

  it("defaults missing color/type to null", () => {
    const pack = {
      cultures: [{ i: 0 }, { i: 1, name: "Bare", area: 10 }],
    } as unknown as Parameters<typeof findLargestCulturesInPack>[0];
    const result = findLargestCulturesInPack(pack, 10, "area") as {
      cultures: Array<{ color: string | null; type: string | null }>;
    };
    expect(result.cultures[0].color).toBeNull();
    expect(result.cultures[0].type).toBeNull();
  });
});

describe("find_largest_cultures — tool surface", () => {
  it("returns ok=true with top N ranked cultures (default by=area)", async () => {
    const tool = createFindLargestCulturesTool(realRuntime());
    const result = await tool.execute({ n: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.requested_n).toBe(3);
    expect(body.by).toBe("area");
    expect(body.cultures.map((c: { i: number }) => c.i)).toEqual([5, 1, 2]);
    expect(body.count).toBe(3);
  });

  it("defaults n to DEFAULT_FIND_LARGEST_CULTURES_N when omitted", async () => {
    let receivedN = -1;
    const runtime: FindLargestCulturesRuntime = {
      find: (n, _by) => {
        receivedN = n;
        return { cultures: [] };
      },
    };
    const tool = createFindLargestCulturesTool(runtime);
    await tool.execute({});
    expect(receivedN).toBe(DEFAULT_FIND_LARGEST_CULTURES_N);
  });

  it("defaults by to DEFAULT_FIND_LARGEST_CULTURES_BY when omitted", async () => {
    let receivedBy: FindLargestCulturesMetric | null = null;
    const runtime: FindLargestCulturesRuntime = {
      find: (_n, by) => {
        receivedBy = by;
        return { cultures: [] };
      },
    };
    const tool = createFindLargestCulturesTool(runtime);
    await tool.execute({});
    expect(receivedBy).toBe(DEFAULT_FIND_LARGEST_CULTURES_BY);
  });

  it("accepts case-insensitive by", async () => {
    const tool = createFindLargestCulturesTool(realRuntime());
    for (const input of ["POPULATION", "Population", " population "]) {
      const r = await tool.execute({ by: input, n: 1 });
      expect(r.isError).toBeFalsy();
      const body = JSON.parse(r.content);
      expect(body.by).toBe("population");
      expect(body.cultures[0].i).toBe(4); // Brightfolk has highest raw pop
    }
  });

  it("ranks by cells when by='cells'", async () => {
    const tool = createFindLargestCulturesTool(realRuntime());
    const r = await tool.execute({ by: "cells" });
    const body = JSON.parse(r.content);
    expect(body.by).toBe("cells");
    expect(body.cultures.map((c: { i: number }) => c.i)).toEqual([2, 4, 1, 5]);
  });

  it("rejects invalid by", async () => {
    const tool = createFindLargestCulturesTool(realRuntime());
    for (const bad of ["size", "", "pop", 42, true]) {
      const r = await tool.execute({ by: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/by must be one of/);
    }
  });

  it("rejects invalid n", async () => {
    const tool = createFindLargestCulturesTool(realRuntime());
    for (const bad of [
      { n: 0 },
      { n: -1 },
      { n: 1.5 },
      { n: "10" },
      { n: MAX_FIND_LARGEST_CULTURES_N + 1 },
      { n: Number.NaN },
      { n: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/n must be an integer/);
    }
  });

  it("returns empty cultures for pack with only Wildlands/removed", async () => {
    const runtime: FindLargestCulturesRuntime = {
      find: () => ({ cultures: [] }),
    };
    const t = createFindLargestCulturesTool(runtime);
    const r = await t.execute({});
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.cultures).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindLargestCulturesTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ n: 10 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("is exported as findLargestCulturesTool with the expected schema", () => {
    expect(findLargestCulturesTool.name).toBe("find_largest_cultures");
    expect(findLargestCulturesTool.input_schema.type).toBe("object");
    expect(findLargestCulturesTool.input_schema.properties.n).toBeDefined();
    expect(findLargestCulturesTool.input_schema.properties.by).toBeDefined();
    const bySchema = findLargestCulturesTool.input_schema.properties
      .by as unknown as { enum?: string[] };
    expect(bySchema.enum).toEqual([...FIND_LARGEST_CULTURES_METRICS]);
  });

  it("exposes DEFAULT and MAX n + metric constants", () => {
    expect(DEFAULT_FIND_LARGEST_CULTURES_N).toBe(10);
    expect(MAX_FIND_LARGEST_CULTURES_N).toBe(500);
    expect(DEFAULT_FIND_LARGEST_CULTURES_BY).toBe("area");
    expect(FIND_LARGEST_CULTURES_METRICS).toEqual([
      "area",
      "cells",
      "population",
    ]);
  });

  it("echoes requested_n and by on the response", async () => {
    const tool = createFindLargestCulturesTool(realRuntime());
    const result = await tool.execute({ n: 2, by: "cells" });
    const body = JSON.parse(result.content);
    expect(body.requested_n).toBe(2);
    expect(body.by).toBe("cells");
    expect(body.cultures).toHaveLength(2);
  });
});

// ----- defaultFindLargestCulturesRuntime integration -----

describe("defaultFindLargestCulturesRuntime (integration)", () => {
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
    const result = defaultFindLargestCulturesRuntime.find(3, "area") as {
      cultures: Array<{ i: number }>;
    };
    expect(result.cultures.map((c) => c.i)).toEqual([5, 1, 2]);
  });

  it("ranks by population via the default runtime", () => {
    const result = defaultFindLargestCulturesRuntime.find(1, "population") as {
      cultures: Array<{ i: number; population: number }>;
    };
    expect(result.cultures[0].i).toBe(4);
    expect(result.cultures[0].population).toBe(200);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findLargestCulturesTool.execute({ n: 1, by: "area" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.cultures).toHaveLength(1);
    expect(body.cultures[0].i).toBe(5);
    expect(body.cultures[0].name).toBe("Shadowkin");
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindLargestCulturesRuntime.find(10, "area")).toBe(
      "not-ready",
    );
    const result = await findLargestCulturesTool.execute({ n: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
