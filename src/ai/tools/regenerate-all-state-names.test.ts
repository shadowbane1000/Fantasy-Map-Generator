import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawState } from "./_shared";
import {
  createRegenerateAllStateNamesTool,
  type RegenerateAllStateNamesRuntime,
  type RegenerateAllStateNamesStateRef,
  regenerateAllStateNamesTool,
} from "./regenerate-all-state-names";

function makeRuntime(
  states: RegenerateAllStateNamesStateRef[],
  generated: (mode: string, culture: number) => string = (_m, c) => `Name${c}`,
): {
  runtime: RegenerateAllStateNamesRuntime;
  list: ReturnType<typeof vi.fn<RegenerateAllStateNamesRuntime["list"]>>;
  generate: ReturnType<
    typeof vi.fn<RegenerateAllStateNamesRuntime["generate"]>
  >;
  apply: ReturnType<typeof vi.fn<RegenerateAllStateNamesRuntime["apply"]>>;
  redraw: ReturnType<typeof vi.fn<RegenerateAllStateNamesRuntime["redraw"]>>;
} {
  const list = vi.fn<RegenerateAllStateNamesRuntime["list"]>(() => states);
  const generate = vi.fn<RegenerateAllStateNamesRuntime["generate"]>(generated);
  const apply = vi.fn<RegenerateAllStateNamesRuntime["apply"]>();
  const redraw = vi.fn<RegenerateAllStateNamesRuntime["redraw"]>();
  return {
    runtime: { list, generate, apply, redraw },
    list,
    generate,
    apply,
    redraw,
  };
}

describe("regenerate_all_state_names tool", () => {
  it("default mode is culture, skips neutrals/locked/removed", async () => {
    const { runtime, generate, apply, redraw } = makeRuntime([
      { i: 0, name: "Neutrals", culture: 0 },
      { i: 1, name: "Altaria", culture: 1 },
      { i: 2, name: "Bardia", culture: 2, lock: true },
      { i: 3, name: "Cedria", culture: 3, removed: true },
      { i: 4, name: "Drakia", culture: 4 },
    ]);
    const tool = createRegenerateAllStateNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledWith("culture", 1);
    expect(generate).toHaveBeenCalledWith("culture", 4);
    expect(apply).toHaveBeenCalledWith(1, "Name1");
    expect(apply).toHaveBeenCalledWith(4, "Name4");
    expect(redraw).toHaveBeenCalledTimes(1);

    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("culture");
    expect(body.renamed).toEqual([
      { i: 1, previousName: "Altaria", name: "Name1" },
      { i: 4, previousName: "Drakia", name: "Name4" },
    ]);
    expect(body.skipped).toEqual([
      { i: 0, name: "Neutrals", reason: "neutrals" },
      { i: 2, name: "Bardia", reason: "locked" },
      { i: 3, name: "Cedria", reason: "removed" },
    ]);
  });

  it("explicit random mode canonicalizes case", async () => {
    const { runtime, generate } = makeRuntime([
      { i: 1, name: "X", culture: 1 },
    ]);
    const tool = createRegenerateAllStateNamesTool(runtime);
    await tool.execute({ mode: "RANDOM" });
    expect(generate).toHaveBeenCalledWith("random", 1);
  });

  it("rejects unknown mode and doesn't touch pack", async () => {
    const { runtime, apply, redraw } = makeRuntime([
      { i: 1, name: "X", culture: 1 },
    ]);
    const tool = createRegenerateAllStateNamesTool(runtime);
    const result = await tool.execute({ mode: "other" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(redraw).not.toHaveBeenCalled();
  });

  it("generator errors go to skipped; loop continues; redraw still called once", async () => {
    let call = 0;
    const { runtime, apply, redraw } = makeRuntime(
      [
        { i: 1, name: "A", culture: 1 },
        { i: 2, name: "B", culture: 2 },
        { i: 3, name: "C", culture: 3 },
      ],
      (_mode, culture) => {
        call++;
        if (call === 2) throw new Error("boom");
        return `Name${culture}`;
      },
    );
    const tool = createRegenerateAllStateNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledWith(1, "Name1");
    expect(apply).toHaveBeenCalledWith(3, "Name3");
    expect(redraw).toHaveBeenCalledTimes(1);

    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(2);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0]).toEqual({
      i: 2,
      name: "B",
      reason: expect.stringMatching(/generate failed: boom/),
    });
  });

  it("empty generator output is skipped", async () => {
    const { runtime, apply, redraw } = makeRuntime(
      [{ i: 1, name: "A", culture: 1 }],
      () => "   ",
    );
    const tool = createRegenerateAllStateNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(redraw).toHaveBeenCalledTimes(1);
    const body = JSON.parse(result.content);
    expect(body.skipped[0].reason).toMatch(/empty/);
  });

  it("apply errors go to skipped and loop continues", async () => {
    const { runtime, apply, redraw } = makeRuntime([
      { i: 1, name: "A", culture: 1 },
      { i: 2, name: "B", culture: 2 },
    ]);
    let applyCall = 0;
    apply.mockImplementation(() => {
      applyCall++;
      if (applyCall === 1) throw new Error("apply-boom");
    });
    const tool = createRegenerateAllStateNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(redraw).toHaveBeenCalledTimes(1);
    const body = JSON.parse(result.content);
    expect(body.renamed).toEqual([{ i: 2, previousName: "B", name: "Name2" }]);
    expect(body.skipped).toEqual([
      {
        i: 1,
        name: "A",
        reason: expect.stringMatching(/apply failed: apply-boom/),
      },
    ]);
  });

  it("list-throws returns errorResult and never calls redraw", async () => {
    const runtime: RegenerateAllStateNamesRuntime = {
      list: vi.fn(() => {
        throw new Error("pack.states is not available.");
      }),
      generate: vi.fn(),
      apply: vi.fn(),
      redraw: vi.fn(),
    };
    const tool = createRegenerateAllStateNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/states/);
    expect(runtime.redraw).not.toHaveBeenCalled();
  });

  it("redraw failure is swallowed (renames still returned)", async () => {
    const { runtime, redraw } = makeRuntime([{ i: 1, name: "A", culture: 1 }]);
    redraw.mockImplementation(() => {
      throw new Error("no d3 yet");
    });
    const tool = createRegenerateAllStateNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(1);
  });
});

