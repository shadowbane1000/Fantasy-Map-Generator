import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetProvinceDistributionTool,
  defaultProvinceDistributionRuntime,
  getProvinceDistributionTool,
  type ProvinceDistribution,
  type ProvinceDistributionPackLike,
  type ProvinceDistributionRuntime,
  readProvinceDistributionFromPack,
} from "./get-province-distribution";

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
//   Province 3 "Removed":   marked removed (cells 13..15 exist but must be skipped)
//   Province 4 "Small":     cells 11..12 (2 cells, areas 1+1=2, rural pop 0+0=0, no burgs)
//   Province 5 "Empty":     no cells, no burgs (0/0/0) — all optional fields missing
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
      { i: 5, name: "Empty" },
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

function asPack(p: FakePack): ProvinceDistributionPackLike {
  return p as unknown as ProvinceDistributionPackLike;
}

function runtimeReturning(
  result: ProvinceDistribution | "not-ready",
): ProvinceDistributionRuntime {
  return { readDistribution: () => result };
}

function realRuntime(): ProvinceDistributionRuntime {
  const pack = asPack(makePack());
  return {
    readDistribution: () => readProvinceDistributionFromPack(pack),
  };
}

describe("get_province_distribution — pure aggregator", () => {
  it("skips index-0 placeholder and removed provinces", () => {
    const result = readProvinceDistributionFromPack(
      asPack(makePack()),
    ) as ProvinceDistribution;
    const ids = result.provinces.map((p) => p.i);
    expect(ids).not.toContain(0);
    expect(ids).not.toContain(3); // removed
    expect(ids).toEqual(expect.arrayContaining([1, 2, 4, 5]));
  });

  it("sorts provinces by cells_count descending", () => {
    const result = readProvinceDistributionFromPack(
      asPack(makePack()),
    ) as ProvinceDistribution;
    // Active cells: 2(6), 1(4), 4(2), 5(0)
    expect(result.provinces.map((p) => p.i)).toEqual([2, 1, 4, 5]);
  });

  it("derives cells_count per province from pack.cells.province", () => {
    const result = readProvinceDistributionFromPack(
      asPack(makePack()),
    ) as ProvinceDistribution;
    const byId = new Map(result.provinces.map((p) => [p.i, p.cells_count]));
    expect(byId.get(1)).toBe(4);
    expect(byId.get(2)).toBe(6);
    expect(byId.get(4)).toBe(2);
    expect(byId.get(5)).toBe(0);
  });

  it("derives area per province by summing pack.cells.area", () => {
    const result = readProvinceDistributionFromPack(
      asPack(makePack()),
    ) as ProvinceDistribution;
    const byId = new Map(result.provinces.map((p) => [p.i, p.area]));
    expect(byId.get(1)).toBe(100);
    expect(byId.get(2)).toBe(30);
    expect(byId.get(4)).toBe(2);
    expect(byId.get(5)).toBe(0);
  });

  it("derives population as raw rural+urban (not rate-scaled)", () => {
    const result = readProvinceDistributionFromPack(
      asPack(makePack()),
    ) as ProvinceDistribution;
    const byId = new Map(result.provinces.map((p) => [p.i, p.population]));
    // Province 1: rural 10 + urban (5+3) = 18
    // Province 2: rural 12 + urban 100     = 112
    // Province 4: rural 0  + urban 0       = 0
    // Province 5: rural 0  + urban 0       = 0
    expect(byId.get(1)).toBe(18);
    expect(byId.get(2)).toBe(112);
    expect(byId.get(4)).toBe(0);
    expect(byId.get(5)).toBe(0);
  });

  it("computes total_cells as sum of derived active cell counts", () => {
    const result = readProvinceDistributionFromPack(
      asPack(makePack()),
    ) as ProvinceDistribution;
    // 4 + 6 + 2 + 0 = 12 (does NOT include the 3 removed-province cells)
    expect(result.total_cells).toBe(12);
  });

  it("computes total_population as sum of active-province raw populations", () => {
    const result = readProvinceDistributionFromPack(
      asPack(makePack()),
    ) as ProvinceDistribution;
    // 18 + 112 + 0 + 0 = 130
    expect(result.total_population).toBe(130);
  });

  it("computes percentage as cells_count / total_cells * 100", () => {
    const result = readProvinceDistributionFromPack(
      asPack(makePack()),
    ) as ProvinceDistribution;
    // total=12; 2 = 6/12 = 50%, 1 = 4/12 ≈ 33.33%, 4 = 2/12 ≈ 16.67%, 5 = 0
    const byId = new Map(result.provinces.map((p) => [p.i, p.percentage]));
    expect(byId.get(2)).toBeCloseTo(50);
    expect(byId.get(1)).toBeCloseTo((4 / 12) * 100);
    expect(byId.get(4)).toBeCloseTo((2 / 12) * 100);
    expect(byId.get(5)).toBeCloseTo(0);
  });

  it("excludes the removed burg from urban pop", () => {
    // Burg 4 (cell 14) is removed + belongs to removed province 3 —
    // its population (9999) must not leak into any entry.
    const result = readProvinceDistributionFromPack(
      asPack(makePack()),
    ) as ProvinceDistribution;
    for (const p of result.provinces) {
      expect(p.population).toBeLessThan(9999);
    }
    expect(result.total_population).toBeLessThan(9999);
  });

  it("ignores burgs whose cell sits on province 0 (placeholder)", () => {
    const pack = makePack();
    // Move burg #3 (pop 100) to a placeholder cell (cell 0 has province 0).
    if (pack.burgs?.[3]) pack.burgs[3] = { ...pack.burgs[3], cell: 0 };
    const result = readProvinceDistributionFromPack(
      asPack(pack),
    ) as ProvinceDistribution;
    // Province 2 urban drops to 0 → just rural 12.
    const p2 = result.provinces.find((p) => p.i === 2);
    expect(p2?.population).toBe(12);
  });

  it("ignores burgs whose cell is out of range", () => {
    const pack = makePack();
    if (pack.burgs?.[3]) pack.burgs[3] = { ...pack.burgs[3], cell: 99999 };
    const result = readProvinceDistributionFromPack(
      asPack(pack),
    ) as ProvinceDistribution;
    const p2 = result.provinces.find((p) => p.i === 2);
    // Province 2 originally 112 population; without the 100-pop burg it's just rural 12.
    expect(p2?.population).toBe(12);
  });

  it("maps missing optional fields to null", () => {
    const result = readProvinceDistributionFromPack(
      asPack(makePack()),
    ) as ProvinceDistribution;
    const empty = result.provinces.find((p) => p.i === 5);
    expect(empty).toMatchObject({
      i: 5,
      name: "Empty",
      fullName: null,
      formName: null,
      color: null,
    });
  });

  it("populates name, fullName, formName, color from the raw province", () => {
    const result = readProvinceDistributionFromPack(
      asPack(makePack()),
    ) as ProvinceDistribution;
    const rook = result.provinces.find((p) => p.i === 1);
    expect(rook).toMatchObject({
      i: 1,
      name: "Rookmark",
      fullName: "Principality of Rookmark",
      formName: "Principality",
      color: "#aabbcc",
    });
  });

  it("treats missing cells/burgs gracefully (zero area/cells/population)", () => {
    const pack = {
      provinces: [{ i: 0 }, { i: 1, name: "A" }, { i: 2, name: "B" }],
    } as unknown as ProvinceDistributionPackLike;
    const result = readProvinceDistributionFromPack(
      pack,
    ) as ProvinceDistribution;
    expect(result.provinces).toHaveLength(2);
    for (const p of result.provinces) {
      expect(p.area).toBe(0);
      expect(p.cells_count).toBe(0);
      expect(p.population).toBe(0);
    }
    expect(result.total_cells).toBe(0);
    expect(result.total_population).toBe(0);
  });

  it("sets percentage to 0 when total_cells is 0", () => {
    const pack = {
      provinces: [{ i: 0 }, { i: 1, name: "A" }, { i: 2, name: "B" }],
    } as unknown as ProvinceDistributionPackLike;
    const result = readProvinceDistributionFromPack(
      pack,
    ) as ProvinceDistribution;
    expect(result.total_cells).toBe(0);
    for (const p of result.provinces) {
      expect(p.percentage).toBe(0);
    }
  });

  it("returns 'not-ready' when pack is missing", () => {
    expect(readProvinceDistributionFromPack(undefined)).toBe("not-ready");
  });

  it("returns 'not-ready' when pack.provinces is missing", () => {
    const pack = {} as ProvinceDistributionPackLike;
    expect(readProvinceDistributionFromPack(pack)).toBe("not-ready");
  });

  it("empty provinces list yields zero totals and empty array", () => {
    const pack = {
      provinces: [],
    } as unknown as ProvinceDistributionPackLike;
    const result = readProvinceDistributionFromPack(
      pack,
    ) as ProvinceDistribution;
    expect(result.total_cells).toBe(0);
    expect(result.total_population).toBe(0);
    expect(result.provinces).toEqual([]);
  });

  it("pack with only placeholder/removed yields empty result", () => {
    const pack = {
      provinces: [
        { i: 0, name: "placeholder" },
        { i: 1, name: "Gone", removed: true },
      ],
    } as unknown as ProvinceDistributionPackLike;
    const result = readProvinceDistributionFromPack(
      pack,
    ) as ProvinceDistribution;
    expect(result.total_cells).toBe(0);
    expect(result.provinces).toEqual([]);
  });

  it("skips falsy slots (undefined / null)", () => {
    const pack = {
      provinces: [{ i: 0 }, undefined, { i: 2, name: "Real" }],
    } as unknown as ProvinceDistributionPackLike;
    const result = readProvinceDistributionFromPack(
      pack,
    ) as ProvinceDistribution;
    expect(result.provinces).toHaveLength(1);
    expect(result.provinces[0].i).toBe(2);
  });

  it("works when pack.burgs is missing entirely", () => {
    const pack = makePack();
    delete pack.burgs;
    const result = readProvinceDistributionFromPack(
      asPack(pack),
    ) as ProvinceDistribution;
    // Rural-only populations: p1=10, p2=12, p4=0, p5=0
    const byId = new Map(result.provinces.map((p) => [p.i, p.population]));
    expect(byId.get(1)).toBe(10);
    expect(byId.get(2)).toBe(12);
    expect(byId.get(4)).toBe(0);
    expect(byId.get(5)).toBe(0);
  });
});

