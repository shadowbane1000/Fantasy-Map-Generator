import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCulture, RawState } from "./_shared";
import {
  createSetStateCultureTool,
  type StateCultureCulture,
  type StateCultureRuntime,
  type StateCultureState,
  setStateCultureTool,
} from "./set-state-culture";

function makeRuntime(
  findState: (ref: number | string) => StateCultureState | null,
  findCulture: (ref: number | string) => StateCultureCulture | null,
): {
  runtime: StateCultureRuntime;
  apply: ReturnType<typeof vi.fn<StateCultureRuntime["apply"]>>;
} {
  const apply = vi.fn<StateCultureRuntime["apply"]>();
  return {
    runtime: { findState, findCulture, apply },
    apply,
  };
}

describe("set_state_culture tool", () => {
  it("sets by ids", async () => {
    const { runtime, apply } = makeRuntime(
      (ref) =>
        ref === 1
          ? {
              i: 1,
              name: "Rookhold",
              previousCultureId: 0,
              previousCultureName: "Wildlands",
            }
          : null,
      (ref) => (ref === 2 ? { i: 2, name: "Highlanders" } : null),
    );
    const tool = createSetStateCultureTool(runtime);
    const result = await tool.execute({ state: 1, culture: 2 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 2);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      state: { i: 1, name: "Rookhold" },
      previousCulture: { id: 0, name: "Wildlands" },
      culture: { id: 2, name: "Highlanders" },
    });
  });

  it("sets by names", async () => {
    const findState = vi.fn<StateCultureRuntime["findState"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "rookhold"
        ? {
            i: 1,
            name: "Rookhold",
            previousCultureId: 0,
            previousCultureName: "Wildlands",
          }
        : null,
    );
    const findCulture = vi.fn<StateCultureRuntime["findCulture"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "highlanders"
        ? { i: 2, name: "Highlanders" }
        : null,
    );
    const { runtime, apply } = makeRuntime(findState, findCulture);
    const tool = createSetStateCultureTool(runtime);
    await tool.execute({ state: "ROOKHOLD", culture: "highlanders" });
    expect(findState).toHaveBeenCalledWith("ROOKHOLD");
    expect(findCulture).toHaveBeenCalledWith("highlanders");
    expect(apply).toHaveBeenCalledWith(1, 2);
  });

  it("allows Wildlands (culture 0)", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({
        i: 1,
        name: "Rookhold",
        previousCultureId: 2,
        previousCultureName: "Highlanders",
      }),
      (ref) => (ref === 0 ? { i: 0, name: "Wildlands" } : null),
    );
    const tool = createSetStateCultureTool(runtime);
    const result = await tool.execute({ state: 1, culture: 0 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 0);
  });

  it("rejects state 0 via valid-ref guard", async () => {
    const { runtime, apply } = makeRuntime(
      () => null,
      () => ({ i: 1, name: "x" }),
    );
    const tool = createSetStateCultureTool(runtime);
    const result = await tool.execute({ state: 0, culture: 1 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, apply } = makeRuntime(
      () => null,
      () => null,
    );
    const tool = createSetStateCultureTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      expect((await tool.execute({ state: bad, culture: 0 })).isError).toBe(
        true,
      );
      expect((await tool.execute({ state: 1, culture: bad })).isError).toBe(
        true,
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors on unknown state / culture", async () => {
    const { runtime, apply } = makeRuntime(
      () => null,
      () => ({ i: 1, name: "x" }),
    );
    const tool = createSetStateCultureTool(runtime);
    expect((await tool.execute({ state: 999, culture: 1 })).isError).toBe(true);
    const { runtime: r2 } = makeRuntime(
      () => ({
        i: 1,
        name: "x",
        previousCultureId: 0,
        previousCultureName: null,
      }),
      () => null,
    );
    const tool2 = createSetStateCultureTool(r2);
    expect((await tool2.execute({ state: 1, culture: 999 })).isError).toBe(
      true,
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: StateCultureRuntime = {
      findState: () => ({
        i: 1,
        name: "x",
        previousCultureId: 0,
        previousCultureName: null,
      }),
      findCulture: () => ({ i: 1, name: "y" }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetStateCultureTool(runtime);
    const result = await tool.execute({ state: 1, culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultStateCultureRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals", removed: true },
        { i: 1, name: "Rookhold", culture: 0 },
        { i: 2, name: "Ashholm", culture: 0 },
      ] satisfies RawState[],
      cultures: [
        { i: 0, name: "Wildlands" },
        { i: 1, name: "Highlanders" },
        { i: 2, name: "Coastalfolk" },
      ] satisfies RawCulture[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("sets state.culture in the live pack", async () => {
    const result = await setStateCultureTool.execute({
      state: 1,
      culture: 2,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { states: RawState[] };
      }
    ).pack;
    expect(pack.states[1]?.culture).toBe(2);
  });

  it("allows Wildlands (culture 0)", async () => {
    const result = await setStateCultureTool.execute({
      state: 2,
      culture: 0,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { states: RawState[] };
      }
    ).pack;
    expect(pack.states[2]?.culture).toBe(0);
  });

  it("refuses a removed culture", async () => {
    const pack = (globalThis as { pack: { cultures: RawCulture[] } }).pack;
    if (pack.cultures[1]) pack.cultures[1].removed = true;
    const result = await setStateCultureTool.execute({
      state: 1,
      culture: 1,
    });
    expect(result.isError).toBe(true);
  });
});
