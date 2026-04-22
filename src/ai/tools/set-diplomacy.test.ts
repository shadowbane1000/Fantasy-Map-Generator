import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawState } from "./_shared";
import {
  createSetDiplomacyTool,
  type DiplomacyRef,
  type DiplomacyRuntime,
  resolveRelation,
  reverseRelation,
  setDiplomacyTool,
} from "./set-diplomacy";

function makeRuntime(
  find: (aRef: number | string, bRef: number | string) => DiplomacyRef | null,
): {
  runtime: DiplomacyRuntime;
  apply: ReturnType<typeof vi.fn<DiplomacyRuntime["apply"]>>;
} {
  const apply = vi.fn<DiplomacyRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("reverseRelation", () => {
  it("maps Vassal/Suzerain, mirrors others", () => {
    expect(reverseRelation("Vassal")).toBe("Suzerain");
    expect(reverseRelation("Suzerain")).toBe("Vassal");
    expect(reverseRelation("Ally")).toBe("Ally");
    expect(reverseRelation("Enemy")).toBe("Enemy");
  });
});

describe("resolveRelation", () => {
  it("resolves canonical values", () => {
    for (const r of ["Ally", "Friendly", "Neutral", "Suspicion", "Enemy"]) {
      expect(resolveRelation(r)).toBe(r);
    }
  });

  it("resolves common aliases", () => {
    expect(resolveRelation("at war")).toBe("Enemy");
    expect(resolveRelation("WAR")).toBe("Enemy");
    expect(resolveRelation("allied")).toBe("Ally");
    expect(resolveRelation("friend")).toBe("Friendly");
  });

  it("returns null for unknown / non-strings", () => {
    expect(resolveRelation("Frienemy")).toBeNull();
    expect(resolveRelation(42)).toBeNull();
    expect(resolveRelation(null)).toBeNull();
  });
});

describe("set_diplomacy tool", () => {
  it("writes both sides symmetrically for Ally", async () => {
    const { runtime, apply } = makeRuntime((a, b) =>
      a === 1 && b === 2
        ? {
            aId: 1,
            aName: "Rookhold",
            bId: 2,
            bName: "Ashholm",
            previousRelation: "Neutral",
          }
        : null,
    );
    const tool = createSetDiplomacyTool(runtime);
    const result = await tool.execute({
      state_a: 1,
      state_b: 2,
      relation: "Ally",
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 2, "Ally");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      state_a: { i: 1, name: "Rookhold" },
      state_b: { i: 2, name: "Ashholm" },
      previousRelation: "Neutral",
      relation: "Ally",
      reverseRelation: "Ally",
    });
  });

  it("mirrors Vassal to Suzerain", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      aId: 1,
      aName: "A",
      bId: 2,
      bName: "B",
      previousRelation: null,
    }));
    const tool = createSetDiplomacyTool(runtime);
    const result = await tool.execute({
      state_a: 1,
      state_b: 2,
      relation: "Vassal",
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 2, "Vassal");
    expect(JSON.parse(result.content).reverseRelation).toBe("Suzerain");
  });

  it("resolves alias 'at war' to Enemy", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      aId: 1,
      aName: "A",
      bId: 2,
      bName: "B",
      previousRelation: null,
    }));
    const tool = createSetDiplomacyTool(runtime);
    await tool.execute({
      state_a: 1,
      state_b: 2,
      relation: "at war",
    });
    expect(apply).toHaveBeenCalledWith(1, 2, "Enemy");
  });

  it("rejects invalid state refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetDiplomacyTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      expect(
        (
          await tool.execute({
            state_a: bad,
            state_b: 2,
            relation: "Ally",
          })
        ).isError,
      ).toBe(true);
      expect(
        (
          await tool.execute({
            state_a: 1,
            state_b: bad,
            relation: "Ally",
          })
        ).isError,
      ).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses same-state pair", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      aId: 1,
      aName: "A",
      bId: 1,
      bName: "A",
      previousRelation: null,
    }));
    const tool = createSetDiplomacyTool(runtime);
    const result = await tool.execute({
      state_a: 1,
      state_b: 1,
      relation: "Ally",
    });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown relations", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      aId: 1,
      aName: "A",
      bId: 2,
      bName: "B",
      previousRelation: null,
    }));
    const tool = createSetDiplomacyTool(runtime);
    for (const bad of [null, undefined, "", "   ", "Frenemy", 42]) {
      const r = await tool.execute({
        state_a: 1,
        state_b: 2,
        relation: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when the states can't be resolved", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetDiplomacyTool(runtime);
    const result = await tool.execute({
      state_a: 999,
      state_b: 998,
      relation: "Ally",
    });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: DiplomacyRuntime = {
      find: () => ({
        aId: 1,
        aName: "A",
        bId: 2,
        bName: "B",
        previousRelation: null,
      }),
      apply: vi.fn(() => {
        throw new Error("diplomacy missing");
      }),
    };
    const tool = createSetDiplomacyTool(runtime);
    const result = await tool.execute({
      state_a: 1,
      state_b: 2,
      relation: "Ally",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/diplomacy missing/);
  });
});

describe("defaultDiplomacyRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      states: [
        {
          i: 0,
          name: "Neutrals",
          removed: true,
          diplomacy: [],
        },
        {
          i: 1,
          name: "Rookhold",
          diplomacy: ["x", "x", "Neutral"],
        },
        {
          i: 2,
          name: "Ashholm",
          diplomacy: ["x", "Neutral", "x"],
        },
      ] satisfies RawState[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("writes both sides for Ally", async () => {
    const result = await setDiplomacyTool.execute({
      state_a: 1,
      state_b: 2,
      relation: "Ally",
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { states: RawState[] };
      }
    ).pack;
    expect(pack.states[1]?.diplomacy?.[2]).toBe("Ally");
    expect(pack.states[2]?.diplomacy?.[1]).toBe("Ally");
  });

  it("mirrors Vassal to Suzerain in the live pack", async () => {
    await setDiplomacyTool.execute({
      state_a: 1,
      state_b: 2,
      relation: "Vassal",
    });
    const pack = (
      globalThis as {
        pack: { states: RawState[] };
      }
    ).pack;
    expect(pack.states[1]?.diplomacy?.[2]).toBe("Vassal");
    expect(pack.states[2]?.diplomacy?.[1]).toBe("Suzerain");
  });

  it("refuses when Neutrals (0) is a party", async () => {
    const result = await setDiplomacyTool.execute({
      state_a: 0,
      state_b: 2,
      relation: "Ally",
    });
    expect(result.isError).toBe(true);
  });

  it("errors when state has no diplomacy array", async () => {
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    if (pack.states[1]) pack.states[1].diplomacy = undefined;
    const result = await setDiplomacyTool.execute({
      state_a: 1,
      state_b: 2,
      relation: "Ally",
    });
    expect(result.isError).toBe(true);
  });
});
