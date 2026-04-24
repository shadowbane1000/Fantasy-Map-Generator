import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindLargestReligionsTool,
  DEFAULT_FIND_LARGEST_RELIGIONS_BY,
  DEFAULT_FIND_LARGEST_RELIGIONS_N,
  defaultFindLargestReligionsRuntime,
  FIND_LARGEST_RELIGIONS_METRICS,
  type FindLargestReligionsMetric,
  type FindLargestReligionsResult,
  type FindLargestReligionsRuntime,
  findLargestReligionsInPack,
  findLargestReligionsTool,
  MAX_FIND_LARGEST_RELIGIONS_N,
} from "./find-largest-religions";

interface FakeReligion {
  i: number;
  name?: string;
  type?: string;
  form?: string;
  color?: string;
  area?: number;
  cells?: number;
  rural?: number;
  urban?: number;
  removed?: boolean;
}

interface FakePack {
  religions: FakeReligion[];
}

function makePack(): FakePack {
  // Religions (active unless noted):
  //   0: "No religion" placeholder
  //   1: Ashenfaith   area=100  cells=20  rural=50   urban=30
  //   2: Sealight     area=80   cells=30  rural=10   urban=5
  //   3: Gone         removed
  //   4: Brighthymn   area=60   cells=25  rural=100  urban=100
  //   5: Shadowcreed  area=150  cells=15  rural=5    urban=1
  return {
    religions: [
      { i: 0, name: "No religion" },
      {
        i: 1,
        name: "Ashenfaith",
        type: "Organized",
        form: "Monotheism",
        color: "#ff0000",
        area: 100,
        cells: 20,
        rural: 50,
        urban: 30,
      },
      {
        i: 2,
        name: "Sealight",
        type: "Folk",
        form: "Polytheism",
        color: "#00ff00",
        area: 80,
        cells: 30,
        rural: 10,
        urban: 5,
      },
      { i: 3, name: "Gone", removed: true, area: 9999, cells: 9999 },
      {
        i: 4,
        name: "Brighthymn",
        type: "Organized",
        form: "Dualism",
        color: "#0000ff",
        area: 60,
        cells: 25,
        rural: 100,
        urban: 100,
      },
      {
        i: 5,
        name: "Shadowcreed",
        type: "Cult",
        form: "Non-theism",
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
  return p as unknown as Parameters<typeof findLargestReligionsInPack>[0];
}

function runtimeReturning(
  result: FindLargestReligionsResult,
): FindLargestReligionsRuntime {
  return {
    find: () => result,
  };
}

function realRuntime(): FindLargestReligionsRuntime {
  const pack = makePack();
  return {
    find: (n, by) => findLargestReligionsInPack(asPack(pack), n, by),
  };
}

describe("find_largest_religions — pure ranker", () => {
  it("ranks by area descending (default)", () => {
    const result = findLargestReligionsInPack(
      asPack(makePack()),
      DEFAULT_FIND_LARGEST_RELIGIONS_N,
      "area",
    ) as { religions: Array<{ i: number; area: number }> };
    // Active: 5(150), 1(100), 2(80), 4(60)
    expect(result.religions.map((r) => r.i)).toEqual([5, 1, 2, 4]);
    expect(result.religions[0].area).toBe(150);
  });

  it("ranks by cells descending", () => {
    const result = findLargestReligionsInPack(
      asPack(makePack()),
      10,
      "cells",
    ) as { religions: Array<{ i: number; cells: number }> };
    // Active: 2(30), 4(25), 1(20), 5(15)
    expect(result.religions.map((r) => r.i)).toEqual([2, 4, 1, 5]);
    expect(result.religions[0].cells).toBe(30);
  });

  it("ranks by population (raw rural+urban) descending", () => {
    const result = findLargestReligionsInPack(
      asPack(makePack()),
      10,
      "population",
    ) as { religions: Array<{ i: number; population: number }> };
    // Active population = rural+urban: 4(200), 1(80), 2(15), 5(6)
    expect(result.religions.map((r) => r.i)).toEqual([4, 1, 2, 5]);
    expect(result.religions[0].population).toBe(200);
    expect(result.religions[1].population).toBe(80);
  });

  it("slices to top n", () => {
    const result = findLargestReligionsInPack(
      asPack(makePack()),
      2,
      "area",
    ) as { religions: Array<{ i: number }> };
    expect(result.religions.map((r) => r.i)).toEqual([5, 1]);
  });

  it("n larger than population returns all active religions", () => {
    const result = findLargestReligionsInPack(
      asPack(makePack()),
      500,
      "area",
    ) as { religions: Array<{ i: number }> };
    expect(result.religions).toHaveLength(4);
  });

  it("skips i=0 placeholder and removed religions", () => {
    const result = findLargestReligionsInPack(
      asPack(makePack()),
      500,
      "area",
    ) as { religions: Array<{ i: number }> };
    const ids = new Set(result.religions.map((r) => r.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(3)).toBe(false); // removed
  });

  it("populates name, color, type, form from the raw religion", () => {
    const result = findLargestReligionsInPack(
      asPack(makePack()),
      1,
      "area",
    ) as {
      religions: Array<{
        i: number;
        name: string;
        color: string | null;
        type: string | null;
        form: string | null;
      }>;
    };
    expect(result.religions[0]).toMatchObject({
      i: 5,
      name: "Shadowcreed",
      color: "#888888",
      type: "Cult",
      form: "Non-theism",
    });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(findLargestReligionsInPack(undefined, 10, "area")).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.religions is missing", () => {
    const pack = {} as unknown as Parameters<
      typeof findLargestReligionsInPack
    >[0];
    expect(findLargestReligionsInPack(pack, 10, "area")).toBe("not-ready");
  });

  it("empty pack.religions yields empty result", () => {
    const pack = { religions: [] } as unknown as Parameters<
      typeof findLargestReligionsInPack
    >[0];
    const result = findLargestReligionsInPack(pack, 10, "area") as {
      religions: unknown[];
    };
    expect(result.religions).toEqual([]);
  });

  it("treats missing numeric fields as 0", () => {
    const pack = {
      religions: [
        { i: 0 },
        { i: 1, name: "A" }, // no area/cells/rural/urban
        { i: 2, name: "B", area: 5 },
      ],
    } as unknown as Parameters<typeof findLargestReligionsInPack>[0];
    const result = findLargestReligionsInPack(pack, 10, "area") as {
      religions: Array<{ i: number; area: number; cells: number }>;
    };
    expect(result.religions[0].i).toBe(2);
    expect(result.religions[0].area).toBe(5);
    expect(result.religions[1].area).toBe(0);
    expect(result.religions[1].cells).toBe(0);
  });
});

describe("find_largest_religions — tool surface", () => {
  it("returns ok=true with top N ranked religions (default by=area)", async () => {
    const tool = createFindLargestReligionsTool(realRuntime());
    const result = await tool.execute({ n: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.requested_n).toBe(3);
    expect(body.by).toBe("area");
    expect(body.religions.map((r: { i: number }) => r.i)).toEqual([5, 1, 2]);
    expect(body.count).toBe(3);
  });

  it("defaults n to DEFAULT_FIND_LARGEST_RELIGIONS_N when omitted", async () => {
    let receivedN = -1;
    const runtime: FindLargestReligionsRuntime = {
      find: (n, _by) => {
        receivedN = n;
        return { religions: [] };
      },
    };
    const tool = createFindLargestReligionsTool(runtime);
    await tool.execute({});
    expect(receivedN).toBe(DEFAULT_FIND_LARGEST_RELIGIONS_N);
  });

  it("defaults by to DEFAULT_FIND_LARGEST_RELIGIONS_BY when omitted", async () => {
    let receivedBy: FindLargestReligionsMetric | null = null;
    const runtime: FindLargestReligionsRuntime = {
      find: (_n, by) => {
        receivedBy = by;
        return { religions: [] };
      },
    };
    const tool = createFindLargestReligionsTool(runtime);
    await tool.execute({});
    expect(receivedBy).toBe(DEFAULT_FIND_LARGEST_RELIGIONS_BY);
  });

  it("accepts case-insensitive by", async () => {
    const tool = createFindLargestReligionsTool(realRuntime());
    for (const input of ["POPULATION", "Population", " population "]) {
      const r = await tool.execute({ by: input, n: 1 });
      expect(r.isError).toBeFalsy();
      const body = JSON.parse(r.content);
      expect(body.by).toBe("population");
      expect(body.religions[0].i).toBe(4); // Brighthymn has highest raw pop
    }
  });

  it("ranks by cells when by='cells'", async () => {
    const tool = createFindLargestReligionsTool(realRuntime());
    const r = await tool.execute({ by: "cells" });
    const body = JSON.parse(r.content);
    expect(body.by).toBe("cells");
    expect(body.religions.map((r: { i: number }) => r.i)).toEqual([2, 4, 1, 5]);
  });

  it("rejects invalid by", async () => {
    const tool = createFindLargestReligionsTool(realRuntime());
    for (const bad of ["size", "", "pop", 42, true]) {
      const r = await tool.execute({ by: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/by must be one of/);
    }
  });

  it("rejects invalid n", async () => {
    const tool = createFindLargestReligionsTool(realRuntime());
    for (const bad of [
      { n: 0 },
      { n: -1 },
      { n: 1.5 },
      { n: "10" },
      { n: MAX_FIND_LARGEST_RELIGIONS_N + 1 },
      { n: Number.NaN },
      { n: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/n must be an integer/);
    }
  });

  it("returns empty religions for pack with only placeholder/removed", async () => {
    const runtime: FindLargestReligionsRuntime = {
      find: () => ({ religions: [] }),
    };
    const t = createFindLargestReligionsTool(runtime);
    const r = await t.execute({});
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.religions).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindLargestReligionsTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ n: 10 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("is exported as findLargestReligionsTool with the expected schema", () => {
    expect(findLargestReligionsTool.name).toBe("find_largest_religions");
    expect(findLargestReligionsTool.input_schema.type).toBe("object");
    expect(findLargestReligionsTool.input_schema.properties.n).toBeDefined();
    expect(findLargestReligionsTool.input_schema.properties.by).toBeDefined();
    const bySchema = findLargestReligionsTool.input_schema.properties
      .by as unknown as { enum?: string[] };
    expect(bySchema.enum).toEqual([...FIND_LARGEST_RELIGIONS_METRICS]);
  });

  it("exposes DEFAULT and MAX n + metric constants", () => {
    expect(DEFAULT_FIND_LARGEST_RELIGIONS_N).toBe(10);
    expect(MAX_FIND_LARGEST_RELIGIONS_N).toBe(500);
    expect(DEFAULT_FIND_LARGEST_RELIGIONS_BY).toBe("area");
    expect(FIND_LARGEST_RELIGIONS_METRICS).toEqual([
      "area",
      "cells",
      "population",
    ]);
  });

  it("echoes requested_n and by on the response", async () => {
    const tool = createFindLargestReligionsTool(realRuntime());
    const result = await tool.execute({ n: 2, by: "cells" });
    const body = JSON.parse(result.content);
    expect(body.requested_n).toBe(2);
    expect(body.by).toBe("cells");
    expect(body.religions).toHaveLength(2);
  });
});

// ----- defaultFindLargestReligionsRuntime integration -----

describe("defaultFindLargestReligionsRuntime (integration)", () => {
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
    const result = defaultFindLargestReligionsRuntime.find(3, "area") as {
      religions: Array<{ i: number }>;
    };
    expect(result.religions.map((r) => r.i)).toEqual([5, 1, 2]);
  });

  it("ranks by population via the default runtime", () => {
    const result = defaultFindLargestReligionsRuntime.find(1, "population") as {
      religions: Array<{ i: number; population: number }>;
    };
    expect(result.religions[0].i).toBe(4);
    expect(result.religions[0].population).toBe(200);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findLargestReligionsTool.execute({
      n: 1,
      by: "area",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.religions).toHaveLength(1);
    expect(body.religions[0].i).toBe(5);
    expect(body.religions[0].name).toBe("Shadowcreed");
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindLargestReligionsRuntime.find(10, "area")).toBe(
      "not-ready",
    );
    const result = await findLargestReligionsTool.execute({ n: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
