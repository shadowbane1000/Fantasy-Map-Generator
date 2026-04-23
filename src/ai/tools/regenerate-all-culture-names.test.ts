import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCulture } from "./_shared";
import {
  createRegenerateAllCultureNamesTool,
  type RegenerateAllCultureNamesCultureRef,
  type RegenerateAllCultureNamesRuntime,
  regenerateAllCultureNamesTool,
} from "./regenerate-all-culture-names";

function makeRuntime(
  cultures: RegenerateAllCultureNamesCultureRef[],
  generated: (
    mode: string,
    culture: RegenerateAllCultureNamesCultureRef,
  ) => string = (_m, c) => `Name${c.i}`,
): {
  runtime: RegenerateAllCultureNamesRuntime;
  list: ReturnType<typeof vi.fn<RegenerateAllCultureNamesRuntime["list"]>>;
  generate: ReturnType<
    typeof vi.fn<RegenerateAllCultureNamesRuntime["generate"]>
  >;
  apply: ReturnType<typeof vi.fn<RegenerateAllCultureNamesRuntime["apply"]>>;
  redraw: ReturnType<typeof vi.fn<RegenerateAllCultureNamesRuntime["redraw"]>>;
} {
  const list = vi.fn<RegenerateAllCultureNamesRuntime["list"]>(() => cultures);
  const generate =
    vi.fn<RegenerateAllCultureNamesRuntime["generate"]>(generated);
  const apply = vi.fn<RegenerateAllCultureNamesRuntime["apply"]>();
  const redraw = vi.fn<RegenerateAllCultureNamesRuntime["redraw"]>();
  return {
    runtime: { list, generate, apply, redraw },
    list,
    generate,
    apply,
    redraw,
  };
}

describe("regenerate_all_culture_names tool", () => {
  it("default mode is culture, skips wildlands/locked/removed/missing-base", async () => {
    const { runtime, generate, apply, redraw } = makeRuntime([
      { i: 0, name: "Wildlands", base: 0 },
      { i: 1, name: "Highlanders", base: 1 },
      { i: 2, name: "Coastalfolk", base: 2, lock: true },
      { i: 3, name: "Gone", base: 3, removed: true },
      { i: 4, name: "NoBase", base: null },
      { i: 5, name: "Rivermen", base: 5 },
    ]);
    const tool = createRegenerateAllCultureNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledWith(
      "culture",
      expect.objectContaining({ i: 1 }),
    );
    expect(generate).toHaveBeenCalledWith(
      "culture",
      expect.objectContaining({ i: 5 }),
    );
    expect(apply).toHaveBeenCalledWith(1, "Name1");
    expect(apply).toHaveBeenCalledWith(5, "Name5");
    expect(redraw).toHaveBeenCalledTimes(1);

    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("culture");
    expect(body.renamed).toEqual([
      { i: 1, previousName: "Highlanders", name: "Name1" },
      { i: 5, previousName: "Rivermen", name: "Name5" },
    ]);
    expect(body.skipped).toEqual([
      { i: 0, name: "Wildlands", reason: "wildlands" },
      { i: 2, name: "Coastalfolk", reason: "locked" },
      { i: 3, name: "Gone", reason: "removed" },
      { i: 4, name: "NoBase", reason: "missing base" },
    ]);
  });

  it("explicit random mode canonicalizes case", async () => {
    const { runtime, generate } = makeRuntime([{ i: 1, name: "X", base: 1 }]);
    const tool = createRegenerateAllCultureNamesTool(runtime);
    await tool.execute({ mode: "RANDOM" });
    expect(generate).toHaveBeenCalledWith(
      "random",
      expect.objectContaining({ i: 1 }),
    );
  });

  it("rejects unknown mode and doesn't touch pack", async () => {
    const { runtime, apply, redraw } = makeRuntime([
      { i: 1, name: "X", base: 1 },
    ]);
    const tool = createRegenerateAllCultureNamesTool(runtime);
    const result = await tool.execute({ mode: "other" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(redraw).not.toHaveBeenCalled();
  });

  it("generator errors go to skipped; loop continues; redraw still called once", async () => {
    let call = 0;
    const { runtime, apply, redraw } = makeRuntime(
      [
        { i: 1, name: "A", base: 1 },
        { i: 2, name: "B", base: 2 },
        { i: 3, name: "C", base: 3 },
      ],
      (_mode, culture) => {
        call++;
        if (call === 2) throw new Error("boom");
        return `Name${culture.i}`;
      },
    );
    const tool = createRegenerateAllCultureNamesTool(runtime);
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
      [{ i: 1, name: "A", base: 1 }],
      () => "   ",
    );
    const tool = createRegenerateAllCultureNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(redraw).toHaveBeenCalledTimes(1);
    const body = JSON.parse(result.content);
    expect(body.skipped[0].reason).toMatch(/empty/);
  });

  it("apply errors go to skipped and loop continues", async () => {
    const { runtime, apply, redraw } = makeRuntime([
      { i: 1, name: "A", base: 1 },
      { i: 2, name: "B", base: 2 },
    ]);
    let applyCall = 0;
    apply.mockImplementation(() => {
      applyCall++;
      if (applyCall === 1) throw new Error("apply-boom");
    });
    const tool = createRegenerateAllCultureNamesTool(runtime);
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
    const runtime: RegenerateAllCultureNamesRuntime = {
      list: vi.fn(() => {
        throw new Error("pack.cultures is not available.");
      }),
      generate: vi.fn(),
      apply: vi.fn(),
      redraw: vi.fn(),
    };
    const tool = createRegenerateAllCultureNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/cultures/);
    expect(runtime.redraw).not.toHaveBeenCalled();
  });

  it("redraw failure is swallowed (renames still returned)", async () => {
    const { runtime, redraw } = makeRuntime([{ i: 1, name: "A", base: 1 }]);
    redraw.mockImplementation(() => {
      throw new Error("no d3 yet");
    });
    const tool = createRegenerateAllCultureNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(1);
  });
});

