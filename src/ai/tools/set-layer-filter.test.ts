import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetLayerFilterTool,
  FILTER_IDS,
  type LayerFilterRuntime,
  setLayerFilterTool,
} from "./set-layer-filter";

function makeRuntime(previous: string | null = null): {
  runtime: LayerFilterRuntime;
  readFilter: ReturnType<typeof vi.fn>;
  setFilter: ReturnType<typeof vi.fn>;
} {
  const readFilter = vi.fn((_id: string) => previous);
  const setFilter = vi.fn((_id: string, _filter: string) => {});
  return {
    runtime: { readFilter, setFilter },
    readFilter,
    setFilter,
  };
}

describe("set_layer_filter tool", () => {
  it("sets filter=url(#dropShadow) on #rivers for layer 'rivers'", async () => {
    const { runtime, readFilter, setFilter } = makeRuntime(null);
    const tool = createSetLayerFilterTool(runtime);
    const result = await tool.execute({
      layer: "rivers",
      filter: "dropShadow",
    });
    expect(result.isError).toBeFalsy();
    expect(readFilter).toHaveBeenCalledWith("rivers");
    expect(setFilter).toHaveBeenCalledWith("rivers", "url(#dropShadow)");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousFilter: null,
      filter: "url(#dropShadow)",
    });
  });

  it("resolves alias 'sepia' → filter-sepia", async () => {
    const { runtime, setFilter } = makeRuntime(null);
    const tool = createSetLayerFilterTool(runtime);
    await tool.execute({ layer: "biomes", filter: "sepia" });
    expect(setFilter).toHaveBeenCalledWith("biomes", "url(#filter-sepia)");
  });

  it("resolves alias 'grayscale' and 'greyscale' → filter-grayscale", async () => {
    const a = makeRuntime();
    const toolA = createSetLayerFilterTool(a.runtime);
    await toolA.execute({ layer: "biomes", filter: "grayscale" });
    expect(a.setFilter).toHaveBeenCalledWith(
      "biomes",
      "url(#filter-grayscale)",
    );

    const b = makeRuntime();
    const toolB = createSetLayerFilterTool(b.runtime);
    await toolB.execute({ layer: "biomes", filter: "greyscale" });
    expect(b.setFilter).toHaveBeenCalledWith(
      "biomes",
      "url(#filter-grayscale)",
    );
  });

  it("resolves alias 'shadow' and 'drop shadow' → dropShadow", async () => {
    const a = makeRuntime();
    const toolA = createSetLayerFilterTool(a.runtime);
    await toolA.execute({ layer: "markers", filter: "shadow" });
    expect(a.setFilter).toHaveBeenCalledWith("markers", "url(#dropShadow)");

    const b = makeRuntime();
    const toolB = createSetLayerFilterTool(b.runtime);
    await toolB.execute({ layer: "markers", filter: "drop shadow" });
    expect(b.setFilter).toHaveBeenCalledWith("markers", "url(#dropShadow)");
  });

  it("resolves alias 'blur' → blur3", async () => {
    const { runtime, setFilter } = makeRuntime();
    const tool = createSetLayerFilterTool(runtime);
    await tool.execute({ layer: "rivers", filter: "blur" });
    expect(setFilter).toHaveBeenCalledWith("rivers", "url(#blur3)");
  });

  it("accepts raw ids like 'crumpled' and 'dropShadow05'", async () => {
    const { runtime, setFilter } = makeRuntime();
    const tool = createSetLayerFilterTool(runtime);
    await tool.execute({ layer: "rivers", filter: "crumpled" });
    expect(setFilter).toHaveBeenCalledWith("rivers", "url(#crumpled)");
    await tool.execute({ layer: "rivers", filter: "dropShadow05" });
    expect(setFilter).toHaveBeenCalledWith("rivers", "url(#dropShadow05)");
  });

  it("clears the filter when filter='' or 'none'", async () => {
    const { runtime, setFilter } = makeRuntime("url(#paper)");
    const tool = createSetLayerFilterTool(runtime);
    const r1 = await tool.execute({ layer: "rivers", filter: "" });
    expect(r1.isError).toBeFalsy();
    expect(setFilter).toHaveBeenLastCalledWith("rivers", "");
    expect(JSON.parse(r1.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousFilter: "url(#paper)",
      filter: "",
    });

    const r2 = await tool.execute({ layer: "rivers", filter: "none" });
    expect(r2.isError).toBeFalsy();
    expect(setFilter).toHaveBeenLastCalledWith("rivers", "");
  });

  it("is case-insensitive for layer names and filter aliases", async () => {
    const { runtime, setFilter } = makeRuntime();
    const tool = createSetLayerFilterTool(runtime);
    const result = await tool.execute({
      layer: "RIVERS",
      filter: "SEPIA",
    });
    expect(result.isError).toBeFalsy();
    expect(setFilter).toHaveBeenCalledWith("rivers", "url(#filter-sepia)");
    expect(JSON.parse(result.content)).toMatchObject({ layer: "rivers" });
  });

  it("resolves canonical layer alias 'state borders' → #borders", async () => {
    const { runtime, setFilter } = makeRuntime();
    const tool = createSetLayerFilterTool(runtime);
    await tool.execute({ layer: "state borders", filter: "dropShadow" });
    expect(setFilter).toHaveBeenCalledWith("borders", "url(#dropShadow)");
  });

  it("resolves 'heightmap' → #terrs", async () => {
    const { runtime, setFilter } = makeRuntime();
    const tool = createSetLayerFilterTool(runtime);
    await tool.execute({ layer: "heightmap", filter: "paper" });
    expect(setFilter).toHaveBeenCalledWith("terrs", "url(#paper)");
  });

  it("returns previousFilter from runtime", async () => {
    const { runtime } = makeRuntime("url(#blur3)");
    const tool = createSetLayerFilterTool(runtime);
    const result = await tool.execute({
      layer: "rivers",
      filter: "dropShadow",
    });
    expect(JSON.parse(result.content).previousFilter).toBe("url(#blur3)");
  });

  it("errors on missing/empty/non-string layer", async () => {
    const { runtime, setFilter } = makeRuntime();
    const tool = createSetLayerFilterTool(runtime);
    const a = await tool.execute({ filter: "dropShadow" });
    const b = await tool.execute({ layer: "   ", filter: "dropShadow" });
    const c = await tool.execute({ layer: 42, filter: "dropShadow" });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(c.isError).toBe(true);
    expect(setFilter).not.toHaveBeenCalled();
  });

  it("errors on non-string filter (missing/number)", async () => {
    const { runtime, setFilter } = makeRuntime();
    const tool = createSetLayerFilterTool(runtime);
    const a = await tool.execute({ layer: "rivers" });
    const b = await tool.execute({ layer: "rivers", filter: 7 });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(setFilter).not.toHaveBeenCalled();
  });

  it("errors on unknown filter id with supported list", async () => {
    const { runtime, setFilter } = makeRuntime();
    const tool = createSetLayerFilterTool(runtime);
    const result = await tool.execute({
      layer: "rivers",
      filter: "nonexistent",
    });
    expect(result.isError).toBe(true);
    expect(setFilter).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("nonexistent");
    expect(Array.isArray(body.supported)).toBe(true);
    expect(body.supported).toContain("dropShadow");
    expect(body.supported).toContain("filter-sepia");
  });

  it("errors on unknown layer with supported list", async () => {
    const { runtime, setFilter } = makeRuntime();
    const tool = createSetLayerFilterTool(runtime);
    const result = await tool.execute({
      layer: "nope",
      filter: "dropShadow",
    });
    expect(result.isError).toBe(true);
    expect(setFilter).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.error).toContain("nope");
    expect(body.supported).toContain("rivers");
  });

  it("surfaces setFilter failures as errorResult", async () => {
    const runtime: LayerFilterRuntime = {
      readFilter: () => null,
      setFilter: () => {
        throw new Error("Layer element #rivers not found in DOM.");
      },
    };
    const tool = createSetLayerFilterTool(runtime);
    const result = await tool.execute({
      layer: "rivers",
      filter: "dropShadow",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("exposes the expected tool name and schema", () => {
    expect(setLayerFilterTool.name).toBe("set_layer_filter");
    expect(setLayerFilterTool.input_schema.required).toEqual([
      "layer",
      "filter",
    ]);
  });

  it("exports FILTER_IDS covering the known filter set", () => {
    expect(FILTER_IDS).toContain("dropShadow");
    expect(FILTER_IDS).toContain("filter-sepia");
    expect(FILTER_IDS).toContain("filter-grayscale");
    expect(FILTER_IDS).toContain("crumpled");
    expect(FILTER_IDS).toContain("paper");
    expect(FILTER_IDS).toContain("blur3");
    expect(FILTER_IDS.length).toBe(20);
  });
});

describe("defaultLayerFilterRuntime (integration)", () => {
  interface FakeEl {
    attrs: Record<string, string>;
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
  }

  const elements: Record<string, FakeEl> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;

  function makeEl(initialFilter?: string): FakeEl {
    const attrs: Record<string, string> = {};
    if (initialFilter !== undefined) attrs.filter = initialFilter;
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

  it("writes the filter attribute on the SVG element and reports previousFilter", async () => {
    elements.rivers = makeEl("url(#blur3)");
    const result = await setLayerFilterTool.execute({
      layer: "rivers",
      filter: "dropShadow",
    });
    expect(result.isError).toBeFalsy();
    expect(elements.rivers?.attrs.filter).toBe("url(#dropShadow)");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousFilter: "url(#blur3)",
      filter: "url(#dropShadow)",
    });
  });

  it("reports previousFilter: null when the attribute is absent", async () => {
    elements.biomes = makeEl();
    const result = await setLayerFilterTool.execute({
      layer: "biomes",
      filter: "sepia",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousFilter).toBeNull();
    expect(elements.biomes?.attrs.filter).toBe("url(#filter-sepia)");
  });

  it("clears via 'none' on an element that already had a filter", async () => {
    elements.rivers = makeEl("url(#paper)");
    const result = await setLayerFilterTool.execute({
      layer: "rivers",
      filter: "none",
    });
    expect(result.isError).toBeFalsy();
    expect(elements.rivers?.attrs.filter).toBe("");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      previousFilter: "url(#paper)",
      filter: "",
    });
  });

  it("errors when the element does not exist", async () => {
    const result = await setLayerFilterTool.execute({
      layer: "markers",
      filter: "dropShadow",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("errors when document is unavailable", async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;
    const result = await setLayerFilterTool.execute({
      layer: "rivers",
      filter: "dropShadow",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/document/);
  });
});
