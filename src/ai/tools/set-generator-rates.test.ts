import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetGeneratorRatesTool,
  GENERATOR_FIELDS,
  type GeneratorRatesRuntime,
  setGeneratorRatesTool,
} from "./set-generator-rates";

function makeRuntime(): {
  runtime: GeneratorRatesRuntime;
  apply: ReturnType<typeof vi.fn<GeneratorRatesRuntime["apply"]>>;
} {
  const apply = vi.fn<GeneratorRatesRuntime["apply"]>(() => null);
  return { runtime: { apply }, apply };
}

describe("set_generator_rates tool", () => {
  it("writes a single field", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetGeneratorRatesTool(runtime);
    const result = await tool.execute({ states_number: 24 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(GENERATOR_FIELDS.states_number, 24);
  });

  it("writes multiple fields", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetGeneratorRatesTool(runtime);
    const result = await tool.execute({
      cultures: 12,
      religions_number: 8,
      growth_rate: 1.2,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(3);
  });

  it("rejects when all fields omitted", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetGeneratorRatesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range values per field", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetGeneratorRatesTool(runtime);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ cultures: 0 }, "cultures"],
      [{ cultures: 1000 }, "cultures"],
      [{ states_number: -1 }, "states_number"],
      [{ states_number: 500 }, "states_number"],
      [{ provinces_ratio: -1 }, "provinces_ratio"],
      [{ provinces_ratio: 101 }, "provinces_ratio"],
      [{ size_variety: -0.5 }, "size_variety"],
      [{ size_variety: 11 }, "size_variety"],
      [{ growth_rate: 0 }, "growth_rate"],
      [{ growth_rate: 3 }, "growth_rate"],
      [{ manors: -5 }, "manors"],
      [{ manors: 5000 }, "manors"],
      [{ religions_number: -1 }, "religions_number"],
      [{ religions_number: 100 }, "religions_number"],
    ];
    for (const [input, name] of cases) {
      const r = await tool.execute(input);
      expect(r.isError, `${name} should error`).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-integer for integer fields", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetGeneratorRatesTool(runtime);
    for (const field of [
      "cultures",
      "states_number",
      "provinces_ratio",
      "manors",
      "religions_number",
    ]) {
      const r = await tool.execute({ [field]: 1.5 });
      expect(r.isError, `${field}`).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("accepts non-integer for non-integer fields", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetGeneratorRatesTool(runtime);
    await tool.execute({ size_variety: 3.5, growth_rate: 1.3 });
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("rejects non-finite values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetGeneratorRatesTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "10"]) {
      const r = await tool.execute({ states_number: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: GeneratorRatesRuntime = {
      apply: vi.fn(() => {
        throw new Error("options is not available");
      }),
    };
    const tool = createSetGeneratorRatesTool(runtime);
    const result = await tool.execute({ states_number: 24 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/options/);
  });
});

describe("defaultGeneratorRatesRuntime (integration)", () => {
  const originalOptions = (globalThis as { options?: unknown }).options;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalLocalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;

  const inputs: Record<string, { value: string }> = {};
  const storage: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(inputs)) delete inputs[k];
    for (const k of Object.keys(storage)) delete storage[k];

    (globalThis as { options?: unknown }).options = {
      statesNumber: 10,
      cultures: 6,
    };
    (globalThis as { document?: unknown }).document = {
      getElementById(id: string) {
        if (!inputs[id]) inputs[id] = { value: "" };
        return inputs[id];
      },
    };
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem(key: string, value: string) {
        storage[key] = value;
      },
      getItem(key: string) {
        return storage[key] ?? null;
      },
    };
  });

  afterEach(() => {
    (globalThis as { options?: unknown }).options = originalOptions;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { localStorage?: unknown }).localStorage =
      originalLocalStorage;
  });

  it("writes options, DOM (input + output), and localStorage", async () => {
    const result = await setGeneratorRatesTool.execute({
      manors: 500,
      cultures: 15,
    });
    expect(result.isError).toBeFalsy();
    const options = (
      globalThis as unknown as { options: Record<string, number> }
    ).options;
    expect(options.manors).toBe(500);
    expect(options.cultures).toBe(15);
    expect(inputs.manorsInput?.value).toBe("500");
    expect(inputs.manorsOutput?.value).toBe("500");
    expect(inputs.culturesInput?.value).toBe("15");
    expect(inputs.culturesOutput?.value).toBe("15");
    expect(storage.manors).toBe("500");
    expect(storage.cultures).toBe("15");
  });

  it("handles fields with no outputId (writes only input)", async () => {
    await setGeneratorRatesTool.execute({ states_number: 42 });
    expect(inputs.statesNumber?.value).toBe("42");
    // states_number has no outputId — no crash, nothing created for output
    expect(storage.statesNumber).toBe("42");
  });
});
