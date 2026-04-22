import { describe, expect, it } from "vitest";
import {
  createGetMapInfoTool,
  type MapInfo,
  type MapStateRuntime,
} from "./get-map-info";

function makeInfo(overrides: Partial<MapInfo> = {}): MapInfo {
  return {
    mapName: "Test Realm",
    seed: "123456",
    mapId: 42,
    dimensions: { width: 1000, height: 800 },
    year: 123,
    era: "Eridanus Era",
    counts: {
      states: 5,
      provinces: 12,
      burgs: 30,
      religions: 4,
      cultures: 6,
      rivers: 20,
      markers: 10,
      zones: 3,
      cells: 10000,
      points: 10000,
    },
    ...overrides,
  };
}

function runtimeOf(info: MapInfo | null): MapStateRuntime {
  return { readState: () => info };
}

describe("get_map_info tool", () => {
  it("returns a valid JSON payload with the expected fields", async () => {
    const info = makeInfo();
    const tool = createGetMapInfoTool(runtimeOf(info));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.mapName).toBe("Test Realm");
    expect(body.seed).toBe("123456");
    expect(body.mapId).toBe(42);
    expect(body.dimensions).toEqual({ width: 1000, height: 800 });
    expect(body.year).toBe(123);
    expect(body.era).toBe("Eridanus Era");
    expect(body.counts).toEqual(info.counts);
  });

  it("passes nullable fields through as null", async () => {
    const info = makeInfo({
      mapName: null,
      seed: null,
      year: null,
      era: null,
      dimensions: null,
    });
    const tool = createGetMapInfoTool(runtimeOf(info));
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    expect(body.mapName).toBeNull();
    expect(body.seed).toBeNull();
    expect(body.year).toBeNull();
    expect(body.era).toBeNull();
    expect(body.dimensions).toBeNull();
  });

  it("returns a structured error when the map isn't ready", async () => {
    const tool = createGetMapInfoTool(runtimeOf(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not ready/i);
  });

  it("does not swallow numeric zeros as nulls in counts", async () => {
    const info = makeInfo({
      counts: {
        states: 0,
        provinces: 0,
        burgs: 0,
        religions: 0,
        cultures: 0,
        rivers: 0,
        markers: 0,
        zones: 0,
        cells: 0,
        points: 0,
      },
    });
    const tool = createGetMapInfoTool(runtimeOf(info));
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    for (const key of Object.keys(body.counts)) {
      expect(body.counts[key]).toBe(0);
    }
  });

  it("ignores unexpected input arguments", async () => {
    const tool = createGetMapInfoTool(runtimeOf(makeInfo()));
    const result = await tool.execute({ unused: true });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).ok).toBe(true);
  });
});
