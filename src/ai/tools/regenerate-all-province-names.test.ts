import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawProvince } from "./_shared";
import {
  createRegenerateAllProvinceNamesTool,
  type RegenerateAllProvinceNamesProvinceRef,
  type RegenerateAllProvinceNamesRuntime,
  regenerateAllProvinceNamesTool,
} from "./regenerate-all-province-names";

function makeRuntime(
  provinces: RegenerateAllProvinceNamesProvinceRef[],
  generated: (mode: string, center: number) => string = (_m, c) => `Name${c}`,
): {
  runtime: RegenerateAllProvinceNamesRuntime;
  list: ReturnType<typeof vi.fn<RegenerateAllProvinceNamesRuntime["list"]>>;
  generate: ReturnType<
    typeof vi.fn<RegenerateAllProvinceNamesRuntime["generate"]>
  >;
  compose: ReturnType<
    typeof vi.fn<RegenerateAllProvinceNamesRuntime["compose"]>
  >;
  apply: ReturnType<typeof vi.fn<RegenerateAllProvinceNamesRuntime["apply"]>>;
} {
  const list = vi.fn<RegenerateAllProvinceNamesRuntime["list"]>(
    () => provinces,
  );
  const generate =
    vi.fn<RegenerateAllProvinceNamesRuntime["generate"]>(generated);
  const compose = vi.fn<RegenerateAllProvinceNamesRuntime["compose"]>(
    (short, form) => {
      if (!form) return short;
      if (!short) return `The ${form}`;
      return `${short} ${form}`;
    },
  );
  const apply = vi.fn<RegenerateAllProvinceNamesRuntime["apply"]>();
  return {
    runtime: { list, generate, compose, apply },
    list,
    generate,
    compose,
    apply,
  };
}

