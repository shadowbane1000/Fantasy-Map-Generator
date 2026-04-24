import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGetLayerVisibilityTool,
  getLayerVisibilityTool,
  type LayerVisibilityRuntime,
} from "./get-layer-visibility";
import { LAYER_SPECS } from "./set-layer-visibility";

function makeRuntime(state: Record<string, boolean> = {}): {
  runtime: LayerVisibilityRuntime;
  isOn: ReturnType<typeof vi.fn>;
} {
  const isOn = vi.fn((id: string) => !!state[id]);
  return { runtime: { isOn }, isOn };
}

describe("get_layer_visibility tool", () => {
  it("returns every layer in canonical order when no `layer` argument is passed", async () => {
    // Alternate on/off across every spec so ordering and values are both
    // pinned down.
    const state: Record<string, boolean> = {};
    LAYER_SPECS.forEach((spec, i) => {
      state[spec.buttonId] = i % 2 === 0;
    });
    const { runtime, isOn } = makeRuntime(state);
    const tool = createGetLayerVisibilityTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content) as {
      ok: boolean;
      layers: { layer: string; visible: boolean }[];
    };
    expect(body.ok).toBe(true);
    expect(body.layers.length).toBe(LAYER_SPECS.length);
    // Canonical order preserved.
    expect(body.layers.map((l) => l.layer)).toEqual(
      LAYER_SPECS.map((s) => s.canonical),
    );
    // Alternating pattern preserved.
    expect(body.layers.map((l) => l.visible)).toEqual(
      LAYER_SPECS.map((_, i) => i % 2 === 0),
    );
    // Runtime was consulted once per layer.
    expect(isOn).toHaveBeenCalledTimes(LAYER_SPECS.length);
  });

  it("treats a null / undefined `layer` the same as omitted", async () => {
    const { runtime, isOn } = makeRuntime({});
    const tool = createGetLayerVisibilityTool(runtime);

    const a = await tool.execute({ layer: undefined });
    const b = await tool.execute({ layer: null });
    expect(a.isError).toBeFalsy();
    expect(b.isError).toBeFalsy();
    expect(JSON.parse(a.content).layers.length).toBe(LAYER_SPECS.length);
    expect(JSON.parse(b.content).layers.length).toBe(LAYER_SPECS.length);
    expect(isOn).toHaveBeenCalledTimes(LAYER_SPECS.length * 2);
  });

  it("returns a single-entry array for a named layer", async () => {
    const { runtime, isOn } = makeRuntime({ toggleRivers: true });
    const tool = createGetLayerVisibilityTool(runtime);

    const result = await tool.execute({ layer: "rivers" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layers: [{ layer: "rivers", visible: true }],
    });
    expect(isOn).toHaveBeenCalledTimes(1);
    expect(isOn).toHaveBeenCalledWith("toggleRivers");
  });

  it("resolves alias 'state borders' → canonical 'borders'", async () => {
    const { runtime, isOn } = makeRuntime({ toggleBorders: false });
    const tool = createGetLayerVisibilityTool(runtime);

    const result = await tool.execute({ layer: "state borders" });
    expect(result.isError).toBeFalsy();
    expect(isOn).toHaveBeenCalledWith("toggleBorders");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layers: [{ layer: "borders", visible: false }],
    });
  });

  it("accepts case-insensitive layer names", async () => {
    const { runtime } = makeRuntime({ toggleRivers: true });
    const tool = createGetLayerVisibilityTool(runtime);

    const result = await tool.execute({ layer: "RIVERS" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      layers: [{ layer: "rivers", visible: true }],
    });
  });

  it("trims whitespace around the layer name", async () => {
    const { runtime } = makeRuntime({ toggleBiomes: true });
    const tool = createGetLayerVisibilityTool(runtime);

    const result = await tool.execute({ layer: "  biomes  " });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      layers: [{ layer: "biomes", visible: true }],
    });
  });

  it("returns a structured error for unknown layer names", async () => {
    const { runtime, isOn } = makeRuntime({});
    const tool = createGetLayerVisibilityTool(runtime);

    const result = await tool.execute({ layer: "shadows" });
    expect(result.isError).toBe(true);
    expect(isOn).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("shadows");
    expect(Array.isArray(body.supported)).toBe(true);
    expect(body.supported).toContain("rivers");
    expect(body.supported).toContain("borders");
  });

  it("rejects an empty / whitespace-only `layer`", async () => {
    const { runtime, isOn } = makeRuntime({});
    const tool = createGetLayerVisibilityTool(runtime);

    const a = await tool.execute({ layer: "" });
    const b = await tool.execute({ layer: "   " });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(isOn).not.toHaveBeenCalled();
  });

  it("rejects a non-string `layer`", async () => {
    const { runtime, isOn } = makeRuntime({});
    const tool = createGetLayerVisibilityTool(runtime);

    const result = await tool.execute({ layer: 42 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toContain("string");
    expect(isOn).not.toHaveBeenCalled();
  });

  it("exposes the expected tool name and schema", () => {
    expect(getLayerVisibilityTool.name).toBe("get_layer_visibility");
    // `layer` is optional — no required array, or an empty one.
    const required = getLayerVisibilityTool.input_schema.required;
    expect(required === undefined || required.length === 0).toBe(true);
  });
});

