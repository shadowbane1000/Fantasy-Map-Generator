import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawState } from "./_shared";
import {
  createListRegimentsTool,
  listRegimentsTool,
  type RegimentPackLike,
  type RegimentSummary,
  type RegimentsRuntime,
  readRegimentsFromPack,
} from "./list-regiments";

function fakeRegiments(): RegimentSummary[] {
  return [
    {
      i: 1,
      name: "Rookhold Army",
      stateId: 1,
      state: "Rookhold",
      type: "Army",
      total: 5000,
      army: 1,
      cell: 10,
      x: 100,
      y: 200,
      naval: false,
      units: { Swordsmen: 3000, Archers: 2000 },
    },
    {
      i: 2,
      name: "Rookhold Fleet",
      stateId: 1,
      state: "Rookhold",
      type: "Fleet",
      total: 1200,
      army: 2,
      cell: 30,
      x: 300,
      y: 400,
      naval: true,
      units: { Sailors: 800, Marines: 400 },
    },
    {
      i: 1,
      name: "Ashholm Army",
      stateId: 2,
      state: "Ashholm",
      type: "Army",
      total: 800,
      army: 1,
      cell: 50,
      x: 500,
      y: 600,
      naval: false,
      units: { Swordsmen: 500, Archers: 300 },
    },
  ];
}

function runtimeOf(
  regiments: RegimentSummary[] | null,
  stateResolver: (ref: number | string) => number | null = () => null,
): RegimentsRuntime {
  return {
    readRegiments: () => regiments,
    resolveStateRef: stateResolver,
  };
}

describe("list_regiments tool", () => {
  it("returns the full flat list by default", async () => {
    const regs = fakeRegiments();
    const tool = createListRegimentsTool(runtimeOf(regs));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(3);
    expect(body.regiments).toEqual(regs);
  });

  it("pagination honors limit and offset", async () => {
    const regs = fakeRegiments();
    const tool = createListRegimentsTool(runtimeOf(regs));
    const result = await tool.execute({ limit: 1, offset: 1 });
    const body = JSON.parse(result.content);
    expect(body.regiments).toEqual([regs[1]]);
  });

  it("filters by state id via resolver", async () => {
    const regs = fakeRegiments();
    const tool = createListRegimentsTool(
      runtimeOf(regs, (ref) => (ref === 1 ? 1 : null)),
    );
    const result = await tool.execute({ state: 1 });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.regiments.map((r: RegimentSummary) => r.name)).toEqual([
      "Rookhold Army",
      "Rookhold Fleet",
    ]);
    expect(body.filters.state).toBe(1);
  });

  it("filters by state name via resolver", async () => {
    const regs = fakeRegiments();
    const tool = createListRegimentsTool(
      runtimeOf(regs, (ref) =>
        typeof ref === "string" && ref.toLowerCase() === "ashholm" ? 2 : null,
      ),
    );
    const result = await tool.execute({ state: "ASHHOLM" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.regiments[0]?.state).toBe("Ashholm");
  });

  it("errors when the state filter cannot be resolved", async () => {
    const tool = createListRegimentsTool(
      runtimeOf(fakeRegiments(), () => null),
    );
    const result = await tool.execute({ state: "Nowhere" });
    expect(result.isError).toBe(true);
  });

  it("filters by type case-insensitively", async () => {
    const tool = createListRegimentsTool(runtimeOf(fakeRegiments()));
    const result = await tool.execute({ type: "fleet" });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.regiments[0]?.naval).toBe(true);
  });

  it("naval_only returns only fleets", async () => {
    const tool = createListRegimentsTool(runtimeOf(fakeRegiments()));
    const result = await tool.execute({ naval_only: true });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.regiments[0]?.name).toBe("Rookhold Fleet");
  });

  it("min_total filters by troop count", async () => {
    const tool = createListRegimentsTool(runtimeOf(fakeRegiments()));
    const result = await tool.execute({ min_total: 1000 });
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.regiments.every((r: RegimentSummary) => r.total >= 1000)).toBe(
      true,
    );
  });

  it("rejects invalid filters", async () => {
    const tool = createListRegimentsTool(runtimeOf(fakeRegiments()));
    expect((await tool.execute({ naval_only: "yes" })).isError).toBe(true);
    expect((await tool.execute({ type: 42 })).isError).toBe(true);
    expect((await tool.execute({ min_total: -1 })).isError).toBe(true);
    expect((await tool.execute({ state: 1.5 })).isError).toBe(true);
  });

  it("returns not-ready error when pack.states is missing", async () => {
    const tool = createListRegimentsTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});

describe("readRegimentsFromPack", () => {
  it("returns null when pack.states is missing", () => {
    expect(readRegimentsFromPack(undefined)).toBeNull();
    expect(readRegimentsFromPack({} as RegimentPackLike)).toBeNull();
  });

  it("flattens across states and annotates state name", () => {
    const pack: RegimentPackLike = {
      states: [
        {
          i: 0,
          name: "Neutrals",
          removed: true,
          military: [{ i: 99, name: "ignored" }],
        },
        {
          i: 1,
          name: "Rookhold",
          military: [
            {
              i: 1,
              name: "Army",
              t: 5000,
              a: 1,
              u: { Swordsmen: 5000 },
              n: 0,
              type: "Army",
              cell: 10,
              x: 10,
              y: 20,
            },
          ],
        },
        { i: 2, name: "NoArmyState" },
        {
          i: 3,
          name: "Ashholm",
          military: [
            {
              i: 1,
              name: "Fleet",
              t: 800,
              a: 2,
              u: { Sailors: 800 },
              n: 1,
              type: "Fleet",
              cell: 30,
              x: 30,
              y: 40,
            },
          ],
        },
      ] satisfies RawState[],
    };
    const flat = readRegimentsFromPack(pack);
    expect(flat).toHaveLength(2);
    expect(flat?.[0]?.state).toBe("Rookhold");
    expect(flat?.[1]?.state).toBe("Ashholm");
    expect(flat?.[1]?.naval).toBe(true);
  });

  it("skips regiments without a numeric i", () => {
    const pack: RegimentPackLike = {
      states: [
        {
          i: 1,
          name: "x",
          military: [{ i: 1, name: "ok" }, { name: "junk" } as never],
        },
      ],
    };
    const flat = readRegimentsFromPack(pack);
    expect(flat).toHaveLength(1);
    expect(flat?.[0]?.name).toBe("ok");
  });
});

describe("defaultRegimentsRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals", removed: true },
        {
          i: 1,
          name: "Rookhold",
          military: [{ i: 1, name: "Army", t: 5000, a: 1, type: "Army" }],
        },
        { i: 2, name: "NoArmyState" },
      ] satisfies RawState[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("reads regiments from the live pack", async () => {
    const result = await listRegimentsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.regiments[0]?.state).toBe("Rookhold");
  });
});
