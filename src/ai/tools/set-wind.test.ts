import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetWindTool,
  DEFAULT_WINDS,
  normaliseAngle,
  resolveBand,
  type SetWindRuntime,
  setWindTool,
  WIND_BAND_COUNT,
  WIND_STORED_KEY,
} from "./set-wind";

function makeRuntime(previous: Record<number, number | null> = {}): {
  runtime: SetWindRuntime;
  read: ReturnType<typeof vi.fn<SetWindRuntime["read"]>>;
  apply: ReturnType<typeof vi.fn<SetWindRuntime["apply"]>>;
} {
  const read = vi.fn<SetWindRuntime["read"]>((band) =>
    band in previous ? (previous[band] ?? null) : 0,
  );
  const apply = vi.fn<SetWindRuntime["apply"]>();
  return { runtime: { read, apply }, read, apply };
}

describe("resolveBand", () => {
  it("accepts integer 0..5", () => {
    for (let i = 0; i < WIND_BAND_COUNT; i++) {
      expect(resolveBand(i)).toBe(i);
    }
  });

  it("rejects out-of-range integers, non-integers, and non-strings", () => {
    expect(resolveBand(-1)).toBeNull();
    expect(resolveBand(6)).toBeNull();
    expect(resolveBand(1.5)).toBeNull();
    expect(resolveBand(null)).toBeNull();
    expect(resolveBand({})).toBeNull();
  });

  it("accepts band aliases case-insensitively", () => {
    expect(resolveBand("polar_north")).toBe(0);
    expect(resolveBand("Temperate-North")).toBe(1);
    expect(resolveBand("TROPICAL_NORTH")).toBe(2);
    expect(resolveBand("tropical_south")).toBe(3);
    expect(resolveBand("temperate-south")).toBe(4);
    expect(resolveBand("polar_south")).toBe(5);
  });

  it("accepts numeric strings", () => {
    expect(resolveBand("0")).toBe(0);
    expect(resolveBand("5")).toBe(5);
    expect(resolveBand("6")).toBeNull();
  });
});

describe("normaliseAngle", () => {
  it("wraps negatives and >=360, preserves fractions", () => {
    expect(normaliseAngle(0)).toBe(0);
    expect(normaliseAngle(359.5)).toBeCloseTo(359.5);
    expect(normaliseAngle(-45)).toBe(315);
    expect(normaliseAngle(405)).toBe(45);
    expect(normaliseAngle(720.5)).toBeCloseTo(0.5);
    expect(normaliseAngle(360)).toBe(0);
  });
});

