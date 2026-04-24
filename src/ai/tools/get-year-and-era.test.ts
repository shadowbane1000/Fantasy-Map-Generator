import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGetYearAndEraTool,
  type GetYearAndEraRuntime,
  getYearAndEraTool,
} from "./get-year-and-era";
import type { WorldDateState } from "./set-year-and-era";

function makeRuntime(
  values: WorldDateState | null = {
    year: 100,
    era: "Bright Era",
    eraShort: "BE",
  },
): { runtime: GetYearAndEraRuntime; read: ReturnType<typeof vi.fn> } {
  const read = vi.fn<GetYearAndEraRuntime["read"]>(() =>
    values ? { ...values } : null,
  );
  return { runtime: { read }, read };
}

describe("get_year_and_era tool", () => {
  it("returns the runtime's current year and era", async () => {
    const { runtime, read } = makeRuntime({
      year: 1247,
      era: "Second Age",
      eraShort: "SA",
    });
    const tool = createGetYearAndEraTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(read).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      year: 1247,
      era: "Second Age",
      era_short: "SA",
    });
  });

  it("returns all-null when the runtime reports null (pre-load)", async () => {
    const { runtime } = makeRuntime(null);
    const tool = createGetYearAndEraTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      year: null,
      era: null,
      era_short: null,
    });
  });

  it("passes through per-field nulls from the runtime", async () => {
    const { runtime } = makeRuntime({
      year: 500,
      era: null,
      eraShort: null,
    });
    const tool = createGetYearAndEraTool(runtime);

    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      year: 500,
      era: null,
      era_short: null,
    });
  });

  it("ignores any input arguments (tool is zero-arg)", async () => {
    const { runtime, read } = makeRuntime();
    const tool = createGetYearAndEraTool(runtime);

    // Extra/unknown keys and null / undefined inputs should all be accepted.
    const a = await tool.execute({ year: 9999, foo: "bar" });
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
    const tool = createGetYearAndEraTool(runtime);
    await tool.execute({});
    expect(read).toHaveBeenCalledTimes(1);
    // Runtime has no other members to call.
    expect(Object.keys(runtime)).toEqual(["read"]);
  });

  it("exposes the expected tool name and schema", () => {
    expect(getYearAndEraTool.name).toBe("get_year_and_era");
    // No required args.
    const required = getYearAndEraTool.input_schema.required;
    expect(required === undefined || required.length === 0).toBe(true);
    // Properties object is present (can be empty).
    expect(typeof getYearAndEraTool.input_schema.properties).toBe("object");
  });
});

describe("defaultGetYearAndEraRuntime (integration)", () => {
  const originalOptions = (globalThis as unknown as { options?: unknown })
    .options;

  beforeEach(() => {
    (globalThis as unknown as { options?: unknown }).options = undefined;
  });

  afterEach(() => {
    (globalThis as unknown as { options?: unknown }).options = originalOptions;
  });

  it("reads year, era, eraShort from window.options", async () => {
    (globalThis as unknown as { options: Record<string, unknown> }).options = {
      year: 1247,
      era: "Second Age",
      eraShort: "SA",
    };

    const result = await getYearAndEraTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      year: 1247,
      era: "Second Age",
      era_short: "SA",
    });
  });

  it("reports all null when window.options is missing entirely", async () => {
    (globalThis as unknown as { options?: unknown }).options = undefined;

    const result = await getYearAndEraTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      year: null,
      era: null,
      era_short: null,
    });
  });

  it("reports null for individual fields that are missing or wrong-typed", async () => {
    (globalThis as unknown as { options: Record<string, unknown> }).options = {
      year: "not-a-number",
      era: 42,
      // eraShort intentionally absent
    };

    const result = await getYearAndEraTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      year: null,
      era: null,
      era_short: null,
    });
  });

  it("reports partial state when only some fields are populated", async () => {
    (globalThis as unknown as { options: Record<string, unknown> }).options = {
      year: 500,
      // era, eraShort intentionally absent
    };

    const result = await getYearAndEraTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      year: 500,
      era: null,
      era_short: null,
    });
  });
});
