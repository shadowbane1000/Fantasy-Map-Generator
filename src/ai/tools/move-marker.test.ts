import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMarker, RawNote } from "./_shared";
import {
  createMoveMarkerTool,
  type MoveMarkerRef,
  type MoveMarkerRuntime,
  moveMarkerTool,
} from "./move-marker";

function makeRuntime(
  find: (ref: number | string) => MoveMarkerRef | null,
  moveResult = 42,
): {
  runtime: MoveMarkerRuntime;
  move: ReturnType<typeof vi.fn<MoveMarkerRuntime["move"]>>;
} {
  const move = vi.fn<MoveMarkerRuntime["move"]>(() => moveResult);
  return { runtime: { find, move }, move };
}

describe("move_marker tool", () => {
  it("moves by numeric id", async () => {
    const { runtime, move } = makeRuntime(
      (ref) =>
        ref === 5
          ? {
              i: 5,
              name: "Dragon Lair",
              previousX: 100,
              previousY: 200,
              previousCell: 11,
            }
          : null,
      42,
    );
    const tool = createMoveMarkerTool(runtime);
    const result = await tool.execute({ marker: 5, x: 300, y: 400 });
    expect(result.isError).toBeFalsy();
    expect(move).toHaveBeenCalled();
    const args = move.mock.calls[0];
    expect(args?.[1]).toBe(300);
    expect(args?.[2]).toBe(400);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Dragon Lair",
      x: 300,
      y: 400,
      cell: 42,
      previousX: 100,
      previousY: 200,
      previousCell: 11,
      noop: false,
    });
  });

  it("resolves by case-insensitive note name", async () => {
    const find = vi.fn<MoveMarkerRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "dragon lair"
        ? {
            i: 5,
            name: "Dragon Lair",
            previousX: 0,
            previousY: 0,
            previousCell: 0,
          }
        : null,
    );
    const { runtime, move } = makeRuntime(find);
    const tool = createMoveMarkerTool(runtime);
    await tool.execute({ marker: "DRAGON LAIR", x: 10, y: 20 });
    expect(find).toHaveBeenCalledWith("DRAGON LAIR");
    expect(move).toHaveBeenCalled();
  });

  it("rejects non-finite x", async () => {
    const { runtime, move } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousX: 0,
      previousY: 0,
      previousCell: 0,
    }));
    const tool = createMoveMarkerTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "100", null]) {
      const r = await tool.execute({ marker: 1, x: bad, y: 10 });
      expect(r.isError).toBe(true);
    }
    expect(move).not.toHaveBeenCalled();
  });

  it("rejects non-finite y", async () => {
    const { runtime, move } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousX: 0,
      previousY: 0,
      previousCell: 0,
    }));
    const tool = createMoveMarkerTool(runtime);
    for (const bad of [Number.NEGATIVE_INFINITY, Number.NaN, "", undefined]) {
      const r = await tool.execute({ marker: 1, x: 10, y: bad });
      expect(r.isError).toBe(true);
    }
    expect(move).not.toHaveBeenCalled();
  });

  it("rejects invalid marker refs", async () => {
    const { runtime, move } = makeRuntime(() => null);
    const tool = createMoveMarkerTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ marker: bad, x: 10, y: 20 });
      expect(r.isError).toBe(true);
    }
    expect(move).not.toHaveBeenCalled();
  });

  it("rejects unknown marker", async () => {
    const { runtime, move } = makeRuntime(() => null);
    const tool = createMoveMarkerTool(runtime);
    const result = await tool.execute({ marker: 999, x: 10, y: 20 });
    expect(result.isError).toBe(true);
    expect(move).not.toHaveBeenCalled();
  });

  it("is a noop when coords unchanged", async () => {
    const { runtime, move } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousX: 100,
      previousY: 200,
      previousCell: 11,
    }));
    const tool = createMoveMarkerTool(runtime);
    const result = await tool.execute({ marker: 5, x: 100, y: 200 });
    expect(move).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: MoveMarkerRuntime = {
      find: () => ({
        i: 5,
        name: "x",
        previousX: 0,
        previousY: 0,
        previousCell: 0,
      }),
      move: vi.fn(() => {
        throw new Error("findCell is not available yet");
      }),
    };
    const tool = createMoveMarkerTool(runtime);
    const result = await tool.execute({ marker: 5, x: 100, y: 200 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/findCell/);
  });
});

describe("defaultMoveMarkerRuntime (integration)", () => {
  const findCellMock = vi.fn((_x: number, _y: number) => 42);
  const drawMock = vi.fn();
  const setAttribute = vi.fn();
  const markerEl = { setAttribute };
  const getElementById = vi.fn((id: string) =>
    id === "marker5" ? markerEl : null,
  );
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalFindCell = (globalThis as { findCell?: unknown }).findCell;
  const originalDraw = (globalThis as { drawMarkers?: unknown }).drawMarkers;

  beforeEach(() => {
    findCellMock.mockClear();
    drawMock.mockReset();
    setAttribute.mockReset();
    getElementById.mockClear();

    (globalThis as { pack?: unknown }).pack = {
      markers: [
        { i: 2, x: 10, y: 20, cell: 2 },
        { i: 5, x: 100, y: 200, cell: 11 },
      ] satisfies RawMarker[],
    };
    (globalThis as { notes?: unknown }).notes = [
      { id: "marker5", name: "Dragon Lair" },
    ] satisfies RawNote[];
    (globalThis as { document?: unknown }).document = { getElementById };
    (globalThis as { findCell?: unknown }).findCell = findCellMock;
    (globalThis as { drawMarkers?: unknown }).drawMarkers = drawMock;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { notes?: unknown }).notes = originalNotes;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { findCell?: unknown }).findCell = originalFindCell;
    (globalThis as { drawMarkers?: unknown }).drawMarkers = originalDraw;
  });

  it("writes x/y/cell and updates the SVG attrs + draws", async () => {
    const result = await moveMarkerTool.execute({ marker: 5, x: 300, y: 400 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    const marker = pack.markers.find((m) => m.i === 5);
    expect(marker?.x).toBe(300);
    expect(marker?.y).toBe(400);
    expect(marker?.cell).toBe(42);
    expect(findCellMock).toHaveBeenCalledWith(300, 400);
    expect(setAttribute).toHaveBeenCalledWith("x", "300");
    expect(setAttribute).toHaveBeenCalledWith("y", "400");
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("resolves by case-insensitive note name", async () => {
    await moveMarkerTool.execute({ marker: "dragon lair", x: 50, y: 60 });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    const marker = pack.markers.find((m) => m.i === 5);
    expect(marker?.x).toBe(50);
    expect(marker?.y).toBe(60);
  });

  it("errors when findCell is missing", async () => {
    (globalThis as { findCell?: unknown }).findCell = undefined;
    const result = await moveMarkerTool.execute({ marker: 5, x: 300, y: 400 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/findCell/);
  });
});
