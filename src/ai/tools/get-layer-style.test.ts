import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGetLayerStyleTool,
  getLayerStyleTool,
  type LayerStyleAttrs,
  type LayerStyleRuntime,
} from "./get-layer-style";

function makeRuntime(attrs: LayerStyleAttrs | null = null): {
  runtime: LayerStyleRuntime;
  read: ReturnType<typeof vi.fn>;
} {
  const read = vi.fn((_id: string) => attrs);
  return { runtime: { read }, read };
}

const EMPTY_ATTRS: LayerStyleAttrs = {
  opacity: null,
  fill: null,
  stroke: null,
  strokeWidth: null,
  strokeDasharray: null,
  filter: null,
};

describe("get_layer_style tool", () => {
  it("reads all six style attributes on a fully-styled layer", async () => {
    const attrs: LayerStyleAttrs = {
      opacity: 0.8,
      fill: "#336699",
      stroke: "#000000",
      strokeWidth: 1.2,
      strokeDasharray: "5,5",
      filter: "url(#dropShadow)",
    };
    const { runtime, read } = makeRuntime(attrs);
    const tool = createGetLayerStyleTool(runtime);
    const result = await tool.execute({ layer: "rivers" });
    expect(result.isError).toBeFalsy();
    expect(read).toHaveBeenCalledWith("rivers");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      opacity: 0.8,
      fill: "#336699",
      stroke: "#000000",
      strokeWidth: 1.2,
      strokeDasharray: "5,5",
      filter: "url(#dropShadow)",
    });
  });

  it("resolves alias 'state borders' to canonical 'borders' (svgId 'borders')", async () => {
    const { runtime, read } = makeRuntime(EMPTY_ATTRS);
    const tool = createGetLayerStyleTool(runtime);
    const result = await tool.execute({ layer: "state borders" });
    expect(result.isError).toBeFalsy();
    expect(read).toHaveBeenCalledWith("borders");
    expect(JSON.parse(result.content)).toMatchObject({ layer: "borders" });
  });

  it("maps canonical 'heightmap' to SVG id '#terrs'", async () => {
    const { runtime, read } = makeRuntime(EMPTY_ATTRS);
    const tool = createGetLayerStyleTool(runtime);
    await tool.execute({ layer: "heightmap" });
    expect(read).toHaveBeenCalledWith("terrs");
  });

  it("maps canonical 'burgs' to SVG id '#burgIcons'", async () => {
    const { runtime, read } = makeRuntime(EMPTY_ATTRS);
    const tool = createGetLayerStyleTool(runtime);
    await tool.execute({ layer: "burgs" });
    expect(read).toHaveBeenCalledWith("burgIcons");
  });

  it("maps 'states' → '#regions', 'cultures' → '#cults', 'religions' → '#relig'", async () => {
    const { runtime, read } = makeRuntime(EMPTY_ATTRS);
    const tool = createGetLayerStyleTool(runtime);
    await tool.execute({ layer: "states" });
    await tool.execute({ layer: "cultures" });
    await tool.execute({ layer: "religions" });
    expect(read).toHaveBeenNthCalledWith(1, "regions");
    expect(read).toHaveBeenNthCalledWith(2, "cults");
    expect(read).toHaveBeenNthCalledWith(3, "relig");
  });

  it("accepts case-insensitive layer names", async () => {
    const { runtime, read } = makeRuntime(EMPTY_ATTRS);
    const tool = createGetLayerStyleTool(runtime);
    const result = await tool.execute({ layer: "RIVERS" });
    expect(result.isError).toBeFalsy();
    expect(read).toHaveBeenCalledWith("rivers");
    expect(JSON.parse(result.content)).toMatchObject({ layer: "rivers" });
  });

  it("returns all-null fields for a layer with no style attrs", async () => {
    const { runtime } = makeRuntime(EMPTY_ATTRS);
    const tool = createGetLayerStyleTool(runtime);
    const result = await tool.execute({ layer: "biomes" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "biomes",
      opacity: null,
      fill: null,
      stroke: null,
      strokeWidth: null,
      strokeDasharray: null,
      filter: null,
    });
  });

  it("returns a structured error for unknown layer names", async () => {
    const { runtime, read } = makeRuntime(EMPTY_ATTRS);
    const tool = createGetLayerStyleTool(runtime);
    const result = await tool.execute({ layer: "shadows" });
    expect(result.isError).toBe(true);
    expect(read).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("shadows");
    expect(Array.isArray(body.supported)).toBe(true);
    expect(body.supported).toContain("rivers");
  });

  it("rejects missing or empty layer", async () => {
    const { runtime } = makeRuntime(EMPTY_ATTRS);
    const tool = createGetLayerStyleTool(runtime);
    const a = await tool.execute({});
    const b = await tool.execute({ layer: "   " });
    const c = await tool.execute({ layer: 42 });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(c.isError).toBe(true);
  });

  it("returns an error when the runtime reports no element (read returns null)", async () => {
    const { runtime } = makeRuntime(null);
    const tool = createGetLayerStyleTool(runtime);
    const result = await tool.execute({ layer: "rivers" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("exposes the expected tool name and schema", () => {
    expect(getLayerStyleTool.name).toBe("get_layer_style");
    expect(getLayerStyleTool.input_schema.required).toEqual(["layer"]);
  });
});

describe("defaultLayerStyleRuntime (integration)", () => {
  interface FakeEl {
    attrs: Record<string, string>;
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
  }

  const elements: Record<string, FakeEl> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;

  function makeEl(attrs: Record<string, string> = {}): FakeEl {
    const copy: Record<string, string> = { ...attrs };
    return {
      attrs: copy,
      getAttribute(name: string): string | null {
        return Object.hasOwn(copy, name) ? copy[name] : null;
      },
      setAttribute(name: string, value: string): void {
        copy[name] = value;
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

  it("reads every attribute from a fully-styled element", async () => {
    elements.rivers = makeEl({
      opacity: "0.8",
      fill: "#336699",
      stroke: "#000000",
      "stroke-width": "1.25",
      "stroke-dasharray": "5,5",
      filter: "url(#dropShadow)",
    });
    const result = await getLayerStyleTool.execute({ layer: "rivers" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      opacity: 0.8,
      fill: "#336699",
      stroke: "#000000",
      strokeWidth: 1.25,
      strokeDasharray: "5,5",
      filter: "url(#dropShadow)",
    });
  });

  it("returns all-null fields when the element has no attributes", async () => {
    elements.biomes = makeEl();
    const result = await getLayerStyleTool.execute({ layer: "biomes" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "biomes",
      opacity: null,
      fill: null,
      stroke: null,
      strokeWidth: null,
      strokeDasharray: null,
      filter: null,
    });
  });

  it("yields null for unparseable numeric attrs (opacity / stroke-width)", async () => {
    elements.rivers = makeEl({
      opacity: "garbage",
      "stroke-width": "also-garbage",
    });
    const result = await getLayerStyleTool.execute({ layer: "rivers" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.opacity).toBeNull();
    expect(body.strokeWidth).toBeNull();
  });

  it("normalises empty-string attrs to null", async () => {
    elements.rivers = makeEl({
      fill: "",
      stroke: "",
      "stroke-dasharray": "",
      filter: "",
    });
    const result = await getLayerStyleTool.execute({ layer: "rivers" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.fill).toBeNull();
    expect(body.stroke).toBeNull();
    expect(body.strokeDasharray).toBeNull();
    expect(body.filter).toBeNull();
  });

  it("errors when the element does not exist", async () => {
    const result = await getLayerStyleTool.execute({ layer: "markers" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("errors when document is unavailable", async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;
    const result = await getLayerStyleTool.execute({ layer: "rivers" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("resolves 'state borders' through the #borders element", async () => {
    elements.borders = makeEl({ opacity: "0.5", stroke: "#222" });
    const result = await getLayerStyleTool.execute({ layer: "state borders" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      layer: "borders",
      opacity: 0.5,
      stroke: "#222",
    });
  });
});
