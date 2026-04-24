import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFindLargestStatesTool,
  DEFAULT_FIND_LARGEST_STATES_BY,
  DEFAULT_FIND_LARGEST_STATES_N,
  defaultFindLargestStatesRuntime,
  FIND_LARGEST_STATES_METRICS,
  type FindLargestStatesMetric,
  type FindLargestStatesResult,
  type FindLargestStatesRuntime,
  findLargestStatesInPack,
  findLargestStatesTool,
  MAX_FIND_LARGEST_STATES_N,
} from "./find-largest-states";

interface FakeBurg {
  i: number;
  name?: string;
  removed?: boolean;
}

interface FakeState {
  i: number;
  name?: string;
  fullName?: string;
  form?: string;
  color?: string;
  capital?: number;
  area?: number;
  cells?: number;
  rural?: number;
  urban?: number;
  removed?: boolean;
}

interface FakePack {
  states: FakeState[];
  burgs?: FakeBurg[];
}

function makePack(): FakePack {
  // States (active unless noted):
  //   0: Neutrals placeholder
  //   1: Altaria    area=100  cells=20  rural=50   urban=30   capital=1 Aria
  //   2: Valorin    area=80   cells=30  rural=10   urban=5    capital=2 Valen
  //   3: Gone       removed
  //   4: Brightmark area=60   cells=25  rural=100  urban=100  capital=3 Lumen
  //   5: Shadowfen  area=150  cells=15  rural=5    urban=1    capital=0 (no capital)
  return {
    states: [
      { i: 0, name: "Neutrals" },
      {
        i: 1,
        name: "Altaria",
        fullName: "Kingdom of Altaria",
        form: "Monarchy",
        color: "#ff0000",
        capital: 1,
        area: 100,
        cells: 20,
        rural: 50,
        urban: 30,
      },
      {
        i: 2,
        name: "Valorin",
        fullName: "Republic of Valorin",
        form: "Republic",
        color: "#00ff00",
        capital: 2,
        area: 80,
        cells: 30,
        rural: 10,
        urban: 5,
      },
      { i: 3, name: "Gone", removed: true, area: 9999, cells: 9999 },
      {
        i: 4,
        name: "Brightmark",
        fullName: "Duchy of Brightmark",
        form: "Duchy",
        color: "#0000ff",
        capital: 3,
        area: 60,
        cells: 25,
        rural: 100,
        urban: 100,
      },
      {
        i: 5,
        name: "Shadowfen",
        fullName: "Dominion of Shadowfen",
        form: "Dominion",
        color: "#888888",
        capital: 0,
        area: 150,
        cells: 15,
        rural: 5,
        urban: 1,
      },
    ],
    burgs: [
      { i: 0 },
      { i: 1, name: "Aria" },
      { i: 2, name: "Valen" },
      { i: 3, name: "Lumen" },
    ],
  };
}

function asPack(p: FakePack) {
  return p as unknown as Parameters<typeof findLargestStatesInPack>[0];
}

function runtimeReturning(
  result: FindLargestStatesResult,
): FindLargestStatesRuntime {
  return {
    find: () => result,
  };
}

function realRuntime(): FindLargestStatesRuntime {
  const pack = makePack();
  return {
    find: (n, by) => findLargestStatesInPack(asPack(pack), n, by),
  };
}

