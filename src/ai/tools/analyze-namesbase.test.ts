import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AnalyzeNamesbaseRuntime,
  analyzeNamesbaseTool,
  createAnalyzeNamesbaseTool,
} from "./analyze-namesbase";
import { ToolRegistry } from "./index";

function makeRuntime(overrides: Partial<AnalyzeNamesbaseRuntime> = {}): {
  runtime: AnalyzeNamesbaseRuntime;
  getNameBases: ReturnType<
    typeof vi.fn<AnalyzeNamesbaseRuntime["getNameBases"]>
  >;
  calculateChain: ReturnType<
    typeof vi.fn<AnalyzeNamesbaseRuntime["calculateChain"]>
  >;
} {
  const getNameBases = vi.fn<AnalyzeNamesbaseRuntime["getNameBases"]>(
    overrides.getNameBases ?? (() => []),
  );
  const calculateChain = vi.fn<AnalyzeNamesbaseRuntime["calculateChain"]>(
    overrides.calculateChain ?? (() => null),
  );
  return {
    runtime: { getNameBases, calculateChain },
    getNameBases,
    calculateChain,
  };
}

describe("analyze_namesbase tool", () => {
  it("happy path: small known corpus", async () => {
    const bases = [{ name: "Generic", b: "Aria,Elen,Mara,Lia,Ven" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [
        ["a", "ar"],
        ["aria", "elen"],
      ],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "Generic",
      length: 5,
      min_length: 3,
      max_length: 4,
      mean_length: 3.6,
      median_length: 4,
      variety: 2,
      length_quality: "not_enough",
      variety_quality: "low",
      non_basic_chars: "",
      doubled_chars: "",
      duplicates_count: 0,
      duplicates_sample: [],
      multiword_rate: 0,
    });
  });

  it("mean_length is rounded to 1 decimal", async () => {
    const bases = [{ name: "X", b: "a,b,cc" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).mean_length).toBe(1.3);
  });

  it("median_length: odd length is the middle integer", async () => {
    const bases = [{ name: "X", b: "a,bb,ccc" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(JSON.parse(result.content).median_length).toBe(2);
  });

  it("median_length: even length is the half-value average", async () => {
    const bases = [{ name: "X", b: "a,bb,ccc,dddd" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(JSON.parse(result.content).median_length).toBe(2.5);
  });

  it("rejects empty corpus (string + whitespace + missing + non-string)", async () => {
    for (const b of ["", "   ", undefined, 42] as const) {
      const bases = [{ name: "X", b }];
      const { runtime } = makeRuntime({
        getNameBases: () => bases,
        calculateChain: () => [["x"]],
      });
      const tool = createAnalyzeNamesbaseTool(runtime);
      const result = await tool.execute({ index: 0 });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toBe(
        "Namesbase corpus is empty.",
      );
    }
  });

  it("corpus of all duplicates: counts the single distinct dupe", async () => {
    const bases = [{ name: "X", b: "a,a,a,a,a" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["a"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0 });
    const body = JSON.parse(result.content);
    expect(body.length).toBe(5);
    expect(body.duplicates_count).toBe(1);
    expect(body.duplicates_sample).toEqual(["a"]);
    expect(body.min_length).toBe(1);
    expect(body.max_length).toBe(1);
    expect(body.mean_length).toBe(1);
    expect(body.median_length).toBe(1);
  });

  it("non_basic_chars: lowercased before unique, first-seen order", async () => {
    const bases = [{ name: "X", b: "héllo,wörld,Æäö" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(JSON.parse(result.content).non_basic_chars).toBe("éöæä");
  });

  it("doubled_chars: empty when no doubles", async () => {
    const bases = [{ name: "X", b: "abc,def,ghi" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(JSON.parse(result.content).doubled_chars).toBe("");
  });

  it("doubled_chars: 4 occurrences pass the > 3 threshold", async () => {
    const bases = [{ name: "X", b: "all,bell,fall,call" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(JSON.parse(result.content).doubled_chars).toBe("l");
  });

  it("doubled_chars: 3 occurrences do NOT pass the > 3 threshold", async () => {
    const bases = [{ name: "X", b: "all,bell,fall,foo" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(JSON.parse(result.content).doubled_chars).toBe("");
  });

  it("multiword_rate: fraction of names containing a space", async () => {
    const bases = [{ name: "X", b: "New York,San Francisco,Paris" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(JSON.parse(result.content).multiword_rate).toBeCloseTo(2 / 3, 9);
  });

  describe("length_quality boundaries", () => {
    function corpusOfLength(n: number): string {
      return Array.from({ length: n }, () => "a").join(",");
    }

    const cases: Array<[number, string]> = [
      [29, "not_enough"],
      [30, "low"],
      [99, "low"],
      [100, "good"],
      [400, "good"],
      [401, "overmuch"],
    ];

    for (const [n, quality] of cases) {
      it(`length=${n} → length_quality="${quality}"`, async () => {
        const bases = [{ name: "X", b: corpusOfLength(n) }];
        const { runtime } = makeRuntime({
          getNameBases: () => bases,
          calculateChain: () => [],
        });
        const tool = createAnalyzeNamesbaseTool(runtime);
        const result = await tool.execute({ index: 0 });
        expect(JSON.parse(result.content).length_quality).toBe(quality);
      });
    }
  });

  describe("variety_quality boundaries", () => {
    const cases: Array<[number, string]> = [
      [14, "low"],
      [15, "mean"],
      [29, "mean"],
      [30, "good"],
      [40, "good"],
    ];

    for (const [n, quality] of cases) {
      it(`mean array length=${n} → variety_quality="${quality}"`, async () => {
        const bases = [{ name: "X", b: "a,b" }];
        const valueArray = Array.from({ length: n }, () => "x");
        const { runtime } = makeRuntime({
          getNameBases: () => bases,
          calculateChain: () => [valueArray],
        });
        const tool = createAnalyzeNamesbaseTool(runtime);
        const result = await tool.execute({ index: 0 });
        const body = JSON.parse(result.content);
        expect(body.variety).toBe(n);
        expect(body.variety_quality).toBe(quality);
      });
    }
  });

  it("omits variety / variety_quality when calculateChain returns null", async () => {
    const bases = [{ name: "X", b: "a,b,c" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => null,
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).not.toHaveProperty("variety");
    expect(body).not.toHaveProperty("variety_quality");
    expect(body.length).toBe(3);
    expect(body.mean_length).toBe(1);
  });

  it("treats calculateChain throws as missing variety", async () => {
    const bases = [{ name: "X", b: "a,b,c" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => {
        throw new Error("boom");
      },
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).not.toHaveProperty("variety");
    expect(body).not.toHaveProperty("variety_quality");
  });

  it("identification: by index", async () => {
    const bases = [
      { name: "A", b: "x,y,z" },
      { name: "B", b: "p,q" },
    ];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.index).toBe(1);
    expect(body.name).toBe("B");
    expect(body.length).toBe(2);
  });

  it("identification: by current_name (case-insensitive)", async () => {
    const bases = [
      { name: "A", b: "x,y,z" },
      { name: "B", b: "p,q" },
    ];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ current_name: "a" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).index).toBe(0);
  });

  it("identification: both supplied and agree", async () => {
    const bases = [
      { name: "A", b: "x,y,z" },
      { name: "B", b: "p,q" },
    ];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 1, current_name: "B" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).index).toBe(1);
  });

  it("identification: both supplied and disagree", async () => {
    const bases = [
      { name: "A", b: "x,y,z" },
      { name: "B", b: "p,q" },
    ];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0, current_name: "B" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "index and current_name disagree.",
    );
  });

  it("identification: ambiguous current_name returns candidates", async () => {
    const bases = [
      { name: "Dup", b: "a,b" },
      { name: "Dup", b: "c,d" },
    ];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ current_name: "Dup" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/Multiple namesbases match name Dup/);
    expect(body.candidates).toEqual([
      { index: 0, name: "Dup" },
      { index: 1, name: "Dup" },
    ]);
  });

  it("identification: name not found", async () => {
    const bases = [{ name: "Real", b: "a,b" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ current_name: "Ghost" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found with name Ghost.",
    );
  });

  it("identification: index out of range", async () => {
    const bases = [{ name: "Real", b: "a,b" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found at index 5.",
    );
  });

  it("identification: rejects negative / non-integer / non-finite / non-numeric index", async () => {
    const bases = [{ name: "Real", b: "a,b" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
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
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Provide either index or current_name to identify the namesbase.",
    );
  });

  it("identification: rejects empty/whitespace/non-string current_name", async () => {
    const bases = [{ name: "A", b: "a,b" }];
    const { runtime } = makeRuntime({
      getNameBases: () => bases,
      calculateChain: () => [["x"]],
    });
    const tool = createAnalyzeNamesbaseTool(runtime);
    for (const bad of ["", "   ", 42] as const) {
      const r = await tool.execute({ current_name: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "current_name must be a non-empty string.",
      );
    }
  });

  it("surfaces runtime getNameBases failures", async () => {
    const runtime: AnalyzeNamesbaseRuntime = {
      getNameBases: () => {
        throw new Error("nameBases missing");
      },
      calculateChain: () => null,
    };
    const tool = createAnalyzeNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases missing/);
  });

  it("has correct tool name and no required schema fields", () => {
    expect(analyzeNamesbaseTool.name).toBe("analyze_namesbase");
    expect(analyzeNamesbaseTool.input_schema.type).toBe("object");
    expect(analyzeNamesbaseTool.input_schema.required).toBeUndefined();
  });
});

describe("defaultAnalyzeNamesbaseRuntime (integration)", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalNames = (globalThis as { Names?: unknown }).Names;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "X", b: "ab,cd" },
    ];
    (globalThis as { Names?: unknown }).Names = {
      calculateChain: () => ({ a: ["a"] }),
    };
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { Names?: unknown }).Names = originalNames;
  });

  it("reads globalThis.nameBases and globalThis.Names; does not mutate", async () => {
    const before = (globalThis as { nameBases: { b: string }[] }).nameBases[0]
      .b;
    const result = await analyzeNamesbaseTool.execute({ index: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.length).toBe(2);
    expect(body.variety).toBe(1);
    expect(body.name).toBe("X");
    const after = (globalThis as { nameBases: { b: string }[] }).nameBases[0].b;
    expect(after).toBe(before);
  });

  it("falls back when window.Names is missing (no variety keys)", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const result = await analyzeNamesbaseTool.execute({ index: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).not.toHaveProperty("variety");
    expect(body).not.toHaveProperty("variety_quality");
    expect(body.length).toBe(2);
  });

  it("falls back when Names.calculateChain is not a function", async () => {
    (globalThis as { Names?: unknown }).Names = {
      calculateChain: "not a function",
    };
    const result = await analyzeNamesbaseTool.execute({ index: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).not.toHaveProperty("variety");
    expect(body).not.toHaveProperty("variety_quality");
  });

  it("errors when nameBases is missing", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await analyzeNamesbaseTool.execute({ index: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });

  it("errors when nameBases is not an array", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = { not: "array" };
    const result = await analyzeNamesbaseTool.execute({ index: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });
});

describe("analyze_namesbase registry round-trip", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalNames = (globalThis as { Names?: unknown }).Names;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "First", b: "x,y,z" },
    ];
    (globalThis as { Names?: unknown }).Names = {
      calculateChain: () => ({ a: ["a"] }),
    };
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { Names?: unknown }).Names = originalNames;
  });

  it("registers under its declared name", () => {
    const registry = new ToolRegistry();
    registry.register(analyzeNamesbaseTool);
    expect(registry.list().map((t) => t.name)).toContain("analyze_namesbase");
  });

  it("runs through the registry", async () => {
    const registry = new ToolRegistry();
    registry.register(analyzeNamesbaseTool);
    const result = await registry.run("analyze_namesbase", { index: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.length).toBe(3);
  });
});
