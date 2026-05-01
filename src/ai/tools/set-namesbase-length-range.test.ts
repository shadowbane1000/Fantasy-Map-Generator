import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createSetNamesbaseLengthRangeTool,
  type SetNamesbaseLengthRangeRuntime,
  setNamesbaseLengthRangeTool,
} from "./set-namesbase-length-range";

function makeRuntime(overrides: Partial<SetNamesbaseLengthRangeRuntime> = {}): {
  runtime: SetNamesbaseLengthRangeRuntime;
  getNameBases: ReturnType<
    typeof vi.fn<SetNamesbaseLengthRangeRuntime["getNameBases"]>
  >;
  setLengthRange: ReturnType<
    typeof vi.fn<SetNamesbaseLengthRangeRuntime["setLengthRange"]>
  >;
} {
  const getNameBases = vi.fn<SetNamesbaseLengthRangeRuntime["getNameBases"]>(
    overrides.getNameBases ?? (() => []),
  );
  const setLengthRange = vi.fn<
    SetNamesbaseLengthRangeRuntime["setLengthRange"]
  >(overrides.setLengthRange ?? (() => undefined));
  return {
    runtime: { getNameBases, setLengthRange },
    getNameBases,
    setLengthRange,
  };
}

describe("set_namesbase_length_range tool", () => {
  it("updates min only and leaves max unchanged in result", async () => {
    const bases = [
      { name: "Generic", min: 4, max: 9 },
      { name: "Elvish", min: 5, max: 12 },
      { name: "Dwarven", min: 4, max: 9 },
    ];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 1, min: 4 });
    expect(result.isError).toBeFalsy();
    expect(setLengthRange).toHaveBeenCalledWith(1, { min: 4 });
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 1,
      name: "Elvish",
      old_min: 5,
      old_max: 12,
      new_min: 4,
      new_max: 12,
    });
  });

  it("updates max only and leaves min unchanged in result", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 0, max: 14 });
    expect(result.isError).toBeFalsy();
    expect(setLengthRange).toHaveBeenCalledWith(0, { max: 14 });
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "Foo",
      old_min: 4,
      old_max: 10,
      new_min: 4,
      new_max: 14,
    });
  });

  it("updates both min and max when both supplied", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 0, min: 3, max: 12 });
    expect(result.isError).toBeFalsy();
    expect(setLengthRange).toHaveBeenCalledWith(0, { min: 3, max: 12 });
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "Foo",
      old_min: 4,
      old_max: 10,
      new_min: 3,
      new_max: 12,
    });
  });

  it("accepts boundary values min=2 and max=100", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 0, min: 2, max: 100 });
    expect(result.isError).toBeFalsy();
    expect(setLengthRange).toHaveBeenCalledWith(0, { min: 2, max: 100 });
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      new_min: 2,
      new_max: 100,
    });
  });

  it("rejects min < 2", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 0, min: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "min must be an integer in [2, 100].",
    );
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("rejects max > 100", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 0, max: 101 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "max must be an integer in [2, 100].",
    );
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("rejects max < 2 (e.g. 0)", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 0, max: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "max must be an integer in [2, 100].",
    );
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("rejects non-integer / non-finite / non-numeric min", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    for (const bad of [
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "3",
    ]) {
      const r = await tool.execute({ index: 0, min: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "min must be an integer in [2, 100].",
      );
    }
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("rejects non-integer / non-finite / non-numeric max", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY, "12"]) {
      const r = await tool.execute({ index: 0, max: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "max must be an integer in [2, 100].",
      );
    }
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("rejects min > existing max when only min supplied; nameBases unchanged", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 0, min: 11 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "min (11) cannot be greater than existing max (10).",
    );
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("rejects max < existing min when only max supplied; nameBases unchanged", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 0, max: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "max (3) cannot be less than existing min (4).",
    );
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("rejects min > max when both supplied; nameBases unchanged", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 0, min: 12, max: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("min must be <= max.");
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("errors when index is out of range", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 5, min: 4 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found at index 5.",
    );
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("rejects negative / non-integer / non-finite / non-numeric index", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "0"]) {
      const r = await tool.execute({ index: bad, min: 4 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "index must be a non-negative integer.",
      );
    }
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("returns ambiguity error with candidates when multiple bases share a name", async () => {
    const bases = [
      { name: "Shared", min: 4, max: 10 },
      { name: "Other", min: 4, max: 10 },
      { name: "Shared", min: 5, max: 12 },
    ];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ current_name: "Shared", min: 3 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Multiple namesbases match name Shared/);
    expect(body.candidates).toEqual([
      { index: 0, name: "Shared" },
      { index: 2, name: "Shared" },
    ]);
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("errors when current_name is not found", async () => {
    const bases = [{ name: "Real", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ current_name: "Ghost", min: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found with name Ghost.",
    );
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("errors when index and current_name disagree", async () => {
    const bases = [
      { name: "Foo", min: 4, max: 10 },
      { name: "Bar", min: 5, max: 12 },
    ];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({
      index: 0,
      current_name: "Bar",
      min: 3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "index and current_name disagree.",
    );
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("succeeds when index and current_name agree (case-insensitive)", async () => {
    const bases = [
      { name: "Foo", min: 4, max: 10 },
      { name: "Bar", min: 5, max: 12 },
    ];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({
      index: 1,
      current_name: "bar",
      min: 4,
    });
    expect(result.isError).toBeFalsy();
    expect(setLengthRange).toHaveBeenCalledTimes(1);
    expect(setLengthRange).toHaveBeenCalledWith(1, { min: 4 });
  });

  it("errors when neither index nor current_name is provided", async () => {
    const bases = [{ name: "A", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ min: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Provide either index or current_name to identify the namesbase.",
    );
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("errors when neither min nor max is provided", async () => {
    const bases = [{ name: "A", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Provide min or max (or both).",
    );
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("rejects empty/non-string current_name (when only current_name supplied)", async () => {
    const bases = [{ name: "A", min: 4, max: 10 }];
    const { runtime, setLengthRange } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    for (const bad of ["", "   ", 42]) {
      const r = await tool.execute({ current_name: bad, min: 3 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "current_name must be a non-empty string.",
      );
    }
    expect(setLengthRange).not.toHaveBeenCalled();
  });

  it("surfaces runtime getNameBases failures", async () => {
    const runtime: SetNamesbaseLengthRangeRuntime = {
      getNameBases: () => {
        throw new Error("nameBases missing");
      },
      setLengthRange: vi.fn(),
    };
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 0, min: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases missing/);
    expect(runtime.setLengthRange).not.toHaveBeenCalled();
  });

  it("surfaces runtime setLengthRange failures", async () => {
    const bases = [{ name: "Foo", min: 4, max: 10 }];
    const runtime: SetNamesbaseLengthRangeRuntime = {
      getNameBases: () => bases,
      setLengthRange: vi.fn(() => {
        throw new Error("write failed");
      }),
    };
    const tool = createSetNamesbaseLengthRangeTool(runtime);
    const result = await tool.execute({ index: 0, min: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/write failed/);
  });

  it("has correct tool name and no required-schema fields", () => {
    expect(setNamesbaseLengthRangeTool.name).toBe("set_namesbase_length_range");
    expect(setNamesbaseLengthRangeTool.input_schema.required).toBeUndefined();
  });
});

describe("defaultSetNamesbaseLengthRangeRuntime (integration)", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "Generic", b: "", min: 4, max: 9, d: "", m: 0 },
      { name: "Elvish", b: "", min: 5, max: 12, d: "", m: 0 },
      { name: "Dwarven", b: "", min: 4, max: 9, d: "", m: 0 },
    ];
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
  });

  it("mutates the matching namesbase entry on window.nameBases (min only)", async () => {
    const result = await setNamesbaseLengthRangeTool.execute({
      index: 1,
      min: 3,
    });
    expect(result.isError).toBeFalsy();
    const bases = (
      globalThis as { nameBases: { name: string; min: number; max: number }[] }
    ).nameBases;
    expect(bases[1]).toMatchObject({ min: 3, max: 12 });
    expect(bases[0]).toMatchObject({ min: 4, max: 9 });
  });

  it("mutates the matching namesbase entry (both min and max)", async () => {
    const result = await setNamesbaseLengthRangeTool.execute({
      current_name: "Dwarven",
      min: 6,
      max: 14,
    });
    expect(result.isError).toBeFalsy();
    const bases = (
      globalThis as { nameBases: { name: string; min: number; max: number }[] }
    ).nameBases;
    expect(bases[2]).toMatchObject({ min: 6, max: 14 });
  });

  it("errors cleanly when nameBases is missing", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await setNamesbaseLengthRangeTool.execute({
      index: 0,
      min: 3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });

  it("errors when nameBases is not an array", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = { not: "array" };
    const result = await setNamesbaseLengthRangeTool.execute({
      index: 0,
      min: 3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });
});

describe("set_namesbase_length_range registry round-trip", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "First", b: "", min: 4, max: 9, d: "", m: 0 },
      { name: "Second", b: "", min: 5, max: 12, d: "", m: 0 },
    ];
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
  });

  it("registers and runs through the registry", async () => {
    const registry = new ToolRegistry();
    registry.register(setNamesbaseLengthRangeTool);
    const result = await registry.run("set_namesbase_length_range", {
      index: 0,
      min: 3,
      max: 11,
    });
    expect(result.isError).toBeFalsy();
    const bases = (
      globalThis as { nameBases: { name: string; min: number; max: number }[] }
    ).nameBases;
    expect(bases[0]).toMatchObject({ min: 3, max: 11 });
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "First",
      old_min: 4,
      old_max: 9,
      new_min: 3,
      new_max: 11,
    });
  });

  it("returns 'set_namesbase_length_range' as its name in registry list", () => {
    const registry = new ToolRegistry();
    registry.register(setNamesbaseLengthRangeTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "set_namesbase_length_range",
    );
  });
});