describe("find_largest_states — pure ranker", () => {
  it("ranks by area descending (default)", () => {
    const result = findLargestStatesInPack(
      asPack(makePack()),
      DEFAULT_FIND_LARGEST_STATES_N,
      "area",
    ) as { states: Array<{ i: number; area: number }> };
    // Active: 5(150), 1(100), 2(80), 4(60)
    expect(result.states.map((s) => s.i)).toEqual([5, 1, 2, 4]);
    expect(result.states[0].area).toBe(150);
  });

  it("ranks by cells descending", () => {
    const result = findLargestStatesInPack(asPack(makePack()), 10, "cells") as {
      states: Array<{ i: number; cells: number }>;
    };
    // Active: 2(30), 4(25), 1(20), 5(15)
    expect(result.states.map((s) => s.i)).toEqual([2, 4, 1, 5]);
    expect(result.states[0].cells).toBe(30);
  });

  it("ranks by population (raw rural+urban) descending", () => {
    const result = findLargestStatesInPack(
      asPack(makePack()),
      10,
      "population",
    ) as { states: Array<{ i: number; population: number }> };
    // Active population = rural+urban: 4(200), 1(80), 2(15), 5(6)
    expect(result.states.map((s) => s.i)).toEqual([4, 1, 2, 5]);
    expect(result.states[0].population).toBe(200);
    expect(result.states[1].population).toBe(80);
  });

  it("slices to top n", () => {
    const result = findLargestStatesInPack(asPack(makePack()), 2, "area") as {
      states: Array<{ i: number }>;
    };
    expect(result.states.map((s) => s.i)).toEqual([5, 1]);
  });

  it("n larger than population returns all active states", () => {
    const result = findLargestStatesInPack(asPack(makePack()), 500, "area") as {
      states: Array<{ i: number }>;
    };
    expect(result.states).toHaveLength(4);
  });

  it("skips i=0 placeholder and removed states", () => {
    const result = findLargestStatesInPack(asPack(makePack()), 500, "area") as {
      states: Array<{ i: number }>;
    };
    const ids = new Set(result.states.map((s) => s.i));
    expect(ids.has(0)).toBe(false);
    expect(ids.has(3)).toBe(false); // removed
  });

  it("resolves capital burg name, or null when no capital", () => {
    const result = findLargestStatesInPack(asPack(makePack()), 500, "area") as {
      states: Array<{ i: number; capital: string | null }>;
    };
    const byId = new Map(result.states.map((s) => [s.i, s.capital]));
    expect(byId.get(1)).toBe("Aria");
    expect(byId.get(2)).toBe("Valen");
    expect(byId.get(4)).toBe("Lumen");
    expect(byId.get(5)).toBeNull();
  });

  it("populates name, fullName, form, color from the raw state", () => {
    const result = findLargestStatesInPack(asPack(makePack()), 1, "area") as {
      states: Array<{
        i: number;
        name: string;
        fullName: string | null;
        form: string | null;
        color: string | null;
      }>;
    };
    expect(result.states[0]).toMatchObject({
      i: 5,
      name: "Shadowfen",
      fullName: "Dominion of Shadowfen",
      form: "Dominion",
      color: "#888888",
    });
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(findLargestStatesInPack(undefined, 10, "area")).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.states is missing", () => {
    const pack = {} as unknown as Parameters<typeof findLargestStatesInPack>[0];
    expect(findLargestStatesInPack(pack, 10, "area")).toBe("not-ready");
  });

  it("empty pack.states yields empty result", () => {
    const pack = { states: [] } as unknown as Parameters<
      typeof findLargestStatesInPack
    >[0];
    const result = findLargestStatesInPack(pack, 10, "area") as {
      states: unknown[];
    };
    expect(result.states).toEqual([]);
  });

  it("treats missing numeric fields as 0", () => {
    const pack = {
      states: [
        { i: 0 },
        { i: 1, name: "A" }, // no area/cells/rural/urban
        { i: 2, name: "B", area: 5 },
      ],
    } as unknown as Parameters<typeof findLargestStatesInPack>[0];
    const result = findLargestStatesInPack(pack, 10, "area") as {
      states: Array<{ i: number; area: number; cells: number }>;
    };
    expect(result.states[0].i).toBe(2);
    expect(result.states[0].area).toBe(5);
    expect(result.states[1].area).toBe(0);
    expect(result.states[1].cells).toBe(0);
  });
});

