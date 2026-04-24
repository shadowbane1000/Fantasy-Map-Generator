import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ClimateReadRuntime,
  type ClimateSnapshot,
  createGetClimateTool,
  defaultClimateReadRuntime,
  getClimateTool,
} from "./get-climate";

function runtimeOf(snapshot: ClimateSnapshot): ClimateReadRuntime {
  return { read: () => snapshot };
}

describe("get_climate tool", () => {
  it("returns all three temperature values mapped to snake_case", async () => {
    const tool = createGetClimateTool(
      runtimeOf({
        temperatureEquator: 28,
        temperatureNorthPole: -35,
        temperatureSouthPole: -20,
      }),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      temperature_equator: 28,
      temperature_north_pole: -35,
      temperature_south_pole: -20,
    });
  });

  it("passes null values through unchanged", async () => {
    const tool = createGetClimateTool(
      runtimeOf({
        temperatureEquator: null,
        temperatureNorthPole: null,
        temperatureSouthPole: null,
      }),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.temperature_equator).toBeNull();
    expect(body.temperature_north_pole).toBeNull();
    expect(body.temperature_south_pole).toBeNull();
  });

  it("ignores unexpected input arguments", async () => {
    const tool = createGetClimateTool(
      runtimeOf({
        temperatureEquator: 10,
        temperatureNorthPole: null,
        temperatureSouthPole: null,
      }),
    );
    const result = await tool.execute({ unused: true, another: "field" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).temperature_equator).toBe(10);
  });

  it("exposes the expected tool metadata", () => {
    expect(getClimateTool.name).toBe("get_climate");
    const schema = getClimateTool.input_schema as {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });
});

describe("defaultClimateReadRuntime (integration)", () => {
  const getItem = vi.fn();
  const elements: Record<string, { value: string } | null> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalOptions = (globalThis as { options?: unknown }).options;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;

  beforeEach(() => {
    getItem.mockReset();
    getElementById.mockClear();
    for (const k of Object.keys(elements)) delete elements[k];
    (globalThis as unknown as { options?: unknown }).options = {};
    (globalThis as unknown as { document?: unknown }).document = {
      getElementById,
    };
    (globalThis as unknown as { localStorage?: unknown }).localStorage = {
      getItem,
    };
  });

  afterEach(() => {
    (globalThis as unknown as { options?: unknown }).options = originalOptions;
    (globalThis as unknown as { document?: unknown }).document = originalDoc;
    (globalThis as unknown as { localStorage?: unknown }).localStorage =
      originalStorage;
  });

  it("reads temperatures from globalThis.options when present", () => {
    (
      globalThis as unknown as {
        options?: {
          temperatureEquator?: number;
          temperatureNorthPole?: number;
          temperatureSouthPole?: number;
        };
      }
    ).options = {
      temperatureEquator: 27,
      temperatureNorthPole: -30,
      temperatureSouthPole: -15,
    };
    const snap = defaultClimateReadRuntime.read();
    expect(snap.temperatureEquator).toBe(27);
    expect(snap.temperatureNorthPole).toBe(-30);
    expect(snap.temperatureSouthPole).toBe(-15);
  });

  it("falls back to DOM input value when options is missing the field", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    elements.temperatureEquatorInput = { value: "33" };
    elements.temperatureNorthPoleInput = { value: "-28" };
    elements.temperatureSouthPoleInput = { value: "-12.5" };
    const snap = defaultClimateReadRuntime.read();
    expect(snap.temperatureEquator).toBe(33);
    expect(snap.temperatureNorthPole).toBe(-28);
    expect(snap.temperatureSouthPole).toBe(-12.5);
  });

  it("falls back to localStorage when options + DOM are missing", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    getItem.mockImplementation((k: string) => {
      if (k === "temperatureEquator") return "20";
      if (k === "temperatureNorthPole") return "-40";
      if (k === "temperatureSouthPole") return "-10";
      return null;
    });
    const snap = defaultClimateReadRuntime.read();
    expect(snap.temperatureEquator).toBe(20);
    expect(snap.temperatureNorthPole).toBe(-40);
    expect(snap.temperatureSouthPole).toBe(-10);
  });

  it("returns null when no source has a usable value", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    getItem.mockReturnValue(null);
    const snap = defaultClimateReadRuntime.read();
    expect(snap.temperatureEquator).toBeNull();
    expect(snap.temperatureNorthPole).toBeNull();
    expect(snap.temperatureSouthPole).toBeNull();
  });

  it("prefers options over DOM and DOM over localStorage", () => {
    (
      globalThis as unknown as {
        options?: { temperatureEquator?: number };
      }
    ).options = {
      temperatureEquator: 42,
    };
    elements.temperatureEquatorInput = { value: "11" };
    elements.temperatureNorthPoleInput = { value: "-15" };
    getItem.mockImplementation((k: string) =>
      k === "temperatureSouthPole" ? "-5" : null,
    );
    const snap = defaultClimateReadRuntime.read();
    expect(snap.temperatureEquator).toBe(42); // from options
    expect(snap.temperatureNorthPole).toBe(-15); // from DOM
    expect(snap.temperatureSouthPole).toBe(-5); // from localStorage
  });

  it("ignores non-finite option values and falls through", () => {
    (
      globalThis as unknown as {
        options?: { temperatureEquator?: unknown };
      }
    ).options = {
      temperatureEquator: Number.NaN,
    };
    elements.temperatureEquatorInput = { value: "9" };
    const snap = defaultClimateReadRuntime.read();
    expect(snap.temperatureEquator).toBe(9);
  });
});
