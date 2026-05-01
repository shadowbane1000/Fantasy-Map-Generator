import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGenerateNamesbaseExamplesTool,
  type GenerateNamesbaseExamplesRuntime,
  generateNamesbaseExamplesTool,
} from "./generate-namesbase-examples";
import { ToolRegistry } from "./index";

function makeRuntime(
  overrides: Partial<GenerateNamesbaseExamplesRuntime> = {},
): {
  runtime: GenerateNamesbaseExamplesRuntime;
  getNameBases: ReturnType<
    typeof vi.fn<GenerateNamesbaseExamplesRuntime["getNameBases"]>
  >;
  generateOne: ReturnType<
    typeof vi.fn<GenerateNamesbaseExamplesRuntime["generateOne"]>
  >;
} {
  const getNameBases = vi.fn<GenerateNamesbaseExamplesRuntime["getNameBases"]>(
    overrides.getNameBases ?? (() => []),
  );
  const generateOne = vi.fn<GenerateNamesbaseExamplesRuntime["generateOne"]>(
    overrides.generateOne ?? (() => "Name"),
  );
  return { runtime: { getNameBases, generateOne }, getNameBases, generateOne };
}

describe("generate_namesbase_examples tool", () => {
  it("happy path: count omitted defaults to 7", async () => {
    const bases = [{ name: "Generic", b: "x,y,z" }];
    let call = 0;
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
      generateOne: () => {
        call += 1;
        return `name${call}`;
      },
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "Generic",
      requested_count: 7,
      examples: ["name1", "name2", "name3", "name4", "name5", "name6", "name7"],
      examples_truncated: false,
    });
    expect(generateOne).toHaveBeenCalledTimes(7);
    for (let i = 0; i < 7; i++) {
      expect(generateOne).toHaveBeenNthCalledWith(i + 1, 0);
    }
  });

  it("count=1 lower boundary produces a single example", async () => {
    const bases = [{ name: "X", b: "a,b" }];
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
      generateOne: () => "only",
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0, count: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.requested_count).toBe(1);
    expect(body.examples).toEqual(["only"]);
    expect(body.examples_truncated).toBe(false);
    expect(generateOne).toHaveBeenCalledTimes(1);
  });

  it("count=50 upper boundary produces 50 examples", async () => {
    const bases = [{ name: "X", b: "a,b" }];
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
      generateOne: () => "n",
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0, count: 50 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.requested_count).toBe(50);
    expect(body.examples).toHaveLength(50);
    expect(body.examples_truncated).toBe(false);
    expect(generateOne).toHaveBeenCalledTimes(50);
  });

  it("count=0 errors", async () => {
    const bases = [{ name: "X", b: "a,b" }];
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0, count: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "count must be an integer in [1, 50].",
    );
    expect(generateOne).not.toHaveBeenCalled();
  });

  it("count=51 errors", async () => {
    const bases = [{ name: "X", b: "a,b" }];
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0, count: 51 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "count must be an integer in [1, 50].",
    );
    expect(generateOne).not.toHaveBeenCalled();
  });

  it("count='3' string errors", async () => {
    const bases = [{ name: "X", b: "a,b" }];
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0, count: "3" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "count must be an integer in [1, 50].",
    );
    expect(generateOne).not.toHaveBeenCalled();
  });

  it("count=1.5 non-integer errors", async () => {
    const bases = [{ name: "X", b: "a,b" }];
    const { runtime } = makeRuntime({ getNameBases: () => bases });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0, count: 1.5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "count must be an integer in [1, 50].",
    );
  });

  it("count=NaN / Infinity errors", async () => {
    const bases = [{ name: "X", b: "a,b" }];
    const { runtime } = makeRuntime({ getNameBases: () => bases });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const result = await tool.execute({ index: 0, count: bad });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toBe(
        "count must be an integer in [1, 50].",
      );
    }
  });

  it("count=null defaults to 7 (same as omitted)", async () => {
    const bases = [{ name: "X", b: "a,b" }];
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
      generateOne: () => "n",
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0, count: null });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.requested_count).toBe(7);
    expect(body.examples).toHaveLength(7);
    expect(generateOne).toHaveBeenCalledTimes(7);
  });

  it("truncates mid-loop when generateOne returns undefined on call 4", async () => {
    const bases = [{ name: "Generic", b: "a,b,c" }];
    const sequence: Array<string | undefined> = ["a", "b", "c", undefined];
    let i = 0;
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
      generateOne: () => sequence[i++],
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0, count: 7 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "Generic",
      requested_count: 7,
      examples: ["a", "b", "c"],
      examples_truncated: true,
    });
    expect(generateOne).toHaveBeenCalledTimes(4);
  });

  it("truncates on first call when generateOne returns undefined immediately", async () => {
    const bases = [{ name: "Generic", b: "a,b,c" }];
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
      generateOne: () => undefined,
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0, count: 5 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "Generic",
      requested_count: 5,
      examples: [],
      examples_truncated: true,
    });
    expect(generateOne).toHaveBeenCalledTimes(1);
  });

  it("identification: by index", async () => {
    const bases = [
      { name: "A", b: "x,y" },
      { name: "B", b: "p,q" },
    ];
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
      generateOne: () => "n",
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 1, count: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.index).toBe(1);
    expect(body.name).toBe("B");
    expect(generateOne).toHaveBeenCalledWith(1);
  });

  it("identification: by current_name (case-insensitive)", async () => {
    const bases = [
      { name: "A", b: "x,y" },
      { name: "B", b: "p,q" },
    ];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      generateOne: () => "n",
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ current_name: "a", count: 1 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).index).toBe(0);
  });

  it("identification: both supplied and agree", async () => {
    const bases = [
      { name: "A", b: "x,y" },
      { name: "B", b: "p,q" },
    ];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      generateOne: () => "n",
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({
      index: 1,
      current_name: "B",
      count: 1,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).index).toBe(1);
  });

  it("identification: both supplied and disagree", async () => {
    const bases = [
      { name: "A", b: "x,y" },
      { name: "B", b: "p,q" },
    ];
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({
      index: 0,
      current_name: "B",
      count: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "index and current_name disagree.",
    );
    expect(generateOne).not.toHaveBeenCalled();
  });

  it("identification: ambiguous current_name returns candidates", async () => {
    const bases = [
      { name: "Dup", b: "a,b" },
      { name: "Dup", b: "c,d" },
    ];
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ current_name: "Dup", count: 1 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/Multiple namesbases match name Dup/);
    expect(body.candidates).toEqual([
      { index: 0, name: "Dup" },
      { index: 1, name: "Dup" },
    ]);
    expect(generateOne).not.toHaveBeenCalled();
  });

  it("identification: name not found", async () => {
    const bases = [{ name: "Real", b: "a,b" }];
    const { runtime } = makeRuntime({ getNameBases: () => bases });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ current_name: "Ghost" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found with name Ghost.",
    );
  });

  it("identification: index out of range", async () => {
    const bases = [{ name: "Real", b: "a,b" }];
    const { runtime } = makeRuntime({ getNameBases: () => bases });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found at index 5.",
    );
  });

  it("identification: rejects negative / non-integer / non-finite / non-numeric index", async () => {
    const bases = [{ name: "Real", b: "a,b" }];
    const { runtime } = makeRuntime({ getNameBases: () => bases });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    for (const bad of [
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "0",
    ] as const) {
      const r = await tool.execute({ index: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "index must be a non-negative integer.",
      );
    }
  });

  it("identification: errors when neither index nor current_name is provided", async () => {
    const bases = [{ name: "A", b: "a,b" }];
    const { runtime } = makeRuntime({ getNameBases: () => bases });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Provide either index or current_name to identify the namesbase.",
    );
  });

  it("identification: rejects empty / whitespace / non-string current_name", async () => {
    const bases = [{ name: "A", b: "a,b" }];
    const { runtime } = makeRuntime({ getNameBases: () => bases });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    for (const bad of ["", "   ", 42] as const) {
      const r = await tool.execute({ current_name: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "current_name must be a non-empty string.",
      );
    }
  });

  it("surfaces runtime getNameBases failures", async () => {
    const runtime: GenerateNamesbaseExamplesRuntime = {
      getNameBases: () => {
        throw new Error("nameBases missing");
      },
      generateOne: () => "x",
    };
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases missing/);
  });

  it("surfaces generateOne throws after partial progress", async () => {
    const bases = [{ name: "X", b: "a,b" }];
    let call = 0;
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
      generateOne: () => {
        call += 1;
        if (call === 1) return "x";
        throw new Error("getBase blew up");
      },
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0, count: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/getBase blew up/);
    expect(generateOne).toHaveBeenCalledTimes(2);
  });

  it("PURITY: original nameBases array reference unchanged after the call", async () => {
    const bases = [{ name: "X", b: "a,b,c" }];
    const arrayBefore = bases;
    const entryBefore = bases[0];
    const corpusBefore = bases[0]!.b;
    const keysBefore = Object.keys(bases[0]!).sort();

    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      generateOne: () => "n",
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0, count: 7 });
    expect(result.isError).toBeFalsy();

    expect(bases).toBe(arrayBefore);
    expect(bases[0]).toBe(entryBefore);
    expect(bases[0]!.b).toBe(corpusBefore);
    expect(bases.length).toBe(1);
    expect(Object.keys(bases[0]!).sort()).toEqual(keysBefore);
  });

  it("tool name + schema shape", () => {
    expect(generateNamesbaseExamplesTool.name).toBe(
      "generate_namesbase_examples",
    );
    expect(generateNamesbaseExamplesTool.input_schema.type).toBe("object");
    expect(generateNamesbaseExamplesTool.input_schema.required).toBeUndefined();
    const props = generateNamesbaseExamplesTool.input_schema.properties;
    expect(props).toHaveProperty("index");
    expect(props).toHaveProperty("current_name");
    expect(props).toHaveProperty("count");
  });

  it("tolerates null / undefined input", async () => {
    const result1 = await generateNamesbaseExamplesTool.execute(null);
    expect(result1.isError).toBe(true);
    expect(JSON.parse(result1.content).error).toBe(
      "Provide either index or current_name to identify the namesbase.",
    );
    const result2 = await generateNamesbaseExamplesTool.execute(undefined);
    expect(result2.isError).toBe(true);
    expect(JSON.parse(result2.content).error).toBe(
      "Provide either index or current_name to identify the namesbase.",
    );
  });

  it("ignores extraneous input properties", async () => {
    const bases = [{ name: "X", b: "a,b" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      generateOne: () => "n",
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ index: 0, count: 3, bogus: "x" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).examples).toHaveLength(3);
  });

  it("validation order: count is checked BEFORE identification", async () => {
    const bases = [{ name: "A", b: "a,b" }];
    const { runtime, generateOne } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createGenerateNamesbaseExamplesTool(runtime);
    const result = await tool.execute({ count: -1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "count must be an integer in [1, 50].",
    );
    expect(generateOne).not.toHaveBeenCalled();
  });
});

