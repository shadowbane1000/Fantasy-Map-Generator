import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGetGeographyTool,
  defaultGeographyReadRuntime,
  type GeographyReadRuntime,
  type GeographySnapshot,
  getGeographyTool,
} from "./get-geography";

function runtimeOf(snapshot: GeographySnapshot): GeographyReadRuntime {
  return { read: () => snapshot };
}

describe("get_geography tool", () => {
  it("returns all three values mapped to snake_case", async () => {
    const tool = createGetGeographyTool(
      runtimeOf({ mapSize: 30, latitude: 60, longitude: 50 }),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      map_size: 30,
      latitude: 60,
      longitude: 50,
    });
  });

  it("passes null values through unchanged", async () => {
    const tool = createGetGeographyTool(
      runtimeOf({ mapSize: null, latitude: null, longitude: null }),
    );
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.map_size).toBeNull();
    expect(body.latitude).toBeNull();
    expect(body.longitude).toBeNull();
  });

  it("ignores unexpected input arguments", async () => {
    const tool = createGetGeographyTool(
      runtimeOf({ mapSize: 10, latitude: null, longitude: null }),
    );
    const result = await tool.execute({ unused: true, another: "field" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).map_size).toBe(10);
  });

  it("exposes the expected tool metadata", () => {
    expect(getGeographyTool.name).toBe("get_geography");
    const schema = getGeographyTool.input_schema as {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({});
    expect(schema.required).toBeUndefined();
  });
});

describe("defaultGeographyReadRuntime (integration)", () => {
  const getItem = vi.fn();
  const elements: Record<string, { value: string } | null> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;

  beforeEach(() => {
    getItem.mockReset();
    getElementById.mockClear();
    for (const k of Object.keys(elements)) delete elements[k];
    (globalThis as unknown as { document?: unknown }).document = {
      getElementById,
    };
    (globalThis as unknown as { localStorage?: unknown }).localStorage = {
      getItem,
    };
  });

  afterEach(() => {
    (globalThis as unknown as { document?: unknown }).document = originalDoc;
    (globalThis as unknown as { localStorage?: unknown }).localStorage =
      originalStorage;
  });

  it("reads from DOM input value when elements are present", () => {
    elements.mapSizeInput = { value: "25" };
    elements.latitudeInput = { value: "60" };
    elements.longitudeInput = { value: "40" };
    const snap = defaultGeographyReadRuntime.read();
    expect(snap.mapSize).toBe(25);
    expect(snap.latitude).toBe(60);
    expect(snap.longitude).toBe(40);
  });

  it("falls back to localStorage when DOM is missing the field", () => {
    getItem.mockImplementation((k: string) => {
      if (k === "mapSize") return "15";
      if (k === "latitude") return "55";
      if (k === "longitude") return "45";
      return null;
    });
    const snap = defaultGeographyReadRuntime.read();
    expect(snap.mapSize).toBe(15);
    expect(snap.latitude).toBe(55);
    expect(snap.longitude).toBe(45);
  });

  it("returns null when no source has a usable value", () => {
    getItem.mockReturnValue(null);
    const snap = defaultGeographyReadRuntime.read();
    expect(snap.mapSize).toBeNull();
    expect(snap.latitude).toBeNull();
    expect(snap.longitude).toBeNull();
  });

  it("prefers DOM over localStorage when both are present", () => {
    elements.mapSizeInput = { value: "11" };
    getItem.mockImplementation((k: string) => {
      if (k === "mapSize") return "99";
      if (k === "latitude") return "44";
      if (k === "longitude") return "77";
      return null;
    });
    const snap = defaultGeographyReadRuntime.read();
    expect(snap.mapSize).toBe(11); // from DOM
    expect(snap.latitude).toBe(44); // from localStorage
    expect(snap.longitude).toBe(77); // from localStorage
  });

  it("skips empty / unparseable DOM values and falls through", () => {
    elements.mapSizeInput = { value: "" };
    elements.latitudeInput = { value: "not-a-number" };
    getItem.mockImplementation((k: string) => {
      if (k === "mapSize") return "22";
      if (k === "latitude") return "66";
      return null;
    });
    const snap = defaultGeographyReadRuntime.read();
    expect(snap.mapSize).toBe(22);
    expect(snap.latitude).toBe(66);
    expect(snap.longitude).toBeNull();
  });
});
