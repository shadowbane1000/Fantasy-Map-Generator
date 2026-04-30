import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGetWindTool,
  defaultWindReadRuntime,
  getWindTool,
  WIND_BAND_NAMES,
  type WindReadRuntime,
  type WindSnapshot,
} from "./get-wind";

function runtimeOf(snapshot: WindSnapshot): WindReadRuntime {
  return { read: () => snapshot };
}

describe("get_wind tool", () => {
  it("returns every band keyed by snake_case alias plus a directions array", async () => {
    const tool = createGetWindTool(
      runtimeOf({
        polar_north: 225,
        temperate_north: 45,
        tropical_north: 225,
        tropical_south: 315,
        temperate_south: 135,
        polar_south: 315,
      }),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      polar_north: 225,
      temperate_north: 45,
      tropical_north: 225,
      tropical_south: 315,
      temperate_south: 135,
      polar_south: 315,
      directions: [225, 45, 225, 315, 135, 315],
    });
  });

  it("passes null values through unchanged in both keyed fields and directions array", async () => {
    const tool = createGetWindTool(
      runtimeOf({
        polar_north: null,
        temperate_north: null,
        tropical_north: null,
        tropical_south: null,
        temperate_south: null,
        polar_south: null,
      }),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.polar_north).toBeNull();
    expect(body.tropical_north).toBeNull();
    expect(body.polar_south).toBeNull();
    expect(body.directions).toEqual([null, null, null, null, null, null]);
  });

  it("ignores unexpected input arguments", async () => {
    const tool = createGetWindTool(
      runtimeOf({
        polar_north: 10,
        temperate_north: null,
        tropical_north: null,
        tropical_south: null,
        temperate_south: null,
        polar_south: null,
      }),
    );
    const result = await tool.execute({ unused: true, another: "field" });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.polar_north).toBe(10);
    expect(body.directions[0]).toBe(10);
  });

  it("exposes the expected tool metadata", () => {
    expect(getWindTool.name).toBe("get_wind");
    const schema = getWindTool.input_schema as {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });

  it("exports band names in tier order N→S", () => {
    expect(WIND_BAND_NAMES).toEqual([
      "polar_north",
      "temperate_north",
      "tropical_north",
      "tropical_south",
      "temperate_south",
      "polar_south",
    ]);
  });
});

describe("defaultWindReadRuntime (integration)", () => {
  const getItem = vi.fn();

  const originalOptions = (globalThis as { options?: unknown }).options;
  const originalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;

  beforeEach(() => {
    getItem.mockReset();
    (globalThis as unknown as { options?: unknown }).options = {};
    (globalThis as unknown as { localStorage?: unknown }).localStorage = {
      getItem,
    };
  });

  afterEach(() => {
    (globalThis as unknown as { options?: unknown }).options = originalOptions;
    (globalThis as unknown as { localStorage?: unknown }).localStorage =
      originalStorage;
  });

  it("reads winds from globalThis.options.winds when present", () => {
    (
      globalThis as unknown as {
        options?: { winds: number[] };
      }
    ).options = { winds: [225, 45, 225, 315, 135, 315] };
    const snap = defaultWindReadRuntime.read();
    expect(snap.polar_north).toBe(225);
    expect(snap.temperate_north).toBe(45);
    expect(snap.tropical_north).toBe(225);
    expect(snap.tropical_south).toBe(315);
    expect(snap.temperate_south).toBe(135);
    expect(snap.polar_south).toBe(315);
  });

  it('falls back to localStorage["winds"] when options is missing', () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    getItem.mockImplementation((k: string) =>
      k === "winds" ? "10,20,30,40,50,60" : null,
    );
    const snap = defaultWindReadRuntime.read();
    expect(snap.polar_north).toBe(10);
    expect(snap.temperate_north).toBe(20);
    expect(snap.tropical_north).toBe(30);
    expect(snap.tropical_south).toBe(40);
    expect(snap.temperate_south).toBe(50);
    expect(snap.polar_south).toBe(60);
  });

  it("returns null per band when no source has a usable value", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    getItem.mockReturnValue(null);
    const snap = defaultWindReadRuntime.read();
    expect(snap.polar_north).toBeNull();
    expect(snap.temperate_north).toBeNull();
    expect(snap.tropical_north).toBeNull();
    expect(snap.tropical_south).toBeNull();
    expect(snap.temperate_south).toBeNull();
    expect(snap.polar_south).toBeNull();
  });

  it("prefers options.winds over localStorage", () => {
    (
      globalThis as unknown as {
        options?: { winds: number[] };
      }
    ).options = { winds: [1, 2, 3, 4, 5, 6] };
    getItem.mockReturnValue("100,200,300,40,50,60");
    const snap = defaultWindReadRuntime.read();
    expect(snap.polar_north).toBe(1);
    expect(snap.polar_south).toBe(6);
  });

  it("ignores non-finite options.winds entries and falls through to localStorage", () => {
    (
      globalThis as unknown as {
        options?: { winds: unknown[] };
      }
    ).options = { winds: [Number.NaN, 45, 225, 315, 135, 315] };
    getItem.mockImplementation((k: string) =>
      k === "winds" ? "999,888,777,666,555,444" : null,
    );
    const snap = defaultWindReadRuntime.read();
    // NaN at band 0 → falls through to storage
    expect(snap.polar_north).toBe(999);
    // band 1 finite from options
    expect(snap.temperate_north).toBe(45);
  });

  it("ignores options.winds when it is not a 6-element array", () => {
    (
      globalThis as unknown as {
        options?: { winds: unknown };
      }
    ).options = { winds: [1, 2, 3] };
    getItem.mockImplementation((k: string) =>
      k === "winds" ? "10,20,30,40,50,60" : null,
    );
    const snap = defaultWindReadRuntime.read();
    expect(snap.polar_north).toBe(10);
    expect(snap.tropical_north).toBe(30);
  });

  it("ignores malformed localStorage tuples (wrong arity)", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    getItem.mockImplementation((k: string) =>
      k === "winds" ? "10,20,30" : null,
    );
    const snap = defaultWindReadRuntime.read();
    expect(snap.polar_north).toBeNull();
    expect(snap.tropical_north).toBeNull();
  });

  it("ignores localStorage tuples with non-finite entries", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    getItem.mockImplementation((k: string) =>
      k === "winds" ? "10,20,NaN,40,50,60" : null,
    );
    const snap = defaultWindReadRuntime.read();
    expect(snap.polar_north).toBeNull();
    expect(snap.temperate_north).toBeNull();
    expect(snap.tropical_north).toBeNull();
  });

  it("ignores empty localStorage entry", () => {
    (globalThis as unknown as { options?: unknown }).options = {};
    getItem.mockImplementation((k: string) => (k === "winds" ? "" : null));
    const snap = defaultWindReadRuntime.read();
    expect(snap.polar_north).toBeNull();
  });
});
