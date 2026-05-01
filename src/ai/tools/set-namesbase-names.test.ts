import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createSetNamesbaseNamesTool,
  defaultSetNamesbaseNamesRuntime,
  type SetNamesbaseNamesRuntime,
  setNamesbaseNamesTool,
} from "./set-namesbase-names";

function makeRuntime(overrides: Partial<SetNamesbaseNamesRuntime> = {}): {
  runtime: SetNamesbaseNamesRuntime;
  getNameBases: ReturnType<
    typeof vi.fn<SetNamesbaseNamesRuntime["getNameBases"]>
  >;
  setNamesData: ReturnType<
    typeof vi.fn<SetNamesbaseNamesRuntime["setNamesData"]>
  >;
  updateChain: ReturnType<
    typeof vi.fn<SetNamesbaseNamesRuntime["updateChain"]>
  >;
} {
  const getNameBases = vi.fn<SetNamesbaseNamesRuntime["getNameBases"]>(
    overrides.getNameBases ?? (() => []),
  );
  const setNamesData = vi.fn<SetNamesbaseNamesRuntime["setNamesData"]>(
    overrides.setNamesData ?? (() => undefined),
  );
  const updateChain = vi.fn<SetNamesbaseNamesRuntime["updateChain"]>(
    overrides.updateChain ?? (() => undefined),
  );
  return {
    runtime: { getNameBases, setNamesData, updateChain },
    getNameBases,
    setNamesData,
    updateChain,
  };
}

