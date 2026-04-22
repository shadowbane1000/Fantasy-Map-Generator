import { describe, expect, it } from "vitest";
import {
  type BurgPackLike,
  type BurgSummary,
  type BurgsRuntime,
  createListBurgsTool,
  readBurgsFromPack,
  resolveStateRefInPack,
} from "./list-burgs";

function fakeBurgs(): BurgSummary[] {
  return [
    {
      i: 1,
      name: "Stormport",
      x: 10,
      y: 20,
      population: 30000,
      state: "Altaria",
      stateId: 1,
      culture: "Highlanders",
      cultureId: 2,
      capital: true,
      port: true,
      type: "Generic",
    },
    {
      i: 2,
      name: "Hillhold",
      x: 30,
      y: 40,
      population: 8000,
      state: "Altaria",
      stateId: 1,
      culture: "Highlanders",
      cultureId: 2,
      capital: false,
      port: false,
      type: null,
    },
    {
      i: 3,
      name: "Seaborough",
      x: 50,
      y: 60,
      population: 15000,
      state: "Borgnia",
      stateId: 2,
      culture: "Coastalfolk",
      cultureId: 3,
      capital: true,
      port: true,
      type: "Naval",
    },
    {
      i: 4,
      name: "Quarrytown",
      x: 70,
      y: 80,
      population: 4000,
      state: "Borgnia",
      stateId: 2,
      culture: "Coastalfolk",
      cultureId: 3,
      capital: false,
      port: false,
      type: null,
    },
  ];
}

function runtimeOf(
  burgs: BurgSummary[] | null,
  stateResolver: (ref: number | string) => number | null = () => null,
): BurgsRuntime {
  return {
    readBurgs: () => burgs,
    resolveStateRef: stateResolver,
  };
}

