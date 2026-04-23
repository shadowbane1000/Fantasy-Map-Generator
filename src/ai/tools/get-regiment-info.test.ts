import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetRegimentInfoTool,
  defaultRegimentInfoRuntime,
  getRegimentInfoTool,
  type ReadRegimentInfoResult,
  type RegimentInfo,
  type RegimentInfoPackLike,
  type RegimentInfoRuntime,
  readRegimentInfoFromPack,
} from "./get-regiment-info";

interface FakeRegiment {
  i: number;
  name?: string;
  icon?: string;
  type?: string;
  x?: number;
  y?: number;
  cell?: number;
  t?: number;
  a?: number;
  u?: Record<string, number>;
  n?: number;
}

interface FakeState {
  i: number;
  name?: string;
  fullName?: string;
  removed?: boolean;
  military?: FakeRegiment[];
}

interface FakePack {
  states: Array<FakeState | undefined>;
}

function makePack(): FakePack {
  return {
    states: [
      {
        i: 0,
        name: "Neutrals",
        military: [
          {
            i: 0,
            name: "Free Company",
            icon: "🏴",
            type: "melee",
            x: 7,
            y: 8,
            cell: 33,
            t: 120,
            a: 120,
            u: { Swordsmen: 80, Archers: 40 },
            n: 0,
          },
        ],
      },
      {
        i: 1,
        name: "Rookhold",
        fullName: "The Kingdom of Rookhold",
        military: [
          {
            i: 0,
            name: "1st Army",
            icon: "🛡️",
            type: "melee",
            x: 100,
            y: 200,
            cell: 42,
            t: 3500,
            a: 3500,
            u: { Swordsmen: 2000, Archers: 1000, Cavalry: 500 },
            n: 0,
          },
          {
            i: 2,
            name: "The Red Phalanx",
            icon: "⚔",
            type: "cavalry",
            x: 300,
            y: 400,
            cell: 88,
            t: 800,
            a: 800,
            u: { Cavalry: 800 },
            n: 0,
          },
          {
            i: 5,
            name: "Northern Fleet",
            icon: "⚓",
            type: "fleet",
            x: 500,
            y: 600,
            cell: 150,
            t: 2000,
            a: 2000,
            u: { Sailors: 2000 },
            n: 1,
          },
        ],
      },
      {
        i: 2,
        name: "Removed Realm",
        removed: true,
        military: [{ i: 0, name: "Ghost", t: 1, a: 1 }],
      },
    ],
  };
}

function runtimeReturning(result: ReadRegimentInfoResult): RegimentInfoRuntime {
  return { readRegiment: () => result };
}

