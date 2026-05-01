import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawState } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createRegenerateDiplomacyTool,
  type RegenerateDiplomacyResult,
  type RegenerateDiplomacyRuntime,
  regenerateDiplomacyTool,
} from "./regenerate-diplomacy";

function makeRuntime(
  summary: RegenerateDiplomacyResult = { states_count: 0, histogram: {} },
): {
  runtime: RegenerateDiplomacyRuntime;
  regenerate: ReturnType<
    typeof vi.fn<RegenerateDiplomacyRuntime["regenerate"]>
  >;
  summarize: ReturnType<typeof vi.fn<RegenerateDiplomacyRuntime["summarize"]>>;
} {
  const regenerate = vi.fn<RegenerateDiplomacyRuntime["regenerate"]>();
  const summarize = vi.fn<RegenerateDiplomacyRuntime["summarize"]>(
    () => summary,
  );
  return { runtime: { regenerate, summarize }, regenerate, summarize };
}

describe("regenerate_diplomacy tool", () => {
  it("calls regenerate then summarize and returns the histogram", async () => {
    const { runtime, regenerate, summarize } = makeRuntime({
      states_count: 4,
      histogram: { Friendly: 3, Neutral: 2, Enemy: 1 },
    });
    const tool = createRegenerateDiplomacyTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(summarize).toHaveBeenCalledTimes(1);
    // Load-bearing: the histogram must reflect post-call state.
    const regOrder = regenerate.mock.invocationCallOrder[0];
    const sumOrder = summarize.mock.invocationCallOrder[0];
    expect(regOrder).toBeDefined();
    expect(sumOrder).toBeDefined();
    expect(regOrder).toBeLessThan(sumOrder as number);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      states_count: 4,
      histogram: { Friendly: 3, Neutral: 2, Enemy: 1 },
    });
  });

  it("surfaces runtime errors and does not summarize on failure", async () => {
    const summarize = vi.fn<RegenerateDiplomacyRuntime["summarize"]>();
    const runtime: RegenerateDiplomacyRuntime = {
      regenerate: vi.fn(() => {
        throw new Error(
          "States.generateDiplomacy is not available; the map hasn't finished loading.",
        );
      }),
      summarize,
    };
    const tool = createRegenerateDiplomacyTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /States\.generateDiplomacy/,
    );
    expect(summarize).not.toHaveBeenCalled();
  });

  it("exposes the expected tool name and empty-input schema", () => {
    const { runtime } = makeRuntime();
    const tool = createRegenerateDiplomacyTool(runtime);
    expect(tool.name).toBe("regenerate_diplomacy");
    expect(tool.input_schema.type).toBe("object");
    expect(tool.input_schema.properties).toEqual({});
    expect(
      (tool.input_schema as { required?: unknown }).required,
    ).toBeUndefined();
  });

  it("registers in a fresh ToolRegistry", () => {
    const registry = new ToolRegistry();
    registry.register(regenerateDiplomacyTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "regenerate_diplomacy",
    );
  });

  it("ignores extraneous / nullish input", async () => {
    const { runtime, regenerate } = makeRuntime({
      states_count: 0,
      histogram: {},
    });
    const tool = createRegenerateDiplomacyTool(runtime);
    for (const input of [{}, null, undefined, { extra: "ignored" }]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
    }
    expect(regenerate).toHaveBeenCalledTimes(4);
  });
});

describe("defaultRegenerateDiplomacyRuntime (integration)", () => {
  const generateDiplomacy = vi.fn();
  const originalStates = (globalThis as { States?: unknown }).States;
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    generateDiplomacy.mockReset();
    (globalThis as { States?: unknown }).States = {
      generateDiplomacy,
    };
    (globalThis as { pack?: unknown }).pack = {
      states: [{ i: 0, name: "Neutrals", diplomacy: [] }] satisfies RawState[],
    };
  });

  afterEach(() => {
    (globalThis as { States?: unknown }).States = originalStates;
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("calls States.generateDiplomacy and reports the post-call histogram", async () => {
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        { i: 1, name: "A", diplomacy: [] },
        { i: 2, name: "B", diplomacy: [] },
        { i: 3, name: "C", diplomacy: [] },
      ] satisfies RawState[],
    };
    generateDiplomacy.mockImplementation(() => {
      const pack = (globalThis as { pack?: { states: RawState[] } }).pack;
      if (!pack) return;
      // Pair (1,2)=Ally, (1,3)=Enemy, (2,3)=Friendly.
      pack.states[1]!.diplomacy = ["x", "x", "Ally", "Enemy"];
      pack.states[2]!.diplomacy = ["x", "Ally", "x", "Friendly"];
      pack.states[3]!.diplomacy = ["x", "Enemy", "Friendly", "x"];
    });

    const result = await regenerateDiplomacyTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(generateDiplomacy).toHaveBeenCalledTimes(1);
    expect(generateDiplomacy).toHaveBeenCalledWith();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      states_count: 3,
      histogram: { Ally: 1, Enemy: 1, Friendly: 1 },
    });
  });

  it("skips removed states and the neutral state in the histogram", async () => {
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        { i: 1, name: "A", diplomacy: [] },
        { i: 2, name: "Gone", removed: true, diplomacy: [] },
        { i: 3, name: "C", diplomacy: [] },
      ] satisfies RawState[],
    };
    generateDiplomacy.mockImplementation(() => {
      const pack = (globalThis as { pack?: { states: RawState[] } }).pack;
      if (!pack) return;
      pack.states[1]!.diplomacy = ["x", "x", "x", "Suspicion"];
      pack.states[3]!.diplomacy = ["x", "Suspicion", "x", "x"];
    });

    const result = await regenerateDiplomacyTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      states_count: 2,
      histogram: { Suspicion: 1 },
    });
  });

  it("returns an empty histogram when fewer than 2 active states exist", async () => {
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals", diplomacy: [] },
        { i: 1, name: "Lonely", diplomacy: [] },
      ] satisfies RawState[],
    };
    // States.generateDiplomacy returns early in this case (states-generator.ts:415).
    generateDiplomacy.mockImplementation(() => {});

    const result = await regenerateDiplomacyTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(generateDiplomacy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      states_count: 1,
      histogram: {},
    });
  });

  it("errors when the States global is missing", async () => {
    (globalThis as { States?: unknown }).States = undefined;
    const result = await regenerateDiplomacyTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /States\.generateDiplomacy/,
    );
  });

  it("errors when States.generateDiplomacy is not a function", async () => {
    (globalThis as { States?: unknown }).States = {
      generateDiplomacy: "not callable",
    };
    const result = await regenerateDiplomacyTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /States\.generateDiplomacy/,
    );
  });

  it("surfaces a thrown runtime error from generateDiplomacy", async () => {
    generateDiplomacy.mockImplementation(() => {
      throw new Error("boom");
    });
    const result = await regenerateDiplomacyTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("boom");
  });
});