describe("set_wind tool", () => {
  it("applies a single {band, direction}", async () => {
    const { runtime, apply } = makeRuntime({ 2: 225 });
    const tool = createSetWindTool(runtime);
    const result = await tool.execute({ band: 2, direction: 90 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(2, 90);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      changes: [{ band: 2, previousDirection: 225, direction: 90 }],
    });
  });

  it("applies multiple bands via {bands}", async () => {
    const { runtime, apply } = makeRuntime({ 0: 225, 5: 315 });
    const tool = createSetWindTool(runtime);
    const result = await tool.execute({
      bands: [
        { band: "polar_north", direction: 180 },
        { band: 5, direction: -90 },
      ],
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenNthCalledWith(1, 0, 180);
    expect(apply).toHaveBeenNthCalledWith(2, 5, 270);
    expect(JSON.parse(result.content).changes).toEqual([
      { band: 0, previousDirection: 225, direction: 180 },
      { band: 5, previousDirection: 315, direction: 270 },
    ]);
  });

  it("applies a full {directions} bulk set", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetWindTool(runtime);
    const result = await tool.execute({
      directions: [0, 90, 180, 270, 45, 135],
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(WIND_BAND_COUNT);
    for (let i = 0; i < WIND_BAND_COUNT; i++) {
      expect(apply).toHaveBeenNthCalledWith(
        i + 1,
        i,
        [0, 90, 180, 270, 45, 135][i],
      );
    }
  });

  it("{reset: true} applies DEFAULT_WINDS", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetWindTool(runtime);
    const result = await tool.execute({ reset: true });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(WIND_BAND_COUNT);
    for (let i = 0; i < WIND_BAND_COUNT; i++) {
      expect(apply).toHaveBeenNthCalledWith(i + 1, i, DEFAULT_WINDS[i]);
    }
  });

  it("rejects no-input", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetWindTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects multiple input forms", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetWindTool(runtime);
    const result = await tool.execute({
      band: 0,
      direction: 0,
      reset: true,
    });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects bad band / direction", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetWindTool(runtime);
    const cases = [
      { band: 99, direction: 0 },
      { band: "not-a-band", direction: 0 },
      { band: 0, direction: Number.NaN },
      { band: 0, direction: "45" },
      { band: 0, direction: Number.POSITIVE_INFINITY },
    ];
    for (const c of cases) {
      const r = await tool.execute(c);
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects wrong-length directions array and non-array", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetWindTool(runtime);
    const r1 = await tool.execute({ directions: [0, 90, 180] });
    expect(r1.isError).toBe(true);
    const r2 = await tool.execute({ directions: "not-an-array" });
    expect(r2.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects malformed bands entries", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetWindTool(runtime);
    const r1 = await tool.execute({ bands: [] });
    expect(r1.isError).toBe(true);
    const r2 = await tool.execute({ bands: [null] });
    expect(r2.isError).toBe(true);
    const r3 = await tool.execute({
      bands: [
        { band: 0, direction: 0 },
        { band: 0, direction: 90 },
      ],
    });
    expect(r3.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-true reset", async () => {
    const { runtime } = makeRuntime();
    const tool = createSetWindTool(runtime);
    const r = await tool.execute({ reset: false });
    expect(r.isError).toBe(true);
  });

  it("surfaces runtime.apply failures as errorResult with partial changes", async () => {
    const runtime: SetWindRuntime = {
      read: () => 0,
      apply: vi.fn((band) => {
        if (band === 1) throw new Error("apply failed");
      }),
    };
    const tool = createSetWindTool(runtime);
    const result = await tool.execute({
      bands: [
        { band: 0, direction: 10 },
        { band: 1, direction: 20 },
        { band: 2, direction: 30 },
      ],
    });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content);
    expect(parsed.error).toMatch(/apply failed/);
    expect(parsed.changes).toEqual([
      { band: 0, previousDirection: 0, direction: 10 },
    ]);
  });
});

describe("defaultSetWindRuntime (integration)", () => {
  const setItem = vi.fn();
  const getItem = vi.fn();
  const querySelector = vi.fn();

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;
  const originalStorage = (globalThis as unknown as { localStorage?: unknown })
    .localStorage;
  const originalOptions = (globalThis as unknown as { options?: unknown })
    .options;

  beforeEach(() => {
    setItem.mockReset();
    getItem.mockReset();
    querySelector.mockReset();
    (globalThis as unknown as { document?: unknown }).document = {
      querySelector,
    };
    (globalThis as unknown as { localStorage?: unknown }).localStorage = {
      setItem,
      getItem,
    };
    (globalThis as unknown as { options?: unknown }).options = {
      winds: [225, 45, 225, 315, 135, 315],
    };
  });

  afterEach(() => {
    (globalThis as unknown as { document?: unknown }).document = originalDoc;
    (globalThis as unknown as { localStorage?: unknown }).localStorage =
      originalStorage;
    (globalThis as unknown as { options?: unknown }).options = originalOptions;
  });

  it("mutates options.winds, rewrites the DOM transform, and persists to localStorage", async () => {
    const path = {
      attrs: { transform: "rotate(225 210 75)" },
      getAttribute(name: string) {
        return (this.attrs as Record<string, string>)[name] ?? null;
      },
      setAttribute(name: string, value: string) {
        (this.attrs as Record<string, string>)[name] = value;
      },
    };
    querySelector.mockReturnValue(path);

    const result = await setWindTool.execute({ band: 2, direction: 90 });
    expect(result.isError).toBeFalsy();

    const options = (globalThis as unknown as { options: { winds: number[] } })
      .options;
    expect(options.winds[2]).toBe(90);
    expect(querySelector).toHaveBeenCalledWith(
      '#globeWindArrows path[data-tier="2"]',
    );
    expect(path.attrs.transform).toBe("rotate(90 210 75)");
    expect(setItem).toHaveBeenCalledWith(
      WIND_STORED_KEY,
      options.winds.join(","),
    );
    expect(JSON.parse(result.content).changes[0]).toEqual({
      band: 2,
      previousDirection: 225,
      direction: 90,
    });
  });

  it("read falls back to localStorage when options.winds is missing", async () => {
    (globalThis as unknown as { options: { winds?: number[] } }).options = {};
    getItem.mockReturnValue("225,45,225,315,135,315");
    const path = {
      attrs: { transform: "rotate(315 210 199)" },
      getAttribute(name: string) {
        return (this.attrs as Record<string, string>)[name] ?? null;
      },
      setAttribute(name: string, value: string) {
        (this.attrs as Record<string, string>)[name] = value;
      },
    };
    querySelector.mockReturnValue(path);

    const result = await setWindTool.execute({ band: 5, direction: 0 });
    expect(result.isError).toBeFalsy();
    expect(getItem).toHaveBeenCalledWith(WIND_STORED_KEY);
    const change = JSON.parse(result.content).changes[0];
    expect(change.previousDirection).toBe(315);
  });

  it("read returns null when neither options nor localStorage has a value", async () => {
    (globalThis as unknown as { options: { winds?: number[] } }).options = {};
    getItem.mockReturnValue(null);
    querySelector.mockReturnValue(null);

    const result = await setWindTool.execute({ band: 3, direction: 270 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).changes[0].previousDirection).toBeNull();
  });

  it("swallows missing DOM and still persists", async () => {
    querySelector.mockReturnValue(null);
    const result = await setWindTool.execute({ band: 1, direction: 180 });
    expect(result.isError).toBeFalsy();
    const options = (globalThis as unknown as { options: { winds: number[] } })
      .options;
    expect(options.winds[1]).toBe(180);
    expect(setItem).toHaveBeenCalledWith(
      WIND_STORED_KEY,
      options.winds.join(","),
    );
  });

  it("lazily initialises options.winds from defaults when missing", async () => {
    (globalThis as unknown as { options: { winds?: number[] } }).options = {};
    querySelector.mockReturnValue(null);
    const result = await setWindTool.execute({ band: 0, direction: 45 });
    expect(result.isError).toBeFalsy();
    const options = (globalThis as unknown as { options: { winds: number[] } })
      .options;
    expect(options.winds).toHaveLength(WIND_BAND_COUNT);
    expect(options.winds[0]).toBe(45);
    // other bands should be the defaults
    expect(options.winds[1]).toBe(DEFAULT_WINDS[1]);
  });

  it("errors when localStorage is unavailable", async () => {
    (globalThis as unknown as { localStorage?: unknown }).localStorage =
      undefined;
    querySelector.mockReturnValue(null);
    const result = await setWindTool.execute({ band: 0, direction: 45 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/localStorage/);
  });

  it("errors when options is unavailable", async () => {
    (globalThis as unknown as { options?: unknown }).options = undefined;
    querySelector.mockReturnValue(null);
    const result = await setWindTool.execute({ band: 0, direction: 45 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/options/);
  });

  it("{reset: true} writes all six defaults and joins them to localStorage", async () => {
    querySelector.mockReturnValue(null);
    // start with non-default winds
    (globalThis as unknown as { options: { winds: number[] } }).options = {
      winds: [0, 0, 0, 0, 0, 0],
    };
    const result = await setWindTool.execute({ reset: true });
    expect(result.isError).toBeFalsy();
    const options = (globalThis as unknown as { options: { winds: number[] } })
      .options;
    expect(options.winds).toEqual([225, 45, 225, 315, 135, 315]);
    // setItem called once per apply
    expect(setItem).toHaveBeenLastCalledWith(
      WIND_STORED_KEY,
      "225,45,225,315,135,315",
    );
  });
});
