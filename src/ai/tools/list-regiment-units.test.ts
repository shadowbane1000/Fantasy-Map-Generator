import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createListRegimentUnitsTool,
  listRegimentUnitsTool,
  type RegimentUnit,
  type RegimentUnitsRuntime,
} from "./list-regiment-units";

function makeRuntime(units: RegimentUnit[] | null): RegimentUnitsRuntime {
  return { readUnits: () => (units === null ? null : [...units]) };
}

const DEFAULT_UNITS = [
  {
    icon: "⚔️",
    name: "infantry",
    rural: 0.25,
    urban: 0.2,
    crew: 1,
    power: 1,
    type: "melee",
    separate: 0,
  },
  {
    icon: "🏹",
    name: "archers",
    rural: 0.12,
    urban: 0.2,
    crew: 1,
    power: 1,
    type: "ranged",
    separate: 0,
  },
  {
    icon: "🐴",
    name: "cavalry",
    rural: 0.12,
    urban: 0.03,
    crew: 2,
    power: 2,
    type: "mounted",
    separate: 0,
  },
  {
    icon: "💣",
    name: "artillery",
    rural: 0,
    urban: 0.03,
    crew: 8,
    power: 12,
    type: "machinery",
    separate: 0,
  },
  {
    icon: "🌊",
    name: "fleet",
    rural: 0,
    urban: 0.015,
    crew: 100,
    power: 50,
    type: "naval",
    separate: 1,
  },
];

describe("list_regiment_units tool", () => {
  it("returns every entry from the runtime in source order", async () => {
    const normalised: RegimentUnit[] = DEFAULT_UNITS.map((u) => ({
      id: u.name,
      name: u.name,
      type: u.type,
      rural: u.rural,
      urban: u.urban,
      crew: u.crew,
      power: u.power,
      icon: u.icon,
      separate: u.separate,
    }));
    const tool = createListRegimentUnitsTool(makeRuntime(normalised));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(5);
    expect(body.units).toHaveLength(5);
    expect(body.units.map((u: RegimentUnit) => u.id)).toEqual([
      "infantry",
      "archers",
      "cavalry",
      "artillery",
      "fleet",
    ]);
    expect(body.units[0]).toEqual({
      id: "infantry",
      name: "infantry",
      type: "melee",
      rural: 0.25,
      urban: 0.2,
      crew: 1,
      power: 1,
      icon: "⚔️",
      separate: 0,
    });
  });

  it("returns empty units / count=0 when runtime returns null", async () => {
    const tool = createListRegimentUnitsTool(makeRuntime(null));
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(0);
    expect(body.units).toEqual([]);
  });

  it("returns empty units / count=0 when runtime returns []", async () => {
    const tool = createListRegimentUnitsTool(makeRuntime([]));
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(0);
    expect(body.units).toEqual([]);
  });

  it("tolerates no-arg / null / undefined input uniformly", async () => {
    const tool = createListRegimentUnitsTool(makeRuntime([]));
    for (const input of [{}, null, undefined]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      expect(body.ok).toBe(true);
      expect(body.count).toBe(0);
    }
  });

  it("count matches units.length", async () => {
    const tool = createListRegimentUnitsTool(
      makeRuntime([
        {
          id: "a",
          name: "a",
          type: "melee",
          rural: 0,
          urban: 0,
          crew: 0,
          power: 0,
          icon: null,
          separate: 0,
        },
        {
          id: "b",
          name: "b",
          type: "ranged",
          rural: 0,
          urban: 0,
          crew: 0,
          power: 0,
          icon: null,
          separate: 0,
        },
      ]),
    );
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.count).toBe(body.units.length);
    expect(body.count).toBe(2);
  });
});

