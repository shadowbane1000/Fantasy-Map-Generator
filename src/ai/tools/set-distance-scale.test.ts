import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createSetDistanceScaleTool,
  type DistanceScaleRuntime,
  defaultDistanceScaleRuntime,
  MAX_DISTANCE_SCALE,
  setDistanceScaleTool,
} from "./set-distance-scale";

interface RuntimeMocks {
  runtime: DistanceScaleRuntime;
  getDistanceScale: ReturnType<typeof vi.fn>;
  setDistanceScale: ReturnType<typeof vi.fn>;
  setDomInputValue: ReturnType<typeof vi.fn>;
  renderScaleBar: ReturnType<typeof vi.fn>;
  calculateFriendlyGridSize: ReturnType<typeof vi.fn>;
}

function makeRuntime(previous: number | undefined = 3): RuntimeMocks {
  const getDistanceScale = vi.fn(() => previous);
  const setDistanceScale = vi.fn();
  const setDomInputValue = vi.fn();
  const renderScaleBar = vi.fn();
  const calculateFriendlyGridSize = vi.fn();
  return {
    runtime: {
      getDistanceScale,
      setDistanceScale,
      setDomInputValue,
      renderScaleBar,
      calculateFriendlyGridSize,
    },
    getDistanceScale,
    setDistanceScale,
    setDomInputValue,
    renderScaleBar,
    calculateFriendlyGridSize,
  };
}

describe("set_distance_scale tool — validation & happy path", () => {
  it("happy path: sets a mid-range value and reports previous", async () => {
    const m = makeRuntime(3);
    const tool = createSetDistanceScaleTool(m.runtime);
    const result = await tool.execute({ scale: 5 });
    expect(result.isError).toBeFalsy();
    expect(m.setDistanceScale).toHaveBeenCalledWith(5);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      scale: 5,
      previous: 3,
    });
  });

  it("accepts boundary low (0.001)", async () => {
    const m = makeRuntime(1);
    const tool = createSetDistanceScaleTool(m.runtime);
    const result = await tool.execute({ scale: 0.001 });
    expect(result.isError).toBeFalsy();
    expect(m.setDistanceScale).toHaveBeenCalledWith(0.001);
  });

  it("accepts boundary high (1000)", async () => {
    const m = makeRuntime(1);
    const tool = createSetDistanceScaleTool(m.runtime);
    const result = await tool.execute({ scale: MAX_DISTANCE_SCALE });
    expect(result.isError).toBeFalsy();
    expect(m.setDistanceScale).toHaveBeenCalledWith(MAX_DISTANCE_SCALE);
  });

  it("rejects scale=0", async () => {
    const m = makeRuntime();
    const tool = createSetDistanceScaleTool(m.runtime);
    const result = await tool.execute({ scale: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "scale must be a finite number > 0 and <= 1000.",
    );
    expect(m.setDistanceScale).not.toHaveBeenCalled();
  });

  it("rejects negative scale", async () => {
    const m = makeRuntime();
    const tool = createSetDistanceScaleTool(m.runtime);
    expect((await tool.execute({ scale: -1 })).isError).toBe(true);
    expect(m.setDistanceScale).not.toHaveBeenCalled();
  });

  it("rejects NaN", async () => {
    const m = makeRuntime();
    const tool = createSetDistanceScaleTool(m.runtime);
    expect((await tool.execute({ scale: Number.NaN })).isError).toBe(true);
    expect(m.setDistanceScale).not.toHaveBeenCalled();
  });

  it("rejects Infinity", async () => {
    const m = makeRuntime();
    const tool = createSetDistanceScaleTool(m.runtime);
    expect(
      (await tool.execute({ scale: Number.POSITIVE_INFINITY })).isError,
    ).toBe(true);
    expect(m.setDistanceScale).not.toHaveBeenCalled();
  });

  it("rejects string '3'", async () => {
    const m = makeRuntime();
    const tool = createSetDistanceScaleTool(m.runtime);
    expect((await tool.execute({ scale: "3" })).isError).toBe(true);
    expect(m.setDistanceScale).not.toHaveBeenCalled();
  });

  it("rejects scale above max", async () => {
    const m = makeRuntime();
    const tool = createSetDistanceScaleTool(m.runtime);
    expect((await tool.execute({ scale: 1001 })).isError).toBe(true);
    expect(m.setDistanceScale).not.toHaveBeenCalled();
  });

  it("rejects missing scale", async () => {
    const m = makeRuntime();
    const tool = createSetDistanceScaleTool(m.runtime);
    expect((await tool.execute({})).isError).toBe(true);
    expect(m.setDistanceScale).not.toHaveBeenCalled();
  });
});