describe("get_regiment_info tool — pure / seam", () => {
  it("returns all fields for a fully populated regiment", async () => {
    const pack = makePack();
    const info = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      0,
    );
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const tool = createGetRegimentInfoTool(runtimeReturning(info));
    const result = await tool.execute({ state: 1, regiment: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({ id: 1, name: "Rookhold" });
    expect(body.i).toBe(0);
    expect(body.name).toBe("1st Army");
    expect(body.icon).toBe("🛡️");
    expect(body.type).toBe("melee");
    expect(body.x).toBe(100);
    expect(body.y).toBe(200);
    expect(body.cell).toBe(42);
    expect(body.n).toBe(3500);
    expect(body.army).toBe(3500);
    expect(body.overall).toBe(3500);
    expect(body.units).toEqual({
      Swordsmen: 2000,
      Archers: 1000,
      Cavalry: 500,
    });
    expect(body.naval).toBe(false);
  });

  it("icon / type resolve to null when absent", () => {
    const pack: FakePack = {
      states: [
        undefined,
        {
          i: 1,
          name: "X",
          military: [{ i: 0, name: "Plain" }],
        },
      ],
    };
    const info = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      0,
    ) as RegimentInfo;
    expect(info.icon).toBeNull();
    expect(info.type).toBeNull();
  });

  it("units is a fresh object (not aliased to regiment.u)", () => {
    const pack = makePack();
    const info = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      0,
    ) as RegimentInfo;
    const original = pack.states[1]?.military?.[0]?.u;
    expect(info.units).not.toBe(original);
    info.units.Swordsmen = 0;
    expect(pack.states[1]?.military?.[0]?.u?.Swordsmen).toBe(2000);
  });

  it("units filters out non-finite / non-number values from u", () => {
    const pack: FakePack = {
      states: [
        undefined,
        {
          i: 1,
          name: "X",
          military: [
            {
              i: 0,
              name: "Mixed",
              u: {
                Swordsmen: 100,
                Bad: NaN as unknown as number,
                Missing: undefined as unknown as number,
              },
            },
          ],
        },
      ],
    };
    const info = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      0,
    ) as RegimentInfo;
    expect(info.units).toEqual({ Swordsmen: 100 });
  });

  it("naval coerces regiment.n strictly against 1", () => {
    const pack: FakePack = {
      states: [
        undefined,
        {
          i: 1,
          name: "X",
          military: [
            { i: 0, name: "A", n: 1 },
            { i: 1, name: "B", n: 0 },
            { i: 2, name: "C" },
            { i: 3, name: "D", n: 2 as unknown as number },
          ],
        },
      ],
    };
    const a = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      0,
    ) as RegimentInfo;
    const b = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      1,
    ) as RegimentInfo;
    const c = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      2,
    ) as RegimentInfo;
    const d = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      3,
    ) as RegimentInfo;
    expect(a.naval).toBe(true);
    expect(b.naval).toBe(false);
    expect(c.naval).toBe(false);
    expect(d.naval).toBe(false);
  });

  it("x / y / cell / n / army default to 0 when missing", () => {
    const pack: FakePack = {
      states: [
        undefined,
        {
          i: 1,
          name: "X",
          military: [{ i: 0, name: "Empty" }],
        },
      ],
    };
    const info = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      0,
    ) as RegimentInfo;
    expect(info.x).toBe(0);
    expect(info.y).toBe(0);
    expect(info.cell).toBe(0);
    expect(info.n).toBe(0);
    expect(info.army).toBe(0);
    expect(info.units).toEqual({});
  });

  it("overall always equals n", () => {
    const pack = makePack();
    const info = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      2,
    ) as RegimentInfo;
    expect(info.overall).toBe(info.n);
    expect(info.overall).toBe(800);
  });

  it("state echoes { id, name } of the resolving state", () => {
    const pack = makePack();
    const info = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      5,
    ) as RegimentInfo;
    expect(info.state).toEqual({ id: 1, name: "Rookhold" });
  });

  it("state-ref resolves by id AND case-insensitive name / fullName", () => {
    const pack = makePack();
    const byId = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      0,
    ) as RegimentInfo;
    expect(byId.i).toBe(0);

    const byName = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      "rookhold",
      0,
    ) as RegimentInfo;
    expect(byName.state.id).toBe(1);

    const byFullName = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      "THE KINGDOM OF ROOKHOLD",
      0,
    ) as RegimentInfo;
    expect(byFullName.state.id).toBe(1);
  });

  it("regiment-ref resolves by id AND case-insensitive name", () => {
    const pack = makePack();
    const byId = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      2,
    ) as RegimentInfo;
    expect(byId.name).toBe("The Red Phalanx");

    const byName = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      "the red phalanx",
    ) as RegimentInfo;
    expect(byName.i).toBe(2);

    const byUpper = readRegimentInfoFromPack(
      pack as unknown as RegimentInfoPackLike,
      1,
      "1ST ARMY",
    ) as RegimentInfo;
    expect(byUpper.i).toBe(0);
  });

  it("returns 'not-found' when the state doesn't exist / is removed", () => {
    const pack = makePack();
    expect(
      readRegimentInfoFromPack(pack as unknown as RegimentInfoPackLike, 99, 0),
    ).toBe("not-found");
    expect(
      readRegimentInfoFromPack(
        pack as unknown as RegimentInfoPackLike,
        2, // removed realm
        0,
      ),
    ).toBe("not-found");
    expect(
      readRegimentInfoFromPack(
        pack as unknown as RegimentInfoPackLike,
        "removed realm",
        0,
      ),
    ).toBe("not-found");
    expect(
      readRegimentInfoFromPack(
        pack as unknown as RegimentInfoPackLike,
        "ghostland",
        0,
      ),
    ).toBe("not-found");
  });

  it("returns 'not-found' when state exists but regiment can't be resolved", () => {
    const pack = makePack();
    expect(
      readRegimentInfoFromPack(pack as unknown as RegimentInfoPackLike, 1, 999),
    ).toBe("not-found");
    expect(
      readRegimentInfoFromPack(
        pack as unknown as RegimentInfoPackLike,
        1,
        "no-such-regiment",
      ),
    ).toBe("not-found");
  });

  it("returns 'not-ready' when pack or pack.states is missing", () => {
    expect(readRegimentInfoFromPack(undefined, 1, 0)).toBe("not-ready");
    expect(
      readRegimentInfoFromPack(
        { states: undefined } as RegimentInfoPackLike,
        1,
        0,
      ),
    ).toBe("not-ready");
  });

  it("state 0 (Neutrals) returns 'not-found' (matches rename_regiment / set_regiment_* isActive gate)", () => {
    const pack = makePack();
    expect(
      readRegimentInfoFromPack(pack as unknown as RegimentInfoPackLike, 0, 0),
    ).toBe("not-found");
  });

  it("is exported as getRegimentInfoTool with the expected schema", () => {
    expect(getRegimentInfoTool.name).toBe("get_regiment_info");
    expect(getRegimentInfoTool.input_schema.type).toBe("object");
    expect(getRegimentInfoTool.input_schema.required).toEqual([
      "state",
      "regiment",
    ]);
    expect(getRegimentInfoTool.input_schema.properties.state).toBeDefined();
    expect(getRegimentInfoTool.input_schema.properties.regiment).toBeDefined();
  });

  it("tool rejects invalid state refs", async () => {
    const tool = createGetRegimentInfoTool(runtimeReturning("not-found"));
    for (const bad of [null, undefined, -1, 1.5, "", "   ", {}]) {
      const r = await tool.execute({ state: bad, regiment: 0 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /state must be a non-negative integer id or a non-empty name/i,
      );
    }
  });

  it("tool rejects invalid regiment refs", async () => {
    const tool = createGetRegimentInfoTool(runtimeReturning("not-found"));
    for (const bad of [null, undefined, -1, 1.5, "", "   ", {}]) {
      const r = await tool.execute({ state: 1, regiment: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /regiment must be a non-negative integer id or a non-empty name/i,
      );
    }
  });

  it("tool surfaces not-found as a structured error with both refs quoted", async () => {
    const tool = createGetRegimentInfoTool(runtimeReturning("not-found"));
    const result = await tool.execute({
      state: "ghostland",
      regiment: "missing",
    });
    expect(result.isError).toBe(true);
    const error = JSON.parse(result.content).error;
    expect(error).toMatch(/No regiment found/i);
    expect(error).toMatch(/"ghostland"/);
    expect(error).toMatch(/"missing"/);
  });

  it("tool surfaces not-ready as a structured error", async () => {
    const tool = createGetRegimentInfoTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ state: 1, regiment: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });
});