describe("list_burgs tool", () => {
  it("returns the full list when no filter/paging is given", async () => {
    const burgs = fakeBurgs();
    const tool = createListBurgsTool(runtimeOf(burgs));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(4);
    expect(body.burgs).toHaveLength(4);
  });

  it("honors limit and offset", async () => {
    const burgs = fakeBurgs();
    const tool = createListBurgsTool(runtimeOf(burgs));
    const result = await tool.execute({ limit: 2, offset: 1 });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(4);
    expect(body.burgs).toEqual(burgs.slice(1, 3));
  });

  it("rejects invalid limit/offset/filter types", async () => {
    const tool = createListBurgsTool(runtimeOf(fakeBurgs()));
    const cases: Array<[object, RegExp]> = [
      [{ limit: 0 }, /limit/],
      [{ limit: 501 }, /limit/],
      [{ limit: 3.5 }, /limit/],
      [{ offset: -1 }, /offset/],
      [{ offset: 1.5 }, /offset/],
      [{ state: true }, /state/],
      [{ capital_only: "yes" }, /capital_only/],
      [{ port_only: 1 }, /port_only/],
    ];
    for (const [input, re] of cases) {
      const result = await tool.execute(input);
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toMatch(re);
    }
  });

  it("filters capitals only", async () => {
    const burgs = fakeBurgs();
    const tool = createListBurgsTool(runtimeOf(burgs));
    const result = await tool.execute({ capital_only: true });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.burgs.every((b: BurgSummary) => b.capital)).toBe(true);
  });

  it("filters ports only", async () => {
    const burgs = fakeBurgs();
    const tool = createListBurgsTool(runtimeOf(burgs));
    const result = await tool.execute({ port_only: true });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.burgs.every((b: BurgSummary) => b.port)).toBe(true);
  });

  it("filters by state id", async () => {
    const burgs = fakeBurgs();
    const tool = createListBurgsTool(
      runtimeOf(burgs, (ref) => (ref === 2 ? 2 : null)),
    );
    const result = await tool.execute({ state: 2 });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.burgs.every((b: BurgSummary) => b.stateId === 2)).toBe(true);
    expect(body.filters.state).toBe(2);
  });

  it("filters by state name (case-insensitive)", async () => {
    const burgs = fakeBurgs();
    const tool = createListBurgsTool(
      runtimeOf(burgs, (ref) =>
        typeof ref === "string" && ref.toLowerCase() === "altaria" ? 1 : null,
      ),
    );
    const result = await tool.execute({ state: "Altaria" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.burgs.every((b: BurgSummary) => b.stateId === 1)).toBe(true);
  });

  it("errors when the state filter cannot be resolved", async () => {
    const tool = createListBurgsTool(runtimeOf(fakeBurgs(), () => null));
    const result = await tool.execute({ state: "Nowhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/resolve/i);
  });

  it("errors when the map isn't ready", async () => {
    const tool = createListBurgsTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});

describe("readBurgsFromPack", () => {
  it("skips index 0 and removed, scales population correctly", () => {
    const pack: BurgPackLike = {
      burgs: [
        { i: 0 },
        {
          i: 1,
          name: "A",
          x: 1,
          y: 2,
          population: 10,
          state: 1,
          culture: 1,
          capital: 1,
          port: 1,
          type: "Naval",
        },
        {
          i: 2,
          name: "Gone",
          removed: true,
          population: 99,
        },
        {
          i: 3,
          name: "B",
          x: 3,
          y: 4,
          population: 5,
          state: 2,
          culture: 2,
        },
      ],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Altaria" },
        { i: 2, name: "Borgnia" },
      ],
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Highlanders" },
        { i: 2, name: "Coastalfolk" },
      ],
    };
    const summaries = readBurgsFromPack(pack, {
      populationRate: 1000,
      urbanization: 2,
    });
    expect(summaries).not.toBeNull();
    expect(summaries).toHaveLength(2);
    const [a, b] = summaries ?? [];
    expect(a).toMatchObject({
      i: 1,
      name: "A",
      population: 20000, // 10 * 1000 * 2
      state: "Altaria",
      culture: "Highlanders",
      capital: true,
      port: true,
      type: "Naval",
    });
    expect(b).toMatchObject({
      i: 3,
      name: "B",
      population: 10000, // 5 * 1000 * 2
      capital: false,
      port: false,
      type: null,
    });
  });

  it("falls back to raw population when factors are non-positive", () => {
    const pack: BurgPackLike = {
      burgs: [{ i: 0 }, { i: 1, name: "A", population: 7 }],
    };
    expect(
      readBurgsFromPack(pack, { populationRate: 0, urbanization: 2 })?.[0]
        .population,
    ).toBe(7);
    expect(
      readBurgsFromPack(pack, {
        populationRate: Number.NaN,
        urbanization: 2,
      })?.[0].population,
    ).toBe(7);
  });

  it("returns null when pack/burgs are missing", () => {
    expect(
      readBurgsFromPack(undefined, { populationRate: 1, urbanization: 1 }),
    ).toBeNull();
    expect(
      readBurgsFromPack({}, { populationRate: 1, urbanization: 1 }),
    ).toBeNull();
  });
});

describe("resolveStateRefInPack", () => {
  it("resolves by id and by name, rejecting removed or unknown", () => {
    const pack: BurgPackLike = {
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Altaria", fullName: "Kingdom of Altaria" },
        { i: 2, name: "Gone", removed: true },
      ],
    };
    expect(resolveStateRefInPack(pack, 1)).toBe(1);
    expect(resolveStateRefInPack(pack, "altaria")).toBe(1);
    expect(resolveStateRefInPack(pack, "Kingdom of Altaria")).toBe(1);
    expect(resolveStateRefInPack(pack, 2)).toBeNull();
    expect(resolveStateRefInPack(pack, 99)).toBeNull();
    expect(resolveStateRefInPack(pack, "   ")).toBeNull();
    expect(resolveStateRefInPack(undefined, 1)).toBeNull();
  });
});
