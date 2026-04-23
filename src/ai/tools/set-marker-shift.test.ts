import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMarker, RawNote } from "./_shared";
import {
  createSetMarkerShiftTool,
  DEFAULT_MARKER_SHIFT,
  MARKER_SHIFT_MAX,
  MARKER_SHIFT_MIN,
  type MarkerShiftRef,
  type SetMarkerShiftRuntime,
  setMarkerShiftTool,
} from "./set-marker-shift";

function makeRuntime(find: (ref: number | string) => MarkerShiftRef | null): {
  runtime: SetMarkerShiftRuntime;
  apply: ReturnType<typeof vi.fn<SetMarkerShiftRuntime["apply"]>>;
} {
  const apply = vi.fn<SetMarkerShiftRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_marker_shift tool", () => {
  it("sets both dx and dy by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 5
        ? {
            i: 5,
            name: "Dragon Lair",
            previousDx: DEFAULT_MARKER_SHIFT,
            previousDy: DEFAULT_MARKER_SHIFT,
          }
        : null,
    );
    const tool = createSetMarkerShiftTool(runtime);
    const result = await tool.execute({ marker: 5, dx: 30, dy: 70 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, 30, 70);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Dragon Lair",
      dx: 30,
      dy: 70,
      previousDx: DEFAULT_MARKER_SHIFT,
      previousDy: DEFAULT_MARKER_SHIFT,
      noop: false,
    });
  });

  it("sets only dx and preserves existing dy", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDx: DEFAULT_MARKER_SHIFT,
      previousDy: 80,
    }));
    const tool = createSetMarkerShiftTool(runtime);
    const result = await tool.execute({ marker: 1, dx: 25 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 25, 80);
    const parsed = JSON.parse(result.content);
    expect(parsed.dx).toBe(25);
    expect(parsed.dy).toBe(80);
    expect(parsed.previousDy).toBe(80);
  });

  it("sets only dy and preserves existing dx", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDx: 20,
      previousDy: DEFAULT_MARKER_SHIFT,
    }));
    const tool = createSetMarkerShiftTool(runtime);
    const result = await tool.execute({ marker: 1, dy: 65 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 20, 65);
    const parsed = JSON.parse(result.content);
    expect(parsed.dx).toBe(20);
    expect(parsed.dy).toBe(65);
    expect(parsed.previousDx).toBe(20);
  });

  it("resolves by case-insensitive note name", async () => {
    const find = vi.fn<SetMarkerShiftRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "dragon lair"
        ? { i: 5, name: "Dragon Lair", previousDx: 50, previousDy: 50 }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetMarkerShiftTool(runtime);
    await tool.execute({ marker: "DRAGON LAIR", dx: 40, dy: 60 });
    expect(find).toHaveBeenCalledWith("DRAGON LAIR");
    expect(apply).toHaveBeenCalledWith(5, 40, 60);
  });

  it("rejects when both dx and dy are missing", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDx: 50,
      previousDy: 50,
    }));
    const tool = createSetMarkerShiftTool(runtime);
    const r = await tool.execute({ marker: 1 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/At least one/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects when both dx and dy are explicitly undefined", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDx: 50,
      previousDy: 50,
    }));
    const tool = createSetMarkerShiftTool(runtime);
    const r = await tool.execute({
      marker: 1,
      dx: undefined,
      dy: undefined,
    });
    expect(r.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-finite / non-number dx", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDx: 50,
      previousDy: 50,
    }));
    const tool = createSetMarkerShiftTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "50", null]) {
      const r = await tool.execute({ marker: 1, dx: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-finite / non-number dy", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDx: 50,
      previousDy: 50,
    }));
    const tool = createSetMarkerShiftTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "50", null]) {
      const r = await tool.execute({ marker: 1, dy: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range dx", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDx: 50,
      previousDy: 50,
    }));
    const tool = createSetMarkerShiftTool(runtime);
    for (const bad of [
      MARKER_SHIFT_MIN - 0.5,
      MARKER_SHIFT_MAX + 0.5,
      -1,
      101,
    ]) {
      const r = await tool.execute({ marker: 1, dx: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range dy", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDx: 50,
      previousDy: 50,
    }));
    const tool = createSetMarkerShiftTool(runtime);
    for (const bad of [
      MARKER_SHIFT_MIN - 0.5,
      MARKER_SHIFT_MAX + 0.5,
      -1,
      101,
    ]) {
      const r = await tool.execute({ marker: 1, dy: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("accepts the boundary values", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDx: 50,
      previousDy: 50,
    }));
    const tool = createSetMarkerShiftTool(runtime);
    const r1 = await tool.execute({
      marker: 1,
      dx: MARKER_SHIFT_MIN,
      dy: MARKER_SHIFT_MIN,
    });
    expect(r1.isError).toBeFalsy();
    const r2 = await tool.execute({
      marker: 1,
      dx: MARKER_SHIFT_MAX,
      dy: MARKER_SHIFT_MAX,
    });
    expect(r2.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid marker refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetMarkerShiftTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ marker: bad, dx: 50 });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown marker", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetMarkerShiftTool(runtime);
    const result = await tool.execute({ marker: 999, dx: 50 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("is a noop when both dx and dy are unchanged", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDx: 40,
      previousDy: 60,
    }));
    const tool = createSetMarkerShiftTool(runtime);
    const result = await tool.execute({ marker: 1, dx: 40, dy: 60 });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("is a noop when only provided field equals current value", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousDx: 40,
      previousDy: 60,
    }));
    const tool = createSetMarkerShiftTool(runtime);
    const result = await tool.execute({ marker: 1, dx: 40 });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: SetMarkerShiftRuntime = {
      find: () => ({ i: 1, name: "x", previousDx: 50, previousDy: 50 }),
      apply: vi.fn(() => {
        throw new Error("pack.markers is not available.");
      }),
    };
    const tool = createSetMarkerShiftTool(runtime);
    const result = await tool.execute({ marker: 1, dx: 30, dy: 70 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/markers/);
  });
});

