import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRiver } from "./_shared";
import {
  createRegenerateRiverNamesTool,
  type RegenerateRiverNamesRiverRef,
  type RegenerateRiverNamesRuntime,
  regenerateRiverNamesTool,
} from "./regenerate-river-names";

function makeRuntime(
  rivers: RegenerateRiverNamesRiverRef[],
  generated: (mode: string, mouth: number) => string = (_m, c) => `Name${c}`,
): {
  runtime: RegenerateRiverNamesRuntime;
  list: ReturnType<typeof vi.fn<RegenerateRiverNamesRuntime["list"]>>;
  generate: ReturnType<typeof vi.fn<RegenerateRiverNamesRuntime["generate"]>>;
  apply: ReturnType<typeof vi.fn<RegenerateRiverNamesRuntime["apply"]>>;
  redraw: ReturnType<typeof vi.fn<RegenerateRiverNamesRuntime["redraw"]>>;
} {
  const list = vi.fn<RegenerateRiverNamesRuntime["list"]>(() => rivers);
  const generate = vi.fn<RegenerateRiverNamesRuntime["generate"]>(generated);
  const apply = vi.fn<RegenerateRiverNamesRuntime["apply"]>();
  const redraw = vi.fn<RegenerateRiverNamesRuntime["redraw"]>();
  return {
    runtime: { list, generate, apply, redraw },
    list,
    generate,
    apply,
    redraw,
  };
}

describe("regenerate_river_names tool", () => {
  it("default mode is culture, skips locked/removed", async () => {
    const { runtime, generate, apply, redraw } = makeRuntime([
      { i: 1, name: "Altaria", mouth: 10 },
      { i: 2, name: "Bardia", mouth: 20, lock: true },
      { i: 3, name: "Cedria", mouth: 30, removed: true },
      { i: 4, name: "Drakia", mouth: 40 },
    ]);
    const tool = createRegenerateRiverNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledWith("culture", 10);
    expect(generate).toHaveBeenCalledWith("culture", 40);
    expect(apply).toHaveBeenCalledWith(1, "Name10");
    expect(apply).toHaveBeenCalledWith(4, "Name40");
    expect(redraw).toHaveBeenCalledTimes(1);

    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("culture");
    expect(body.renamed).toEqual([
      { i: 1, previousName: "Altaria", name: "Name10" },
      { i: 4, previousName: "Drakia", name: "Name40" },
    ]);
    expect(body.skipped).toEqual([
      { i: 2, name: "Bardia", reason: "locked" },
      { i: 3, name: "Cedria", reason: "removed" },
    ]);
  });

  it("explicit random mode canonicalizes case", async () => {
    const { runtime, generate } = makeRuntime([{ i: 1, name: "X", mouth: 5 }]);
    const tool = createRegenerateRiverNamesTool(runtime);
    await tool.execute({ mode: "RANDOM" });
    expect(generate).toHaveBeenCalledWith("random", 5);
  });

  it("rejects unknown mode and doesn't touch pack", async () => {
    const { runtime, apply, redraw } = makeRuntime([
      { i: 1, name: "X", mouth: 5 },
    ]);
    const tool = createRegenerateRiverNamesTool(runtime);
    const result = await tool.execute({ mode: "other" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(redraw).not.toHaveBeenCalled();
  });

  it("generator errors go to skipped; loop continues; redraw still called once", async () => {
    let call = 0;
    const { runtime, apply, redraw } = makeRuntime(
      [
        { i: 1, name: "A", mouth: 1 },
        { i: 2, name: "B", mouth: 2 },
        { i: 3, name: "C", mouth: 3 },
      ],
      (_mode, mouth) => {
        call++;
        if (call === 2) throw new Error("boom");
        return `Name${mouth}`;
      },
    );
    const tool = createRegenerateRiverNamesTool(runtime);
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
      [{ i: 1, name: "A", mouth: 1 }],
      () => "   ",
    );
    const tool = createRegenerateRiverNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(redraw).toHaveBeenCalledTimes(1);
    const body = JSON.parse(result.content);
    expect(body.skipped[0].reason).toMatch(/empty/);
  });

  it("apply errors go to skipped and loop continues", async () => {
    const { runtime, apply, redraw } = makeRuntime([
      { i: 1, name: "A", mouth: 1 },
      { i: 2, name: "B", mouth: 2 },
    ]);
    let applyCall = 0;
    apply.mockImplementation(() => {
      applyCall++;
      if (applyCall === 1) throw new Error("apply-boom");
    });
    const tool = createRegenerateRiverNamesTool(runtime);
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
    const runtime: RegenerateRiverNamesRuntime = {
      list: vi.fn(() => {
        throw new Error("pack.rivers is not available.");
      }),
      generate: vi.fn(),
      apply: vi.fn(),
      redraw: vi.fn(),
    };
    const tool = createRegenerateRiverNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/rivers/);
    expect(runtime.redraw).not.toHaveBeenCalled();
  });

  it("redraw failure is swallowed (renames still returned)", async () => {
    const { runtime, redraw } = makeRuntime([{ i: 1, name: "A", mouth: 1 }]);
    redraw.mockImplementation(() => {
      throw new Error("no d3 yet");
    });
    const tool = createRegenerateRiverNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(1);
  });
});

