import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMarker, RawNote } from "./_shared";
import {
  createSetMarkerSizeTool,
  DEFAULT_MARKER_SIZE,
  type MarkerSizeRef,
  type MarkerSizeRuntime,
  setMarkerSizeTool,
} from "./set-marker-size";

function makeRuntime(find: (ref: number | string) => MarkerSizeRef | null): {
  runtime: MarkerSizeRuntime;
  setSize: ReturnType<typeof vi.fn<MarkerSizeRuntime["setSize"]>>;
} {
  const setSize = vi.fn<MarkerSizeRuntime["setSize"]>();
  return { runtime: { find, setSize }, setSize };
}

describe("set_marker_size tool", () => {
  it("sets size by numeric id", async () => {
    const { runtime, setSize } = makeRuntime((ref) =>
      ref === 5
        ? { i: 5, name: "Dragon Lair", previousSize: DEFAULT_MARKER_SIZE }
        : null,
    );
    const tool = createSetMarkerSizeTool(runtime);
    const result = await tool.execute({ marker: 5, size: 45 });
    expect(result.isError).toBeFalsy();
    expect(setSize).toHaveBeenCalledWith(5, 45);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Dragon Lair",
      size: 45,
      previousSize: DEFAULT_MARKER_SIZE,
      noop: false,
    });
  });

  it("resolves by case-insensitive note name", async () => {
    const find = vi.fn<MarkerSizeRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "dragon lair"
        ? { i: 5, name: "Dragon Lair", previousSize: 20 }
        : null,
    );
    const { runtime, setSize } = makeRuntime(find);
    const tool = createSetMarkerSizeTool(runtime);
    await tool.execute({ marker: "DRAGON LAIR", size: 60 });
    expect(find).toHaveBeenCalledWith("DRAGON LAIR");
    expect(setSize).toHaveBeenCalledWith(5, 60);
  });

  it("rejects non-finite size", async () => {
    const { runtime, setSize } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousSize: 30,
    }));
    const tool = createSetMarkerSizeTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "30", null]) {
      const r = await tool.execute({ marker: 1, size: bad });
      expect(r.isError).toBe(true);
    }
    expect(setSize).not.toHaveBeenCalled();
  });

  it("rejects zero / negative size", async () => {
    const { runtime, setSize } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousSize: 30,
    }));
    const tool = createSetMarkerSizeTool(runtime);
    for (const bad of [0, -1, -100]) {
      const r = await tool.execute({ marker: 1, size: bad });
      expect(r.isError).toBe(true);
    }
    expect(setSize).not.toHaveBeenCalled();
  });

  it("rejects invalid marker refs", async () => {
    const { runtime, setSize } = makeRuntime(() => null);
    const tool = createSetMarkerSizeTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ marker: bad, size: 30 });
      expect(r.isError).toBe(true);
    }
    expect(setSize).not.toHaveBeenCalled();
  });

  it("rejects unknown marker", async () => {
    const { runtime, setSize } = makeRuntime(() => null);
    const tool = createSetMarkerSizeTool(runtime);
    const result = await tool.execute({ marker: 999, size: 30 });
    expect(result.isError).toBe(true);
    expect(setSize).not.toHaveBeenCalled();
  });

  it("is a noop when size is unchanged", async () => {
    const { runtime, setSize } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousSize: 45,
    }));
    const tool = createSetMarkerSizeTool(runtime);
    const result = await tool.execute({ marker: 1, size: 45 });
    expect(setSize).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: MarkerSizeRuntime = {
      find: () => ({ i: 1, name: "x", previousSize: 30 }),
      setSize: vi.fn(() => {
        throw new Error("pack.markers is not available.");
      }),
    };
    const tool = createSetMarkerSizeTool(runtime);
    const result = await tool.execute({ marker: 1, size: 45 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/markers/);
  });
});

describe("defaultMarkerSizeRuntime (integration)", () => {
  const drawMock = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalDraw = (globalThis as { drawMarkers?: unknown }).drawMarkers;

  beforeEach(() => {
    drawMock.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      markers: [
        { i: 2, size: 30 },
        { i: 5, type: "volcano", size: 30 },
        { i: 8, type: "volcano", size: 30 },
      ] satisfies RawMarker[],
    };
    (globalThis as { notes?: unknown }).notes = [
      { id: "marker5", name: "Dragon Lair" },
    ] satisfies RawNote[];
    (globalThis as { drawMarkers?: unknown }).drawMarkers = drawMock;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { notes?: unknown }).notes = originalNotes;
    (globalThis as { drawMarkers?: unknown }).drawMarkers = originalDraw;
  });

  it("writes size on target marker and calls drawMarkers once", async () => {
    const result = await setMarkerSizeTool.execute({ marker: 5, size: 60 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.size).toBe(60);
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("resolves by case-insensitive note name", async () => {
    await setMarkerSizeTool.execute({ marker: "dragon lair", size: 70 });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.size).toBe(70);
  });

  it("does NOT cascade to same-type markers", async () => {
    await setMarkerSizeTool.execute({ marker: 5, size: 60 });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.size).toBe(60);
    expect(pack.markers[2]?.size).toBe(30);
  });

  it("succeeds when drawMarkers is missing", async () => {
    (globalThis as { drawMarkers?: unknown }).drawMarkers = undefined;
    const result = await setMarkerSizeTool.execute({ marker: 5, size: 60 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.size).toBe(60);
  });
});