describe("defaultGenerateNamesbaseExamplesRuntime (integration)", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalNames = (globalThis as { Names?: unknown }).Names;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "X", b: "a,b,c" },
    ];
    (globalThis as { Names?: unknown }).Names = {
      getBase: vi.fn().mockReturnValue("Stub"),
    };
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { Names?: unknown }).Names = originalNames;
  });

  it("end-to-end with populated globals", async () => {
    const result = await generateNamesbaseExamplesTool.execute({
      index: 0,
      count: 5,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.examples).toEqual(["Stub", "Stub", "Stub", "Stub", "Stub"]);
    expect(body.examples_truncated).toBe(false);
    const getBase = (
      globalThis as unknown as { Names: { getBase: ReturnType<typeof vi.fn> } }
    ).Names.getBase;
    expect(getBase).toHaveBeenCalledTimes(5);
    expect(getBase).toHaveBeenCalledWith(0);
  });

  it("errors when nameBases is missing", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await generateNamesbaseExamplesTool.execute({ index: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.nameBases is unavailable/,
    );
  });

  it("errors when nameBases is not an array", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = { not: "array" };
    const result = await generateNamesbaseExamplesTool.execute({ index: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.nameBases is unavailable/,
    );
  });

  it("errors when Names is missing", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const result = await generateNamesbaseExamplesTool.execute({
      index: 0,
      count: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Names.getBase is not available; the map hasn't finished loading.",
    );
  });

  it("errors when Names.getBase is not a function", async () => {
    (globalThis as { Names?: unknown }).Names = { getBase: "not a function" };
    const result = await generateNamesbaseExamplesTool.execute({
      index: 0,
      count: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Names.getBase is not available; the map hasn't finished loading.",
    );
  });

  it("treats Names.getBase non-string returns as truncation", async () => {
    (globalThis as { Names?: unknown }).Names = { getBase: () => 42 };
    const result = await generateNamesbaseExamplesTool.execute({
      index: 0,
      count: 5,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.examples).toEqual([]);
    expect(body.examples_truncated).toBe(true);
  });

  it("PURITY: integration — nameBases identity preserved", async () => {
    const arrayBefore = (globalThis as { nameBases: { b: string }[] })
      .nameBases;
    const entryBefore = arrayBefore[0];
    const corpusBefore = arrayBefore[0]!.b;
    const keysBefore = Object.keys(arrayBefore[0]!).sort();

    const result = await generateNamesbaseExamplesTool.execute({
      index: 0,
      count: 3,
    });
    expect(result.isError).toBeFalsy();

    const after = (globalThis as { nameBases: { b: string }[] }).nameBases;
    expect(after).toBe(arrayBefore);
    expect(after[0]).toBe(entryBefore);
    expect(after[0]!.b).toBe(corpusBefore);
    expect(after.length).toBe(1);
    expect(Object.keys(after[0]!).sort()).toEqual(keysBefore);
  });
});

describe("generate_namesbase_examples registry round-trip", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalNames = (globalThis as { Names?: unknown }).Names;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "First", b: "x,y,z" },
    ];
    (globalThis as { Names?: unknown }).Names = {
      getBase: () => "Reg",
    };
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { Names?: unknown }).Names = originalNames;
  });

  it("registers under its declared name", () => {
    const registry = new ToolRegistry();
    registry.register(generateNamesbaseExamplesTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "generate_namesbase_examples",
    );
  });

  it("runs through the registry", async () => {
    const registry = new ToolRegistry();
    registry.register(generateNamesbaseExamplesTool);
    const result = await registry.run("generate_namesbase_examples", {
      index: 0,
      count: 3,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.examples).toHaveLength(3);
    expect(body.examples_truncated).toBe(false);
  });
});
