import { describe, expect, it } from "vitest";
import {
  createListStatesTool,
  readStatesFromPack,
  type StateSummary,
  type StatesRuntime,
} from "./list-states";

function fakeStates(): StateSummary[] {
  return Array.from({ length: 5 }, (_, i) => ({
    i: i + 1,
    name: `State ${i + 1}`,
    fullName: `Kingdom of ${i + 1}`,
    form: "Monarchy",
    type: "Land",
    color: "#123456",
    culture: `Culture ${i + 1}`,
    capital: `Capital ${i + 1}`,
    burgs: 10 + i,
    cells: 100 + i,
    area: 200 + i,
    population: 1000 + i,
  }));
}

function runtimeOf(states: StateSummary[] | null): StatesRuntime {
  return { readStates: () => states };
}

describe("list_states tool", () => {
  it("returns every state when no paging params are passed", async () => {
    const states = fakeStates();
    const tool = createListStatesTool(runtimeOf(states));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total).toBe(5);
    expect(body.limit).toBe(100);
    expect(body.offset).toBe(0);
    expect(body.states).toEqual(states);
  });

  it("honors limit and offset", async () => {
    const states = fakeStates();
    const tool = createListStatesTool(runtimeOf(states));
    const result = await tool.execute({ limit: 2, offset: 2 });
    const body = JSON.parse(result.content);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(2);
    expect(body.states).toEqual(states.slice(2, 4));
  });

  it("rejects invalid limit", async () => {
    const tool = createListStatesTool(runtimeOf(fakeStates()));
    for (const bad of [0, -1, 501, 3.5, "five"]) {
      const result = await tool.execute({ limit: bad });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toContain("limit");
    }
  });

  it("rejects negative or non-integer offset", async () => {
    const tool = createListStatesTool(runtimeOf(fakeStates()));
    for (const bad of [-1, 1.5, "zero"]) {
      const result = await tool.execute({ offset: bad });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toContain("offset");
    }
  });

  it("returns a structured error when the map isn't ready", async () => {
    const tool = createListStatesTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("accepts null / undefined paging params", async () => {
    const tool = createListStatesTool(runtimeOf(fakeStates()));
    const result = await tool.execute({ limit: null, offset: null });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(5);
  });
});

describe("readStatesFromPack", () => {
  it("skips index 0 and removed states, resolves culture/capital names", () => {
    const burgs = new Array(11).fill({ i: 0 });
    burgs[0] = { i: 0 };
    burgs[10] = { i: 10, name: "Stormport" };
    const pack = {
      states: [
        { i: 0, name: "Neutrals" },
        {
          i: 1,
          name: "Kingdom A",
          fullName: "The Kingdom of A",
          form: "Monarchy",
          type: "Land",
          color: "#aaa",
          culture: 2,
          capital: 10,
          burgs: 5,
          cells: 100,
          area: 500,
          rural: 1000,
          urban: 500,
        },
        { i: 2, name: "Removed", removed: true, culture: 1, capital: 20 },
        {
          i: 3,
          name: "Free City",
          culture: 999,
          capital: 0,
        },
      ],
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Unused" },
        { i: 2, name: "Highlanders" },
      ],
      burgs,
    };
    const summaries = readStatesFromPack(pack, 1);
    expect(summaries).not.toBeNull();
    const [a, city] = summaries ?? [];
    expect(a.i).toBe(1);
    expect(a.name).toBe("Kingdom A");
    expect(a.culture).toBe("Highlanders");
    expect(a.capital).toBe("Stormport");
    expect(a.population).toBe(1500);
    expect(city.i).toBe(3);
    expect(city.culture).toBeNull(); // id 999 missing
    expect(city.capital).toBeNull(); // 0 → no capital
    expect(summaries).toHaveLength(2); // removed skipped
  });

  it("returns null when pack/states are missing", () => {
    expect(readStatesFromPack(undefined, 1)).toBeNull();
    expect(readStatesFromPack({}, 1)).toBeNull();
  });

  it("scales population by a positive populationRate and falls back otherwise", () => {
    const pack = {
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "A", rural: 10, urban: 5, culture: 0, capital: 0 },
      ],
      cultures: [{ i: 0, name: "x" }],
      burgs: [{ i: 0 }],
    };
    expect(readStatesFromPack(pack, 10)?.[0].population).toBe(150);
    expect(readStatesFromPack(pack, 0)?.[0].population).toBe(15);
    expect(readStatesFromPack(pack, Number.NaN)?.[0].population).toBe(15);
  });
});