describe("get_province_distribution — tool surface", () => {
  it("returns ok=true with a well-formed payload", async () => {
    const tool = createGetProvinceDistributionTool(realRuntime());
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_cells).toBe(12);
    expect(body.total_population).toBe(130);
    expect(Array.isArray(body.provinces)).toBe(true);
    expect(body.provinces).toHaveLength(4);
    expect(body.provinces.map((p: { i: number }) => p.i)).toEqual([2, 1, 4, 5]);
  });

  it("includes raw populations in the payload (not rate-scaled)", async () => {
    const tool = createGetProvinceDistributionTool(realRuntime());
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    const byId = new Map<number, number>(
      body.provinces.map((p: { i: number; population: number }) => [
        p.i,
        p.population,
      ]),
    );
    expect(byId.get(1)).toBe(18);
    expect(byId.get(2)).toBe(112);
  });

  it("echoes percentages in the payload", async () => {
    const tool = createGetProvinceDistributionTool(realRuntime());
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    const byId = new Map<number, number>(
      body.provinces.map((p: { i: number; percentage: number }) => [
        p.i,
        p.percentage,
      ]),
    );
    expect(byId.get(2)).toBeCloseTo(50);
    expect(byId.get(1)).toBeCloseTo((4 / 12) * 100);
  });

  it("ignores unrelated input keys", async () => {
    const tool = createGetProvinceDistributionTool(realRuntime());
    const result = await tool.execute({ foo: 1, bar: "baz" });
    expect(result.isError).toBeFalsy();
  });

  it("surfaces 'not-ready' as a structured error", async () => {
    const tool = createGetProvinceDistributionTool(
      runtimeReturning("not-ready"),
    );
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("is exported as getProvinceDistributionTool with the expected schema", () => {
    expect(getProvinceDistributionTool.name).toBe("get_province_distribution");
    expect(getProvinceDistributionTool.input_schema.type).toBe("object");
    expect(getProvinceDistributionTool.input_schema.required).toBeUndefined();
    expect(getProvinceDistributionTool.input_schema.properties).toEqual({});
  });
});

// ----- defaultProvinceDistributionRuntime integration -----

describe("defaultProvinceDistributionRuntime (integration)", () => {
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

  it("reads real distribution through the default runtime", () => {
    const result =
      defaultProvinceDistributionRuntime.readDistribution() as ProvinceDistribution;
    expect(result.total_cells).toBe(12);
    expect(result.total_population).toBe(130);
    expect(result.provinces.map((p) => p.i)).toEqual([2, 1, 4, 5]);
    // Province 2 is biggest: 6 cells, 112 pop, ~50% of total_cells
    expect(result.provinces[0].i).toBe(2);
    expect(result.provinces[0].cells_count).toBe(6);
    expect(result.provinces[0].population).toBe(112);
    expect(result.provinces[0].percentage).toBeCloseTo(50);
  });

  it("tool uses default runtime to resolve against globals", async () => {
    const result = await getProvinceDistributionTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total_cells).toBe(12);
    expect(body.total_population).toBe(130);
    expect(body.provinces[0].i).toBe(2);
    expect(body.provinces[0].name).toBe("Elsewhere");
  });

  it("returns 'not-ready' when pack is missing -> tool surfaces error", async () => {
    globalsRef.pack = undefined;
    expect(defaultProvinceDistributionRuntime.readDistribution()).toBe(
      "not-ready",
    );
    const result = await getProvinceDistributionTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});
