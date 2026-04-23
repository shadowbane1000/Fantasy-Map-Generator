import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetFontSizeTool,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  type FontSizeRuntime,
  setFontSizeTool,
} from "./set-font-size";

function makeRuntime(previous: number | null = null): {
  runtime: FontSizeRuntime;
  readFontSize: ReturnType<typeof vi.fn>;
  setFontSize: ReturnType<typeof vi.fn>;
} {
  const readFontSize = vi.fn((_id: string) => previous);
  const setFontSize = vi.fn((_id: string, _size: number) => {});
  return {
    runtime: { readFontSize, setFontSize },
    readFontSize,
    setFontSize,
  };
}

describe("set_font_size tool", () => {
  it("sets font-size on #labels for layer 'labels'", async () => {
    const { runtime, readFontSize, setFontSize } = makeRuntime(12);
    const tool = createSetFontSizeTool(runtime);
    const result = await tool.execute({
      layer: "labels",
      size: 16,
    });
    expect(result.isError).toBeFalsy();
    expect(readFontSize).toHaveBeenCalledWith("labels");
    expect(setFontSize).toHaveBeenCalledWith("labels", 16);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "labels",
      previousSize: 12,
      size: 16,
    });
  });

  it("resolves alias 'state labels' → canonical 'state_labels' → #states", async () => {
    const { runtime, readFontSize, setFontSize } = makeRuntime(14);
    const tool = createSetFontSizeTool(runtime);
    const result = await tool.execute({
      layer: "state labels",
      size: 22,
    });
    expect(result.isError).toBeFalsy();
    expect(readFontSize).toHaveBeenCalledWith("states");
    expect(setFontSize).toHaveBeenCalledWith("states", 22);
    expect(JSON.parse(result.content)).toMatchObject({
      layer: "state_labels",
      previousSize: 14,
      size: 22,
    });
  });

  it("resolves alias 'burg labels' → #burgLabels", async () => {
    const { runtime, setFontSize } = makeRuntime(null);
    const tool = createSetFontSizeTool(runtime);
    await tool.execute({ layer: "burg labels", size: 10 });
    expect(setFontSize).toHaveBeenCalledWith("burgLabels", 10);
  });

  it("resolves alias 'province labels' → #provs", async () => {
    const { runtime, setFontSize } = makeRuntime(8);
    const tool = createSetFontSizeTool(runtime);
    await tool.execute({ layer: "province labels", size: 18 });
    expect(setFontSize).toHaveBeenCalledWith("provs", 18);
  });

  it("resolves 'provinces' alias → #provs", async () => {
    const { runtime, setFontSize } = makeRuntime(null);
    const tool = createSetFontSizeTool(runtime);
    await tool.execute({ layer: "provinces", size: 12 });
    expect(setFontSize).toHaveBeenCalledWith("provs", 12);
  });

  it("resolves 'added labels' → #addedLabels", async () => {
    const { runtime, setFontSize } = makeRuntime(null);
    const tool = createSetFontSizeTool(runtime);
    await tool.execute({ layer: "added labels", size: 14 });
    expect(setFontSize).toHaveBeenCalledWith("addedLabels", 14);
  });

  it("resolves 'legend' → #legend", async () => {
    const { runtime, setFontSize } = makeRuntime(null);
    const tool = createSetFontSizeTool(runtime);
    await tool.execute({ layer: "legend", size: 13 });
    expect(setFontSize).toHaveBeenCalledWith("legend", 13);
  });

  it("accepts case-insensitive layer names", async () => {
    const { runtime, setFontSize } = makeRuntime(null);
    const tool = createSetFontSizeTool(runtime);
    const result = await tool.execute({
      layer: "STATE_LABELS",
      size: 20,
    });
    expect(result.isError).toBeFalsy();
    expect(setFontSize).toHaveBeenCalledWith("states", 20);
    expect(JSON.parse(result.content)).toMatchObject({
      layer: "state_labels",
    });
  });

  it("returns a structured error for unknown layer names", async () => {
    const { runtime, setFontSize } = makeRuntime();
    const tool = createSetFontSizeTool(runtime);
    const result = await tool.execute({
      layer: "shadows",
      size: 12,
    });
    expect(result.isError).toBe(true);
    expect(setFontSize).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("shadows");
    expect(Array.isArray(body.supported)).toBe(true);
    expect(body.supported).toContain("labels");
    expect(body.supported).toContain("all");
  });

  it("rejects missing or empty layer", async () => {
    const { runtime } = makeRuntime();
    const tool = createSetFontSizeTool(runtime);
    const a = await tool.execute({ size: 12 });
    const b = await tool.execute({ layer: "   ", size: 12 });
    const c = await tool.execute({ layer: 42, size: 12 });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(c.isError).toBe(true);
  });

  it("rejects missing, non-number, or out-of-range size", async () => {
    const { runtime, setFontSize } = makeRuntime();
    const tool = createSetFontSizeTool(runtime);
    const a = await tool.execute({ layer: "labels" });
    const b = await tool.execute({ layer: "labels", size: "12" });
    const c = await tool.execute({ layer: "labels", size: Number.NaN });
    const d = await tool.execute({ layer: "labels", size: 0 }); // below min
    const e = await tool.execute({ layer: "labels", size: 200 }); // above max
    const f = await tool.execute({
      layer: "labels",
      size: Number.POSITIVE_INFINITY,
    });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(c.isError).toBe(true);
    expect(d.isError).toBe(true);
    expect(e.isError).toBe(true);
    expect(f.isError).toBe(true);
    expect(setFontSize).not.toHaveBeenCalled();
  });

  it("accepts sizes at the boundaries", async () => {
    const { runtime, setFontSize } = makeRuntime(null);
    const tool = createSetFontSizeTool(runtime);
    const low = await tool.execute({ layer: "labels", size: FONT_SIZE_MIN });
    const high = await tool.execute({ layer: "labels", size: FONT_SIZE_MAX });
    expect(low.isError).toBeFalsy();
    expect(high.isError).toBeFalsy();
    expect(setFontSize).toHaveBeenCalledWith("labels", FONT_SIZE_MIN);
    expect(setFontSize).toHaveBeenCalledWith("labels", FONT_SIZE_MAX);
  });

  it("surfaces setFontSize failures as errorResult", async () => {
    const runtime: FontSizeRuntime = {
      readFontSize: () => null,
      setFontSize: () => {
        throw new Error("Layer element #labels not found in DOM.");
      },
    };
    const tool = createSetFontSizeTool(runtime);
    const result = await tool.execute({
      layer: "labels",
      size: 12,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("reports previousSize: null when runtime.readFontSize returns null", async () => {
    const { runtime } = makeRuntime(null);
    const tool = createSetFontSizeTool(runtime);
    const result = await tool.execute({
      layer: "labels",
      size: 12,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "labels",
      previousSize: null,
      size: 12,
    });
  });

  it("'all' applies to #labels, #provs, and #legend in order", async () => {
    const previous: Record<string, number | null> = {
      labels: 12,
      provs: 14,
      legend: null,
    };
    const readFontSize = vi.fn((id: string) => previous[id] ?? null);
    const setFontSize = vi.fn((_id: string, _size: number) => {});
    const runtime: FontSizeRuntime = { readFontSize, setFontSize };
    const tool = createSetFontSizeTool(runtime);

    const result = await tool.execute({ layer: "all", size: 18 });
    expect(result.isError).toBeFalsy();
    expect(setFontSize).toHaveBeenNthCalledWith(1, "labels", 18);
    expect(setFontSize).toHaveBeenNthCalledWith(2, "provs", 18);
    expect(setFontSize).toHaveBeenNthCalledWith(3, "legend", 18);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      layer: "all",
      previousSize: 12,
      size: 18,
    });
    expect(body.applied).toEqual([
      { layer: "labels", svgId: "labels", previousSize: 12 },
      { layer: "province_labels", svgId: "provs", previousSize: 14 },
      { layer: "legend", svgId: "legend", previousSize: null },
    ]);
  });

  it("'all' reports appliedBeforeError when a mid-layer write fails", async () => {
    const readFontSize = vi.fn(() => null);
    const setFontSize = vi.fn((id: string, _size: number) => {
      if (id === "provs") throw new Error("Layer element #provs not found.");
    });
    const runtime: FontSizeRuntime = { readFontSize, setFontSize };
    const tool = createSetFontSizeTool(runtime);

    const result = await tool.execute({ layer: "all", size: 18 });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toContain("provs");
    expect(Array.isArray(body.appliedBeforeError)).toBe(true);
    expect(body.appliedBeforeError).toHaveLength(1);
    expect(body.appliedBeforeError[0]).toMatchObject({ layer: "labels" });
  });

  it("exposes the expected tool name and schema", () => {
    expect(setFontSizeTool.name).toBe("set_font_size");
    expect(setFontSizeTool.input_schema.required).toEqual(["layer", "size"]);
  });
});

