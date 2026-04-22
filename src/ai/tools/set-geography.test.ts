import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetGeographyTool,
  GEOGRAPHY_FIELDS,
  type GeographyRuntime,
  setGeographyTool,
} from "./set-geography";

function makeRuntime(): {
  runtime: GeographyRuntime;
  apply: ReturnType<typeof vi.fn<GeographyRuntime["apply"]>>;
} {
  const apply = vi.fn<GeographyRuntime["apply"]>();
  return { runtime: { apply }, apply };
}

describe("set_geography tool", () => {
  it("sets map_size alone", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetGeographyTool(runtime);
    const result = await tool.execute({ map_size: 30 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(1);
    const [field, value] = apply.mock.calls[0] ?? [];
    expect(field).toBe(GEOGRAPHY_FIELDS.map_size);
    expect(value).toBe(30);
    expect(JSON.parse(result.content)).toEqual({ ok: true, map_size: 30 });
  });

  it("sets all three together", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetGeographyTool(runtime);
    const result = await tool.execute({
      map_size: 25,
      latitude: 60,
      longitude: 50,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(3);
    const body = JSON.parse(result.content);
    expect(body.map_size).toBe(25);
    expect(body.latitude).toBe(60);
    expect(body.longitude).toBe(50);
  });

  it("errors when nothing is supplied", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetGeographyTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-number / non-finite values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetGeographyTool(runtime);
    for (const bad of ["10", null, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
      expect((await tool.execute({ latitude: bad })).isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetGeographyTool(runtime);
    expect((await tool.execute({ map_size: 0 })).isError).toBe(true);
    expect((await tool.execute({ map_size: 101 })).isError).toBe(true);
    expect((await tool.execute({ latitude: -1 })).isError).toBe(true);
    expect((await tool.execute({ latitude: 101 })).isError).toBe(true);
    expect((await tool.execute({ longitude: -0.1 })).isError).toBe(true);
    expect((await tool.execute({ longitude: 100.1 })).isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("accepts boundary values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetGeographyTool(runtime);
    const result = await tool.execute({
      map_size: 1,
      latitude: 0,
      longitude: 100,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(3);
  });

  it("surfaces runtime failures", async () => {
    const runtime: GeographyRuntime = {
      apply: vi.fn(() => {
        throw new Error("no dom");
      }),
    };
    const tool = createSetGeographyTool(runtime);
    const result = await tool.execute({ latitude: 50 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no dom/);
  });
});

describe("defaultGeographyRuntime (integration)", () => {
  const setItem = vi.fn();
  const elements: Record<string, { value: string }> = {};
  const getElementById = vi.fn((id: string) => elements[id] ?? null);

  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;

  beforeEach(() => {
    setItem.mockReset();
    getElementById.mockClear();
    for (const id of [
      "mapSizeInput",
      "mapSizeOutput",
      "latitudeInput",
      "latitudeOutput",
      "longitudeInput",
      "longitudeOutput",
    ]) {
      elements[id] = { value: "" };
    }
    (globalThis as { document?: unknown }).document = { getElementById };
    (globalThis as { localStorage?: unknown }).localStorage = { setItem };
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { localStorage?: unknown }).localStorage = originalStorage;
    for (const k of Object.keys(elements)) delete elements[k];
  });

  it("updates paired input/output elements and localStorage per field", async () => {
    const result = await setGeographyTool.execute({
      map_size: 30,
      latitude: 60,
      longitude: 50,
    });
    expect(result.isError).toBeFalsy();
    expect(elements.mapSizeInput?.value).toBe("30");
    expect(elements.mapSizeOutput?.value).toBe("30");
    expect(elements.latitudeInput?.value).toBe("60");
    expect(elements.latitudeOutput?.value).toBe("60");
    expect(elements.longitudeInput?.value).toBe("50");
    expect(elements.longitudeOutput?.value).toBe("50");
    expect(setItem.mock.calls).toEqual([
      ["mapSize", "30"],
      ["latitude", "60"],
      ["longitude", "50"],
    ]);
  });

  it("soft-fails when an input element is missing (still writes what it can)", async () => {
    delete elements.latitudeInput;
    const result = await setGeographyTool.execute({ latitude: 45 });
    expect(result.isError).toBeFalsy();
    expect(elements.latitudeOutput?.value).toBe("45");
    expect(setItem).toHaveBeenCalledWith("latitude", "45");
  });
});
