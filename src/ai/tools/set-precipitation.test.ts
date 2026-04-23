import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetPrecipitationTool,
  PRECIPITATION_INPUT_ID,
  PRECIPITATION_MAX,
  PRECIPITATION_MIN,
  PRECIPITATION_OUTPUT_ID,
  PRECIPITATION_STORED_KEY,
  type SetPrecipitationRuntime,
  setPrecipitationTool,
} from "./set-precipitation";

function makeRuntime(previous: number | null = 100): {
  runtime: SetPrecipitationRuntime;
  read: ReturnType<typeof vi.fn<SetPrecipitationRuntime["read"]>>;
  apply: ReturnType<typeof vi.fn<SetPrecipitationRuntime["apply"]>>;
} {
  const read = vi.fn<SetPrecipitationRuntime["read"]>(() => previous);
  const apply = vi.fn<SetPrecipitationRuntime["apply"]>();
  return { runtime: { read, apply }, read, apply };
}

describe("set_precipitation tool", () => {
  it("applies a valid value and returns {previousValue, value}", async () => {
    const { runtime, apply } = makeRuntime(120);
    const tool = createSetPrecipitationTool(runtime);
    const result = await tool.execute({ value: 180 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(180);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previousValue: 120,
      value: 180,
    });
  });

  it("rejects a missing value", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetPrecipitationTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-number / non-finite / out-of-range values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetPrecipitationTool(runtime);
    const bad = [
      "100",
      null,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      {},
      -1,
      PRECIPITATION_MAX + 1,
    ];
    for (const v of bad) {
      const result = await tool.execute({ value: v });
      expect(result.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("accepts the boundary values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetPrecipitationTool(runtime);
    const minResult = await tool.execute({ value: PRECIPITATION_MIN });
    expect(minResult.isError).toBeFalsy();
    const maxResult = await tool.execute({ value: PRECIPITATION_MAX });
    expect(maxResult.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenNthCalledWith(1, PRECIPITATION_MIN);
    expect(apply).toHaveBeenNthCalledWith(2, PRECIPITATION_MAX);
  });

  it("surfaces runtime.apply failures as errorResult", async () => {
    const runtime: SetPrecipitationRuntime = {
      read: () => 100,
      apply: vi.fn(() => {
        throw new Error("localStorage exploded");
      }),
    };
    const tool = createSetPrecipitationTool(runtime);
    const result = await tool.execute({ value: 50 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/localStorage exploded/);
  });

  it("reports previousValue: null when runtime.read returns null", async () => {
    const { runtime } = makeRuntime(null);
    const tool = createSetPrecipitationTool(runtime);
    const result = await tool.execute({ value: 75 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previousValue: null,
      value: 75,
    });
  });
});

describe("defaultSetPrecipitationRuntime (integration)", () => {
  const setItem = vi.fn();
  const getItem = vi.fn();
  const elements: Record<string, { value: string }> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as unknown as { document?: unknown })
    .document;
  const originalStorage = (globalThis as unknown as { localStorage?: unknown })
    .localStorage;

  beforeEach(() => {
    setItem.mockReset();
    getItem.mockReset();
    getElementById.mockClear();
    for (const id of [PRECIPITATION_INPUT_ID, PRECIPITATION_OUTPUT_ID]) {
      elements[id] = { value: "" };
    }
    (globalThis as unknown as { document?: unknown }).document = {
      getElementById,
    };
    (globalThis as unknown as { localStorage?: unknown }).localStorage = {
      setItem,
      getItem,
    };
  });

  afterEach(() => {
    (globalThis as unknown as { document?: unknown }).document = originalDoc;
    (globalThis as unknown as { localStorage?: unknown }).localStorage =
      originalStorage;
    for (const k of Object.keys(elements)) delete elements[k];
  });

  it("applies value to both DOM elements and localStorage", async () => {
    const result = await setPrecipitationTool.execute({ value: 220 });
    expect(result.isError).toBeFalsy();
    expect(elements[PRECIPITATION_INPUT_ID]?.value).toBe("220");
    expect(elements[PRECIPITATION_OUTPUT_ID]?.value).toBe("220");
    expect(setItem).toHaveBeenCalledWith(PRECIPITATION_STORED_KEY, "220");
  });

  it("reads previousValue from #precOutput when present", async () => {
    const output = elements[PRECIPITATION_OUTPUT_ID];
    if (output) output.value = "140";
    const input = elements[PRECIPITATION_INPUT_ID];
    if (input) input.value = "999";
    const result = await setPrecipitationTool.execute({ value: 50 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousValue).toBe(140);
  });

  it("falls back to #precInput when #precOutput is empty", async () => {
    const input = elements[PRECIPITATION_INPUT_ID];
    if (input) input.value = "77";
    const result = await setPrecipitationTool.execute({ value: 50 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousValue).toBe(77);
  });

  it("falls back to localStorage when DOM is absent", async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;
    getItem.mockReturnValueOnce("42");
    const result = await setPrecipitationTool.execute({ value: 50 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousValue).toBe(42);
    expect(getItem).toHaveBeenCalledWith(PRECIPITATION_STORED_KEY);
  });

  it("returns previousValue: null when nothing is set", async () => {
    getItem.mockReturnValue(null);
    const result = await setPrecipitationTool.execute({ value: 50 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previousValue).toBeNull();
  });

  it("errors when localStorage is unavailable", async () => {
    (globalThis as unknown as { localStorage?: unknown }).localStorage =
      undefined;
    const result = await setPrecipitationTool.execute({ value: 50 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/localStorage/);
  });
});
