import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGetWorldRatesTool,
  type GetWorldRatesRuntime,
  getWorldRatesTool,
} from "./get-world-rates";
import type { WorldRates } from "./set-world-rates";

function makeRuntime(
  values: WorldRates = {
    populationRate: 1000,
    urbanization: 1,
    urbanDensity: 10,
  },
): { runtime: GetWorldRatesRuntime; read: ReturnType<typeof vi.fn> } {
  const read = vi.fn<GetWorldRatesRuntime["read"]>(() => values);
  return { runtime: { read }, read };
}

describe("get_world_rates tool", () => {
  it("returns the runtime's current rates", async () => {
    const { runtime, read } = makeRuntime({
      populationRate: 1500,
      urbanization: 1.3,
      urbanDensity: 12,
    });
    const tool = createGetWorldRatesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(read).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      populationRate: 1500,
      urbanization: 1.3,
      urbanDensity: 12,
    });
  });

  it("passes through all-null values when the runtime reports nothing", async () => {
    const { runtime } = makeRuntime({
      populationRate: null,
      urbanization: null,
      urbanDensity: null,
    });
    const tool = createGetWorldRatesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      populationRate: null,
      urbanization: null,
      urbanDensity: null,
    });
  });

  it("passes through a partial null (missing urban_density input)", async () => {
    const { runtime } = makeRuntime({
      populationRate: 1000,
      urbanization: 1,
      urbanDensity: null,
    });
    const tool = createGetWorldRatesTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      populationRate: 1000,
      urbanization: 1,
      urbanDensity: null,
    });
  });

  it("ignores any input arguments (tool is zero-arg)", async () => {
    const { runtime, read } = makeRuntime();
    const tool = createGetWorldRatesTool(runtime);

    // Extra/unknown keys and null inputs should all be accepted without error.
    const a = await tool.execute({ population_rate: 9999, foo: "bar" });
    const b = await tool.execute(null);
    const c = await tool.execute(undefined);
    expect(a.isError).toBeFalsy();
    expect(b.isError).toBeFalsy();
    expect(c.isError).toBeFalsy();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("does not call any write-like methods on the runtime", async () => {
    // Strictly read-only — verify `read` is the only thing invoked.
    const { runtime, read } = makeRuntime();
    const tool = createGetWorldRatesTool(runtime);
    await tool.execute({});
    expect(read).toHaveBeenCalledTimes(1);
    // Runtime has no other members to call.
    expect(Object.keys(runtime)).toEqual(["read"]);
  });

  it("exposes the expected tool name and schema", () => {
    expect(getWorldRatesTool.name).toBe("get_world_rates");
    // No required args.
    const required = getWorldRatesTool.input_schema.required;
    expect(required === undefined || required.length === 0).toBe(true);
    // Properties object is present (can be empty).
    expect(typeof getWorldRatesTool.input_schema.properties).toBe("object");
  });
});

describe("defaultGetWorldRatesRuntime (integration)", () => {
  interface FakeInput {
    value: string;
  }

  const elements: Record<string, FakeInput | null> = {};
  const getElementById = vi.fn(
    (id: string) => (id in elements ? elements[id] : null) as FakeInput | null,
  );

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;

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

  it("reads all three DOM inputs and returns their parsed numeric values", async () => {
    elements.populationRateInput = { value: "1500" };
    elements.urbanizationInput = { value: "1.3" };
    elements.urbanDensityInput = { value: "12" };

    const result = await getWorldRatesTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      populationRate: 1500,
      urbanization: 1.3,
      urbanDensity: 12,
    });
    // All three inputs consulted.
    expect(getElementById).toHaveBeenCalledWith("populationRateInput");
    expect(getElementById).toHaveBeenCalledWith("urbanizationInput");
    expect(getElementById).toHaveBeenCalledWith("urbanDensityInput");
  });

  it("reports null for missing inputs but still returns ok", async () => {
    // Only populationRateInput is present; the other two are missing.
    elements.populationRateInput = { value: "750" };

    const result = await getWorldRatesTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      populationRate: 750,
      urbanization: null,
      urbanDensity: null,
    });
  });

  it("reports null for an unparseable input value", async () => {
    elements.populationRateInput = { value: "not-a-number" };
    elements.urbanizationInput = { value: "" };
    elements.urbanDensityInput = { value: "10" };

    const result = await getWorldRatesTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      populationRate: null,
      urbanization: null,
      urbanDensity: 10,
    });
  });

  it("returns all null when document is unavailable", async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;

    const result = await getWorldRatesTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      populationRate: null,
      urbanization: null,
      urbanDensity: null,
    });
    // No element lookups attempted when document is undefined.
    expect(getElementById).not.toHaveBeenCalled();
  });
});
