import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawState } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createResetStateDiplomacyTool,
  type ResetStateDiplomacyError,
  type ResetStateDiplomacyResult,
  type ResetStateDiplomacyRuntime,
  resetStateDiplomacyTool,
} from "./reset-state-diplomacy";

function makeRuntime(
  reset: (
    ref: number | string,
  ) => ResetStateDiplomacyResult | ResetStateDiplomacyError,
): {
  runtime: ResetStateDiplomacyRuntime;
  reset: ReturnType<typeof vi.fn<ResetStateDiplomacyRuntime["reset"]>>;
} {
  const fn = vi.fn<ResetStateDiplomacyRuntime["reset"]>(reset);
  return { runtime: { reset: fn }, reset: fn };
}

describe("reset_state_diplomacy tool", () => {
  it("returns the runtime result with mixed changes", async () => {
    const { runtime, reset } = makeRuntime(() => ({
      state: { i: 1, name: "Rookhold" },
      changes: [
        {
          other_state: { i: 2, name: "Ashholm" },
          previous: "Friendly",
          new: "Neutral",
        },
        {
          other_state: { i: 4, name: "Marrowmere" },
          previous: "Enemy",
          new: "Neutral",
        },
        {
          other_state: { i: 5, name: "Tideford" },
          previous: "Vassal",
          new: "Neutral",
        },
      ],
    }));
    const tool = createResetStateDiplomacyTool(runtime);
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledWith(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      state: { i: 1, name: "Rookhold" },
      changes: [
        {
          other_state: { i: 2, name: "Ashholm" },
          previous: "Friendly",
          new: "Neutral",
        },
        {
          other_state: { i: 4, name: "Marrowmere" },
          previous: "Enemy",
          new: "Neutral",
        },
        {
          other_state: { i: 5, name: "Tideford" },
          previous: "Vassal",
          new: "Neutral",
        },
      ],
    });
  });

  it("returns ok with empty changes when nothing to reset", async () => {
    const { runtime, reset } = makeRuntime(() => ({
      state: { i: 1, name: "Rookhold" },
      changes: [],
    }));
    const tool = createResetStateDiplomacyTool(runtime);
    const result = await tool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    expect(reset).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      state: { i: 1, name: "Rookhold" },
      changes: [],
    });
  });

  it("forwards string refs verbatim (case preserved)", async () => {
    const { runtime, reset } = makeRuntime(() => ({
      state: { i: 1, name: "Rookhold" },
      changes: [],
    }));
    const tool = createResetStateDiplomacyTool(runtime);
    await tool.execute({ state: "rookhold" });
    expect(reset).toHaveBeenCalledWith("rookhold");
  });

  it("forwards integer refs", async () => {
    const { runtime, reset } = makeRuntime(() => ({
      state: { i: 5, name: "Tideford" },
      changes: [],
    }));
    const tool = createResetStateDiplomacyTool(runtime);
    await tool.execute({ state: 5 });
    expect(reset).toHaveBeenCalledWith(5);
  });

  it("rejects invalid input shapes", async () => {
    const { runtime, reset } = makeRuntime(() => ({
      state: { i: 1, name: "X" },
      changes: [],
    }));
    const tool = createResetStateDiplomacyTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, "", "   ", [], {}]) {
      const result = await tool.execute({ state: bad });
      expect(result.isError).toBe(true);
    }
    expect(reset).not.toHaveBeenCalled();
  });

  it("surfaces runtime error objects via errorResult", async () => {
    const { runtime } = makeRuntime(() => ({
      error: "State 99 not found.",
    }));
    const tool = createResetStateDiplomacyTool(runtime);
    const result = await tool.execute({ state: 99 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("State 99 not found.");
  });

  it("exposes the expected tool name and schema", () => {
    const { runtime } = makeRuntime(() => ({
      state: { i: 1, name: "X" },
      changes: [],
    }));
    const tool = createResetStateDiplomacyTool(runtime);
    expect(tool.name).toBe("reset_state_diplomacy");
    expect(tool.input_schema.type).toBe("object");
    expect((tool.input_schema as { required?: unknown }).required).toEqual([
      "state",
    ]);
    const props = (
      tool.input_schema as { properties?: Record<string, unknown> }
    ).properties;
    expect((props?.state as { type?: unknown })?.type).toEqual([
      "integer",
      "string",
    ]);
  });

  it("registers in a fresh ToolRegistry", () => {
    const registry = new ToolRegistry();
    registry.register(resetStateDiplomacyTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "reset_state_diplomacy",
    );
  });
});

describe("defaultResetStateDiplomacyRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      states: [
        {
          i: 0,
          name: "Neutrals",
          removed: true,
          diplomacy: ["x", "x", "x", "x", "x", "x"],
        },
        {
          i: 1,
          name: "Rookhold",
          diplomacy: ["x", "x", "Neutral", "x", "Neutral", "Neutral"],
        },
        {
          i: 2,
          name: "Ashholm",
          diplomacy: ["x", "Neutral", "x", "x", "Neutral", "Neutral"],
        },
        {
          i: 3,
          name: "Greycliff",
          removed: true,
          diplomacy: ["x", "x", "x", "x", "x", "x"],
        },
        {
          i: 4,
          name: "Marrowmere",
          diplomacy: ["x", "Neutral", "Neutral", "x", "x", "Neutral"],
        },
        {
          i: 5,
          name: "Tideford",
          diplomacy: ["x", "Neutral", "Neutral", "x", "Neutral", "x"],
        },
      ] satisfies RawState[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("mutates both sides for non-Neutral pairs and tracks previous values", async () => {
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    pack.states[1]!.diplomacy = ["x", "x", "Friendly", "x", "Enemy", "Vassal"];
    pack.states[2]!.diplomacy = [
      "x",
      "Friendly",
      "x",
      "x",
      "Neutral",
      "Neutral",
    ];
    pack.states[4]!.diplomacy = ["x", "Enemy", "Neutral", "x", "x", "Neutral"];
    pack.states[5]!.diplomacy = [
      "x",
      "Suzerain",
      "Neutral",
      "x",
      "Neutral",
      "x",
    ];

    const result = await resetStateDiplomacyTool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.ok).toBe(true);
    expect(parsed.state).toEqual({ i: 1, name: "Rookhold" });
    expect(parsed.changes).toHaveLength(3);
    expect(parsed.changes).toEqual([
      {
        other_state: { i: 2, name: "Ashholm" },
        previous: "Friendly",
        new: "Neutral",
      },
      {
        other_state: { i: 4, name: "Marrowmere" },
        previous: "Enemy",
        new: "Neutral",
      },
      {
        other_state: { i: 5, name: "Tideford" },
        previous: "Vassal",
        new: "Neutral",
      },
    ]);

    // Self side: x slots preserved, others now Neutral.
    expect(pack.states[1]!.diplomacy).toEqual([
      "x",
      "x",
      "Neutral",
      "x",
      "Neutral",
      "Neutral",
    ]);

    // Mirror writes (load-bearing).
    expect(pack.states[2]!.diplomacy?.[1]).toBe("Neutral");
    expect(pack.states[4]!.diplomacy?.[1]).toBe("Neutral");
    expect(pack.states[5]!.diplomacy?.[1]).toBe("Neutral");

    // Removed state untouched.
    expect(pack.states[3]!.diplomacy).toEqual(["x", "x", "x", "x", "x", "x"]);
    // Neutral state untouched.
    expect(pack.states[0]!.diplomacy).toEqual(["x", "x", "x", "x", "x", "x"]);
  });

  it("does not write when the Self side is already Neutral (idempotent)", async () => {
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    // Self is fully Neutral already.
    pack.states[1]!.diplomacy = [
      "x",
      "x",
      "Neutral",
      "x",
      "Neutral",
      "Neutral",
    ];
    // Pre-existing inconsistency: state 2 thinks state 1 is Suspicion.
    pack.states[2]!.diplomacy = [
      "x",
      "Suspicion",
      "x",
      "x",
      "Neutral",
      "Neutral",
    ];

    const result = await resetStateDiplomacyTool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.ok).toBe(true);
    expect(parsed.changes).toEqual([]);

    // Self side unchanged.
    expect(pack.states[1]!.diplomacy).toEqual([
      "x",
      "x",
      "Neutral",
      "x",
      "Neutral",
      "Neutral",
    ]);
    // Mirror NOT touched — pre-existing Suspicion preserved (no spurious write).
    expect(pack.states[2]!.diplomacy?.[1]).toBe("Suspicion");
  });

  it("resolves state by name (case-insensitive)", async () => {
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    pack.states[1]!.diplomacy = [
      "x",
      "x",
      "Friendly",
      "x",
      "Neutral",
      "Neutral",
    ];
    pack.states[2]!.diplomacy = [
      "x",
      "Friendly",
      "x",
      "x",
      "Neutral",
      "Neutral",
    ];

    const result = await resetStateDiplomacyTool.execute({
      state: "rOoKhOlD",
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.state).toEqual({ i: 1, name: "Rookhold" });
    expect(parsed.changes).toEqual([
      {
        other_state: { i: 2, name: "Ashholm" },
        previous: "Friendly",
        new: "Neutral",
      },
    ]);
    expect(pack.states[1]!.diplomacy?.[2]).toBe("Neutral");
    expect(pack.states[2]!.diplomacy?.[1]).toBe("Neutral");
  });

  it("skips slots whose counterpart state is undefined (sparse list)", async () => {
    const pack = (
      globalThis as {
        pack: { states: (RawState | undefined)[] };
      }
    ).pack;
    pack.states[3] = undefined;
    pack.states[1]!.diplomacy = ["x", "x", "Friendly", "Enemy", "Neutral", "x"];
    pack.states[2]!.diplomacy = [
      "x",
      "Friendly",
      "x",
      "x",
      "Neutral",
      "Neutral",
    ];

    const result = await resetStateDiplomacyTool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed.changes).toEqual([
      {
        other_state: { i: 2, name: "Ashholm" },
        previous: "Friendly",
        new: "Neutral",
      },
    ]);
    // Slot 3 left alone — counterpart is undefined.
    expect(pack.states[1]!.diplomacy?.[3]).toBe("Enemy");
    // Slot 2 mirror happened.
    expect(pack.states[2]!.diplomacy?.[1]).toBe("Neutral");
  });

  it("rejects state 0 with an input-shape error", async () => {
    const result = await resetStateDiplomacyTool.execute({ state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/positive integer id/);
  });

  it("rejects a removed state with a not-found error", async () => {
    const result = await resetStateDiplomacyTool.execute({ state: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not found/);
  });

  it("errors when the state ref doesn't resolve (numeric)", async () => {
    const result = await resetStateDiplomacyTool.execute({ state: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not found/);
  });

  it("errors when the state ref doesn't resolve (string)", async () => {
    const result = await resetStateDiplomacyTool.execute({ state: "Atlantis" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not found/);
  });

  it("returns ok with empty changes when diplomacy is missing", async () => {
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    pack.states[1]!.diplomacy = undefined;
    const result = await resetStateDiplomacyTool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed).toEqual({
      ok: true,
      state: { i: 1, name: "Rookhold" },
      changes: [],
    });
  });

  it("returns ok with empty changes when diplomacy is not an array", async () => {
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    pack.states[1]!.diplomacy = "nope" as unknown as string[];
    const result = await resetStateDiplomacyTool.execute({ state: 1 });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content);
    expect(parsed).toEqual({
      ok: true,
      state: { i: 1, name: "Rookhold" },
      changes: [],
    });
  });

  it("errors when pack is missing entirely", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await resetStateDiplomacyTool.execute({ state: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not found/);
  });
});