describe("defaultLayerVisibilityRuntime (integration)", () => {
  interface FakeEl {
    classList: { contains: (cls: string) => boolean };
  }

  const elements: Record<string, FakeEl> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;
  const originalLayerIsOn = (globalThis as unknown as { layerIsOn?: unknown })
    .layerIsOn;

  function makeEl(off: boolean): FakeEl {
    const classes = new Set<string>();
    if (off) classes.add("buttonoff");
    return { classList: { contains: (c: string) => classes.has(c) } };
  }

  beforeEach(() => {
    getElementById.mockClear();
    for (const k of Object.keys(elements)) delete elements[k];
    (globalThis as unknown as { document?: unknown }).document = {
      getElementById,
    };
    // Ensure no globally-installed layerIsOn bleeds in from other tests.
    (globalThis as unknown as { layerIsOn?: unknown }).layerIsOn = undefined;
  });

  afterEach(() => {
    (globalThis as unknown as { document?: unknown }).document = originalDoc;
    (globalThis as unknown as { layerIsOn?: unknown }).layerIsOn =
      originalLayerIsOn;
  });

  it("prefers a globally-installed `layerIsOn` helper when present", async () => {
    const fn = vi.fn((id: string) => id === "toggleRivers");
    (
      globalThis as unknown as { layerIsOn: (id: string) => boolean }
    ).layerIsOn = fn;
    const result = await getLayerVisibilityTool.execute({ layer: "rivers" });
    expect(result.isError).toBeFalsy();
    expect(fn).toHaveBeenCalledWith("toggleRivers");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layers: [{ layer: "rivers", visible: true }],
    });
    // Falls through to window when the element lookup was never needed.
    expect(getElementById).not.toHaveBeenCalled();
  });

  it("falls back to reading `.buttonoff` on the DOM button when no helper is installed", async () => {
    elements.toggleRivers = makeEl(false);
    elements.toggleBorders = makeEl(true);
    const rivers = await getLayerVisibilityTool.execute({ layer: "rivers" });
    const borders = await getLayerVisibilityTool.execute({ layer: "borders" });
    expect(JSON.parse(rivers.content)).toMatchObject({
      layers: [{ layer: "rivers", visible: true }],
    });
    expect(JSON.parse(borders.content)).toMatchObject({
      layers: [{ layer: "borders", visible: false }],
    });
  });

  it("reports hidden when the button element is missing from the DOM", async () => {
    // No entry in `elements` → getElementById returns null → visible=false.
    const result = await getLayerVisibilityTool.execute({ layer: "rivers" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      layers: [{ layer: "rivers", visible: false }],
    });
  });

  it("reports hidden for every layer when `document` is unavailable", async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;
    const result = await getLayerVisibilityTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content) as {
      layers: { visible: boolean }[];
    };
    expect(body.layers.every((l) => l.visible === false)).toBe(true);
  });

  it("returns every layer when invoked with no args", async () => {
    // Mark rivers on, everything else off.
    for (const spec of LAYER_SPECS) {
      elements[spec.buttonId] = makeEl(spec.canonical !== "rivers");
    }
    const result = await getLayerVisibilityTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content) as {
      layers: { layer: string; visible: boolean }[];
    };
    expect(body.layers.length).toBe(LAYER_SPECS.length);
    const rivers = body.layers.find((l) => l.layer === "rivers");
    expect(rivers?.visible).toBe(true);
    const others = body.layers.filter((l) => l.layer !== "rivers");
    expect(others.every((l) => l.visible === false)).toBe(true);
  });
});