describe("set_distance_scale tool — `previous` semantics", () => {
  it("captures previous BEFORE mutation (read once, before write)", async () => {
    // Returns 7 the first time, 999 thereafter — proves we read once
    // BEFORE mutating. If we read after, we'd see 999.
    let calls = 0;
    const getDistanceScale = vi.fn(() => {
      calls++;
      return calls === 1 ? 7 : 999;
    });
    const setDistanceScale = vi.fn();
    const tool = createSetDistanceScaleTool({
      getDistanceScale,
      setDistanceScale,
    });
    const result = await tool.execute({ scale: 5 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      scale: 5,
      previous: 7,
    });
  });

  it("omits `previous` when getDistanceScale returns undefined", async () => {
    const tool = createSetDistanceScaleTool({
      getDistanceScale: () => undefined,
      setDistanceScale: vi.fn(),
    });
    const result = await tool.execute({ scale: 5 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ ok: true, scale: 5 });
  });
});

describe("set_distance_scale tool — side-effect callbacks", () => {
  it("calls all three optional callbacks when present", async () => {
    const m = makeRuntime(3);
    const tool = createSetDistanceScaleTool(m.runtime);
    const result = await tool.execute({ scale: 4 });
    expect(result.isError).toBeFalsy();
    expect(m.setDomInputValue).toHaveBeenCalledTimes(1);
    expect(m.setDomInputValue).toHaveBeenCalledWith("distanceScaleInput", 4);
    expect(m.renderScaleBar).toHaveBeenCalledTimes(1);
    expect(m.calculateFriendlyGridSize).toHaveBeenCalledTimes(1);
  });

  it("works when all three optional callbacks are missing", async () => {
    const setDistanceScale = vi.fn();
    const tool = createSetDistanceScaleTool({
      getDistanceScale: () => 3,
      setDistanceScale,
    });
    const result = await tool.execute({ scale: 7 });
    expect(result.isError).toBeFalsy();
    expect(setDistanceScale).toHaveBeenCalledWith(7);
  });

  it("swallows renderScaleBar throws", async () => {
    const m = makeRuntime(3);
    m.runtime.renderScaleBar = vi.fn(() => {
      throw new Error("render boom");
    });
    const tool = createSetDistanceScaleTool(m.runtime);
    const result = await tool.execute({ scale: 4 });
    expect(result.isError).toBeFalsy();
    expect(m.setDistanceScale).toHaveBeenCalledWith(4);
  });

  it("swallows calculateFriendlyGridSize throws", async () => {
    const m = makeRuntime(3);
    m.runtime.calculateFriendlyGridSize = vi.fn(() => {
      throw new Error("grid boom");
    });
    const tool = createSetDistanceScaleTool(m.runtime);
    const result = await tool.execute({ scale: 4 });
    expect(result.isError).toBeFalsy();
    expect(m.setDistanceScale).toHaveBeenCalledWith(4);
  });

  it("swallows setDomInputValue throws", async () => {
    const m = makeRuntime(3);
    m.runtime.setDomInputValue = vi.fn(() => {
      throw new Error("dom boom");
    });
    const tool = createSetDistanceScaleTool(m.runtime);
    const result = await tool.execute({ scale: 4 });
    expect(result.isError).toBeFalsy();
    expect(m.setDistanceScale).toHaveBeenCalledWith(4);
  });

  it("propagates setDistanceScale throws (load-bearing)", async () => {
    const m = makeRuntime(3);
    m.runtime.setDistanceScale = vi.fn(() => {
      throw new Error("set boom");
    });
    const tool = createSetDistanceScaleTool(m.runtime);
    const result = await tool.execute({ scale: 4 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/set boom/);
  });
});

describe("set_distance_scale tool — shape & registry", () => {
  it("has the right name, schema, and required fields", () => {
    const tool = createSetDistanceScaleTool();
    expect(tool.name).toBe("set_distance_scale");
    expect(tool.input_schema.type).toBe("object");
    expect(tool.input_schema.required).toEqual(["scale"]);
    const scaleSchema = tool.input_schema.properties.scale as Record<
      string,
      unknown
    >;
    expect(scaleSchema.exclusiveMinimum).toBe(0);
    expect(scaleSchema.maximum).toBe(1000);
    expect(scaleSchema.type).toBe("number");
  });

  it("round-trips through the ToolRegistry", async () => {
    const registry = new ToolRegistry();
    registry.register(setDistanceScaleTool);
    expect(registry.list().some((t) => t.name === "set_distance_scale")).toBe(
      true,
    );
  });
});

describe("defaultDistanceScaleRuntime (integration)", () => {
  const originalDistanceScale = (globalThis as { distanceScale?: number })
    .distanceScale;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalDrawScaleBar = (globalThis as { drawScaleBar?: unknown })
    .drawScaleBar;
  const originalFitScaleBar = (globalThis as { fitScaleBar?: unknown })
    .fitScaleBar;
  const originalScaleBar = (globalThis as { scaleBar?: unknown }).scaleBar;
  const originalScale = (globalThis as { scale?: unknown }).scale;
  const originalSvgWidth = (globalThis as { svgWidth?: unknown }).svgWidth;
  const originalSvgHeight = (globalThis as { svgHeight?: unknown }).svgHeight;
  const originalCalc = (globalThis as { calculateFriendlyGridSize?: unknown })
    .calculateFriendlyGridSize;

  function restoreOrDelete(name: string, value: unknown) {
    const g = globalThis as Record<string, unknown>;
    if (value === undefined) delete g[name];
    else g[name] = value;
  }

  beforeEach(() => {
    (globalThis as { distanceScale?: number }).distanceScale = 3;
  });

  afterEach(() => {
    restoreOrDelete("distanceScale", originalDistanceScale);
    restoreOrDelete("document", originalDoc);
    restoreOrDelete("drawScaleBar", originalDrawScaleBar);
    restoreOrDelete("fitScaleBar", originalFitScaleBar);
    restoreOrDelete("scaleBar", originalScaleBar);
    restoreOrDelete("scale", originalScale);
    restoreOrDelete("svgWidth", originalSvgWidth);
    restoreOrDelete("svgHeight", originalSvgHeight);
    restoreOrDelete("calculateFriendlyGridSize", originalCalc);
  });

  it("REASSIGNS globalThis.distanceScale and reports previous", async () => {
    (globalThis as { distanceScale?: number }).distanceScale = 3;
    const tool = createSetDistanceScaleTool(defaultDistanceScaleRuntime);
    const result = await tool.execute({ scale: 5.5 });
    expect(result.isError).toBeFalsy();
    expect((globalThis as { distanceScale?: number }).distanceScale).toBe(5.5);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      scale: 5.5,
      previous: 3,
    });
  });

  it("updates the DOM input value when present", async () => {
    const el: { value: string } = { value: "" };
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => (id === "distanceScaleInput" ? el : null),
    };
    const result = await setDistanceScaleTool.execute({ scale: 5 });
    expect(result.isError).toBeFalsy();
    expect(el.value).toBe("5");
  });

  it("tolerates the DOM input being absent", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    const result = await setDistanceScaleTool.execute({ scale: 5 });
    expect(result.isError).toBeFalsy();
  });

  it("invokes drawScaleBar + fitScaleBar (renderScaleBar best-effort)", async () => {
    const drawScaleBar = vi.fn();
    const fitScaleBar = vi.fn();
    (globalThis as Record<string, unknown>).drawScaleBar = drawScaleBar;
    (globalThis as Record<string, unknown>).fitScaleBar = fitScaleBar;
    (globalThis as Record<string, unknown>).scaleBar = { stub: true };
    (globalThis as Record<string, unknown>).scale = "scale-stub";
    (globalThis as Record<string, unknown>).svgWidth = 1200;
    (globalThis as Record<string, unknown>).svgHeight = 800;
    const result = await setDistanceScaleTool.execute({ scale: 5 });
    expect(result.isError).toBeFalsy();
    expect(drawScaleBar).toHaveBeenCalledWith({ stub: true }, "scale-stub");
    expect(fitScaleBar).toHaveBeenCalledWith({ stub: true }, 1200, 800);
  });

  it("invokes calculateFriendlyGridSize when present (best-effort)", async () => {
    const calc = vi.fn();
    (globalThis as Record<string, unknown>).calculateFriendlyGridSize = calc;
    const result = await setDistanceScaleTool.execute({ scale: 5 });
    expect(result.isError).toBeFalsy();
    expect(calc).toHaveBeenCalledTimes(1);
  });

  it("succeeds when ALL side-effect globals are missing", async () => {
    delete (globalThis as Record<string, unknown>).drawScaleBar;
    delete (globalThis as Record<string, unknown>).fitScaleBar;
    delete (globalThis as Record<string, unknown>).scaleBar;
    delete (globalThis as Record<string, unknown>).calculateFriendlyGridSize;
    delete (globalThis as Record<string, unknown>).document;
    const result = await setDistanceScaleTool.execute({ scale: 5 });
    expect(result.isError).toBeFalsy();
    expect((globalThis as { distanceScale?: number }).distanceScale).toBe(5);
  });

  it("invokes BOTH renderScaleBar AND calculateFriendlyGridSize when both present", async () => {
    const drawScaleBar = vi.fn();
    const fitScaleBar = vi.fn();
    const calc = vi.fn();
    (globalThis as Record<string, unknown>).drawScaleBar = drawScaleBar;
    (globalThis as Record<string, unknown>).fitScaleBar = fitScaleBar;
    (globalThis as Record<string, unknown>).scaleBar = { stub: true };
    (globalThis as Record<string, unknown>).calculateFriendlyGridSize = calc;
    const result = await setDistanceScaleTool.execute({ scale: 5 });
    expect(result.isError).toBeFalsy();
    expect(drawScaleBar).toHaveBeenCalledTimes(1);
    expect(fitScaleBar).toHaveBeenCalledTimes(1);
    expect(calc).toHaveBeenCalledTimes(1);
  });
});