// ----- defaultRegimentInfoRuntime integration -----

describe("defaultRegimentInfoRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as { pack?: unknown };
  const originalPack = globalsRef.pack;

  beforeEach(() => {
    globalsRef.pack = makePack() as unknown;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
  });

  it("reads a real packed regiment through the default runtime", () => {
    const info = defaultRegimentInfoRuntime.readRegiment(1, 0);
    expect(info).not.toBe("not-ready");
    expect(info).not.toBe("not-found");
    const ri = info as RegimentInfo;
    expect(ri.state).toEqual({ id: 1, name: "Rookhold" });
    expect(ri.name).toBe("1st Army");
    expect(ri.naval).toBe(false);
    expect(ri.n).toBe(3500);
    expect(ri.units).toEqual({
      Swordsmen: 2000,
      Archers: 1000,
      Cavalry: 500,
    });
  });

  it("resolves fleets with naval=true", () => {
    const info = defaultRegimentInfoRuntime.readRegiment(1, 5);
    const ri = info as RegimentInfo;
    expect(ri.naval).toBe(true);
    expect(ri.type).toBe("fleet");
  });

  it("returns 'not-ready' when pack is missing", async () => {
    globalsRef.pack = undefined;
    expect(defaultRegimentInfoRuntime.readRegiment(1, 0)).toBe("not-ready");
    const result = await getRegimentInfoTool.execute({
      state: 1,
      regiment: 0,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("returns 'not-found' for unknown (state, regiment) pair", async () => {
    expect(defaultRegimentInfoRuntime.readRegiment(999, 0)).toBe("not-found");
    expect(defaultRegimentInfoRuntime.readRegiment(1, 999)).toBe("not-found");
    const result = await getRegimentInfoTool.execute({
      state: 1,
      regiment: 999,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/No regiment found/i);
  });
});
