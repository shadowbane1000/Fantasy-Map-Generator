import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetFontFamilyTool,
  FONT_LAYERS,
  type FontFamilyRuntime,
  setFontFamilyTool,
} from "./set-font-family";

function makeRuntime(previous: string | null = null): {
  runtime: FontFamilyRuntime;
  readFontFamily: ReturnType<typeof vi.fn>;
  setFontFamily: ReturnType<typeof vi.fn>;
} {
  const readFontFamily = vi.fn((_id: string) => previous);
  const setFontFamily = vi.fn((_id: string, _font: string) => {});
  return {
    runtime: { readFontFamily, setFontFamily },
    readFontFamily,
    setFontFamily,
  };
}

describe("set_font_family tool", () => {
  it("sets font-family on #labels for layer 'labels'", async () => {
    const { runtime, readFontFamily, setFontFamily } =
      makeRuntime("Almendra SC");
    const tool = createSetFontFamilyTool(runtime);
    const result = await tool.execute({
      layer: "labels",
      font: "Garamond",
    });
    expect(result.isError).toBeFalsy();
    expect(readFontFamily).toHaveBeenCalledWith("labels");
    expect(setFontFamily).toHaveBeenCalledWith("labels", "Garamond");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "labels",
      previousFont: "Almendra SC",
      font: "Garamond",
    });
  });

  it("resolves alias 'state labels' → canonical 'state_labels' → #states", async () => {
    const { runtime, readFontFamily, setFontFamily } = makeRuntime("Forum");
    const tool = createSetFontFamilyTool(runtime);
    const result = await tool.execute({
      layer: "state labels",
      font: "Almendra SC",
    });
    expect(result.isError).toBeFalsy();
    expect(readFontFamily).toHaveBeenCalledWith("states");
    expect(setFontFamily).toHaveBeenCalledWith("states", "Almendra SC");
    expect(JSON.parse(result.content)).toMatchObject({
      layer: "state_labels",
      previousFont: "Forum",
      font: "Almendra SC",
    });
  });

  it("resolves alias 'burg labels' → #burgLabels", async () => {
    const { runtime, setFontFamily } = makeRuntime(null);
    const tool = createSetFontFamilyTool(runtime);
    await tool.execute({ layer: "burg labels", font: "Garamond" });
    expect(setFontFamily).toHaveBeenCalledWith("burgLabels", "Garamond");
  });

  it("resolves alias 'province labels' → #provs", async () => {
    const { runtime, setFontFamily } = makeRuntime("Forum");
    const tool = createSetFontFamilyTool(runtime);
    await tool.execute({ layer: "province labels", font: "Overlock SC" });
    expect(setFontFamily).toHaveBeenCalledWith("provs", "Overlock SC");
  });

  it("resolves 'provinces' alias → #provs", async () => {
    const { runtime, setFontFamily } = makeRuntime(null);
    const tool = createSetFontFamilyTool(runtime);
    await tool.execute({ layer: "provinces", font: "MedievalSharp" });
    expect(setFontFamily).toHaveBeenCalledWith("provs", "MedievalSharp");
  });

  it("resolves 'added labels' → #addedLabels", async () => {
    const { runtime, setFontFamily } = makeRuntime(null);
    const tool = createSetFontFamilyTool(runtime);
    await tool.execute({ layer: "added labels", font: "Forum" });
    expect(setFontFamily).toHaveBeenCalledWith("addedLabels", "Forum");
  });

  it("resolves 'legend' → #legend", async () => {
    const { runtime, setFontFamily } = makeRuntime(null);
    const tool = createSetFontFamilyTool(runtime);
    await tool.execute({ layer: "legend", font: "Forum" });
    expect(setFontFamily).toHaveBeenCalledWith("legend", "Forum");
  });

  it("accepts case-insensitive layer names", async () => {
    const { runtime, setFontFamily } = makeRuntime(null);
    const tool = createSetFontFamilyTool(runtime);
    const result = await tool.execute({
      layer: "STATE_LABELS",
      font: "Almendra SC",
    });
    expect(result.isError).toBeFalsy();
    expect(setFontFamily).toHaveBeenCalledWith("states", "Almendra SC");
    expect(JSON.parse(result.content)).toMatchObject({
      layer: "state_labels",
    });
  });

  it("returns a structured error for unknown layer names", async () => {
    const { runtime, setFontFamily } = makeRuntime();
    const tool = createSetFontFamilyTool(runtime);
    const result = await tool.execute({
      layer: "shadows",
      font: "Garamond",
    });
    expect(result.isError).toBe(true);
    expect(setFontFamily).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("shadows");
    expect(Array.isArray(body.supported)).toBe(true);
    expect(body.supported).toContain("labels");
    expect(body.supported).toContain("all");
  });

  it("rejects missing or empty layer", async () => {
    const { runtime } = makeRuntime();
    const tool = createSetFontFamilyTool(runtime);
    const a = await tool.execute({ font: "Garamond" });
    const b = await tool.execute({ layer: "   ", font: "Garamond" });
    const c = await tool.execute({ layer: 42, font: "Garamond" });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(c.isError).toBe(true);
  });

  it("rejects missing or empty font", async () => {
    const { runtime, setFontFamily } = makeRuntime();
    const tool = createSetFontFamilyTool(runtime);
    const a = await tool.execute({ layer: "labels" });
    const b = await tool.execute({ layer: "labels", font: "" });
    const c = await tool.execute({ layer: "labels", font: "   " });
    const d = await tool.execute({ layer: "labels", font: 7 });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(c.isError).toBe(true);
    expect(d.isError).toBe(true);
    expect(setFontFamily).not.toHaveBeenCalled();
  });

  it("surfaces setFontFamily failures as errorResult", async () => {
    const runtime: FontFamilyRuntime = {
      readFontFamily: () => null,
      setFontFamily: () => {
        throw new Error("Layer element #labels not found in DOM.");
      },
    };
    const tool = createSetFontFamilyTool(runtime);
    const result = await tool.execute({
      layer: "labels",
      font: "Garamond",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("reports previousFont: null when runtime.readFontFamily returns null", async () => {
    const { runtime } = makeRuntime(null);
    const tool = createSetFontFamilyTool(runtime);
    const result = await tool.execute({
      layer: "labels",
      font: "Garamond",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "labels",
      previousFont: null,
      font: "Garamond",
    });
  });

  it("'all' applies to #labels, #provs, and #legend in order", async () => {
    const previous: Record<string, string | null> = {
      labels: "Almendra SC",
      provs: "Forum",
      legend: null,
    };
    const readFontFamily = vi.fn((id: string) => previous[id] ?? null);
    const setFontFamily = vi.fn((_id: string, _font: string) => {});
    const runtime: FontFamilyRuntime = { readFontFamily, setFontFamily };
    const tool = createSetFontFamilyTool(runtime);

    const result = await tool.execute({ layer: "all", font: "Garamond" });
    expect(result.isError).toBeFalsy();
    expect(setFontFamily).toHaveBeenNthCalledWith(1, "labels", "Garamond");
    expect(setFontFamily).toHaveBeenNthCalledWith(2, "provs", "Garamond");
    expect(setFontFamily).toHaveBeenNthCalledWith(3, "legend", "Garamond");
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      layer: "all",
      previousFont: "Almendra SC",
      font: "Garamond",
    });
    expect(body.applied).toEqual([
      { layer: "labels", svgId: "labels", previousFont: "Almendra SC" },
      { layer: "province_labels", svgId: "provs", previousFont: "Forum" },
      { layer: "legend", svgId: "legend", previousFont: null },
    ]);
  });

  it("'all' reports appliedBeforeError when a mid-layer write fails", async () => {
    const readFontFamily = vi.fn(() => null);
    const setFontFamily = vi.fn((id: string, _font: string) => {
      if (id === "provs") throw new Error("Layer element #provs not found.");
    });
    const runtime: FontFamilyRuntime = { readFontFamily, setFontFamily };
    const tool = createSetFontFamilyTool(runtime);

    const result = await tool.execute({ layer: "all", font: "Garamond" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toContain("provs");
    expect(Array.isArray(body.appliedBeforeError)).toBe(true);
    expect(body.appliedBeforeError).toHaveLength(1);
    expect(body.appliedBeforeError[0]).toMatchObject({ layer: "labels" });
  });

  it("exposes the expected tool name and schema", () => {
    expect(setFontFamilyTool.name).toBe("set_font_family");
    expect(setFontFamilyTool.input_schema.required).toEqual(["layer", "font"]);
  });

  it("exports FONT_LAYERS covering the expected canonical names", () => {
    const names = FONT_LAYERS.map((l) => l.canonical);
    expect(names).toEqual([
      "labels",
      "state_labels",
      "added_labels",
      "burg_labels",
      "province_labels",
      "legend",
    ]);
  });
});

describe("defaultFontFamilyRuntime (integration)", () => {
  interface FakeEl {
    attrs: Record<string, string>;
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
  }

  const elements: Record<string, FakeEl> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;

  function makeEl(initialFont?: string): FakeEl {
    const attrs: Record<string, string> = {};
    if (initialFont !== undefined) attrs["font-family"] = initialFont;
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

  it("writes the font-family attribute on the SVG element and returns previousFont", async () => {
    elements.labels = makeEl("Almendra SC");
    const result = await setFontFamilyTool.execute({
      layer: "labels",
      font: "Garamond",
    });
    expect(result.isError).toBeFalsy();
    expect(elements.labels?.attrs["font-family"]).toBe("Garamond");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "labels",
      previousFont: "Almendra SC",
      font: "Garamond",
    });
  });

  it("reports previousFont: null when the attribute is absent", async () => {
    elements.states = makeEl(); // no font-family attr
    const result = await setFontFamilyTool.execute({
      layer: "state_labels",
      font: "Forum",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousFont).toBeNull();
    expect(elements.states?.attrs["font-family"]).toBe("Forum");
  });

  it("errors when the element does not exist (setFontFamily throws)", async () => {
    const result = await setFontFamilyTool.execute({
      layer: "burg_labels",
      font: "Garamond",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("errors when document is unavailable", async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;
    const result = await setFontFamilyTool.execute({
      layer: "labels",
      font: "Garamond",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/document/);
  });

  it("'all' writes across #labels, #provs, #legend", async () => {
    elements.labels = makeEl("A");
    elements.provs = makeEl("B");
    elements.legend = makeEl();
    const result = await setFontFamilyTool.execute({
      layer: "all",
      font: "Garamond",
    });
    expect(result.isError).toBeFalsy();
    expect(elements.labels?.attrs["font-family"]).toBe("Garamond");
    expect(elements.provs?.attrs["font-family"]).toBe("Garamond");
    expect(elements.legend?.attrs["font-family"]).toBe("Garamond");
    const body = JSON.parse(result.content);
    expect(body.applied).toEqual([
      { layer: "labels", svgId: "labels", previousFont: "A" },
      { layer: "province_labels", svgId: "provs", previousFont: "B" },
      { layer: "legend", svgId: "legend", previousFont: null },
    ]);
  });
});