describe("defaultRegenerateRiverNamesRuntime (integration)", () => {
  const getCulture = vi.fn((_c: number) => "Generated");
  const getBase = vi.fn((_b: number) => "BaseName");
  const drawRivers = vi.fn();

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNames = (globalThis as { Names?: unknown }).Names;
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalDraw = (globalThis as { drawRivers?: unknown }).drawRivers;

  beforeEach(() => {
    getCulture.mockReset();
    getCulture.mockImplementation((c: number) => `Gen${c}`);
    getBase.mockReset();
    getBase.mockReturnValue("BaseName");
    drawRivers.mockReset();

    const cultureArr = new Array(100).fill(0);
    cultureArr[10] = 1;
    cultureArr[20] = 2;
    cultureArr[30] = 3;
    cultureArr[40] = 4;

    const rivers: RawRiver[] = [
      { i: 1, name: "Altaria", mouth: 10 },
      { i: 2, name: "Bardia", mouth: 20, lock: true },
      { i: 3, name: "Cedria", mouth: 30, removed: true },
      { i: 4, name: "Drakia", mouth: 40 },
    ];

    (globalThis as { pack?: unknown }).pack = {
      cells: { culture: cultureArr },
      rivers,
    };
    (globalThis as { Names?: unknown }).Names = { getCulture, getBase };
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "A" },
      { name: "B" },
      { name: "C" },
    ];
    (globalThis as { drawRivers?: unknown }).drawRivers = drawRivers;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Names?: unknown }).Names = originalNames;
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { drawRivers?: unknown }).drawRivers = originalDraw;
  });

  it("culture mode: renames only non-locked, non-removed rivers", async () => {
    const result = await regenerateRiverNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toEqual([
      { i: 1, previousName: "Altaria", name: "Gen1" },
      { i: 4, previousName: "Drakia", name: "Gen4" },
    ]);

    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    expect(pack.rivers[0]?.name).toBe("Gen1");
    expect(pack.rivers[1]?.name).toBe("Bardia"); // locked, untouched
    expect(pack.rivers[2]?.name).toBe("Cedria"); // removed, untouched
    expect(pack.rivers[3]?.name).toBe("Gen4");

    expect(getCulture).toHaveBeenCalledWith(1);
    expect(getCulture).toHaveBeenCalledWith(4);
    expect(drawRivers).toHaveBeenCalledTimes(1);
  });

  it("random mode: calls getBase with a numeric base index", async () => {
    const result = await regenerateRiverNamesTool.execute({
      mode: "random",
    });
    expect(result.isError).toBeFalsy();
    expect(getBase).toHaveBeenCalledTimes(2);
    for (const call of getBase.mock.calls) {
      expect(typeof call[0]).toBe("number");
    }
    expect(drawRivers).toHaveBeenCalledTimes(1);
  });

  it("per-river generator error when Names is missing (no throw)", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const result = await regenerateRiverNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(0);
    expect(
      body.skipped.filter((s: { reason: string }) =>
        /Names is not available/.test(s.reason),
      ),
    ).toHaveLength(2);
  });

  it("per-river generator error when nameBases missing in random mode", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await regenerateRiverNamesTool.execute({
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