describe("regenerate_all_province_names tool", () => {
  it("default mode is culture, skips province 0 / locked / removed", async () => {
    const { runtime, generate, apply } = makeRuntime([
      { i: 0, name: "", fullName: "", center: 0, formName: "" },
      {
        i: 1,
        name: "Altaria",
        fullName: "Altaria Province",
        center: 10,
        formName: "Province",
      },
      {
        i: 2,
        name: "Bardia",
        fullName: "Bardia County",
        center: 20,
        formName: "County",
        lock: true,
      },
      {
        i: 3,
        name: "Cedria",
        fullName: "Cedria Duchy",
        center: 30,
        formName: "Duchy",
        removed: true,
      },
      {
        i: 4,
        name: "Drakia",
        fullName: "Drakia March",
        center: 40,
        formName: "March",
      },
    ]);
    const tool = createRegenerateAllProvinceNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledWith("culture", 10);
    expect(generate).toHaveBeenCalledWith("culture", 40);
    expect(apply).toHaveBeenCalledWith(1, "Name10", "Name10 Province");
    expect(apply).toHaveBeenCalledWith(4, "Name40", "Name40 March");

    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("culture");
    expect(body.renamed).toEqual([
      {
        i: 1,
        previousName: "Altaria",
        previousFullName: "Altaria Province",
        name: "Name10",
        fullName: "Name10 Province",
      },
      {
        i: 4,
        previousName: "Drakia",
        previousFullName: "Drakia March",
        name: "Name40",
        fullName: "Name40 March",
      },
    ]);
    expect(body.skipped).toEqual([
      { i: 0, name: "", reason: "province 0" },
      { i: 2, name: "Bardia", reason: "locked" },
      { i: 3, name: "Cedria", reason: "removed" },
    ]);
  });

  it("explicit random mode canonicalizes case", async () => {
    const { runtime, generate } = makeRuntime([
      { i: 1, name: "X", fullName: "X", center: 5, formName: "" },
    ]);
    const tool = createRegenerateAllProvinceNamesTool(runtime);
    await tool.execute({ mode: "RANDOM" });
    expect(generate).toHaveBeenCalledWith("random", 5);
  });

  it("rejects unknown mode and doesn't touch runtime", async () => {
    const { runtime, list, apply } = makeRuntime([
      { i: 1, name: "X", fullName: "X", center: 5, formName: "" },
    ]);
    const tool = createRegenerateAllProvinceNamesTool(runtime);
    const result = await tool.execute({ mode: "other" });
    expect(result.isError).toBe(true);
    expect(list).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("generator errors go to skipped; loop continues", async () => {
    let call = 0;
    const { runtime, apply } = makeRuntime(
      [
        {
          i: 1,
          name: "A",
          fullName: "A Province",
          center: 1,
          formName: "Province",
        },
        {
          i: 2,
          name: "B",
          fullName: "B County",
          center: 2,
          formName: "County",
        },
        {
          i: 3,
          name: "C",
          fullName: "C Duchy",
          center: 3,
          formName: "Duchy",
        },
      ],
      (_mode, center) => {
        call++;
        if (call === 2) throw new Error("boom");
        return `Name${center}`;
      },
    );
    const tool = createRegenerateAllProvinceNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledWith(1, "Name1", "Name1 Province");
    expect(apply).toHaveBeenCalledWith(3, "Name3", "Name3 Duchy");

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
    const { runtime, apply } = makeRuntime(
      [{ i: 1, name: "A", fullName: "A", center: 1, formName: "" }],
      () => "   ",
    );
    const tool = createRegenerateAllProvinceNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.skipped[0].reason).toMatch(/empty/);
  });

  it("apply errors go to skipped and loop continues", async () => {
    const { runtime, apply } = makeRuntime([
      {
        i: 1,
        name: "A",
        fullName: "A Province",
        center: 1,
        formName: "Province",
      },
      {
        i: 2,
        name: "B",
        fullName: "B County",
        center: 2,
        formName: "County",
      },
    ]);
    let applyCall = 0;
    apply.mockImplementation(() => {
      applyCall++;
      if (applyCall === 1) throw new Error("apply-boom");
    });
    const tool = createRegenerateAllProvinceNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toEqual([
      {
        i: 2,
        previousName: "B",
        previousFullName: "B County",
        name: "Name2",
        fullName: "Name2 County",
      },
    ]);
    expect(body.skipped).toEqual([
      {
        i: 1,
        name: "A",
        reason: expect.stringMatching(/apply failed: apply-boom/),
      },
    ]);
  });

  it("list-throws returns errorResult", async () => {
    const runtime: RegenerateAllProvinceNamesRuntime = {
      list: vi.fn(() => {
        throw new Error("pack.provinces is not available.");
      }),
      generate: vi.fn(),
      compose: vi.fn(),
      apply: vi.fn(),
    };
    const tool = createRegenerateAllProvinceNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/provinces/);
  });

  it("composes fullName: 'The {form}' when short becomes empty", async () => {
    const { runtime, apply } = makeRuntime(
      [
        {
          i: 1,
          name: "Old",
          fullName: "Old Province",
          center: 1,
          formName: "Territory",
        },
      ],
      () => "Fresh",
    );
    const tool = createRegenerateAllProvinceNamesTool(runtime);
    await tool.execute({});
    expect(apply).toHaveBeenCalledWith(1, "Fresh", "Fresh Territory");
  });

  it("composes fullName as just short when formName is empty", async () => {
    const { runtime, apply } = makeRuntime(
      [{ i: 1, name: "Old", fullName: "Old", center: 1, formName: "" }],
      () => "Fresh",
    );
    const tool = createRegenerateAllProvinceNamesTool(runtime);
    await tool.execute({});
    expect(apply).toHaveBeenCalledWith(1, "Fresh", "Fresh");
  });
});

