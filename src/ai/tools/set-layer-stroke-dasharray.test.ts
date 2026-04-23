import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetLayerStrokeDasharrayTool,
  type LayerStrokeDasharrayRuntime,
  setLayerStrokeDasharrayTool,
} from "./set-layer-stroke-dasharray";

function makeRuntime(previous: string | null = "5,5"): {
  runtime: LayerStrokeDasharrayRuntime;
  readDasharray: ReturnType<typeof vi.fn>;
  setDasharray: ReturnType<typeof vi.fn>;
} {
  const readDasharray = vi.fn((_id: string) => previous);
  const setDasharray = vi.fn((_id: string, _dasharray: string) => {});
  return {
    runtime: { readDasharray, setDasharray },
    readDasharray,
    setDasharray,
  };
}

describe("set_layer_stroke_dasharray tool", () => {
  it("sets dasharray on the rivers layer", async () => {
    const { runtime, readDasharray, setDasharray } = makeRuntime("1,1");
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    const result = await tool.execute({ layer: "rivers", dasharray: "5,5" });
    expect(result.isError).toBeFalsy();
    expect(readDasharray).toHaveBeenCalledWith("rivers");
    expect(setDasharray).toHaveBeenCalledWith("rivers", "5,5");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousDasharray: "1,1",
      dasharray: "5,5",
    });
  });

  it("resolves alias 'state borders' to canonical 'borders' (svgId 'borders')", async () => {
    const { runtime, readDasharray, setDasharray } = makeRuntime("2,2");
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    const result = await tool.execute({
      layer: "state borders",
      dasharray: "10 5",
    });
    expect(result.isError).toBeFalsy();
    expect(readDasharray).toHaveBeenCalledWith("borders");
    expect(setDasharray).toHaveBeenCalledWith("borders", "10 5");
    expect(JSON.parse(result.content)).toMatchObject({
      layer: "borders",
      dasharray: "10 5",
    });
  });

  it("maps canonical 'heightmap' to SVG id '#terrs'", async () => {
    const { runtime, setDasharray } = makeRuntime(null);
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    await tool.execute({ layer: "heightmap", dasharray: "3,3" });
    expect(setDasharray).toHaveBeenCalledWith("terrs", "3,3");
  });

  it("maps canonical 'burgs' to SVG id '#burgIcons'", async () => {
    const { runtime, setDasharray } = makeRuntime(null);
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    await tool.execute({ layer: "burgs", dasharray: "1 2 1" });
    expect(setDasharray).toHaveBeenCalledWith("burgIcons", "1 2 1");
  });

  it("maps 'cultures' → '#cults' and 'religions' → '#relig'", async () => {
    const { runtime, setDasharray } = makeRuntime(null);
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    await tool.execute({ layer: "cultures", dasharray: "4,2" });
    await tool.execute({ layer: "religions", dasharray: "2,4" });
    expect(setDasharray).toHaveBeenNthCalledWith(1, "cults", "4,2");
    expect(setDasharray).toHaveBeenNthCalledWith(2, "relig", "2,4");
  });

  it("accepts case-insensitive layer names", async () => {
    const { runtime, setDasharray } = makeRuntime(null);
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    const result = await tool.execute({
      layer: "RIVERS",
      dasharray: "2 4",
    });
    expect(result.isError).toBeFalsy();
    expect(setDasharray).toHaveBeenCalledWith("rivers", "2 4");
    expect(JSON.parse(result.content)).toMatchObject({ layer: "rivers" });
  });

  it("accepts a variety of dasharray forms", async () => {
    const { runtime, setDasharray } = makeRuntime(null);
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    const variants = ["5,5", "2 4 2", "10 5", "1,2,3,4", "0", "0.5 1.5"];
    for (const v of variants) {
      const r = await tool.execute({ layer: "rivers", dasharray: v });
      expect(r.isError).toBeFalsy();
    }
    expect(setDasharray).toHaveBeenCalledTimes(variants.length);
    for (let i = 0; i < variants.length; i++) {
      expect(setDasharray).toHaveBeenNthCalledWith(
        i + 1,
        "rivers",
        variants[i],
      );
    }
  });

  it("trims whitespace from the dasharray before writing", async () => {
    const { runtime, setDasharray } = makeRuntime(null);
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    const r = await tool.execute({
      layer: "rivers",
      dasharray: "   5,5   ",
    });
    expect(r.isError).toBeFalsy();
    expect(setDasharray).toHaveBeenCalledWith("rivers", "5,5");
  });

  it("clears with empty string → stored as ''", async () => {
    const { runtime, setDasharray } = makeRuntime("5,5");
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    const r = await tool.execute({ layer: "rivers", dasharray: "" });
    expect(r.isError).toBeFalsy();
    expect(setDasharray).toHaveBeenCalledWith("rivers", "");
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousDasharray: "5,5",
      dasharray: "",
    });
  });

  it("clears with 'none' / 'NONE' → stored as ''", async () => {
    const { runtime, setDasharray } = makeRuntime("5,5");
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    const a = await tool.execute({ layer: "rivers", dasharray: "none" });
    const b = await tool.execute({ layer: "rivers", dasharray: "NONE" });
    expect(a.isError).toBeFalsy();
    expect(b.isError).toBeFalsy();
    expect(setDasharray).toHaveBeenNthCalledWith(1, "rivers", "");
    expect(setDasharray).toHaveBeenNthCalledWith(2, "rivers", "");
  });

  it("returns a structured error for unknown layer names", async () => {
    const { runtime, setDasharray } = makeRuntime();
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    const result = await tool.execute({ layer: "shadows", dasharray: "5,5" });
    expect(result.isError).toBe(true);
    expect(setDasharray).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("shadows");
    expect(Array.isArray(body.supported)).toBe(true);
    expect(body.supported).toContain("rivers");
  });

  it("rejects missing or empty layer", async () => {
    const { runtime } = makeRuntime();
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    const a = await tool.execute({ dasharray: "5,5" });
    const b = await tool.execute({ layer: "   ", dasharray: "5,5" });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
  });

  it("rejects non-string / malformed dasharray values", async () => {
    const { runtime, setDasharray } = makeRuntime();
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    const bad: unknown[] = [
      undefined,
      null,
      123,
      {},
      ["5", "5"],
      "5px",
      "abc",
      "-5,5",
      "5,,5",
      "5,",
      ",5",
      "NaN",
      "Infinity",
    ];
    for (const v of bad) {
      const result = await tool.execute({ layer: "rivers", dasharray: v });
      expect(result.isError).toBe(true);
    }
    expect(setDasharray).not.toHaveBeenCalled();
  });

  it("surfaces setDasharray failures as errorResult", async () => {
    const runtime: LayerStrokeDasharrayRuntime = {
      readDasharray: () => "5,5",
      setDasharray: () => {
        throw new Error("Layer element #rivers not found in DOM.");
      },
    };
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    const result = await tool.execute({ layer: "rivers", dasharray: "2,2" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("reports previousDasharray: null when runtime.readDasharray returns null", async () => {
    const { runtime } = makeRuntime(null);
    const tool = createSetLayerStrokeDasharrayTool(runtime);
    const result = await tool.execute({ layer: "rivers", dasharray: "5,5" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousDasharray: null,
      dasharray: "5,5",
    });
  });

  it("exposes the expected tool name and schema", () => {
    expect(setLayerStrokeDasharrayTool.name).toBe("set_layer_stroke_dasharray");
    expect(setLayerStrokeDasharrayTool.input_schema.required).toEqual([
      "layer",
      "dasharray",
    ]);
  });
});

describe("defaultLayerStrokeDasharrayRuntime (integration)", () => {
  interface FakeEl {
    attrs: Record<string, string>;
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
  }

  const elements: Record<string, FakeEl> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;

  function makeEl(initial?: string): FakeEl {
    const attrs: Record<string, string> = {};
    if (initial !== undefined) attrs["stroke-dasharray"] = initial;
    return {
      attrs,
      getAttribute(name: string): string | null {
        return Object.hasOwn(attrs, name) ? attrs[name] : null;
      },
      setAttribute(name: string, value: string): void {
        attrs[name] = value;
      },
    };
  }

  beforeEach(() => {
    getElementById.mockClear();
    for (const k of Object.keys(elements)) delete elements[k];
    (globalThis as unknown as { document?: unknown }).document = {
      getElementById,
    };
  });

  afterEach(() => {
    (globalThis as unknown as { document?: unknown }).document = originalDoc;
  });

  it("writes the stroke-dasharray attribute and returns previousDasharray", async () => {
    elements.rivers = makeEl("1,1");
    const result = await setLayerStrokeDasharrayTool.execute({
      layer: "rivers",
      dasharray: "5,5",
    });
    expect(result.isError).toBeFalsy();
    expect(elements.rivers?.attrs["stroke-dasharray"]).toBe("5,5");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousDasharray: "1,1",
      dasharray: "5,5",
    });
  });

  it("returns previousDasharray: null when the attribute is absent", async () => {
    elements.biomes = makeEl();
    const result = await setLayerStrokeDasharrayTool.execute({
      layer: "biomes",
      dasharray: "2,2",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousDasharray).toBe(null);
    expect(elements.biomes?.attrs["stroke-dasharray"]).toBe("2,2");
  });

  it("errors when the element does not exist", async () => {
    const result = await setLayerStrokeDasharrayTool.execute({
      layer: "rivers",
      dasharray: "5,5",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("errors when document is unavailable (setDasharray throws)", async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;
    const result = await setLayerStrokeDasharrayTool.execute({
      layer: "rivers",
      dasharray: "5,5",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/document/);
  });

  it("maps 'state borders' through to the #borders element", async () => {
    elements.borders = makeEl("1");
    const result = await setLayerStrokeDasharrayTool.execute({
      layer: "state borders",
      dasharray: "10 5",
    });
    expect(result.isError).toBeFalsy();
    expect(elements.borders?.attrs["stroke-dasharray"]).toBe("10 5");
  });

  it("clearing writes an empty string attribute", async () => {
    elements.rivers = makeEl("5,5");
    const result = await setLayerStrokeDasharrayTool.execute({
      layer: "rivers",
      dasharray: "",
    });
    expect(result.isError).toBeFalsy();
    expect(elements.rivers?.attrs["stroke-dasharray"]).toBe("");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousDasharray: "5,5",
      dasharray: "",
    });
  });
});
