import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createSetNamesbaseMultiwordRateTool,
  type SetNamesbaseMultiwordRateRuntime,
  setNamesbaseMultiwordRateTool,
} from "./set-namesbase-multiword-rate";

function makeRuntime(
  overrides: Partial<SetNamesbaseMultiwordRateRuntime> = {},
): {
  runtime: SetNamesbaseMultiwordRateRuntime;
  getNameBases: ReturnType<
    typeof vi.fn<SetNamesbaseMultiwordRateRuntime["getNameBases"]>
  >;
  setMultiwordRate: ReturnType<
    typeof vi.fn<SetNamesbaseMultiwordRateRuntime["setMultiwordRate"]>
  >;
} {
  const getNameBases = vi.fn<SetNamesbaseMultiwordRateRuntime["getNameBases"]>(
    overrides.getNameBases ?? (() => []),
  );
  const setMultiwordRate = vi.fn<
    SetNamesbaseMultiwordRateRuntime["setMultiwordRate"]
  >(overrides.setMultiwordRate ?? (() => undefined));
  return {
    runtime: { getNameBases, setMultiwordRate },
    getNameBases,
    setMultiwordRate,
  };
}

describe("set_namesbase_multiword_rate tool", () => {
  it("happy path: sets multiword_rate on the entry by index", async () => {
    const bases = [
      { name: "Generic", m: 0 },
      { name: "Elvish", m: 0 },
      { name: "Dwarven", m: 0 },
    ];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({ index: 1, multiword_rate: 0.3 });
    expect(result.isError).toBeFalsy();
    expect(setMultiwordRate).toHaveBeenCalledWith(1, 0.3);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 1,
      name: "Elvish",
      old_multiword_rate: 0,
      new_multiword_rate: 0.3,
    });
  });

  it("accepts boundary value 0", async () => {
    const bases = [{ name: "Foo", m: 0.5 }];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({ index: 0, multiword_rate: 0 });
    expect(result.isError).toBeFalsy();
    expect(setMultiwordRate).toHaveBeenCalledWith(0, 0);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "Foo",
      old_multiword_rate: 0.5,
      new_multiword_rate: 0,
    });
  });

  it("accepts boundary value 1", async () => {
    const bases = [{ name: "Foo", m: 0.2 }];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({ index: 0, multiword_rate: 1 });
    expect(result.isError).toBeFalsy();
    expect(setMultiwordRate).toHaveBeenCalledWith(0, 1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "Foo",
      old_multiword_rate: 0.2,
      new_multiword_rate: 1,
    });
  });

  it("treats missing .m on the entry as old value 0", async () => {
    const bases = [{ name: "Foo" }];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({ index: 0, multiword_rate: 0.4 });
    expect(result.isError).toBeFalsy();
    expect(setMultiwordRate).toHaveBeenCalledWith(0, 0.4);
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      index: 0,
      old_multiword_rate: 0,
      new_multiword_rate: 0.4,
    });
  });

  it("treats non-numeric .m on the entry as old value 0", async () => {
    const bases = [{ name: "Foo", m: "0.5" as unknown }];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({ index: 0, multiword_rate: 0.1 });
    expect(result.isError).toBeFalsy();
    expect(setMultiwordRate).toHaveBeenCalledWith(0, 0.1);
    expect(JSON.parse(result.content).old_multiword_rate).toBe(0);
  });

  it("rejects out-of-range values", async () => {
    const bases = [{ name: "Foo", m: 0 }];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    for (const bad of [-0.01, 1.01, -1, 2]) {
      const r = await tool.execute({ index: 0, multiword_rate: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "multiword_rate must be in [0, 1].",
      );
    }
    expect(setMultiwordRate).not.toHaveBeenCalled();
  });

  it("rejects non-finite values", async () => {
    const bases = [{ name: "Foo", m: 0 }];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const r = await tool.execute({ index: 0, multiword_rate: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "multiword_rate must be a finite number.",
      );
    }
    expect(setMultiwordRate).not.toHaveBeenCalled();
  });

  it("rejects non-number multiword_rate values", async () => {
    const bases = [{ name: "Foo", m: 0 }];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    for (const bad of ["0.5", null, true, {}, []]) {
      const r = await tool.execute({ index: 0, multiword_rate: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "multiword_rate must be a finite number.",
      );
    }
    expect(setMultiwordRate).not.toHaveBeenCalled();
  });

  it("rejects when multiword_rate is missing", async () => {
    const bases = [{ name: "Foo", m: 0 }];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "multiword_rate must be a finite number.",
    );
    expect(setMultiwordRate).not.toHaveBeenCalled();
  });

  it("errors when index is out of range", async () => {
    const bases = [{ name: "Foo", m: 0 }];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({ index: 5, multiword_rate: 0.1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found at index 5.",
    );
    expect(setMultiwordRate).not.toHaveBeenCalled();
  });

  it("rejects negative / non-integer / non-finite / non-numeric index", async () => {
    const bases = [{ name: "Foo", m: 0 }];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "0"]) {
      const r = await tool.execute({ index: bad, multiword_rate: 0.1 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "index must be a non-negative integer.",
      );
    }
    expect(setMultiwordRate).not.toHaveBeenCalled();
  });

  it("errors when current_name is not found", async () => {
    const bases = [{ name: "Real", m: 0 }];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({
      current_name: "Ghost",
      multiword_rate: 0.1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found with name Ghost.",
    );
    expect(setMultiwordRate).not.toHaveBeenCalled();
  });

  it("returns ambiguity error with candidates when multiple bases share a name", async () => {
    const bases = [
      { name: "Shared", m: 0 },
      { name: "Other", m: 0 },
      { name: "Shared", m: 0.2 },
    ];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({
      current_name: "Shared",
      multiword_rate: 0.5,
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Multiple namesbases match name Shared/);
    expect(body.candidates).toEqual([
      { index: 0, name: "Shared" },
      { index: 2, name: "Shared" },
    ]);
    expect(setMultiwordRate).not.toHaveBeenCalled();
  });

  it("errors when index and current_name disagree", async () => {
    const bases = [
      { name: "Foo", m: 0 },
      { name: "Bar", m: 0 },
    ];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({
      index: 0,
      current_name: "Bar",
      multiword_rate: 0.1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "index and current_name disagree.",
    );
    expect(setMultiwordRate).not.toHaveBeenCalled();
  });

  it("succeeds when index and current_name agree (case-insensitive)", async () => {
    const bases = [
      { name: "Foo", m: 0 },
      { name: "Bar", m: 0 },
    ];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({
      index: 1,
      current_name: "bar",
      multiword_rate: 0.7,
    });
    expect(result.isError).toBeFalsy();
    expect(setMultiwordRate).toHaveBeenCalledTimes(1);
    expect(setMultiwordRate).toHaveBeenCalledWith(1, 0.7);
  });

  it("errors when neither index nor current_name is provided", async () => {
    const bases = [{ name: "A", m: 0 }];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({ multiword_rate: 0.1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Provide either index or current_name to identify the namesbase.",
    );
    expect(setMultiwordRate).not.toHaveBeenCalled();
  });

  it("rejects empty/whitespace/non-string current_name", async () => {
    const bases = [{ name: "A", m: 0 }];
    const { runtime, setMultiwordRate } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    for (const bad of ["", "   ", 42]) {
      const r = await tool.execute({
        current_name: bad,
        multiword_rate: 0.1,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "current_name must be a non-empty string.",
      );
    }
    expect(setMultiwordRate).not.toHaveBeenCalled();
  });

  it("surfaces runtime getNameBases failures", async () => {
    const runtime: SetNamesbaseMultiwordRateRuntime = {
      getNameBases: () => {
        throw new Error("nameBases missing");
      },
      setMultiwordRate: vi.fn(),
    };
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({ index: 0, multiword_rate: 0.1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases missing/);
    expect(runtime.setMultiwordRate).not.toHaveBeenCalled();
  });

  it("surfaces runtime setMultiwordRate failures", async () => {
    const bases = [{ name: "Foo", m: 0 }];
    const runtime: SetNamesbaseMultiwordRateRuntime = {
      getNameBases: () => bases,
      setMultiwordRate: vi.fn(() => {
        throw new Error("write failed");
      }),
    };
    const tool = createSetNamesbaseMultiwordRateTool(runtime);
    const result = await tool.execute({ index: 0, multiword_rate: 0.1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/write failed/);
  });

  it("has correct tool name and required schema field", () => {
    expect(setNamesbaseMultiwordRateTool.name).toBe(
      "set_namesbase_multiword_rate",
    );
    expect(setNamesbaseMultiwordRateTool.input_schema.required).toEqual([
      "multiword_rate",
    ]);
  });
});

describe("defaultSetNamesbaseMultiwordRateRuntime (integration)", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "Generic", b: "", min: 4, max: 9, d: "", m: 0 },
      { name: "Elvish", b: "", min: 5, max: 12, d: "aeiou", m: 0.1 },
      { name: "Dwarven", b: "", min: 4, max: 9, d: "", m: 0 },
    ];
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
  });

  it("mutates the matching namesbase entry on window.nameBases (by index)", async () => {
    const result = await setNamesbaseMultiwordRateTool.execute({
      index: 0,
      multiword_rate: 0.25,
    });
    expect(result.isError).toBeFalsy();
    const bases = (globalThis as { nameBases: { name: string; m: number }[] })
      .nameBases;
    expect(bases[0].m).toBe(0.25);
    expect(bases[1].m).toBe(0.1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "Generic",
      old_multiword_rate: 0,
      new_multiword_rate: 0.25,
    });
  });

  it("mutates the matching namesbase entry by current_name", async () => {
    const result = await setNamesbaseMultiwordRateTool.execute({
      current_name: "Elvish",
      multiword_rate: 0,
    });
    expect(result.isError).toBeFalsy();
    const bases = (globalThis as { nameBases: { name: string; m: number }[] })
      .nameBases;
    expect(bases[1].m).toBe(0);
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      index: 1,
      name: "Elvish",
      old_multiword_rate: 0.1,
      new_multiword_rate: 0,
    });
  });

  it("errors cleanly when nameBases is missing", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await setNamesbaseMultiwordRateTool.execute({
      index: 0,
      multiword_rate: 0.1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });

  it("errors when nameBases is not an array", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = { not: "array" };
    const result = await setNamesbaseMultiwordRateTool.execute({
      index: 0,
      multiword_rate: 0.1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });
});

describe("set_namesbase_multiword_rate registry round-trip", () => {
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
    registry.register(setNamesbaseMultiwordRateTool);
    const result = await registry.run("set_namesbase_multiword_rate", {
      index: 0,
      multiword_rate: 0.5,
    });
    expect(result.isError).toBeFalsy();
    const bases = (globalThis as { nameBases: { name: string; m: number }[] })
      .nameBases;
    expect(bases[0].m).toBe(0.5);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "First",
      old_multiword_rate: 0,
      new_multiword_rate: 0.5,
    });
  });

  it("returns 'set_namesbase_multiword_rate' as its name in registry list", () => {
    const registry = new ToolRegistry();
    registry.register(setNamesbaseMultiwordRateTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "set_namesbase_multiword_rate",
    );
  });
});