describe("defaultRegimentUnitsRuntime (integration)", () => {
  const originalOptions = (globalThis as { options?: unknown }).options;

  afterEach(() => {
    (globalThis as unknown as { options?: unknown }).options = originalOptions;
  });

  it("reads options.military with the 5 default units, normalising each", async () => {
    (globalThis as unknown as { options?: unknown }).options = {
      military: [...DEFAULT_UNITS],
    };
    const result = await listRegimentUnitsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(5);
    const units = body.units as RegimentUnit[];
    expect(units.map((u) => u.id)).toEqual([
      "infantry",
      "archers",
      "cavalry",
      "artillery",
      "fleet",
    ]);
    expect(units.map((u) => u.type)).toEqual([
      "melee",
      "ranged",
      "mounted",
      "machinery",
      "naval",
    ]);
    expect(units[4]).toEqual({
      id: "fleet",
      name: "fleet",
      type: "naval",
      rural: 0,
      urban: 0.015,
      crew: 100,
      power: 50,
      icon: "🌊",
      separate: 1,
    });
  });

  it("returns empty list when globalThis.options is absent", async () => {
    (globalThis as unknown as { options?: unknown }).options = undefined;
    const body = JSON.parse((await listRegimentUnitsTool.execute({})).content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(0);
    expect(body.units).toEqual([]);
  });

  it("returns empty list when options exists without military", async () => {
    (globalThis as unknown as { options?: unknown }).options = {
      year: 1000,
    };
    const body = JSON.parse((await listRegimentUnitsTool.execute({})).content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(0);
  });

  it("returns empty list when options.military is not an array", async () => {
    (globalThis as unknown as { options?: unknown }).options = {
      military: "nope",
    };
    const body = JSON.parse((await listRegimentUnitsTool.execute({})).content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(0);
  });
});

describe("normalisation edge cases via injected arrays", () => {
  // Use the defaultRuntime by staging options.military — exercises the
  // same normalisation pipeline that production goes through.
  const originalOptions = (globalThis as { options?: unknown }).options;

  beforeEach(() => {
    (globalThis as unknown as { options?: unknown }).options = { military: [] };
  });

  afterEach(() => {
    (globalThis as unknown as { options?: unknown }).options = originalOptions;
  });

  it("skips entries missing name / non-string name / empty name", async () => {
    (globalThis as unknown as { options?: unknown }).options = {
      military: [
        { name: "valid", type: "melee", icon: "⚔️" },
        { type: "ranged" }, // missing name
        { name: 42, type: "mounted" }, // non-string name
        { name: "", type: "naval" }, // empty name
        null, // not an object
        "string entry", // not an object
      ],
    };
    const body = JSON.parse((await listRegimentUnitsTool.execute({})).content);
    expect(body.count).toBe(1);
    expect((body.units as RegimentUnit[])[0].id).toBe("valid");
  });

  it("coerces missing / non-finite numeric fields to 0", async () => {
    (globalThis as unknown as { options?: unknown }).options = {
      military: [
        {
          name: "odd",
          type: "melee",
          // rural, urban, crew, power, separate all missing
        },
        {
          name: "nanfest",
          type: "ranged",
          rural: Number.NaN,
          urban: Number.POSITIVE_INFINITY,
          crew: "5",
          power: null,
          separate: undefined,
        },
      ],
    };
    const body = JSON.parse((await listRegimentUnitsTool.execute({})).content);
    expect(body.count).toBe(2);
    const units = body.units as RegimentUnit[];
    expect(units[0]).toMatchObject({
      id: "odd",
      rural: 0,
      urban: 0,
      crew: 0,
      power: 0,
      separate: 0,
    });
    expect(units[1]).toMatchObject({
      id: "nanfest",
      rural: 0,
      urban: 0,
      crew: 0,
      power: 0,
      separate: 0,
    });
  });

  it("treats missing / empty / non-string icon as null", async () => {
    (globalThis as unknown as { options?: unknown }).options = {
      military: [
        { name: "ok", type: "melee", icon: "⚔️" },
        { name: "noicon", type: "melee" },
        { name: "emptyicon", type: "melee", icon: "" },
        { name: "numicon", type: "melee", icon: 42 },
      ],
    };
    const body = JSON.parse((await listRegimentUnitsTool.execute({})).content);
    const units = body.units as RegimentUnit[];
    expect(units.map((u) => u.icon)).toEqual(["⚔️", null, null, null]);
  });

  it("defaults missing type to empty string", async () => {
    (globalThis as unknown as { options?: unknown }).options = {
      military: [
        { name: "a" },
        { name: "b", type: null },
        { name: "c", type: 7 },
      ],
    };
    const body = JSON.parse((await listRegimentUnitsTool.execute({})).content);
    const units = body.units as RegimentUnit[];
    expect(units.map((u) => u.type)).toEqual(["", "", ""]);
  });
});