describe("defaultRegenerateAllCultureNamesRuntime (integration)", () => {
  const getCultureShort = vi.fn((_c: number) => "Short");
  const getBaseShort = vi.fn((_b: number) => "BaseName");
  const drawCultures = vi.fn();

  const originalPack = (globalThis as unknown as { pack?: unknown }).pack;
  const originalNames = (globalThis as unknown as { Names?: unknown }).Names;
  const originalNameBases = (globalThis as unknown as { nameBases?: unknown })
    .nameBases;
  const originalDraw = (globalThis as unknown as { drawCultures?: unknown })
    .drawCultures;

  beforeEach(() => {
    getCultureShort.mockReset();
    getCultureShort.mockImplementation((c: number) => `Short${c}`);
    getBaseShort.mockReset();
    getBaseShort.mockImplementation((b: number) => `Base${b}`);
    drawCultures.mockReset();

    const cultures: RawCulture[] = [];
    cultures[0] = { i: 0, name: "Wildlands", base: 0 };
    cultures[1] = { i: 1, name: "Highlanders", base: 1 };
    cultures[2] = { i: 2, name: "Coastalfolk", base: 2, lock: true };
    cultures[3] = { i: 3, name: "Gone", base: 3, removed: true };
    cultures[4] = { i: 4, name: "Rivermen", base: 4 };
    (globalThis as unknown as { pack?: unknown }).pack = { cultures };
    (globalThis as unknown as { Names?: unknown }).Names = {
      getCultureShort,
      getBaseShort,
    };
    (globalThis as unknown as { nameBases?: unknown }).nameBases = [
      { name: "A" },
      { name: "B" },
      { name: "C" },
    ];
    (globalThis as unknown as { drawCultures?: unknown }).drawCultures =
      drawCultures;
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
    (globalThis as unknown as { Names?: unknown }).Names = originalNames;
    (globalThis as unknown as { nameBases?: unknown }).nameBases =
      originalNameBases;
    (globalThis as unknown as { drawCultures?: unknown }).drawCultures =
      originalDraw;
  });

  it("culture mode: renames only non-locked, non-removed (skips Wildlands)", async () => {
    const result = await regenerateAllCultureNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toEqual([
      { i: 1, previousName: "Highlanders", name: "Short1" },
      { i: 4, previousName: "Rivermen", name: "Short4" },
    ]);

    const pack = (globalThis as unknown as { pack: { cultures: RawCulture[] } })
      .pack;
    expect(pack.cultures[0]?.name).toBe("Wildlands");
    expect(pack.cultures[1]?.name).toBe("Short1");
    expect(pack.cultures[2]?.name).toBe("Coastalfolk"); // locked, untouched
    expect(pack.cultures[3]?.name).toBe("Gone"); // removed, untouched
    expect(pack.cultures[4]?.name).toBe("Short4");

    expect(getCultureShort).toHaveBeenCalledWith(1);
    expect(getCultureShort).toHaveBeenCalledWith(4);
    expect(drawCultures).toHaveBeenCalledTimes(1);
    expect(drawCultures).toHaveBeenCalledWith();
  });

  it("random mode: calls getBaseShort with random base index", async () => {
    const result = await regenerateAllCultureNamesTool.execute({
      mode: "random",
    });
    expect(result.isError).toBeFalsy();
    expect(getBaseShort).toHaveBeenCalledTimes(2);
    for (const call of getBaseShort.mock.calls) {
      expect(typeof call[0]).toBe("number");
    }
    expect(drawCultures).toHaveBeenCalledTimes(1);
  });

  it("errors when Names is missing (per-culture generate failures, no throw)", async () => {
    (globalThis as unknown as { Names?: unknown }).Names = undefined;
    const result = await regenerateAllCultureNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(0);
    expect(
      body.skipped.filter((s: { reason: string }) =>
        /Names is not available/.test(s.reason),
      ),
    ).toHaveLength(2);
  });

  it("errors when nameBases missing in random mode", async () => {
    (globalThis as unknown as { nameBases?: unknown }).nameBases = undefined;
    const result = await regenerateAllCultureNamesTool.execute({
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

  it("culture missing base is skipped with 'missing base' reason", async () => {
    const pack = (globalThis as unknown as { pack: { cultures: RawCulture[] } })
      .pack;
    pack.cultures[5] = { i: 5, name: "NoBase" };
    const result = await regenerateAllCultureNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(
      body.skipped.find(
        (s: { i: number; reason: string }) =>
          s.i === 5 && s.reason === "missing base",
      ),
    ).toBeTruthy();
  });
});