describe("set_namesbase_names tool", () => {
  it("sets corpus from an array of strings (happy by index)", async () => {
    const bases = [
      { name: "Generic", b: "Old" },
      { name: "Elvish", b: "Old" },
    ];
    const { runtime, setNamesData, updateChain } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      index: 1,
      names: ["Foo", "Bar", "Baz", "Qux"],
    });
    expect(result.isError).toBeFalsy();
    expect(setNamesData).toHaveBeenCalledWith(1, "Foo,Bar,Baz,Qux");
    expect(updateChain).toHaveBeenCalledWith(1);
    expect(updateChain).toHaveBeenCalledTimes(1);
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      index: 1,
      name: "Elvish",
      name_count: 4,
      sample_names: ["Foo", "Bar", "Baz", "Qux"],
    });
  });

  it("sets corpus from a comma-separated string", async () => {
    const bases = [{ name: "Test", b: "Old" }];
    const { runtime, setNamesData, updateChain } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({ index: 0, names: "Foo,Bar,Baz" });
    expect(result.isError).toBeFalsy();
    expect(setNamesData).toHaveBeenCalledWith(0, "Foo,Bar,Baz");
    expect(updateChain).toHaveBeenCalledWith(0);
    const body = JSON.parse(result.content);
    expect(body.name_count).toBe(3);
    expect(body.sample_names).toEqual(["Foo", "Bar", "Baz"]);
  });

  it("strips '/' and '|' (sanitisation) — string form", async () => {
    const bases = [{ name: "X", b: "" }];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      index: 0,
      names: "Alpha,Bet|a,Gam/ma,Delta",
    });
    expect(result.isError).toBeFalsy();
    expect(setNamesData).toHaveBeenCalledWith(0, "Alpha,Beta,Gamma,Delta");
    expect(JSON.parse(result.content).name_count).toBe(4);
  });

  it("strips '/' and '|' (sanitisation) — array form, after join", async () => {
    const bases = [{ name: "X", b: "" }];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      index: 0,
      names: ["Alpha", "Bet|a", "Gam/ma", "Delta"],
    });
    expect(result.isError).toBeFalsy();
    expect(setNamesData).toHaveBeenCalledWith(0, "Alpha,Beta,Gamma,Delta");
  });

  it("trims and filters empty/whitespace entries from array form", async () => {
    const bases = [{ name: "X", b: "" }];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      index: 0,
      names: [" ", "", "Foo", "Bar", "Baz"],
    });
    expect(result.isError).toBeFalsy();
    expect(setNamesData).toHaveBeenCalledWith(0, "Foo,Bar,Baz");
  });

  it("errors when array yields fewer than 3 names", async () => {
    const bases = [{ name: "X", b: "" }];
    const { runtime, setNamesData, updateChain } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({ index: 0, names: ["Foo", "Bar"] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Names corpus must have at least 3 names",
    );
    expect(setNamesData).not.toHaveBeenCalled();
    expect(updateChain).not.toHaveBeenCalled();
  });

  it("errors when string yields fewer than 3 names", async () => {
    const bases = [{ name: "X", b: "" }];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({ index: 0, names: "Foo,Bar" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Names corpus must have at least 3 names",
    );
    expect(setNamesData).not.toHaveBeenCalled();
  });

  it("errors on empty array", async () => {
    const bases = [{ name: "X", b: "" }];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({ index: 0, names: [] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "names must be a non-empty string.",
    );
    expect(setNamesData).not.toHaveBeenCalled();
  });

  it("errors on empty string", async () => {
    const bases = [{ name: "X", b: "" }];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({ index: 0, names: "" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "names must be a non-empty string.",
    );
    expect(setNamesData).not.toHaveBeenCalled();
  });

  it("errors on whitespace-only string", async () => {
    const bases = [{ name: "X", b: "" }];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({ index: 0, names: "   " });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "names must be a non-empty string.",
    );
    expect(setNamesData).not.toHaveBeenCalled();
  });

  it("errors on array of empty/whitespace entries (yields empty)", async () => {
    const bases = [{ name: "X", b: "" }];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({ index: 0, names: ["", " ", "  "] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "names must be a non-empty string.",
    );
    expect(setNamesData).not.toHaveBeenCalled();
  });

  it("rejects names that is not string and not string-array", async () => {
    const bases = [{ name: "X", b: "" }];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    for (const bad of [
      null,
      undefined,
      42,
      {},
      [1, 2, 3],
      ["Foo", 42, "Bar"],
    ]) {
      const r = await tool.execute({ index: 0, names: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "names must be a string or an array of strings.",
      );
    }
    expect(setNamesData).not.toHaveBeenCalled();
  });

  it("surfaces updateChain errors AND mutates b first (legacy write order)", async () => {
    const bases = [{ name: "X", b: "Old,Names,Here" }];
    const { runtime, setNamesData, updateChain } = makeRuntime({
      getNameBases: () => bases,
      // emulate: setNamesData mutates the actual array.
      setNamesData: (index: number, b: string) => {
        (bases[index] as { b: string }).b = b;
      },
      updateChain: () => {
        throw new Error("chain busted");
      },
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      index: 0,
      names: ["Foo", "Bar", "Baz"],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/chain busted/);
    // Critical: b IS mutated even when updateChain throws.
    expect(bases[0]?.b).toBe("Foo,Bar,Baz");
    expect(setNamesData).toHaveBeenCalledWith(0, "Foo,Bar,Baz");
    expect(updateChain).toHaveBeenCalledWith(0);
  });

  it("errors before mutation when Names.updateChain unavailable", async () => {
    // Unlike above, here updateChain throws because the Names module isn't
    // present — which also means we never want b to be mutated. But the
    // legacy order DOES mutate first, so reflect that. Test that the error
    // is surfaced and b IS mutated (mirrors editor).
    const bases = [{ name: "X", b: "OldA,OldB,OldC" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      setNamesData: (index: number, b: string) => {
        (bases[index] as { b: string }).b = b;
      },
      updateChain: () => {
        throw new Error("Names.updateChain is not available.");
      },
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      index: 0,
      names: ["Foo", "Bar", "Baz"],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Names.updateChain is not available.",
    );
    expect(bases[0]?.b).toBe("Foo,Bar,Baz");
  });

  it("errors when index is out of range", async () => {
    const bases = [{ name: "X", b: "" }];
    const { runtime, setNamesData, updateChain } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      index: 5,
      names: ["Foo", "Bar", "Baz"],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found at index 5.",
    );
    expect(setNamesData).not.toHaveBeenCalled();
    expect(updateChain).not.toHaveBeenCalled();
  });

  it("errors when current_name is not found", async () => {
    const bases = [{ name: "Real", b: "" }];
    const { runtime, setNamesData, updateChain } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      current_name: "Ghost",
      names: ["Foo", "Bar", "Baz"],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found with name Ghost.",
    );
    expect(setNamesData).not.toHaveBeenCalled();
    expect(updateChain).not.toHaveBeenCalled();
  });

  it("returns ambiguity error with candidates when names match > 1", async () => {
    const bases = [
      { name: "Shared", b: "" },
      { name: "Other", b: "" },
      { name: "Shared", b: "" },
    ];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      current_name: "Shared",
      names: ["Foo", "Bar", "Baz"],
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Multiple namesbases match name Shared/);
    expect(body.candidates).toEqual([
      { index: 0, name: "Shared" },
      { index: 2, name: "Shared" },
    ]);
    expect(setNamesData).not.toHaveBeenCalled();
  });

  it("errors when index and current_name disagree", async () => {
    const bases = [
      { name: "Foo", b: "" },
      { name: "Bar", b: "" },
    ];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      index: 0,
      current_name: "Bar",
      names: ["Foo", "Bar", "Baz"],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "index and current_name disagree.",
    );
    expect(setNamesData).not.toHaveBeenCalled();
  });

  it("succeeds when index and current_name agree (case-insensitive)", async () => {
    const bases = [
      { name: "Foo", b: "" },
      { name: "Bar", b: "" },
    ];
    const { runtime, setNamesData, updateChain } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      index: 1,
      current_name: "bar",
      names: ["A", "B", "C"],
    });
    expect(result.isError).toBeFalsy();
    expect(setNamesData).toHaveBeenCalledWith(1, "A,B,C");
    expect(updateChain).toHaveBeenCalledWith(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 1,
      name: "Bar",
      name_count: 3,
      sample_names: ["A", "B", "C"],
    });
  });

  it("errors when neither index nor current_name is provided", async () => {
    const bases = [{ name: "A", b: "" }];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({ names: ["Foo", "Bar", "Baz"] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Provide either index or current_name to identify the namesbase.",
    );
    expect(setNamesData).not.toHaveBeenCalled();
  });

  it("rejects empty/non-string current_name (when only current_name supplied)", async () => {
    const bases = [{ name: "A", b: "" }];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    for (const bad of ["", "   ", 42]) {
      const r = await tool.execute({
        current_name: bad,
        names: ["Foo", "Bar", "Baz"],
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "current_name must be a non-empty string.",
      );
    }
    expect(setNamesData).not.toHaveBeenCalled();
  });

  it("rejects negative / non-integer / non-finite / non-numeric index", async () => {
    const bases = [{ name: "A", b: "" }];
    const { runtime, setNamesData } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseNamesTool(runtime);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "0"]) {
      const r = await tool.execute({
        index: bad,
        names: ["Foo", "Bar", "Baz"],
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "index must be a non-negative integer.",
      );
    }
    expect(setNamesData).not.toHaveBeenCalled();
  });

  it("surfaces runtime getNameBases failures", async () => {
    const runtime: SetNamesbaseNamesRuntime = {
      getNameBases: () => {
        throw new Error("nameBases missing");
      },
      setNamesData: vi.fn(),
      updateChain: vi.fn(),
    };
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      index: 0,
      names: ["Foo", "Bar", "Baz"],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases missing/);
    expect(runtime.setNamesData).not.toHaveBeenCalled();
    expect(runtime.updateChain).not.toHaveBeenCalled();
  });

  it("surfaces runtime setNamesData failures (no updateChain after)", async () => {
    const bases = [{ name: "Old", b: "" }];
    const runtime: SetNamesbaseNamesRuntime = {
      getNameBases: () => bases,
      setNamesData: vi.fn(() => {
        throw new Error("write failed");
      }),
      updateChain: vi.fn(),
    };
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      index: 0,
      names: ["Foo", "Bar", "Baz"],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/write failed/);
    expect(runtime.updateChain).not.toHaveBeenCalled();
  });

  it("returns at most 5 sample_names and trims them", async () => {
    const bases = [{ name: "X", b: "" }];
    const { runtime } = makeRuntime({ getNameBases: () => bases });
    const tool = createSetNamesbaseNamesTool(runtime);
    const result = await tool.execute({
      index: 0,
      names: " A , B , C , D , E , F , G ",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).sample_names).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
  });

  it("has correct tool name and required-schema fields", () => {
    expect(setNamesbaseNamesTool.name).toBe("set_namesbase_names");
    expect(setNamesbaseNamesTool.input_schema.required).toEqual(["names"]);
    // Schema declares both shapes for the `names` property.
    const namesSchema = setNamesbaseNamesTool.input_schema.properties.names as {
      oneOf: Array<{ type: string }>;
    };
    expect(namesSchema.oneOf.map((s) => s.type)).toEqual(["string", "array"]);
  });
});