describe("defaultSetMarkerShiftRuntime (integration)", () => {
  const drawMock = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalDraw = (globalThis as { drawMarkers?: unknown }).drawMarkers;

  beforeEach(() => {
    drawMock.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      markers: [
        { i: 2, dx: 50, dy: 50 },
        { i: 5, type: "volcano", dx: 50, dy: 50 },
        { i: 8, type: "volcano", dx: 50, dy: 50 },
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

  it("writes dx and dy on target marker and calls drawMarkers once", async () => {
    const result = await setMarkerShiftTool.execute({
      marker: 5,
      dx: 30,
      dy: 70,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.dx).toBe(30);
    expect(pack.markers[1]?.dy).toBe(70);
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("partial update preserves untouched field", async () => {
    // Seed marker 5 with a non-default dy so we can detect clobbering.
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    const marker5 = pack.markers[1];
    if (marker5) {
      marker5.dx = 20;
      marker5.dy = 80;
    }
    const result = await setMarkerShiftTool.execute({
      marker: 5,
      dx: 35,
    });
    expect(result.isError).toBeFalsy();
    expect(pack.markers[1]?.dx).toBe(35);
    expect(pack.markers[1]?.dy).toBe(80);
  });

  it("resolves by case-insensitive note name", async () => {
    await setMarkerShiftTool.execute({
      marker: "dragon lair",
      dx: 40,
      dy: 60,
    });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.dx).toBe(40);
    expect(pack.markers[1]?.dy).toBe(60);
  });

  it("does NOT cascade to same-type markers", async () => {
    await setMarkerShiftTool.execute({ marker: 5, dx: 30, dy: 70 });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.dx).toBe(30);
    expect(pack.markers[2]?.dx).toBe(50);
    expect(pack.markers[2]?.dy).toBe(50);
  });

  it("succeeds when drawMarkers is missing", async () => {
    (globalThis as { drawMarkers?: unknown }).drawMarkers = undefined;
    const result = await setMarkerShiftTool.execute({
      marker: 5,
      dx: 30,
      dy: 70,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.dx).toBe(30);
    expect(pack.markers[1]?.dy).toBe(70);
  });
});
