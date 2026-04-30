import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGetHeightExponentTool,
  defaultHeightExponentReadRuntime,
  getHeightExponentTool,
  type HeightExponentReadRuntime,
} from "./get-height-exponent";

function runtimeOf(value: number | null): HeightExponentReadRuntime {
  return { read: () => value };
}

describe("get_height_exponent tool", () => {
  it("returns the runtime's number under `value`", async () => {
    const tool = createGetHeightExponentTool(runtimeOf(1.8));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ ok: true, value: 1.8 });
  });

  it("passes null through unchanged", async () => {
    const tool = createGetHeightExponentTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.value).toBeNull();
  });

  it("ignores unexpected input arguments", async () => {
    const tool = createGetHeightExponentTool(runtimeOf(2));
    const result = await tool.execute({ unused: true, value: 99 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).value).toBe(2);
  });

  it("exposes the expected tool metadata", () => {
    expect(getHeightExponentTool.name).toBe("get_height_exponent");
    const schema = getHeightExponentTool.input_schema as {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });
});

describe("defaultHeightExponentReadRuntime (integration)", () => {
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

  it("reads heightExponent from globalThis.options when present", () => {
    (
      globalThis as unknown as {
        options?: Record<string, number>;
      }
    ).options = { heightExponent: 1.9 };
    expect(defaultHeightExponentReadRuntime.read()).toBe(1.9);
  });

  it("falls back to DOM input value when options is missing the field", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    elements.heightExponentInput = { value: "1.7" };
    expect(defaultHeightExponentReadRuntime.read()).toBe(1.7);
  });

  it("falls back to localStorage when options + DOM are missing", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    getItem.mockImplementation((k: string) =>
      k === "heightExponent" ? "2.05" : null,
    );
    expect(defaultHeightExponentReadRuntime.read()).toBe(2.05);
  });

  it("returns null when no source has a usable value", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    getItem.mockReturnValue(null);
    expect(defaultHeightExponentReadRuntime.read()).toBeNull();
  });

  it("prefers options over DOM and DOM over localStorage", () => {
    (
      globalThis as unknown as {
        options?: Record<string, number>;
      }
    ).options = { heightExponent: 2.0 };
    elements.heightExponentInput = { value: "1.6" };
    getItem.mockReturnValue("1.5");
    expect(defaultHeightExponentReadRuntime.read()).toBe(2.0);

    // remove options → DOM wins over localStorage
    (globalThis as unknown as { options?: unknown }).options = {};
    expect(defaultHeightExponentReadRuntime.read()).toBe(1.6);

    // remove DOM → localStorage wins
    delete elements.heightExponentInput;
    expect(defaultHeightExponentReadRuntime.read()).toBe(1.5);
  });

  it("ignores non-finite option values and falls through", () => {
    (
      globalThis as unknown as {
        options?: { heightExponent?: unknown };
      }
    ).options = { heightExponent: Number.NaN };
    elements.heightExponentInput = { value: "1.85" };
    expect(defaultHeightExponentReadRuntime.read()).toBe(1.85);
  });

  it("ignores empty / non-numeric DOM values and falls through", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    elements.heightExponentInput = { value: "  " };
    getItem.mockReturnValue("1.95");
    expect(defaultHeightExponentReadRuntime.read()).toBe(1.95);
  });
});
