import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawState } from "./_shared";
import {
  createSetStateTypeTool,
  resolveStateType,
  type StateTypeRef,
  type StateTypeRuntime,
  setStateTypeTool,
} from "./set-state-type";

function makeRuntime(find: (ref: number | string) => StateTypeRef | null): {
  runtime: StateTypeRuntime;
  apply: ReturnType<typeof vi.fn<StateTypeRuntime["apply"]>>;
} {
  const apply = vi.fn<StateTypeRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("resolveStateType", () => {
  it("resolves canonical values case-insensitively", () => {
    expect(resolveStateType("Generic")).toBe("Generic");
    expect(resolveStateType("naval")).toBe("Naval");
    expect(resolveStateType("HIGHLAND")).toBe("Highland");
  });

  it("returns null for unknown", () => {
    expect(resolveStateType("Desert")).toBeNull();
    expect(resolveStateType(42)).toBeNull();
  });
});

describe("set_state_type tool", () => {
  it("sets by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 1 ? { i: 1, name: "Rookhold", previousType: "Generic" } : null,
    );
    const tool = createSetStateTypeTool(runtime);
    const result = await tool.execute({ state: 1, type: "Naval" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, "Naval");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      name: "Rookhold",
      previousType: "Generic",
      type: "Naval",
    });
  });

  it("sets by case-insensitive name", async () => {
    const find = vi.fn<StateTypeRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "rookhold"
        ? { i: 1, name: "Rookhold", previousType: "Generic" }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetStateTypeTool(runtime);
    await tool.execute({ state: "ROOKHOLD", type: "Highland" });
    expect(find).toHaveBeenCalledWith("ROOKHOLD");
    expect(apply).toHaveBeenCalledWith(1, "Highland");
  });

  it("canonicalizes lowercase type", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousType: null,
    }));
    const tool = createSetStateTypeTool(runtime);
    await tool.execute({ state: 1, type: "nomadic" });
    expect(apply).toHaveBeenCalledWith(1, "Nomadic");
  });

  it("rejects unknown type", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousType: null,
    }));
    const tool = createSetStateTypeTool(runtime);
    const result = await tool.execute({ state: 1, type: "Desert" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid state refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetStateTypeTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad, type: "Naval" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses Neutrals (state 0)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 0,
      name: "Neutrals",
      previousType: null,
    }));
    const tool = createSetStateTypeTool(runtime);
    const result = await tool.execute({ state: 0, type: "Naval" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors on unknown state", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetStateTypeTool(runtime);
    const result = await tool.execute({ state: 999, type: "Naval" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: StateTypeRuntime = {
      find: () => ({ i: 1, name: "x", previousType: null }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetStateTypeTool(runtime);
    const result = await tool.execute({ state: 1, type: "Naval" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultStateTypeRuntime (integration)", () => {
  const recalc = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRecalc = (globalThis as { recalculateStates?: unknown })
    .recalculateStates;

  beforeEach(() => {
    recalc.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals", removed: true, type: "Generic" },
        { i: 1, name: "Rookhold", type: "Generic" },
        { i: 2, name: "Ashholm", type: "Generic" },
      ] satisfies RawState[],
    };
    (globalThis as { recalculateStates?: unknown }).recalculateStates = recalc;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { recalculateStates?: unknown }).recalculateStates =
      originalRecalc;
  });

  it("retypes state and recalculates", async () => {
    const result = await setStateTypeTool.execute({
      state: 1,
      type: "Highland",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[1]?.type).toBe("Highland");
    expect(recalc).toHaveBeenCalledTimes(1);
  });

  it("refuses a removed state", async () => {
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    if (pack.states[2]) pack.states[2].removed = true;
    const result = await setStateTypeTool.execute({
      state: 2,
      type: "Naval",
    });
    expect(result.isError).toBe(true);
  });
});
