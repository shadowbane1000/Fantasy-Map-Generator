import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetLayerStrokeColorTool,
  type LayerStrokeColorRuntime,
  setLayerStrokeColorTool,
} from "./set-layer-stroke-color";

function makeRuntime(previous: string | null = "#000000"): {
  runtime: LayerStrokeColorRuntime;
  readStroke: ReturnType<typeof vi.fn>;
  setStroke: ReturnType<typeof vi.fn>;
} {
  const readStroke = vi.fn((_id: string) => previous);
  const setStroke = vi.fn((_id: string, _stroke: string) => {});
  return {
    runtime: { readStroke, setStroke },
    readStroke,
    setStroke,
  };
}

describe("set_layer_stroke_color tool", () => {
  it("sets stroke on the rivers layer", async () => {
    const { runtime, readStroke, setStroke } = makeRuntime("#123456");
    const tool = createSetLayerStrokeColorTool(runtime);
    const result = await tool.execute({ layer: "rivers", stroke: "#ff0000" });
    expect(result.isError).toBeFalsy();
    expect(readStroke).toHaveBeenCalledWith("rivers");
    expect(setStroke).toHaveBeenCalledWith("rivers", "#ff0000");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousStroke: "#123456",
      stroke: "#ff0000",
    });
  });

  it("resolves alias 'state borders' to canonical 'borders' (svgId 'borders')", async () => {
    const { runtime, readStroke, setStroke } = makeRuntime("#aaa");
    const tool = createSetLayerStrokeColorTool(runtime);
    const result = await tool.execute({
      layer: "state borders",
      stroke: "#bbbbbb",
    });
    expect(result.isError).toBeFalsy();
    expect(readStroke).toHaveBeenCalledWith("borders");
    expect(setStroke).toHaveBeenCalledWith("borders", "#bbbbbb");
    expect(JSON.parse(result.content)).toMatchObject({
      layer: "borders",
      stroke: "#bbbbbb",
    });
  });

  it("maps canonical 'heightmap' to SVG id '#terrs'", async () => {
    const { runtime, setStroke } = makeRuntime("#000");
    const tool = createSetLayerStrokeColorTool(runtime);
    await tool.execute({ layer: "heightmap", stroke: "#112233" });
    expect(setStroke).toHaveBeenCalledWith("terrs", "#112233");
  });

  it("maps canonical 'burgs' to SVG id '#burgIcons'", async () => {
    const { runtime, setStroke } = makeRuntime("#000");
    const tool = createSetLayerStrokeColorTool(runtime);
    await tool.execute({ layer: "burgs", stroke: "navy" });
    expect(setStroke).toHaveBeenCalledWith("burgIcons", "navy");
  });

  it("maps 'cultures' → '#cults' and 'religions' → '#relig'", async () => {
    const { runtime, setStroke } = makeRuntime("#000");
    const tool = createSetLayerStrokeColorTool(runtime);
    await tool.execute({ layer: "cultures", stroke: "#abcdef" });
    await tool.execute({ layer: "religions", stroke: "#fedcba" });
    expect(setStroke).toHaveBeenNthCalledWith(1, "cults", "#abcdef");
    expect(setStroke).toHaveBeenNthCalledWith(2, "relig", "#fedcba");
  });

  it("accepts case-insensitive layer names", async () => {
    const { runtime, setStroke } = makeRuntime("#000");
    const tool = createSetLayerStrokeColorTool(runtime);
    const result = await tool.execute({ layer: "RIVERS", stroke: "#ff00ff" });
    expect(result.isError).toBeFalsy();
    expect(setStroke).toHaveBeenCalledWith("rivers", "#ff00ff");
    expect(JSON.parse(result.content)).toMatchObject({ layer: "rivers" });
  });

  it("accepts rgb(), rgba(), hsl(), hsla() and named colors", async () => {
    const { runtime, setStroke } = makeRuntime("#000");
    const tool = createSetLayerStrokeColorTool(runtime);
    const variants = [
      "rgb(10, 20, 30)",
      "rgba(10, 20, 30, 0.5)",
      "hsl(120, 50%, 50%)",
      "hsla(120, 50%, 50%, 0.5)",
      "red",
      "#abc",
      "#aabbcc",
      "#aabbccdd",
    ];
    for (const v of variants) {
      const r = await tool.execute({ layer: "rivers", stroke: v });
      expect(r.isError).toBeFalsy();
    }
    expect(setStroke).toHaveBeenCalledTimes(variants.length);
  });

  it("trims whitespace from the stroke value before writing", async () => {
    const { runtime, setStroke } = makeRuntime("#000");
    const tool = createSetLayerStrokeColorTool(runtime);
    const r = await tool.execute({ layer: "rivers", stroke: "  #112233  " });
    expect(r.isError).toBeFalsy();
    expect(setStroke).toHaveBeenCalledWith("rivers", "#112233");
  });

  it("returns a structured error for unknown layer names", async () => {
    const { runtime, setStroke } = makeRuntime();
    const tool = createSetLayerStrokeColorTool(runtime);
    const result = await tool.execute({ layer: "shadows", stroke: "#fff" });
    expect(result.isError).toBe(true);
    expect(setStroke).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("shadows");
    expect(Array.isArray(body.supported)).toBe(true);
    expect(body.supported).toContain("rivers");
  });

  it("rejects missing or empty layer", async () => {
    const { runtime } = makeRuntime();
    const tool = createSetLayerStrokeColorTool(runtime);
    const a = await tool.execute({ stroke: "#fff" });
    const b = await tool.execute({ layer: "   ", stroke: "#fff" });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
  });

  it("rejects non-string / empty / invalid stroke values", async () => {
    const { runtime, setStroke } = makeRuntime();
    const tool = createSetLayerStrokeColorTool(runtime);
    const bad: unknown[] = [
      undefined,
      null,
      "",
      "   ",
      123,
      {},
      "#gggggg",
      "not-a-color!",
      "rgb(",
    ];
    for (const v of bad) {
      const result = await tool.execute({ layer: "rivers", stroke: v });
      expect(result.isError).toBe(true);
    }
    expect(setStroke).not.toHaveBeenCalled();
  });

  it("surfaces setStroke failures as errorResult", async () => {
    const runtime: LayerStrokeColorRuntime = {
      readStroke: () => "#000",
      setStroke: () => {
        throw new Error("Layer element #rivers not found in DOM.");
      },
    };
    const tool = createSetLayerStrokeColorTool(runtime);
    const result = await tool.execute({ layer: "rivers", stroke: "#fff" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("reports previousStroke: null when runtime.readStroke returns null", async () => {
    const { runtime } = makeRuntime(null);
    const tool = createSetLayerStrokeColorTool(runtime);
    const result = await tool.execute({ layer: "rivers", stroke: "#fff" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousStroke: null,
      stroke: "#fff",
    });
  });

  it("exposes the expected tool name and schema", () => {
    expect(setLayerStrokeColorTool.name).toBe("set_layer_stroke_color");
    expect(setLayerStrokeColorTool.input_schema.required).toEqual([
      "layer",
      "stroke",
    ]);
  });
});

describe("defaultLayerStrokeColorRuntime (integration)", () => {
  interface FakeEl {
    attrs: Record<string, string>;
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
  }

  const elements: Record<string, FakeEl> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;

  function makeEl(initialStroke?: string): FakeEl {
    const attrs: Record<string, string> = {};
    if (initialStroke !== undefined) attrs.stroke = initialStroke;
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

  it("writes the stroke attribute on the SVG element and returns previousStroke", async () => {
    elements.rivers = makeEl("#0088ff");
    const result = await setLayerStrokeColorTool.execute({
      layer: "rivers",
      stroke: "#112233",
    });
    expect(result.isError).toBeFalsy();
    expect(elements.rivers?.attrs.stroke).toBe("#112233");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousStroke: "#0088ff",
      stroke: "#112233",
    });
  });

  it("returns previousStroke: null when the attribute is absent", async () => {
    elements.biomes = makeEl(); // no stroke attr
    const result = await setLayerStrokeColorTool.execute({
      layer: "biomes",
      stroke: "red",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousStroke).toBe(null);
    expect(elements.biomes?.attrs.stroke).toBe("red");
  });

  it("errors when the element does not exist", async () => {
    const result = await setLayerStrokeColorTool.execute({
      layer: "rivers",
      stroke: "#fff",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("errors when document is unavailable (setStroke throws)", async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;
    const result = await setLayerStrokeColorTool.execute({
      layer: "rivers",
      stroke: "#fff",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/document/);
  });

  it("maps 'state borders' through to the #borders element", async () => {
    elements.borders = makeEl("#111");
    const result = await setLayerStrokeColorTool.execute({
      layer: "state borders",
      stroke: "#abcdef",
    });
    expect(result.isError).toBeFalsy();
    expect(elements.borders?.attrs.stroke).toBe("#abcdef");
  });
});
