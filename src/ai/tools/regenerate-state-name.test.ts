import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawState } from "./_shared";
import {
  createRegenerateStateNameTool,
  type RegenerateStateNameRef,
  type RegenerateStateNameRuntime,
  regenerateStateNameTool,
  resolveStateNameMode,
  STATE_NAME_MODES,
} from "./regenerate-state-name";

describe("resolveStateNameMode", () => {
  it("canonicalizes case-insensitively", () => {
    expect(resolveStateNameMode("Culture")).toBe("culture");
    expect(resolveStateNameMode("RANDOM")).toBe("random");
  });

  it("returns null for unknown / non-string", () => {
    expect(resolveStateNameMode("other")).toBeNull();
    expect(resolveStateNameMode("")).toBeNull();
    expect(resolveStateNameMode(null)).toBeNull();
  });
});

describe("STATE_NAME_MODES", () => {
  it("has 2 modes", () => {
    expect(STATE_NAME_MODES).toEqual(["culture", "random"]);
  });
});

function makeRuntime(
  find: (ref: number | string) => RegenerateStateNameRef | null,
  generated = "New Kingdom",
): {
  runtime: RegenerateStateNameRuntime;
  generate: ReturnType<typeof vi.fn<RegenerateStateNameRuntime["generate"]>>;
  apply: ReturnType<typeof vi.fn<RegenerateStateNameRuntime["apply"]>>;
} {
  const generate = vi.fn<RegenerateStateNameRuntime["generate"]>(
    () => generated,
  );
  const apply = vi.fn<RegenerateStateNameRuntime["apply"]>();
  return { runtime: { find, generate, apply }, generate, apply };
}

describe("regenerate_state_name tool", () => {
  it("default mode is culture", async () => {
    const { runtime, generate, apply } = makeRuntime(() => ({
      i: 3,
      name: "Altaria",
      culture: 2,
    }));
    const tool = createRegenerateStateNameTool(runtime);
    const result = await tool.execute({ state: 3 });
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledWith("culture", 2);
    expect(apply).toHaveBeenCalledWith(3, "New Kingdom");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      previousName: "Altaria",
      name: "New Kingdom",
      mode: "culture",
    });
  });

  it("explicit random mode", async () => {
    const { runtime, generate } = makeRuntime(() => ({
      i: 3,
      name: "x",
      culture: 2,
    }));
    const tool = createRegenerateStateNameTool(runtime);
    await tool.execute({ state: 3, mode: "RANDOM" });
    expect(generate).toHaveBeenCalledWith("random", 2);
  });

  it("rejects unknown mode", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "x",
      culture: 2,
    }));
    const tool = createRegenerateStateNameTool(runtime);
    const result = await tool.execute({ state: 3, mode: "other" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid state refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createRegenerateStateNameTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects Neutrals (id 0)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 0,
      name: "Neutrals",
      culture: 0,
    }));
    const tool = createRegenerateStateNameTool(runtime);
    const result = await tool.execute({ state: 0 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown state", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createRegenerateStateNameTool(runtime);
    const result = await tool.execute({ state: 999 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces generator errors", async () => {
    const runtime: RegenerateStateNameRuntime = {
      find: () => ({ i: 3, name: "x", culture: 2 }),
      generate: vi.fn(() => {
        throw new Error("Names.getState is not available");
      }),
      apply: vi.fn(),
    };
    const tool = createRegenerateStateNameTool(runtime);
    const result = await tool.execute({ state: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names/);
  });

  it("rejects empty generator output", async () => {
    const runtime: RegenerateStateNameRuntime = {
      find: () => ({ i: 3, name: "x", culture: 2 }),
      generate: () => "   ",
      apply: vi.fn(),
    };
    const tool = createRegenerateStateNameTool(runtime);
    const result = await tool.execute({ state: 3 });
    expect(result.isError).toBe(true);
  });
});

describe("defaultRegenerateStateNameRuntime (integration)", () => {
  const getState = vi.fn(
    (_base: string, _c?: number, _bi?: number) => "Generated",
  );
  const getCultureShort = vi.fn((_c: number) => "Short");
  const getBase = vi.fn((_b: number) => "BaseName");
  const drawStateLabels = vi.fn();

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNames = (globalThis as { Names?: unknown }).Names;
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalDraw = (globalThis as { drawStateLabels?: unknown })
    .drawStateLabels;

  beforeEach(() => {
    getState.mockReset();
    getState.mockReturnValue("Generated");
    getCultureShort.mockReset();
    getCultureShort.mockReturnValue("Short");
    getBase.mockReset();
    getBase.mockReturnValue("BaseName");
    drawStateLabels.mockReset();

    const states: RawState[] = [];
    states[0] = { i: 0, name: "Neutrals" };
    states[3] = { i: 3, name: "Altaria", culture: 2 };
    (globalThis as { pack?: unknown }).pack = { states };
    (globalThis as { Names?: unknown }).Names = {
      getState,
      getCultureShort,
      getBase,
    };
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "A" },
      { name: "B" },
      { name: "C" },
    ];
    (globalThis as { drawStateLabels?: unknown }).drawStateLabels =
      drawStateLabels;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Names?: unknown }).Names = originalNames;
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { drawStateLabels?: unknown }).drawStateLabels =
      originalDraw;
  });

  it("culture mode calls getState(getCultureShort, culture)", async () => {
    const result = await regenerateStateNameTool.execute({ state: 3 });
    expect(result.isError).toBeFalsy();
    expect(getCultureShort).toHaveBeenCalledWith(2);
    expect(getState).toHaveBeenCalledWith("Short", 2);
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[3]?.name).toBe("Generated");
    expect(drawStateLabels).toHaveBeenCalledWith([3]);
  });

  it("random mode calls getState(getBase, undefined, base)", async () => {
    const result = await regenerateStateNameTool.execute({
      state: 3,
      mode: "random",
    });
    expect(result.isError).toBeFalsy();
    expect(getBase).toHaveBeenCalled();
    expect(getState).toHaveBeenCalled();
    const call = getState.mock.calls[0];
    // base arg 1 should be undefined; arg 2 should be the base index
    expect(call?.[1]).toBeUndefined();
    expect(typeof call?.[2]).toBe("number");
  });

  it("rejects Neutrals (state 0)", async () => {
    const result = await regenerateStateNameTool.execute({ state: 0 });
    expect(result.isError).toBe(true);
  });

  it("errors when Names is missing", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const result = await regenerateStateNameTool.execute({ state: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names/);
  });
});