describe("defaultRegenerateAllStateNamesRuntime (integration)", () => {
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
    getState.mockImplementation(
      (_base: string, c?: number, _bi?: number) => `Gen${c ?? "X"}`,
    );
    getCultureShort.mockReset();
    getCultureShort.mockReturnValue("Short");
    getBase.mockReset();
    getBase.mockReturnValue("BaseName");
    drawStateLabels.mockReset();

    const states: RawState[] = [];
    states[0] = { i: 0, name: "Neutrals" };
    states[1] = { i: 1, name: "Altaria", culture: 1 };
    states[2] = { i: 2, name: "Bardia", culture: 2, lock: true };
    states[3] = { i: 3, name: "Cedria", culture: 3, removed: true };
    states[4] = { i: 4, name: "Drakia", culture: 4 };
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

  it("culture mode: renames only non-locked, non-removed (skips Neutrals)", async () => {
    const result = await regenerateAllStateNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toEqual([
      { i: 1, previousName: "Altaria", name: "Gen1" },
      { i: 4, previousName: "Drakia", name: "Gen4" },
    ]);

    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[0]?.name).toBe("Neutrals");
    expect(pack.states[1]?.name).toBe("Gen1");
    expect(pack.states[2]?.name).toBe("Bardia"); // locked, untouched
    expect(pack.states[3]?.name).toBe("Cedria"); // removed, untouched
    expect(pack.states[4]?.name).toBe("Gen4");

    expect(getCultureShort).toHaveBeenCalledWith(1);
    expect(getCultureShort).toHaveBeenCalledWith(4);
    expect(drawStateLabels).toHaveBeenCalledTimes(1);
    expect(drawStateLabels).toHaveBeenCalledWith();
  });

  it("random mode: calls getBase + getState with base index", async () => {
    const result = await regenerateAllStateNamesTool.execute({
      mode: "random",
    });
    expect(result.isError).toBeFalsy();
    expect(getBase).toHaveBeenCalledTimes(2);
    expect(getState).toHaveBeenCalledTimes(2);
    for (const call of getState.mock.calls) {
      expect(call[1]).toBeUndefined();
      expect(typeof call[2]).toBe("number");
    }
    expect(drawStateLabels).toHaveBeenCalledTimes(1);
  });

  it("errors when Names is missing", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const result = await regenerateAllStateNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    // Per-state generator errors are recorded in skipped.
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(0);
    expect(
      body.skipped.filter((s: { reason: string }) =>
        /Names.getState is not available/.test(s.reason),
      ),
    ).toHaveLength(2);
  });

  it("errors when nameBases missing in random mode", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await regenerateAllStateNamesTool.execute({
      mode: "random",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(0);
    expect(
      body.skipped.filter((s: { reason: string }) =>
        /nameBases/.test(s.reason),
      ),
    ).toHaveLength(2);
  });
});
