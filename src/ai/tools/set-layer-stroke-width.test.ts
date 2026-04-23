import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetLayerStrokeWidthTool,
  type LayerStrokeWidthRuntime,
  setLayerStrokeWidthTool,
  WIDTH_MAX,
  WIDTH_MIN,
} from "./set-layer-stroke-width";

function makeRuntime(previous: number | null = 1): {
  runtime: LayerStrokeWidthRuntime;
  readStrokeWidth: ReturnType<typeof vi.fn>;
  setStrokeWidth: ReturnType<typeof vi.fn>;
} {
  const readStrokeWidth = vi.fn((_id: string) => previous);
  const setStrokeWidth = vi.fn((_id: string, _width: number) => {});
  return {
    runtime: { readStrokeWidth, setStrokeWidth },
    readStrokeWidth,
    setStrokeWidth,
  };
}

describe("set_layer_stroke_width tool", () => {
  it("sets width 2 on the rivers layer", async () => {
    const { runtime, readStrokeWidth, setStrokeWidth } = makeRuntime(1);
    const tool = createSetLayerStrokeWidthTool(runtime);
    const result = await tool.execute({ layer: "rivers", width: 2 });
    expect(result.isError).toBeFalsy();
    expect(readStrokeWidth).toHaveBeenCalledWith("rivers");
    expect(setStrokeWidth).toHaveBeenCalledWith("rivers", 2);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousWidth: 1,
      width: 2,
    });
  });

  it("resolves alias 'state borders' to canonical 'borders' (svgId 'borders')", async () => {
    const { runtime, readStrokeWidth, setStrokeWidth } = makeRuntime(1);
    const tool = createSetLayerStrokeWidthTool(runtime);
    const result = await tool.execute({
      layer: "state borders",
      width: 1.5,
    });
    expect(result.isError).toBeFalsy();
    expect(readStrokeWidth).toHaveBeenCalledWith("borders");
    expect(setStrokeWidth).toHaveBeenCalledWith("borders", 1.5);
    expect(JSON.parse(result.content)).toMatchObject({
      layer: "borders",
      width: 1.5,
    });
  });

  it("maps canonical 'heightmap' to SVG id '#terrs'", async () => {
    const { runtime, setStrokeWidth } = makeRuntime(0.5);
    const tool = createSetLayerStrokeWidthTool(runtime);
    await tool.execute({ layer: "heightmap", width: 0.7 });
    expect(setStrokeWidth).toHaveBeenCalledWith("terrs", 0.7);
  });

  it("maps canonical 'burgs' to SVG id '#burgIcons'", async () => {
    const { runtime, setStrokeWidth } = makeRuntime(1);
    const tool = createSetLayerStrokeWidthTool(runtime);
    await tool.execute({ layer: "burgs", width: 0.8 });
    expect(setStrokeWidth).toHaveBeenCalledWith("burgIcons", 0.8);
  });

  it("maps 'cultures' → '#cults' and 'religions' → '#relig'", async () => {
    const { runtime, setStrokeWidth } = makeRuntime(1);
    const tool = createSetLayerStrokeWidthTool(runtime);
    await tool.execute({ layer: "cultures", width: 0.4 });
    await tool.execute({ layer: "religions", width: 0.6 });
    expect(setStrokeWidth).toHaveBeenNthCalledWith(1, "cults", 0.4);
    expect(setStrokeWidth).toHaveBeenNthCalledWith(2, "relig", 0.6);
  });

  it("accepts case-insensitive layer names", async () => {
    const { runtime, setStrokeWidth } = makeRuntime(1);
    const tool = createSetLayerStrokeWidthTool(runtime);
    const result = await tool.execute({ layer: "RIVERS", width: 0.25 });
    expect(result.isError).toBeFalsy();
    expect(setStrokeWidth).toHaveBeenCalledWith("rivers", 0.25);
    expect(JSON.parse(result.content)).toMatchObject({ layer: "rivers" });
  });

  it("accepts boundary width values 0 and 10", async () => {
    const { runtime, setStrokeWidth } = makeRuntime(0.5);
    const tool = createSetLayerStrokeWidthTool(runtime);
    const a = await tool.execute({ layer: "rivers", width: WIDTH_MIN });
    const b = await tool.execute({ layer: "rivers", width: WIDTH_MAX });
    expect(a.isError).toBeFalsy();
    expect(b.isError).toBeFalsy();
    expect(setStrokeWidth).toHaveBeenNthCalledWith(1, "rivers", 0);
    expect(setStrokeWidth).toHaveBeenNthCalledWith(2, "rivers", 10);
  });

  it("returns a structured error for unknown layer names", async () => {
    const { runtime, setStrokeWidth } = makeRuntime();
    const tool = createSetLayerStrokeWidthTool(runtime);
    const result = await tool.execute({ layer: "shadows", width: 0.5 });
    expect(result.isError).toBe(true);
    expect(setStrokeWidth).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("shadows");
    expect(Array.isArray(body.supported)).toBe(true);
    expect(body.supported).toContain("rivers");
  });

  it("rejects missing or empty layer", async () => {
    const { runtime } = makeRuntime();
    const tool = createSetLayerStrokeWidthTool(runtime);
    const a = await tool.execute({ width: 0.5 });
    const b = await tool.execute({ layer: "   ", width: 0.5 });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
  });

  it("rejects non-number / non-finite / out-of-range width", async () => {
    const { runtime, setStrokeWidth } = makeRuntime();
    const tool = createSetLayerStrokeWidthTool(runtime);
    const bad: unknown[] = [
      "2",
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0.1,
      10.1,
      {},
    ];
    for (const v of bad) {
      const result = await tool.execute({ layer: "rivers", width: v });
      expect(result.isError).toBe(true);
    }
    expect(setStrokeWidth).not.toHaveBeenCalled();
  });

  it("surfaces setStrokeWidth failures as errorResult", async () => {
    const runtime: LayerStrokeWidthRuntime = {
      readStrokeWidth: () => 1,
      setStrokeWidth: () => {
        throw new Error("Layer element #rivers not found in DOM.");
      },
    };
    const tool = createSetLayerStrokeWidthTool(runtime);
    const result = await tool.execute({ layer: "rivers", width: 0.5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("reports previousWidth: null when runtime.readStrokeWidth returns null", async () => {
    const { runtime } = makeRuntime(null);
    const tool = createSetLayerStrokeWidthTool(runtime);
    const result = await tool.execute({ layer: "rivers", width: 0.5 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousWidth: null,
      width: 0.5,
    });
  });

  it("exposes the expected tool name and schema", () => {
    expect(setLayerStrokeWidthTool.name).toBe("set_layer_stroke_width");
    expect(setLayerStrokeWidthTool.input_schema.required).toEqual([
      "layer",
      "width",
    ]);
  });
});

describe("defaultLayerStrokeWidthRuntime (integration)", () => {
  interface FakeEl {
    attrs: Record<string, string>;
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
  }

  const elements: Record<string, FakeEl> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;

  function makeEl(initialWidth?: string): FakeEl {
    const attrs: Record<string, string> = {};
    if (initialWidth !== undefined) attrs["stroke-width"] = initialWidth;
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

  it("writes the stroke-width attribute on the SVG element and returns previousWidth", async () => {
    elements.rivers = makeEl("0.8");
    const result = await setLayerStrokeWidthTool.execute({
      layer: "rivers",
      width: 2,
    });
    expect(result.isError).toBeFalsy();
    expect(elements.rivers?.attrs["stroke-width"]).toBe("2");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousWidth: 0.8,
      width: 2,
    });
  });

  it("returns previousWidth: null when the attribute is absent", async () => {
    elements.biomes = makeEl(); // no stroke-width attr
    const result = await setLayerStrokeWidthTool.execute({
      layer: "biomes",
      width: 0.2,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousWidth).toBe(null);
    expect(elements.biomes?.attrs["stroke-width"]).toBe("0.2");
  });

  it("returns previousWidth: null when the attribute is unparseable", async () => {
    elements.rivers = makeEl("garbage");
    const result = await setLayerStrokeWidthTool.execute({
      layer: "rivers",
      width: 0.3,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousWidth).toBe(null);
  });

  it("errors when the element does not exist", async () => {
    const result = await setLayerStrokeWidthTool.execute({
      layer: "rivers",
      width: 0.3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("errors when document is unavailable (setStrokeWidth throws)", async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;
    const result = await setLayerStrokeWidthTool.execute({
      layer: "rivers",
      width: 0.3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/document/);
  });

  it("maps 'state borders' through to the #borders element", async () => {
    elements.borders = makeEl("1");
    const result = await setLayerStrokeWidthTool.execute({
      layer: "state borders",
      width: 2.5,
    });
    expect(result.isError).toBeFalsy();
    expect(elements.borders?.attrs["stroke-width"]).toBe("2.5");
  });
});
