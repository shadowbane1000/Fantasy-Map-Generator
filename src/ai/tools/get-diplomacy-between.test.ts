import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RawState } from "./_shared";
import {
  createGetDiplomacyBetweenTool,
  type DiplomacyBetween,
  type DiplomacyBetweenRuntime,
  getDiplomacyBetweenTool,
  type ReadDiplomacyBetweenResult,
  readDiplomacyBetweenFromPack,
} from "./get-diplomacy-between";

function sampleStates(): RawState[] {
  return [
    { i: 0, name: "Neutrals", removed: true, diplomacy: [] },
    {
      i: 1,
      name: "Rookhold",
      fullName: "The Kingdom of Rookhold",
      diplomacy: ["x", "x", "Ally", "Enemy"],
    },
    {
      i: 2,
      name: "Ashholm",
      diplomacy: ["x", "Ally", "x", "Vassal"],
    },
    {
      i: 3,
      name: "Stormveil",
      diplomacy: ["x", "Enemy", "Suzerain", "x"],
    },
    {
      i: 4,
      name: "Removed Realm",
      removed: true,
      diplomacy: [],
    },
  ];
}

function runtimeReturning(
  result: ReadDiplomacyBetweenResult,
): DiplomacyBetweenRuntime {
  return { read: () => result };
}

describe("readDiplomacyBetweenFromPack", () => {
  it("returns not-ready when pack.states is missing", () => {
    expect(readDiplomacyBetweenFromPack(undefined, 1, 2)).toBe("not-ready");
    expect(readDiplomacyBetweenFromPack({}, 1, 2)).toBe("not-ready");
  });

  it("returns neutral when state_a is 0", () => {
    expect(readDiplomacyBetweenFromPack({ states: sampleStates() }, 0, 2)).toBe(
      "neutral",
    );
  });

  it("returns neutral when state_b is 0", () => {
    expect(readDiplomacyBetweenFromPack({ states: sampleStates() }, 1, 0)).toBe(
      "neutral",
    );
  });

  it("returns same-state when refs resolve to the same id", () => {
    expect(readDiplomacyBetweenFromPack({ states: sampleStates() }, 1, 1)).toBe(
      "same-state",
    );
    expect(
      readDiplomacyBetweenFromPack({ states: sampleStates() }, "Rookhold", 1),
    ).toBe("same-state");
  });

  it("returns the relationship from state_a's view", () => {
    const res = readDiplomacyBetweenFromPack(
      { states: sampleStates() },
      1,
      2,
    ) as DiplomacyBetween;
    expect(res).toEqual({
      state_a: { i: 1, name: "Rookhold" },
      state_b: { i: 2, name: "Ashholm" },
      relationship: "Ally",
    });
  });

  it("reverses sides correctly — Vassal vs Suzerain", () => {
    const a = readDiplomacyBetweenFromPack(
      { states: sampleStates() },
      2,
      3,
    ) as DiplomacyBetween;
    expect(a.relationship).toBe("Vassal");

    const b = readDiplomacyBetweenFromPack(
      { states: sampleStates() },
      3,
      2,
    ) as DiplomacyBetween;
    expect(b.relationship).toBe("Suzerain");
  });

  it("normalizes the 'x' self-sentinel to null", () => {
    const states: RawState[] = [
      { i: 0, name: "Neutrals", removed: true, diplomacy: [] },
      { i: 1, name: "A", diplomacy: ["x", "x", "x"] },
      { i: 2, name: "B", diplomacy: ["x", "x", "x"] },
    ];
    const res = readDiplomacyBetweenFromPack(
      { states },
      1,
      2,
    ) as DiplomacyBetween;
    expect(res.relationship).toBeNull();
  });

  it("returns null relationship when the diplomacy array is absent", () => {
    const states: RawState[] = [
      { i: 0, name: "Neutrals", removed: true, diplomacy: [] },
      { i: 1, name: "A" },
      { i: 2, name: "B" },
    ];
    const res = readDiplomacyBetweenFromPack(
      { states },
      1,
      2,
    ) as DiplomacyBetween;
    expect(res).toEqual({
      state_a: { i: 1, name: "A" },
      state_b: { i: 2, name: "B" },
      relationship: null,
    });
  });

  it("resolves refs by name case-insensitively", () => {
    const res = readDiplomacyBetweenFromPack(
      { states: sampleStates() },
      "ROOKHOLD",
      "ashholm",
    ) as DiplomacyBetween;
    expect(res.state_a.i).toBe(1);
    expect(res.state_b.i).toBe(2);
    expect(res.relationship).toBe("Ally");
  });

  it("resolves refs by fullName", () => {
    const res = readDiplomacyBetweenFromPack(
      { states: sampleStates() },
      "the kingdom of rookhold",
      2,
    ) as DiplomacyBetween;
    expect(res.state_a.i).toBe(1);
  });

  it("returns not-found for unresolvable refs", () => {
    expect(
      readDiplomacyBetweenFromPack({ states: sampleStates() }, "Nowhere", 2),
    ).toBe("not-found");
    expect(
      readDiplomacyBetweenFromPack({ states: sampleStates() }, 1, 999),
    ).toBe("not-found");
  });

  it("returns not-found when a state is removed", () => {
    expect(readDiplomacyBetweenFromPack({ states: sampleStates() }, 1, 4)).toBe(
      "not-found",
    );
  });
});

