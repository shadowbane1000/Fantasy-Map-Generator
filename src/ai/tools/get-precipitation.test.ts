import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGetPrecipitationTool,
  defaultPrecipitationReadRuntime,
  getPrecipitationTool,
  type PrecipitationReadRuntime,
  type PrecipitationSnapshot,
} from "./get-precipitation";

function runtimeOf(snapshot: PrecipitationSnapshot): PrecipitationReadRuntime {
  return { read: () => snapshot };
}

describe("get_precipitation tool", () => {
  it("returns the value from a non-null snapshot", async () => {
    const tool = createGetPrecipitationTool(runtimeOf({ value: 100 }));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({ ok: true, value: 100 });
  });

  it("passes a null value through unchanged", async () => {
    const tool = createGetPrecipitationTool(runtimeOf({ value: null }));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({ ok: true, value: null });
  });

  it("ignores unexpected input arguments", async () => {
    const tool = createGetPrecipitationTool(runtimeOf({ value: 250 }));
    const result = await tool.execute({ unused: true, another: "field" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).value).toBe(250);
  });

  it("exposes the expected tool metadata", () => {
    expect(getPrecipitationTool.name).toBe("get_precipitation");
    const schema = getPrecipitationTool.input_schema as {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });
});

describe("defaultPrecipitationReadRuntime (integration)", () => {
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

  it("reads from globalThis.options.prec when present", () => {
    (globalThis as unknown as { options?: Record<string, number> }).options = {
      prec: 175,
    };
    const snap = defaultPrecipitationReadRuntime.read();
    expect(snap.value).toBe(175);
  });

  it("falls back to DOM precOutput when options is missing", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    elements.precOutput = { value: "120" };
    const snap = defaultPrecipitationReadRuntime.read();
    expect(snap.value).toBe(120);
  });

  it("falls back to DOM precInput when options + precOutput missing", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    elements.precInput = { value: "85" };
    const snap = defaultPrecipitationReadRuntime.read();
    expect(snap.value).toBe(85);
  });

  it("falls back to localStorage.prec when options + DOM are missing", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    getItem.mockImplementation((k: string) => (k === "prec" ? "60" : null));
    const snap = defaultPrecipitationReadRuntime.read();
    expect(snap.value).toBe(60);
  });

  it("returns null when no source has a usable value", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    getItem.mockReturnValue(null);
    const snap = defaultPrecipitationReadRuntime.read();
    expect(snap.value).toBeNull();
  });

  it("prefers options over DOM and DOM-output over DOM-input over localStorage", () => {
    // options wins outright
    (globalThis as unknown as { options?: Record<string, number> }).options = {
      prec: 42,
    };
    elements.precOutput = { value: "11" };
    elements.precInput = { value: "22" };
    getItem.mockImplementation((k: string) => (k === "prec" ? "33" : null));
    expect(defaultPrecipitationReadRuntime.read().value).toBe(42);

    // no options → precOutput wins over precInput + localStorage
    (globalThis as unknown as { options?: unknown }).options = {};
    expect(defaultPrecipitationReadRuntime.read().value).toBe(11);

    // no options + no precOutput → precInput wins over localStorage
    delete elements.precOutput;
    expect(defaultPrecipitationReadRuntime.read().value).toBe(22);

    // no options + no DOM → localStorage
    delete elements.precInput;
    expect(defaultPrecipitationReadRuntime.read().value).toBe(33);
  });

  it("ignores non-finite options.prec and falls through", () => {
    (globalThis as unknown as { options?: { prec?: unknown } }).options = {
      prec: Number.NaN,
    };
    elements.precOutput = { value: "70" };
    const snap = defaultPrecipitationReadRuntime.read();
    expect(snap.value).toBe(70);
  });

  it("skips empty / unparseable DOM values and falls through", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    elements.precOutput = { value: "" };
    elements.precInput = { value: "not-a-number" };
    getItem.mockImplementation((k: string) => (k === "prec" ? "99" : null));
    const snap = defaultPrecipitationReadRuntime.read();
    expect(snap.value).toBe(99);
  });
});
