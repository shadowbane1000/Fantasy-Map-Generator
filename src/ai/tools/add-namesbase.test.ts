import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AddNamesbaseRuntime,
  addNamesbaseTool,
  createAddNamesbaseTool,
  DEFAULT_NAMESBASE_CORPUS,
  defaultAddNamesbaseRuntime,
} from "./add-namesbase";
import { ToolRegistry } from "./index";

interface NameBaseLike {
  name: string;
  b: string;
  min: number;
  max: number;
  d: string;
  m: number;
}

function makeRuntime(initial: NameBaseLike[]): {
  runtime: AddNamesbaseRuntime;
  bases: NameBaseLike[];
  getNameBases: ReturnType<typeof vi.fn>;
  appendNamesbase: ReturnType<typeof vi.fn>;
} {
  const bases: NameBaseLike[] = [...initial];
  const getNameBases = vi.fn(() => bases);
  const appendNamesbase = vi.fn((entry: NameBaseLike) => {
    bases.push(entry);
  });
  return {
    runtime: { getNameBases, appendNamesbase },
    bases,
    getNameBases,
    appendNamesbase,
  };
}

describe("add_namesbase tool", () => {
  it("happy path with no inputs (empty nameBases) — defaults applied", async () => {
    const { runtime, bases, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(appendNamesbase).toHaveBeenCalledTimes(1);
    expect(bases).toHaveLength(1);
    expect(bases[0]).toEqual({
      name: "Base0",
      min: 5,
      max: 12,
      d: "",
      m: 0,
      b: DEFAULT_NAMESBASE_CORPUS,
    });
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      index: 0,
      name: "Base0",
      min: 5,
      max: 12,
      duplicate_chars: "",
      multiword_rate: 0,
    });
    expect(body.name_count).toBe(DEFAULT_NAMESBASE_CORPUS.split(",").length);
    expect(body.sample_names).toEqual(["This", "is", "an", "example", "of"]);
  });

  it("happy path with N existing entries — index N, name BaseN", async () => {
    const existing: NameBaseLike[] = [
      { name: "Generic", b: "a,b,c", min: 4, max: 9, d: "", m: 0 },
      { name: "Elvish", b: "a,b,c", min: 4, max: 9, d: "", m: 0 },
      { name: "Dwarven", b: "a,b,c", min: 4, max: 9, d: "", m: 0 },
    ];
    const { runtime, bases } = makeRuntime(existing);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(bases).toHaveLength(4);
    expect(bases[3]).toEqual({
      name: "Base3",
      min: 5,
      max: 12,
      d: "",
      m: 0,
      b: DEFAULT_NAMESBASE_CORPUS,
    });
    const body = JSON.parse(result.content);
    expect(body.index).toBe(3);
    expect(body.name).toBe("Base3");
  });

  it("happy path with all custom inputs", async () => {
    const { runtime, bases } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({
      name: "MyBase",
      min: 3,
      max: 20,
      duplicate_chars: "lr",
      multiword_rate: 0.3,
      names: ["Alpha", "Beta", "Gamma", "Delta"],
    });
    expect(result.isError).toBeFalsy();
    expect(bases[0]).toEqual({
      name: "MyBase",
      min: 3,
      max: 20,
      d: "lr",
      m: 0.3,
      b: "Alpha,Beta,Gamma,Delta",
    });
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "MyBase",
      min: 3,
      max: 20,
      duplicate_chars: "lr",
      multiword_rate: 0.3,
      name_count: 4,
      sample_names: ["Alpha", "Beta", "Gamma", "Delta"],
    });
  });

  it("custom name with '/' and '|' — sanitised", async () => {
    const { runtime, bases } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ name: "My/Base|X" });
    expect(result.isError).toBeFalsy();
    expect(bases[0]?.name).toBe("MyBaseX");
    expect(JSON.parse(result.content).name).toBe("MyBaseX");
  });

  it("sanitised name empty ('|||') — falls back to default 'BaseN'", async () => {
    const { runtime, bases } = makeRuntime([
      { name: "Existing", b: "a,b,c", min: 4, max: 9, d: "", m: 0 },
      { name: "Existing2", b: "a,b,c", min: 4, max: 9, d: "", m: 0 },
    ]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ name: "|||" });
    expect(result.isError).toBeFalsy();
    expect(bases[2]?.name).toBe("Base2");
    expect(JSON.parse(result.content).name).toBe("Base2");
  });

  it("whitespace-only name — falls back to default", async () => {
    const { runtime, bases } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ name: "   " });
    expect(result.isError).toBeFalsy();
    expect(bases[0]?.name).toBe("Base0");
  });

  it("custom names array (3 entries) — joined", async () => {
    const { runtime, bases } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ names: ["Foo", "Bar", "Baz"] });
    expect(result.isError).toBeFalsy();
    expect(bases[0]?.b).toBe("Foo,Bar,Baz");
    const body = JSON.parse(result.content);
    expect(body.name_count).toBe(3);
    expect(body.sample_names).toEqual(["Foo", "Bar", "Baz"]);
  });

  it("custom names string — used as-is", async () => {
    const { runtime, bases } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ names: "Alpha,Beta,Gamma" });
    expect(result.isError).toBeFalsy();
    expect(bases[0]?.b).toBe("Alpha,Beta,Gamma");
  });

  it("names with '/' and '|' — stripped (array form)", async () => {
    const { runtime, bases } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ names: ["A", "B|", "C/"] });
    expect(result.isError).toBeFalsy();
    expect(bases[0]?.b).toBe("A,B,C");
  });

  it("names with '/' and '|' — stripped (string form)", async () => {
    const { runtime, bases } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ names: "A|,B/,C" });
    expect(result.isError).toBeFalsy();
    expect(bases[0]?.b).toBe("A,B,C");
  });

  it("rejects names array with fewer than 3 entries", async () => {
    const { runtime, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ names: ["Foo", "Bar"] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Names corpus must have at least 3 names",
    );
    expect(appendNamesbase).not.toHaveBeenCalled();
  });

  it("rejects names string with fewer than 3 entries", async () => {
    const { runtime, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ names: "Foo,Bar" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Names corpus must have at least 3 names",
    );
    expect(appendNamesbase).not.toHaveBeenCalled();
  });

  it("rejects empty names string", async () => {
    const { runtime, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ names: "" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "names must be a non-empty string.",
    );
    expect(appendNamesbase).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only names string", async () => {
    const { runtime, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ names: "   " });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "names must be a non-empty string.",
    );
    expect(appendNamesbase).not.toHaveBeenCalled();
  });

  it("rejects names array of empty/whitespace entries", async () => {
    const { runtime, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ names: ["", " ", "  "] });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "names must be a non-empty string.",
    );
    expect(appendNamesbase).not.toHaveBeenCalled();
  });

  it("min/max boundary 2/100 accepted", async () => {
    const { runtime, bases } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ min: 2, max: 100 });
    expect(result.isError).toBeFalsy();
    expect(bases[0]?.min).toBe(2);
    expect(bases[0]?.max).toBe(100);
  });

  it("rejects min=1 (out of range)", async () => {
    const { runtime, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ min: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "min must be an integer in [2, 100].",
    );
    expect(appendNamesbase).not.toHaveBeenCalled();
  });

  it("rejects max=101 (out of range)", async () => {
    const { runtime, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ max: 101 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "max must be an integer in [2, 100].",
    );
    expect(appendNamesbase).not.toHaveBeenCalled();
  });

  it("rejects min=1.5 (non-integer)", async () => {
    const { runtime, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ min: 1.5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "min must be an integer in [2, 100].",
    );
    expect(appendNamesbase).not.toHaveBeenCalled();
  });

  it("rejects min > max", async () => {
    const { runtime, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({ min: 10, max: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("min must be <= max.");
    expect(appendNamesbase).not.toHaveBeenCalled();
  });

  it("multiword_rate boundaries 0 and 1 accepted", async () => {
    const { runtime, bases } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    const a = await tool.execute({ multiword_rate: 0 });
    expect(a.isError).toBeFalsy();
    const b = await tool.execute({ multiword_rate: 1 });
    expect(b.isError).toBeFalsy();
    expect(bases[0]?.m).toBe(0);
    expect(bases[1]?.m).toBe(1);
  });

  it("rejects multiword_rate -0.1, 1.1, NaN", async () => {
    const { runtime, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    for (const bad of [-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await tool.execute({ multiword_rate: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "multiword_rate must be a finite number in [0, 1].",
      );
    }
    expect(appendNamesbase).not.toHaveBeenCalled();
  });

  it("rejects non-string duplicate_chars", async () => {
    const { runtime, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    for (const bad of [42, true, [], {}]) {
      const r = await tool.execute({ duplicate_chars: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "duplicate_chars must be a string.",
      );
    }
    expect(appendNamesbase).not.toHaveBeenCalled();
  });

  it("rejects non-string name", async () => {
    const { runtime, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    for (const bad of [42, true, [], {}]) {
      const r = await tool.execute({ name: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe("name must be a string.");
    }
    expect(appendNamesbase).not.toHaveBeenCalled();
  });

  it("rejects names of wrong type (number, object, mixed array)", async () => {
    const { runtime, appendNamesbase } = makeRuntime([]);
    const tool = createAddNamesbaseTool(runtime);
    for (const bad of [42, {}, [1, 2, 3], ["Foo", 42, "Bar"], true]) {
      const r = await tool.execute({ names: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "names must be a string or an array of strings.",
      );
    }
    expect(appendNamesbase).not.toHaveBeenCalled();
  });

  it("surfaces runtime getNameBases failures", async () => {
    const runtime: AddNamesbaseRuntime = {
      getNameBases: () => {
        throw new Error("nameBases missing");
      },
      appendNamesbase: vi.fn(),
    };
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases missing/);
    expect(runtime.appendNamesbase).not.toHaveBeenCalled();
  });

  it("surfaces runtime appendNamesbase failures", async () => {
    const bases: NameBaseLike[] = [];
    const runtime: AddNamesbaseRuntime = {
      getNameBases: () => bases,
      appendNamesbase: vi.fn(() => {
        throw new Error("push failed");
      }),
    };
    const tool = createAddNamesbaseTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/push failed/);
  });

  it("has correct tool name and schema (both names shapes declared)", () => {
    expect(addNamesbaseTool.name).toBe("add_namesbase");
    expect(addNamesbaseTool.input_schema.required).toBeUndefined();
    const namesSchema = addNamesbaseTool.input_schema.properties.names as {
      oneOf: Array<{ type: string }>;
    };
    expect(namesSchema.oneOf.map((s) => s.type)).toEqual(["string", "array"]);
  });
});

describe("defaultAddNamesbaseRuntime (integration)", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "Generic", b: "Old", min: 4, max: 9, d: "", m: 0 },
      { name: "Elvish", b: "Old", min: 4, max: 9, d: "", m: 0 },
    ];
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
  });

  it("appends to the live globals", async () => {
    const result = await addNamesbaseTool.execute({ name: "Custom" });
    expect(result.isError).toBeFalsy();
    const bases = (globalThis as { nameBases: NameBaseLike[] }).nameBases;
    expect(bases).toHaveLength(3);
    expect(bases[2]?.name).toBe("Custom");
    expect(bases[2]?.min).toBe(5);
    expect(bases[2]?.max).toBe(12);
    expect(JSON.parse(result.content).index).toBe(2);
  });

  it("errors cleanly when nameBases is missing", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await addNamesbaseTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });

  it("errors when nameBases is not an array", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = { not: "array" };
    const result = await addNamesbaseTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });

  it("default runtime exposes the seam", () => {
    expect(typeof defaultAddNamesbaseRuntime.getNameBases).toBe("function");
    expect(typeof defaultAddNamesbaseRuntime.appendNamesbase).toBe("function");
  });
});

describe("add_namesbase registry round-trip", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [];
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
  });

  it("registers and runs through the registry", async () => {
    const registry = new ToolRegistry();
    registry.register(addNamesbaseTool);
    const result = await registry.run("add_namesbase", {});
    expect(result.isError).toBeFalsy();
    const bases = (globalThis as { nameBases: NameBaseLike[] }).nameBases;
    expect(bases).toHaveLength(1);
    expect(bases[0]?.name).toBe("Base0");
    expect(JSON.parse(result.content).index).toBe(0);
  });

  it("returns 'add_namesbase' as its name in registry list", () => {
    const registry = new ToolRegistry();
    registry.register(addNamesbaseTool);
    expect(registry.list().map((t) => t.name)).toContain("add_namesbase");
  });
});
