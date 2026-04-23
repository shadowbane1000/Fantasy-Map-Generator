import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetLayerFillTool,
  type LayerFillRuntime,
  setLayerFillTool,
} from "./set-layer-fill";

function makeRuntime(previous: string | null = "#111111"): {
  runtime: LayerFillRuntime;
  readFill: ReturnType<typeof vi.fn>;
  setFill: ReturnType<typeof vi.fn>;
} {
  const readFill = vi.fn((_id: string) => previous);
  const setFill = vi.fn((_id: string, _fill: string) => {});
  return {
    runtime: { readFill, setFill },
    readFill,
    setFill,
  };
}

describe("set_layer_fill tool", () => {
  it("sets fill '#ff0000' on the rivers layer", async () => {
    const { runtime, readFill, setFill } = makeRuntime("#0000ff");
    const tool = createSetLayerFillTool(runtime);
    const result = await tool.execute({ layer: "rivers", fill: "#ff0000" });
    expect(result.isError).toBeFalsy();
    expect(readFill).toHaveBeenCalledWith("rivers");
    expect(setFill).toHaveBeenCalledWith("rivers", "#ff0000");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousFill: "#0000ff",
      fill: "#ff0000",
    });
  });

  it("resolves alias 'state borders' to canonical 'borders' (svgId 'borders')", async () => {
    const { runtime, readFill, setFill } = makeRuntime("#000000");
    const tool = createSetLayerFillTool(runtime);
    const result = await tool.execute({
      layer: "state borders",
      fill: "#123456",
    });
    expect(result.isError).toBeFalsy();
    expect(readFill).toHaveBeenCalledWith("borders");
    expect(setFill).toHaveBeenCalledWith("borders", "#123456");
    expect(JSON.parse(result.content)).toMatchObject({
      layer: "borders",
      fill: "#123456",
    });
  });

  it("maps canonical 'heightmap' to SVG id '#terrs'", async () => {
    const { runtime, setFill } = makeRuntime(null);
    const tool = createSetLayerFillTool(runtime);
    await tool.execute({ layer: "heightmap", fill: "#abcdef" });
    expect(setFill).toHaveBeenCalledWith("terrs", "#abcdef");
  });

  it("maps canonical 'burgs' to SVG id '#burgIcons'", async () => {
    const { runtime, setFill } = makeRuntime(null);
    const tool = createSetLayerFillTool(runtime);
    await tool.execute({ layer: "burgs", fill: "#ffffff" });
    expect(setFill).toHaveBeenCalledWith("burgIcons", "#ffffff");
  });

  it("maps 'cultures' → '#cults' and 'religions' → '#relig'", async () => {
    const { runtime, setFill } = makeRuntime(null);
    const tool = createSetLayerFillTool(runtime);
    await tool.execute({ layer: "cultures", fill: "#111111" });
    await tool.execute({ layer: "religions", fill: "#222222" });
    expect(setFill).toHaveBeenNthCalledWith(1, "cults", "#111111");
    expect(setFill).toHaveBeenNthCalledWith(2, "relig", "#222222");
  });

  it("accepts case-insensitive layer names", async () => {
    const { runtime, setFill } = makeRuntime(null);
    const tool = createSetLayerFillTool(runtime);
    const result = await tool.execute({ layer: "RIVERS", fill: "#010203" });
    expect(result.isError).toBeFalsy();
    expect(setFill).toHaveBeenCalledWith("rivers", "#010203");
    expect(JSON.parse(result.content)).toMatchObject({ layer: "rivers" });
  });

  it("accepts rgb(), rgba(), hsl(), hsla(), and named colors", async () => {
    const { runtime, setFill } = makeRuntime(null);
    const tool = createSetLayerFillTool(runtime);
    const values = [
      "rgb(255, 0, 0)",
      "rgba(0, 255, 0, 0.5)",
      "hsl(120, 100%, 50%)",
      "hsla(200, 50%, 40%, 0.8)",
      "red",
      "cornflowerblue",
    ];
    for (const v of values) {
      const result = await tool.execute({ layer: "biomes", fill: v });
      expect(result.isError).toBeFalsy();
    }
    expect(setFill).toHaveBeenCalledTimes(values.length);
    for (let i = 0; i < values.length; i++) {
      expect(setFill).toHaveBeenNthCalledWith(i + 1, "biomes", values[i]);
    }
  });

  it("trims surrounding whitespace from the fill value", async () => {
    const { runtime, setFill } = makeRuntime(null);
    const tool = createSetLayerFillTool(runtime);
    const result = await tool.execute({
      layer: "rivers",
      fill: "  #abcdef  ",
    });
    expect(result.isError).toBeFalsy();
    expect(setFill).toHaveBeenCalledWith("rivers", "#abcdef");
    expect(JSON.parse(result.content).fill).toBe("#abcdef");
  });

  it("returns a structured error for unknown layer names", async () => {
    const { runtime, setFill } = makeRuntime();
    const tool = createSetLayerFillTool(runtime);
    const result = await tool.execute({ layer: "shadows", fill: "#ff0000" });
    expect(result.isError).toBe(true);
    expect(setFill).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("shadows");
    expect(Array.isArray(body.supported)).toBe(true);
    expect(body.supported).toContain("rivers");
  });

  it("rejects missing or empty layer", async () => {
    const { runtime } = makeRuntime();
    const tool = createSetLayerFillTool(runtime);
    const a = await tool.execute({ fill: "#ff0000" });
    const b = await tool.execute({ layer: "   ", fill: "#ff0000" });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
  });

  it("rejects missing / non-string / invalid CSS color fill", async () => {
    const { runtime, setFill } = makeRuntime();
    const tool = createSetLayerFillTool(runtime);
    const bad: unknown[] = [
      undefined,
      null,
      42,
      {},
      "",
      "   ",
      "not-a-color!!",
      "#zzz",
      "#12345",
      "rgb no parens",
    ];
    for (const v of bad) {
      const result = await tool.execute({ layer: "rivers", fill: v });
      expect(result.isError).toBe(true);
    }
    expect(setFill).not.toHaveBeenCalled();
  });

  it("surfaces setFill failures as errorResult", async () => {
    const runtime: LayerFillRuntime = {
      readFill: () => null,
      setFill: () => {
        throw new Error("Layer element #rivers not found in DOM.");
      },
    };
    const tool = createSetLayerFillTool(runtime);
    const result = await tool.execute({ layer: "rivers", fill: "#ff0000" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("reports previousFill: null when runtime.readFill returns null", async () => {
    const { runtime } = makeRuntime(null);
    const tool = createSetLayerFillTool(runtime);
    const result = await tool.execute({ layer: "rivers", fill: "#ff0000" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousFill: null,
      fill: "#ff0000",
    });
  });

  it("exposes the expected tool name and schema", () => {
    expect(setLayerFillTool.name).toBe("set_layer_fill");
    expect(setLayerFillTool.input_schema.required).toEqual(["layer", "fill"]);
  });
});

describe("defaultLayerFillRuntime (integration)", () => {
  interface FakeEl {
    attrs: Record<string, string>;
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
  }

  const elements: Record<string, FakeEl> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;

  function makeEl(initialFill?: string): FakeEl {
    const attrs: Record<string, string> = {};
    if (initialFill !== undefined) attrs.fill = initialFill;
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

  it("writes the fill attribute on the SVG element and returns previousFill", async () => {
    elements.rivers = makeEl("#0000ff");
    const result = await setLayerFillTool.execute({
      layer: "rivers",
      fill: "#ff0000",
    });
    expect(result.isError).toBeFalsy();
    expect(elements.rivers?.attrs.fill).toBe("#ff0000");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousFill: "#0000ff",
      fill: "#ff0000",
    });
  });

  it("returns previousFill: null when the attribute is absent", async () => {
    elements.biomes = makeEl(); // no fill attr
    const result = await setLayerFillTool.execute({
      layer: "biomes",
      fill: "#abcdef",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousFill).toBe(null);
    expect(elements.biomes?.attrs.fill).toBe("#abcdef");
  });

  it("errors when the element does not exist", async () => {
    const result = await setLayerFillTool.execute({
      layer: "rivers",
      fill: "#ff0000",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("errors when document is unavailable (setFill throws)", async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;
    const result = await setLayerFillTool.execute({
      layer: "rivers",
      fill: "#ff0000",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/document/);
  });

  it("maps 'state borders' through to the #borders element", async () => {
    elements.borders = makeEl("#000000");
    const result = await setLayerFillTool.execute({
      layer: "state borders",
      fill: "red",
    });
    expect(result.isError).toBeFalsy();
    expect(elements.borders?.attrs.fill).toBe("red");
  });
});