describe("defaultFontSizeRuntime (integration)", () => {
  interface FakeEl {
    attrs: Record<string, string>;
    getAttribute: (name: string) => string | null;
    setAttribute: (name: string, value: string) => void;
  }

  const elements: Record<string, FakeEl> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;

  function makeEl(initial?: { dataSize?: string; fontSize?: string }): FakeEl {
    const attrs: Record<string, string> = {};
    if (initial?.dataSize !== undefined) attrs["data-size"] = initial.dataSize;
    if (initial?.fontSize !== undefined) attrs["font-size"] = initial.fontSize;
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

  it("writes data-size and font-size on the SVG element and returns previousSize from data-size", async () => {
    elements.labels = makeEl({ dataSize: "12", fontSize: "9.5" });
    const result = await setFontSizeTool.execute({
      layer: "labels",
      size: 18,
    });
    expect(result.isError).toBeFalsy();
    expect(elements.labels?.attrs["data-size"]).toBe("18");
    expect(elements.labels?.attrs["font-size"]).toBe("18");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "labels",
      previousSize: 12,
      size: 18,
    });
  });

  it("falls back to font-size when data-size is absent", async () => {
    elements.states = makeEl({ fontSize: "14" });
    const result = await setFontSizeTool.execute({
      layer: "state_labels",
      size: 22,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousSize).toBe(14);
    expect(elements.states?.attrs["data-size"]).toBe("22");
    expect(elements.states?.attrs["font-size"]).toBe("22");
  });

  it("reports previousSize: null when neither attribute is present", async () => {
    elements.burgLabels = makeEl();
    const result = await setFontSizeTool.execute({
      layer: "burg_labels",
      size: 11,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousSize).toBeNull();
    expect(elements.burgLabels?.attrs["data-size"]).toBe("11");
    expect(elements.burgLabels?.attrs["font-size"]).toBe("11");
  });

  it("errors when the element does not exist (setFontSize throws)", async () => {
    const result = await setFontSizeTool.execute({
      layer: "burg_labels",
      size: 12,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not found");
  });

  it("errors when document is unavailable", async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;
    const result = await setFontSizeTool.execute({
      layer: "labels",
      size: 12,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/document/);
  });

  it("'all' writes across #labels, #provs, #legend", async () => {
    elements.labels = makeEl({ dataSize: "10" });
    elements.provs = makeEl({ dataSize: "12" });
    elements.legend = makeEl();
    const result = await setFontSizeTool.execute({
      layer: "all",
      size: 20,
    });
    expect(result.isError).toBeFalsy();
    expect(elements.labels?.attrs["font-size"]).toBe("20");
    expect(elements.labels?.attrs["data-size"]).toBe("20");
    expect(elements.provs?.attrs["font-size"]).toBe("20");
    expect(elements.provs?.attrs["data-size"]).toBe("20");
    expect(elements.legend?.attrs["font-size"]).toBe("20");
    expect(elements.legend?.attrs["data-size"]).toBe("20");
    const body = JSON.parse(result.content);
    expect(body.applied).toEqual([
      { layer: "labels", svgId: "labels", previousSize: 10 },
      { layer: "province_labels", svgId: "provs", previousSize: 12 },
      { layer: "legend", svgId: "legend", previousSize: null },
    ]);
  });
});
