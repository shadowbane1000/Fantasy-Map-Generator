import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGetGeneratorRatesTool,
  defaultGeneratorRatesReadRuntime,
  type GeneratorRatesReadRuntime,
  type GeneratorRatesSnapshot,
  getGeneratorRatesTool,
} from "./get-generator-rates";

function runtimeOf(
  snapshot: GeneratorRatesSnapshot,
): GeneratorRatesReadRuntime {
  return { read: () => snapshot };
}

describe("get_generator_rates tool", () => {
  it("returns every generator-field with snake_case keys", async () => {
    const tool = createGetGeneratorRatesTool(
      runtimeOf({
        cultures: 12,
        states_number: 24,
        provinces_ratio: 30,
        size_variety: 0.5,
        growth_rate: 1.0,
        manors: 1000,
        religions_number: 5,
      }),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      cultures: 12,
      states_number: 24,
      provinces_ratio: 30,
      size_variety: 0.5,
      growth_rate: 1.0,
      manors: 1000,
      religions_number: 5,
    });
  });

  it("passes null values through unchanged", async () => {
    const tool = createGetGeneratorRatesTool(
      runtimeOf({
        cultures: null,
        states_number: null,
        provinces_ratio: null,
        size_variety: null,
        growth_rate: null,
        manors: null,
        religions_number: null,
      }),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cultures).toBeNull();
    expect(body.states_number).toBeNull();
    expect(body.manors).toBeNull();
    expect(body.religions_number).toBeNull();
  });

  it("ignores unexpected input arguments", async () => {
    const tool = createGetGeneratorRatesTool(
      runtimeOf({
        cultures: 7,
        states_number: null,
        provinces_ratio: null,
        size_variety: null,
        growth_rate: null,
        manors: null,
        religions_number: null,
      }),
    );
    const result = await tool.execute({ unused: true, another: "field" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).cultures).toBe(7);
  });

  it("exposes the expected tool metadata", () => {
    expect(getGeneratorRatesTool.name).toBe("get_generator_rates");
    const schema = getGeneratorRatesTool.input_schema as {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });
});

describe("defaultGeneratorRatesReadRuntime (integration)", () => {
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

  it("reads rates from globalThis.options when present", () => {
    (
      globalThis as unknown as {
        options?: Record<string, number>;
      }
    ).options = {
      cultures: 18,
      statesNumber: 24,
      provincesRatio: 30,
      sizeVariety: 0.5,
      growthRate: 1.2,
      manors: 1000,
      religionsNumber: 5,
    };
    const snap = defaultGeneratorRatesReadRuntime.read();
    expect(snap.cultures).toBe(18);
    expect(snap.states_number).toBe(24);
    expect(snap.provinces_ratio).toBe(30);
    expect(snap.size_variety).toBe(0.5);
    expect(snap.growth_rate).toBe(1.2);
    expect(snap.manors).toBe(1000);
    expect(snap.religions_number).toBe(5);
  });

  it("falls back to DOM input value when options is missing the field", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    elements.culturesInput = { value: "10" };
    elements.statesNumber = { value: "30" };
    elements.provincesRatio = { value: "40" };
    elements.sizeVariety = { value: "1.5" };
    elements.growthRate = { value: "0.8" };
    elements.manorsInput = { value: "200" };
    elements.religionsNumber = { value: "9" };
    const snap = defaultGeneratorRatesReadRuntime.read();
    expect(snap.cultures).toBe(10);
    expect(snap.states_number).toBe(30);
    expect(snap.provinces_ratio).toBe(40);
    expect(snap.size_variety).toBe(1.5);
    expect(snap.growth_rate).toBe(0.8);
    expect(snap.manors).toBe(200);
    expect(snap.religions_number).toBe(9);
  });

  it("falls back to localStorage when options + DOM are missing", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    getItem.mockImplementation((k: string) => {
      const map: Record<string, string> = {
        cultures: "11",
        statesNumber: "22",
        provincesRatio: "33",
        sizeVariety: "2",
        growthRate: "1.1",
        manors: "500",
        religionsNumber: "7",
      };
      return map[k] ?? null;
    });
    const snap = defaultGeneratorRatesReadRuntime.read();
    expect(snap.cultures).toBe(11);
    expect(snap.states_number).toBe(22);
    expect(snap.provinces_ratio).toBe(33);
    expect(snap.size_variety).toBe(2);
    expect(snap.growth_rate).toBe(1.1);
    expect(snap.manors).toBe(500);
    expect(snap.religions_number).toBe(7);
  });

  it("returns null when no source has a usable value", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    getItem.mockReturnValue(null);
    const snap = defaultGeneratorRatesReadRuntime.read();
    expect(snap.cultures).toBeNull();
    expect(snap.states_number).toBeNull();
    expect(snap.provinces_ratio).toBeNull();
    expect(snap.size_variety).toBeNull();
    expect(snap.growth_rate).toBeNull();
    expect(snap.manors).toBeNull();
    expect(snap.religions_number).toBeNull();
  });

  it("prefers options over DOM and DOM over localStorage", () => {
    (
      globalThis as unknown as {
        options?: Record<string, number>;
      }
    ).options = { cultures: 42 };
    elements.statesNumber = { value: "15" };
    getItem.mockImplementation((k: string) => (k === "manors" ? "750" : null));
    const snap = defaultGeneratorRatesReadRuntime.read();
    expect(snap.cultures).toBe(42); // options
    expect(snap.states_number).toBe(15); // DOM
    expect(snap.manors).toBe(750); // localStorage
    expect(snap.provinces_ratio).toBeNull();
  });

  it("ignores non-finite option values and falls through", () => {
    (
      globalThis as unknown as {
        options?: { cultures?: unknown };
      }
    ).options = { cultures: Number.NaN };
    elements.culturesInput = { value: "6" };
    const snap = defaultGeneratorRatesReadRuntime.read();
    expect(snap.cultures).toBe(6);
  });
});