describe("get_diplomacy_between tool — seam", () => {
  const okValue: DiplomacyBetween = {
    state_a: { i: 1, name: "Rookhold" },
    state_b: { i: 2, name: "Ashholm" },
    relationship: "Ally",
  };

  it("returns { ok, state_a, state_b, relationship } on success", async () => {
    const tool = createGetDiplomacyBetweenTool(runtimeReturning(okValue));
    const result = await tool.execute({ state_a: 1, state_b: 2 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      state_a: { i: 1, name: "Rookhold" },
      state_b: { i: 2, name: "Ashholm" },
      relationship: "Ally",
    });
  });

  it("passes null relationship through when the slot is empty", async () => {
    const tool = createGetDiplomacyBetweenTool(
      runtimeReturning({
        state_a: { i: 1, name: "A" },
        state_b: { i: 2, name: "B" },
        relationship: null,
      }),
    );
    const result = await tool.execute({ state_a: 1, state_b: 2 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).relationship).toBeNull();
  });

  it("does not expand aliases — keeps engine casing", async () => {
    const tool = createGetDiplomacyBetweenTool(
      runtimeReturning({
        state_a: { i: 1, name: "A" },
        state_b: { i: 2, name: "B" },
        relationship: "Enemy",
      }),
    );
    const result = await tool.execute({ state_a: 1, state_b: 2 });
    expect(JSON.parse(result.content).relationship).toBe("Enemy");
  });

  it("rejects state_a = 0 with a Neutrals-specific error", async () => {
    const tool = createGetDiplomacyBetweenTool(runtimeReturning(okValue));
    const result = await tool.execute({ state_a: 0, state_b: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Neutrals/);
  });

  it("rejects state_b = 0 with a Neutrals-specific error", async () => {
    const tool = createGetDiplomacyBetweenTool(runtimeReturning(okValue));
    const result = await tool.execute({ state_a: 1, state_b: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Neutrals/);
  });

  it("rejects invalid ref shapes", async () => {
    const tool = createGetDiplomacyBetweenTool(runtimeReturning(okValue));
    for (const bad of [null, undefined, "", "   ", -1, 1.5]) {
      expect((await tool.execute({ state_a: bad, state_b: 2 })).isError).toBe(
        true,
      );
      expect((await tool.execute({ state_a: 1, state_b: bad })).isError).toBe(
        true,
      );
    }
  });

  it("surfaces same-state rejection from the seam", async () => {
    const tool = createGetDiplomacyBetweenTool(runtimeReturning("same-state"));
    const result = await tool.execute({ state_a: 1, state_b: "Rookhold" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/different states/);
  });

  it("surfaces not-ready from the seam", async () => {
    const tool = createGetDiplomacyBetweenTool(runtimeReturning("not-ready"));
    const result = await tool.execute({ state_a: 1, state_b: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not ready/i);
  });

  it("surfaces not-found from the seam with both refs echoed", async () => {
    const tool = createGetDiplomacyBetweenTool(runtimeReturning("not-found"));
    const result = await tool.execute({
      state_a: "Nowhere",
      state_b: "Elsewhere",
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/Nowhere/);
    expect(body.error).toMatch(/Elsewhere/);
  });
});

describe("defaultDiplomacyBetweenRuntime (integration)", () => {
  const originalPack = (globalThis as unknown as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = {
      states: sampleStates(),
    };
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
  });

  it("reads from the live pack — Ally pair", async () => {
    const result = await getDiplomacyBetweenTool.execute({
      state_a: 1,
      state_b: 2,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      state_a: { i: 1, name: "Rookhold" },
      state_b: { i: 2, name: "Ashholm" },
      relationship: "Ally",
    });
  });

  it("returns relationship: null when the diplomacy array is missing", async () => {
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    if (pack.states[1]) pack.states[1].diplomacy = undefined;
    const result = await getDiplomacyBetweenTool.execute({
      state_a: 1,
      state_b: 2,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).relationship).toBeNull();
  });

  it("rejects a removed state as state_b", async () => {
    const result = await getDiplomacyBetweenTool.execute({
      state_a: 1,
      state_b: 4,
    });
    expect(result.isError).toBe(true);
  });

  it("rejects Neutrals (state 0) as either party", async () => {
    expect(
      (
        await getDiplomacyBetweenTool.execute({
          state_a: 0,
          state_b: 2,
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await getDiplomacyBetweenTool.execute({
          state_a: 1,
          state_b: 0,
        })
      ).isError,
    ).toBe(true);
  });
});
