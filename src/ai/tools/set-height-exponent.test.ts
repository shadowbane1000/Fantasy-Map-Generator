import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetHeightExponentTool,
  type HeightExponentRuntime,
  setHeightExponentTool,
} from "./set-height-exponent";

function makeRuntime(): {
  runtime: HeightExponentRuntime;
  apply: ReturnType<typeof vi.fn<HeightExponentRuntime["apply"]>>;
} {
  const apply = vi.fn<HeightExponentRuntime["apply"]>();
  return { runtime: { apply }, apply };
}

describe("set_height_exponent tool", () => {
  it("sets a mid-range value", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetHeightExponentTool(runtime);
    const result = await tool.execute({ value: 1.8 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1.8);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      heightExponent: 1.8,
    });
  });

  it("accepts boundary values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetHeightExponentTool(runtime);
    expect((await tool.execute({ value: 1.5 })).isError).toBeFalsy();
    expect((await tool.execute({ value: 2.2 })).isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("rejects out-of-range values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetHeightExponentTool(runtime);
    expect((await tool.execute({ value: 1.49 })).isError).toBe(true);
    expect((await tool.execute({ value: 2.21 })).isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-number / non-finite values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetHeightExponentTool(runtime);
    for (const bad of [
      "1.8",
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      {},
    ]) {
      expect((await tool.execute({ value: bad })).isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: HeightExponentRuntime = {
      apply: vi.fn(() => {
        throw new Error("no document");
      }),
    };
    const tool = createSetHeightExponentTool(runtime);
    const result = await tool.execute({ value: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no document/);
  });
});

describe("defaultHeightExponentRuntime (integration)", () => {
  const setItem = vi.fn();
  const el: { value: string } = { value: "" };
  const getElementById = vi.fn((id: string) =>
    id === "heightExponentInput" ? el : null,
  );

  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;

  beforeEach(() => {
    setItem.mockReset();
    getElementById.mockClear();
    el.value = "";
    (globalThis as { document?: unknown }).document = { getElementById };
    (globalThis as { localStorage?: unknown }).localStorage = { setItem };
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { localStorage?: unknown }).localStorage = originalStorage;
  });

  it("updates the DOM input value and localStorage", async () => {
    const result = await setHeightExponentTool.execute({ value: 1.8 });
    expect(result.isError).toBeFalsy();
    expect(el.value).toBe("1.8");
    expect(setItem).toHaveBeenCalledWith("heightExponent", "1.8");
  });

  it("still writes localStorage when the input is not mounted", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    const result = await setHeightExponentTool.execute({ value: 1.6 });
    expect(result.isError).toBeFalsy();
    expect(setItem).toHaveBeenCalledWith("heightExponent", "1.6");
  });
});
