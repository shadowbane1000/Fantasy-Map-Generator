import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMarker, RawNote } from "./_shared";
import {
  addMarkerTool,
  createAddMarkerTool,
  type MarkerAddInput,
  type MarkerAddRuntime,
  type NewMarker,
} from "./add-marker";

function makeRuntime(
  result: (input: MarkerAddInput) => NewMarker = defaultResult,
): {
  runtime: MarkerAddRuntime;
  add: ReturnType<typeof vi.fn<MarkerAddRuntime["add"]>>;
} {
  const add = vi.fn<MarkerAddRuntime["add"]>(result);
  return { runtime: { add }, add };
}

function defaultResult(input: MarkerAddInput): NewMarker {
  return {
    i: 1,
    type: input.type ?? "custom",
    icon: input.icon ?? "📍",
    x: input.x,
    y: input.y,
    cell: 42,
    name: input.name ?? null,
    legend: input.name ? (input.legend ?? "") : null,
    lock: !!input.lock,
  };
}

describe("add_marker tool", () => {
  it("adds with just x, y using defaults", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddMarkerTool(runtime);
    const result = await tool.execute({ x: 100, y: 200 });
    expect(result.isError).toBeFalsy();
    expect(add).toHaveBeenCalledWith({
      x: 100,
      y: 200,
      type: undefined,
      icon: undefined,
      name: undefined,
      legend: undefined,
      lock: undefined,
    });
    const body = JSON.parse(result.content);
    expect(body.type).toBe("custom");
    expect(body.icon).toBe("📍");
    expect(body.name).toBeNull();
    expect(body.lock).toBe(false);
  });

  it("adds with all fields", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddMarkerTool(runtime);
    await tool.execute({
      x: 1,
      y: 2,
      type: "castle",
      icon: "🏰",
      name: "Dragon Lair",
      legend: "Here be dragons",
      lock: true,
    });
    expect(add).toHaveBeenCalledWith({
      x: 1,
      y: 2,
      type: "castle",
      icon: "🏰",
      name: "Dragon Lair",
      legend: "Here be dragons",
      lock: true,
    });
  });

  it("rejects non-finite x or y", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddMarkerTool(runtime);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, "10", null]) {
      expect((await tool.execute({ x: bad, y: 0 })).isError).toBe(true);
      expect((await tool.execute({ x: 0, y: bad })).isError).toBe(true);
    }
    expect(add).not.toHaveBeenCalled();
  });

  it("rejects invalid optional fields", async () => {
    const { runtime, add } = makeRuntime();
    const tool = createAddMarkerTool(runtime);
    for (const bad of ["", "   ", 42, {}]) {
      expect((await tool.execute({ x: 0, y: 0, type: bad })).isError).toBe(
        true,
      );
      expect((await tool.execute({ x: 0, y: 0, icon: bad })).isError).toBe(
        true,
      );
      expect((await tool.execute({ x: 0, y: 0, name: bad })).isError).toBe(
        true,
      );
    }
    expect((await tool.execute({ x: 0, y: 0, lock: "yes" })).isError).toBe(
      true,
    );
    expect(add).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: MarkerAddRuntime = {
      add: vi.fn(() => {
        throw new Error("findCell missing");
      }),
    };
    const tool = createAddMarkerTool(runtime);
    const result = await tool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/findCell missing/);
  });
});

describe("defaultMarkerAddRuntime (integration)", () => {
  const drawMock = vi.fn();
  const findCellMock = vi.fn((x: number, y: number) => x + y); // deterministic stub

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalFindCell = (globalThis as { findCell?: unknown }).findCell;
  const originalDraw = (globalThis as { drawMarkers?: unknown }).drawMarkers;

  beforeEach(() => {
    drawMock.mockReset();
    findCellMock.mockClear();
    (globalThis as { pack?: unknown }).pack = { markers: [] };
    (globalThis as { notes?: unknown }).notes = [];
    (globalThis as { findCell?: unknown }).findCell = findCellMock;
    (globalThis as { drawMarkers?: unknown }).drawMarkers = drawMock;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { notes?: unknown }).notes = originalNotes;
    (globalThis as { findCell?: unknown }).findCell = originalFindCell;
    (globalThis as { drawMarkers?: unknown }).drawMarkers = originalDraw;
  });

  it("pushes a marker with auto-assigned i and calls drawMarkers", async () => {
    const result = await addMarkerTool.execute({ x: 100, y: 200 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers).toHaveLength(1);
    expect(pack.markers[0]).toEqual({
      i: 1,
      type: "custom",
      icon: "📍",
      x: 100,
      y: 200,
      cell: 300,
    });
    expect(findCellMock).toHaveBeenCalledWith(100, 200);
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("creates a matching note when name is provided", async () => {
    await addMarkerTool.execute({
      x: 1,
      y: 2,
      name: "Dragon Lair",
      legend: "Here be dragons",
    });
    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes).toEqual([
      { id: "marker1", name: "Dragon Lair", legend: "Here be dragons" },
    ]);
  });

  it("sets the lock flag when requested", async () => {
    await addMarkerTool.execute({ x: 5, y: 5, lock: true });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[0]?.lock).toBe(true);
  });

  it("errors when pack.markers is missing", async () => {
    (globalThis as { pack?: unknown }).pack = {};
    const result = await addMarkerTool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
  });

  it("errors when findCell is missing", async () => {
    (globalThis as { findCell?: unknown }).findCell = undefined;
    const result = await addMarkerTool.execute({ x: 0, y: 0 });
    expect(result.isError).toBe(true);
  });

  it("creates window.notes if missing and still pushes the note", async () => {
    (globalThis as { notes?: unknown }).notes = undefined;
    await addMarkerTool.execute({ x: 0, y: 0, name: "Ruin" });
    const notes = (globalThis as { notes: RawNote[] }).notes;
    expect(notes).toEqual([{ id: "marker1", name: "Ruin", legend: "" }]);
  });

  it("second add increments i", async () => {
    await addMarkerTool.execute({ x: 1, y: 1 });
    await addMarkerTool.execute({ x: 2, y: 2 });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers.map((m) => m.i)).toEqual([1, 2]);
  });
});