describe("find_largest_states — tool surface", () => {
  it("returns ok=true with top N ranked states (default by=area)", async () => {
    const tool = createFindLargestStatesTool(realRuntime());
    const result = await tool.execute({ n: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.requested_n).toBe(3);
    expect(body.by).toBe("area");
    expect(body.states.map((s: { i: number }) => s.i)).toEqual([5, 1, 2]);
    expect(body.count).toBe(3);
  });

  it("defaults n to DEFAULT_FIND_LARGEST_STATES_N when omitted", async () => {
    let receivedN = -1;
    const runtime: FindLargestStatesRuntime = {
      find: (n, _by) => {
        receivedN = n;
        return { states: [] };
      },
    };
    const tool = createFindLargestStatesTool(runtime);
    await tool.execute({});
    expect(receivedN).toBe(DEFAULT_FIND_LARGEST_STATES_N);
  });

  it("defaults by to DEFAULT_FIND_LARGEST_STATES_BY when omitted", async () => {
    let receivedBy: FindLargestStatesMetric | null = null;
    const runtime: FindLargestStatesRuntime = {
      find: (_n, by) => {
        receivedBy = by;
        return { states: [] };
      },
    };
    const tool = createFindLargestStatesTool(runtime);
    await tool.execute({});
    expect(receivedBy).toBe(DEFAULT_FIND_LARGEST_STATES_BY);
  });

  it("accepts case-insensitive by", async () => {
    const tool = createFindLargestStatesTool(realRuntime());
    for (const input of ["POPULATION", "Population", " population "]) {
      const r = await tool.execute({ by: input, n: 1 });
      expect(r.isError).toBeFalsy();
      const body = JSON.parse(r.content);
      expect(body.by).toBe("population");
      expect(body.states[0].i).toBe(4); // Brightmark has highest raw pop
    }
  });

  it("ranks by cells when by='cells'", async () => {
    const tool = createFindLargestStatesTool(realRuntime());
    const r = await tool.execute({ by: "cells" });
    const body = JSON.parse(r.content);
    expect(body.by).toBe("cells");
    expect(body.states.map((s: { i: number }) => s.i)).toEqual([2, 4, 1, 5]);
  });

  it("rejects invalid by", async () => {
    const tool = createFindLargestStatesTool(realRuntime());
    for (const bad of ["size", "", "pop", 42, true]) {
      const r = await tool.execute({ by: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/by must be one of/);
    }
  });

  it("rejects invalid n", async () => {
    const tool = createFindLargestStatesTool(realRuntime());
    for (const bad of [
      { n: 0 },
      { n: -1 },
      { n: 1.5 },
      { n: "10" },
      { n: MAX_FIND_LARGEST_STATES_N + 1 },
      { n: Number.NaN },
      { n: true },
    ]) {
      const r = await tool.execute(bad);
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/n must be an integer/);
    }
  });

  it("returns empty states for pack with only neutrals/removed", async () => {
    const runtime: FindLargestStatesRuntime = {
      find: () => ({ states: [] }),
    };
    const t = createFindLargestStatesTool(runtime);
    const r = await t.execute({});
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.states).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createFindLargestStatesTool(runtimeReturning("not-ready"));
    const r = await tool.execute({ n: 10 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not ready/i);
  });

  it("is exported as findLargestStatesTool with the expected schema", () => {
    expect(findLargestStatesTool.name).toBe("find_largest_states");
    expect(findLargestStatesTool.input_schema.type).toBe("object");
    expect(findLargestStatesTool.input_schema.properties.n).toBeDefined();
    expect(findLargestStatesTool.input_schema.properties.by).toBeDefined();
    const bySchema = findLargestStatesTool.input_schema.properties
      .by as unknown as { enum?: string[] };
    expect(bySchema.enum).toEqual([...FIND_LARGEST_STATES_METRICS]);
  });

  it("exposes DEFAULT and MAX n + metric constants", () => {
    expect(DEFAULT_FIND_LARGEST_STATES_N).toBe(10);
    expect(MAX_FIND_LARGEST_STATES_N).toBe(500);
    expect(DEFAULT_FIND_LARGEST_STATES_BY).toBe("area");
    expect(FIND_LARGEST_STATES_METRICS).toEqual([
      "area",
      "cells",
      "population",
    ]);
  });

  it("echoes requested_n and by on the response", async () => {
    const tool = createFindLargestStatesTool(realRuntime());
    const result = await tool.execute({ n: 2, by: "cells" });
    const body = JSON.parse(result.content);
    expect(body.requested_n).toBe(2);
    expect(body.by).toBe("cells");
    expect(body.states).toHaveLength(2);
  });
});

// ----- defaultFindLargestStatesRuntime integration -----

describe("defaultFindLargestStatesRuntime (integration)", () => {
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
    const result = defaultFindLargestStatesRuntime.find(3, "area") as {
      states: Array<{ i: number }>;
    };
    expect(result.states.map((s) => s.i)).toEqual([5, 1, 2]);
  });

  it("ranks by population via the default runtime", () => {
    const result = defaultFindLargestStatesRuntime.find(1, "population") as {
      states: Array<{ i: number; population: number }>;
    };
    expect(result.states[0].i).toBe(4);
    expect(result.states[0].population).toBe(200);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await findLargestStatesTool.execute({ n: 1, by: "area" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.states).toHaveLength(1);
    expect(body.states[0].i).toBe(5);
    expect(body.states[0].name).toBe("Shadowfen");
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultFindLargestStatesRuntime.find(10, "area")).toBe("not-ready");
    const result = await findLargestStatesTool.execute({ n: 10 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