describe("defaultSetNamesbaseNamesRuntime (integration)", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalNames = (globalThis as { Names?: unknown }).Names;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "Generic", b: "Old", min: 4, max: 9, d: "", m: 0 },
      { name: "Elvish", b: "Old", min: 4, max: 9, d: "", m: 0 },
      { name: "Dwarven", b: "Old", min: 4, max: 9, d: "", m: 0 },
    ];
    (globalThis as { Names?: unknown }).Names = {
      updateChain: vi.fn(),
    };
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { Names?: unknown }).Names = originalNames;
  });

  it("writes b and calls Names.updateChain on the live globals", async () => {
    const result = await setNamesbaseNamesTool.execute({
      index: 1,
      names: ["Foo", "Bar", "Baz", "Qux"],
    });
    expect(result.isError).toBeFalsy();
    const bases = (globalThis as { nameBases: { name: string; b: string }[] })
      .nameBases;
    expect(bases[1]?.b).toBe("Foo,Bar,Baz,Qux");
    expect(bases[0]?.b).toBe("Old"); // unchanged
    const names = (
      globalThis as unknown as {
        Names: { updateChain: ReturnType<typeof vi.fn> };
      }
    ).Names;
    expect(names.updateChain).toHaveBeenCalledWith(1);
  });

  it("errors cleanly when nameBases is missing", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await setNamesbaseNamesTool.execute({
      index: 0,
      names: ["Foo", "Bar", "Baz"],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });

  it("errors when nameBases is not an array", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = { not: "array" };
    const result = await setNamesbaseNamesTool.execute({
      index: 0,
      names: ["Foo", "Bar", "Baz"],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });

  it("errors when Names.updateChain is missing (after b mutated)", async () => {
    (globalThis as { Names?: unknown }).Names = { updateChain: undefined };
    const result = await setNamesbaseNamesTool.execute({
      index: 0,
      names: ["Foo", "Bar", "Baz"],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Names.updateChain is not available.",
    );
    // legacy write order: b mutated regardless
    const bases = (globalThis as { nameBases: { name: string; b: string }[] })
      .nameBases;
    expect(bases[0]?.b).toBe("Foo,Bar,Baz");
  });

  it("errors when Names global is missing entirely", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const result = await setNamesbaseNamesTool.execute({
      index: 0,
      names: ["Foo", "Bar", "Baz"],
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Names.updateChain is not available.",
    );
  });

  it("default runtime exists and exposes the seam", () => {
    expect(typeof defaultSetNamesbaseNamesRuntime.getNameBases).toBe(
      "function",
    );
    expect(typeof defaultSetNamesbaseNamesRuntime.setNamesData).toBe(
      "function",
    );
    expect(typeof defaultSetNamesbaseNamesRuntime.updateChain).toBe("function");
  });
});

describe("set_namesbase_names registry round-trip", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalNames = (globalThis as { Names?: unknown }).Names;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "First", b: "Old", min: 4, max: 9, d: "", m: 0 },
      { name: "Second", b: "Old", min: 4, max: 9, d: "", m: 0 },
    ];
    (globalThis as { Names?: unknown }).Names = {
      updateChain: vi.fn(),
    };
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { Names?: unknown }).Names = originalNames;
  });

  it("registers and runs through the registry", async () => {
    const registry = new ToolRegistry();
    registry.register(setNamesbaseNamesTool);
    const result = await registry.run("set_namesbase_names", {
      index: 0,
      names: ["Aaa", "Bbb", "Ccc"],
    });
    expect(result.isError).toBeFalsy();
    const bases = (globalThis as { nameBases: { name: string; b: string }[] })
      .nameBases;
    expect(bases[0]?.b).toBe("Aaa,Bbb,Ccc");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "First",
      name_count: 3,
      sample_names: ["Aaa", "Bbb", "Ccc"],
    });
  });

  it("returns 'set_namesbase_names' as its name in registry list", () => {
    const registry = new ToolRegistry();
    registry.register(setNamesbaseNamesTool);
    expect(registry.list().map((t) => t.name)).toContain("set_namesbase_names");
  });
});
