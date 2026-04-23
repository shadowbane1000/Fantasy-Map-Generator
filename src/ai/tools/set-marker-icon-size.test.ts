import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMarker, RawNote } from "./_shared";
import {
  createSetMarkerIconSizeTool,
  DEFAULT_MARKER_ICON_SIZE,
  MARKER_ICON_SIZE_MAX,
  MARKER_ICON_SIZE_MIN,
  type MarkerIconSizeRef,
  type SetMarkerIconSizeRuntime,
  setMarkerIconSizeTool,
} from "./set-marker-icon-size";

function makeRuntime(
  find: (ref: number | string) => MarkerIconSizeRef | null,
): {
  runtime: SetMarkerIconSizeRuntime;
  apply: ReturnType<typeof vi.fn<SetMarkerIconSizeRuntime["apply"]>>;
} {
  const apply = vi.fn<SetMarkerIconSizeRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_marker_icon_size tool", () => {
  it("sets px by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 5
        ? { i: 5, name: "Dragon Lair", previousPx: DEFAULT_MARKER_ICON_SIZE }
        : null,
    );
    const tool = createSetMarkerIconSizeTool(runtime);
    const result = await tool.execute({ marker: 5, size: 16 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, 16);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Dragon Lair",
      px: 16,
      previousPx: DEFAULT_MARKER_ICON_SIZE,
      noop: false,
    });
  });

  it("resolves by case-insensitive note name", async () => {
    const find = vi.fn<SetMarkerIconSizeRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "dragon lair"
        ? { i: 5, name: "Dragon Lair", previousPx: 10 }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetMarkerIconSizeTool(runtime);
    await tool.execute({ marker: "DRAGON LAIR", size: 18 });
    expect(find).toHaveBeenCalledWith("DRAGON LAIR");
    expect(apply).toHaveBeenCalledWith(5, 18);
  });

  it("accepts fractional sizes within range (UI step=0.5)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousPx: DEFAULT_MARKER_ICON_SIZE,
    }));
    const tool = createSetMarkerIconSizeTool(runtime);
    const result = await tool.execute({ marker: 1, size: 7.5 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 7.5);
  });

  it("rejects non-finite / non-number size", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousPx: DEFAULT_MARKER_ICON_SIZE,
    }));
    const tool = createSetMarkerIconSizeTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, "12", null]) {
      const r = await tool.execute({ marker: 1, size: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects out-of-range size", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousPx: DEFAULT_MARKER_ICON_SIZE,
    }));
    const tool = createSetMarkerIconSizeTool(runtime);
    for (const bad of [
      MARKER_ICON_SIZE_MIN - 0.5,
      MARKER_ICON_SIZE_MAX + 0.5,
      0,
      -5,
      100,
    ]) {
      const r = await tool.execute({ marker: 1, size: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("accepts the boundary values", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousPx: DEFAULT_MARKER_ICON_SIZE,
    }));
    const tool = createSetMarkerIconSizeTool(runtime);
    const r1 = await tool.execute({ marker: 1, size: MARKER_ICON_SIZE_MIN });
    expect(r1.isError).toBeFalsy();
    const r2 = await tool.execute({ marker: 1, size: MARKER_ICON_SIZE_MAX });
    expect(r2.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid marker refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetMarkerIconSizeTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ marker: bad, size: 12 });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown marker", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetMarkerIconSizeTool(runtime);
    const result = await tool.execute({ marker: 999, size: 12 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("is a noop when px is unchanged", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousPx: 14,
    }));
    const tool = createSetMarkerIconSizeTool(runtime);
    const result = await tool.execute({ marker: 1, size: 14 });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: SetMarkerIconSizeRuntime = {
      find: () => ({ i: 1, name: "x", previousPx: 12 }),
      apply: vi.fn(() => {
        throw new Error("pack.markers is not available.");
      }),
    };
    const tool = createSetMarkerIconSizeTool(runtime);
    const result = await tool.execute({ marker: 1, size: 16 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/markers/);
  });
});

describe("defaultSetMarkerIconSizeRuntime (integration)", () => {
  const drawMock = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalDraw = (globalThis as { drawMarkers?: unknown }).drawMarkers;

  beforeEach(() => {
    drawMock.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      markers: [
        { i: 2, px: 12 },
        { i: 5, type: "volcano", px: 12 },
        { i: 8, type: "volcano", px: 12 },
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

  it("writes px on target marker and calls drawMarkers once", async () => {
    const result = await setMarkerIconSizeTool.execute({
      marker: 5,
      size: 18,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.px).toBe(18);
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("resolves by case-insensitive note name", async () => {
    await setMarkerIconSizeTool.execute({
      marker: "dragon lair",
      size: 16,
    });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.px).toBe(16);
  });

  it("does NOT cascade to same-type markers", async () => {
    await setMarkerIconSizeTool.execute({ marker: 5, size: 18 });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.px).toBe(18);
    expect(pack.markers[2]?.px).toBe(12);
  });

  it("succeeds when drawMarkers is missing", async () => {
    (globalThis as { drawMarkers?: unknown }).drawMarkers = undefined;
    const result = await setMarkerIconSizeTool.execute({
      marker: 5,
      size: 18,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.px).toBe(18);
  });
});