describe("defaultRegenerateAllProvinceNamesRuntime (integration)", () => {
  const getState = vi.fn(
    (_base: string, _c?: number, _bi?: number) => "Generated",
  );
  const getCultureShort = vi.fn((_c: number) => "Short");
  const getBase = vi.fn((_b: number) => "BaseName");
  const labelEls: Record<string, { textContent: string }> = {};
  const getElementById = vi.fn((id: string) => labelEls[id] ?? null);

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNames = (globalThis as { Names?: unknown }).Names;
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalDoc = (globalThis as { document?: unknown }).document;

  beforeEach(() => {
    getState.mockReset();
    getState.mockImplementation(
      (_base: string, c?: number, _bi?: number) => `Gen${c ?? "X"}`,
    );
    getCultureShort.mockReset();
    getCultureShort.mockReturnValue("Short");
    getBase.mockReset();
    getBase.mockReturnValue("BaseName");
    for (const key of Object.keys(labelEls)) delete labelEls[key];
    labelEls.provinceLabel1 = { textContent: "Altaria" };
    labelEls.provinceLabel4 = { textContent: "Drakia" };
    getElementById.mockClear();

    const cultureArr = new Array(100).fill(0);
    cultureArr[10] = 1;
    cultureArr[20] = 2;
    cultureArr[30] = 3;
    cultureArr[40] = 4;

    const provinces: RawProvince[] = [];
    provinces[0] = { i: 0 };
    provinces[1] = {
      i: 1,
      name: "Altaria",
      fullName: "Altaria Province",
      center: 10,
      formName: "Province",
    };
    provinces[2] = {
      i: 2,
      name: "Bardia",
      fullName: "Bardia County",
      center: 20,
      formName: "County",
      lock: true,
    };
    provinces[3] = {
      i: 3,
      name: "Cedria",
      fullName: "Cedria Duchy",
      center: 30,
      formName: "Duchy",
      removed: true,
    };
    provinces[4] = {
      i: 4,
      name: "Drakia",
      fullName: "Drakia March",
      center: 40,
      formName: "March",
    };

    (globalThis as { pack?: unknown }).pack = {
      cells: { culture: cultureArr },
      provinces,
    };
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
    (globalThis as { document?: unknown }).document = { getElementById };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Names?: unknown }).Names = originalNames;
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("culture mode: renames only non-locked, non-removed (skips province 0)", async () => {
    const result = await regenerateAllProvinceNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toEqual([
      {
        i: 1,
        previousName: "Altaria",
        previousFullName: "Altaria Province",
        name: "Gen1",
        fullName: "Gen1 Province",
      },
      {
        i: 4,
        previousName: "Drakia",
        previousFullName: "Drakia March",
        name: "Gen4",
        fullName: "Gen4 March",
      },
    ]);

    const pack = (globalThis as { pack: { provinces: RawProvince[] } }).pack;
    expect(pack.provinces[1]?.name).toBe("Gen1");
    expect(pack.provinces[1]?.fullName).toBe("Gen1 Province");
    expect(pack.provinces[2]?.name).toBe("Bardia"); // locked, untouched
    expect(pack.provinces[2]?.fullName).toBe("Bardia County");
    expect(pack.provinces[3]?.name).toBe("Cedria"); // removed, untouched
    expect(pack.provinces[4]?.name).toBe("Gen4");
    expect(pack.provinces[4]?.fullName).toBe("Gen4 March");

    expect(getCultureShort).toHaveBeenCalledWith(1);
    expect(getCultureShort).toHaveBeenCalledWith(4);

    // DOM labels updated via #provinceLabel{i}
    expect(labelEls.provinceLabel1.textContent).toBe("Gen1");
    expect(labelEls.provinceLabel4.textContent).toBe("Gen4");
  });

  it("random mode: calls getBase + getState with base index", async () => {
    const result = await regenerateAllProvinceNamesTool.execute({
      mode: "random",
    });
    expect(result.isError).toBeFalsy();
    expect(getBase).toHaveBeenCalledTimes(2);
    expect(getState).toHaveBeenCalledTimes(2);
    for (const call of getState.mock.calls) {
      expect(call[1]).toBeUndefined();
      expect(typeof call[2]).toBe("number");
    }
  });

  it("per-province generator error when Names is missing (no throw)", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const result = await regenerateAllProvinceNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(0);
    expect(
      body.skipped.filter((s: { reason: string }) =>
        /Names.getState is not available/.test(s.reason),
      ),
    ).toHaveLength(2);
  });

  it("per-province generator error when nameBases missing in random mode", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await regenerateAllProvinceNamesTool.execute({
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
