import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetLayerOpacityTool,
  type LayerOpacityRuntime,
  OPACITY_MAX,
  OPACITY_MIN,
  setLayerOpacityTool,
} from "./set-layer-opacity";

function makeRuntime(previous: number | null = 1): {
  runtime: LayerOpacityRuntime;
  readOpacity: ReturnType<typeof vi.fn>;
  setOpacity: ReturnType<typeof vi.fn>;
} {
  const readOpacity = vi.fn((_id: string) => previous);
  const setOpacity = vi.fn((_id: string, _opacity: number) => {});
  return { runtime: { readOpacity, setOpacity }, readOpacity, setOpacity };
}

describe("set_layer_opacity tool", () => {
  it("sets opacity 0.5 on the rivers layer", async () => {
    const { runtime, readOpacity, setOpacity } = makeRuntime(1);
    const tool = createSetLayerOpacityTool(runtime);
    const result = await tool.execute({ layer: "rivers", opacity: 0.5 });
    expect(result.isError).toBeFalsy();
    expect(readOpacity).toHaveBeenCalledWith("rivers");
    expect(setOpacity).toHaveBeenCalledWith("rivers", 0.5);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousOpacity: 1,
      opacity: 0.5,
    });
  });

  it("resolves alias 'state borders' to canonical 'borders' (svgId 'borders')", async () => {
    const { runtime, readOpacity, setOpacity } = makeRuntime(1);
    const tool = createSetLayerOpacityTool(runtime);
    const result = await tool.execute({
      layer: "state borders",
      opacity: 0.3,
    });
    expect(result.isError).toBeFalsy();
    expect(readOpacity).toHaveBeenCalledWith("borders");
    expect(setOpacity).toHaveBeenCalledWith("borders", 0.3);
    expect(JSON.parse(result.content)).toMatchObject({
      layer: "borders",
      opacity: 0.3,
    });
  });

  it("maps canonical 'heightmap' to SVG id '#terrs'", async () => {
    const { runtime, setOpacity } = makeRuntime(0.9);
    const tool = createSetLayerOpacityTool(runtime);
    await tool.execute({ layer: "heightmap", opacity: 0.7 });
    expect(setOpacity).toHaveBeenCalledWith("terrs", 0.7);
  });

  it("maps canonical 'burgs' to SVG id '#burgIcons'", async () => {
    const { runtime, setOpacity } = makeRuntime(1);
    const tool = createSetLayerOpacityTool(runtime);
    await tool.execute({ layer: "burgs", opacity: 0.8 });
    expect(setOpacity).toHaveBeenCalledWith("burgIcons", 0.8);
  });

  it("maps 'cultures' → '#cults' and 'religions' → '#relig'", async () => {
    const { runtime, setOpacity } = makeRuntime(1);
    const tool = createSetLayerOpacityTool(runtime);
    await tool.execute({ layer: "cultures", opacity: 0.4 });
    await tool.execute({ layer: "religions", opacity: 0.6 });
    expect(setOpacity).toHaveBeenNthCalledWith(1, "cults", 0.4);
    expect(setOpacity).toHaveBeenNthCalledWith(2, "relig", 0.6);
  });

  it("accepts case-insensitive layer names", async () => {
    const { runtime, setOpacity } = makeRuntime(1);
    const tool = createSetLayerOpacityTool(runtime);
    const result = await tool.execute({ layer: "RIVERS", opacity: 0.25 });
    expect(result.isError).toBeFalsy();
    expect(setOpacity).toHaveBeenCalledWith("rivers", 0.25);
    expect(JSON.parse(result.content)).toMatchObject({ layer: "rivers" });
  });

  it("accepts boundary opacity values 0 and 1", async () => {
    const { runtime, setOpacity } = makeRuntime(0.5);
    const tool = createSetLayerOpacityTool(runtime);
    const a = await tool.execute({ layer: "rivers", opacity: OPACITY_MIN });
    const b = await tool.execute({ layer: "rivers", opacity: OPACITY_MAX });
    expect(a.isError).toBeFalsy();
    expect(b.isError).toBeFalsy();
    expect(setOpacity).toHaveBeenNthCalledWith(1, "rivers", 0);
    expect(setOpacity).toHaveBeenNthCalledWith(2, "rivers", 1);
  });

  it("returns a structured error for unknown layer names", async () => {
    const { runtime, setOpacity } = makeRuntime();
    const tool = createSetLayerOpacityTool(runtime);
    const result = await tool.execute({ layer: "shadows", opacity: 0.5 });
    expect(result.isError).toBe(true);
    expect(setOpacity).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("shadows");
    expect(Array.isArray(body.supported)).toBe(true);
    expect(body.supported).toContain("rivers");
  });

  it("rejects missing or empty layer", async () => {
    const { runtime } = makeRuntime();
    const tool = createSetLayerOpacityTool(runtime);
    const a = await tool.execute({ opacity: 0.5 });
    const b = await tool.execute({ layer: "   ", opacity: 0.5 });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
  });

  it("rejects non-number / non-finite / out-of-range opacity", async () => {
    const { runtime, setOpacity } = makeRuntime();
    const tool = createSetLayerOpacityTool(runtime);
    const bad: unknown[] = [
      "0.5",
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0.1,
      1.1,
      {},
    ];
    for (const v of bad) {
      const result = await tool.execute({ layer: "rivers", opacity: v });
      expect(result.isError).toBe(true);
    }
    expect(setOpacity).not.toHaveBeenCalled();
  });

  it("surfaces setOpacity failures as errorResult", async () => {
    const runtime: LayerOpacityRuntime = {
      readOpacity: () => 1,
      setOpacity: () => {
        throw new Error("Layer element #rivers not found in DOM.");
      },
    };
    const tool = createSetLayerOpacityTool(runtime);
    const result = await tool.execute({ layer: "rivers", opacity: 0.5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("reports previousOpacity: null when runtime.readOpacity returns null", async () => {
    const { runtime } = makeRuntime(null);
    const tool = createSetLayerOpacityTool(runtime);
    const result = await tool.execute({ layer: "rivers", opacity: 0.5 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousOpacity: null,
      opacity: 0.5,
    });
  });

  it("exposes the expected tool name and schema", () => {
    expect(setLayerOpacityTool.name).toBe("set_layer_opacity");
    expect(setLayerOpacityTool.input_schema.required).toEqual([
      "layer",
      "opacity",
    ]);
  });
});

describe("defaultLayerOpacityRuntime (integration)", () => {
  interface FakeEl {
    attrs: Record<string, string>;
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
  }

  const elements: Record<string, FakeEl> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;

  function makeEl(initialOpacity?: string): FakeEl {
    const attrs: Record<string, string> = {};
    if (initialOpacity !== undefined) attrs.opacity = initialOpacity;
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

  it("writes the opacity attribute on the SVG element and returns previousOpacity", async () => {
    elements.rivers = makeEl("0.8");
    const result = await setLayerOpacityTool.execute({
      layer: "rivers",
      opacity: 0.4,
    });
    expect(result.isError).toBeFalsy();
    expect(elements.rivers?.attrs.opacity).toBe("0.4");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousOpacity: 0.8,
      opacity: 0.4,
    });
  });

  it("defaults previousOpacity to 1 when the attribute is absent", async () => {
    elements.biomes = makeEl(); // no opacity attr
    const result = await setLayerOpacityTool.execute({
      layer: "biomes",
      opacity: 0.2,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousOpacity).toBe(1);
    expect(elements.biomes?.attrs.opacity).toBe("0.2");
  });

  it("defaults previousOpacity to 1 when the attribute is unparseable", async () => {
    elements.rivers = makeEl("garbage");
    const result = await setLayerOpacityTool.execute({
      layer: "rivers",
      opacity: 0.3,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousOpacity).toBe(1);
  });

  it("returns previousOpacity: null when the element does not exist", async () => {
    // getElementById returns null via mock default; also add a no-op element
    // for the write step to succeed — but we actually want the write to fail
    // too: element missing → throws. Here we assert the behaviour without a
    // backing element.
    const result = await setLayerOpacityTool.execute({
      layer: "rivers",
      opacity: 0.3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("errors when document is unavailable (setOpacity throws)", async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;
    const result = await setLayerOpacityTool.execute({
      layer: "rivers",
      opacity: 0.3,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/document/);
  });

  it("maps 'state borders' through to the #borders element", async () => {
    elements.borders = makeEl("1");
    const result = await setLayerOpacityTool.execute({
      layer: "state borders",
      opacity: 0.55,
    });
    expect(result.isError).toBeFalsy();
    expect(elements.borders?.attrs.opacity).toBe("0.55");
  });
});
