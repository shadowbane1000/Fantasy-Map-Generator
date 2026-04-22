import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMarker, RawNote } from "./_shared";
import {
  createSetMarkerPinnedTool,
  type MarkerPinnedRef,
  type MarkerPinnedRuntime,
  setMarkerPinnedTool,
} from "./set-marker-pinned";

function makeRuntime(find: (ref: number | string) => MarkerPinnedRef | null): {
  runtime: MarkerPinnedRuntime;
  setPinned: ReturnType<typeof vi.fn<MarkerPinnedRuntime["setPinned"]>>;
} {
  const setPinned = vi.fn<MarkerPinnedRuntime["setPinned"]>();
  return { runtime: { find, setPinned }, setPinned };
}

describe("set_marker_pinned tool", () => {
  it("pins an unpinned marker", async () => {
    const { runtime, setPinned } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Dragon Lair", previousPinned: false } : null,
    );
    const tool = createSetMarkerPinnedTool(runtime);
    const result = await tool.execute({ marker: 5, pinned: true });
    expect(result.isError).toBeFalsy();
    expect(setPinned).toHaveBeenCalledWith(5, true);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Dragon Lair",
      pinned: true,
      previousPinned: false,
      noop: false,
    });
  });

  it("unpins a pinned marker", async () => {
    const { runtime, setPinned } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousPinned: true,
    }));
    const tool = createSetMarkerPinnedTool(runtime);
    const result = await tool.execute({ marker: 5, pinned: false });
    expect(result.isError).toBeFalsy();
    expect(setPinned).toHaveBeenCalledWith(5, false);
    expect(JSON.parse(result.content).noop).toBe(false);
  });

  it("resolves by case-insensitive note name", async () => {
    const find = vi.fn<MarkerPinnedRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "dragon lair"
        ? { i: 5, name: "Dragon Lair", previousPinned: false }
        : null,
    );
    const { runtime, setPinned } = makeRuntime(find);
    const tool = createSetMarkerPinnedTool(runtime);
    await tool.execute({ marker: "DRAGON LAIR", pinned: true });
    expect(find).toHaveBeenCalledWith("DRAGON LAIR");
    expect(setPinned).toHaveBeenCalledWith(5, true);
  });

  it("is a noop when already pinned", async () => {
    const { runtime, setPinned } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousPinned: true,
    }));
    const tool = createSetMarkerPinnedTool(runtime);
    const result = await tool.execute({ marker: 1, pinned: true });
    expect(setPinned).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("is a noop when already unpinned", async () => {
    const { runtime, setPinned } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousPinned: false,
    }));
    const tool = createSetMarkerPinnedTool(runtime);
    const result = await tool.execute({ marker: 1, pinned: false });
    expect(setPinned).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("errors when the marker is unknown", async () => {
    const { runtime, setPinned } = makeRuntime(() => null);
    const tool = createSetMarkerPinnedTool(runtime);
    const result = await tool.execute({ marker: 999, pinned: true });
    expect(result.isError).toBe(true);
    expect(setPinned).not.toHaveBeenCalled();
  });

  it("rejects invalid marker refs", async () => {
    const { runtime, setPinned } = makeRuntime(() => null);
    const tool = createSetMarkerPinnedTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ marker: bad, pinned: true });
      expect(r.isError).toBe(true);
    }
    expect(setPinned).not.toHaveBeenCalled();
  });

  it("rejects non-boolean pinned", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousPinned: false,
    }));
    const tool = createSetMarkerPinnedTool(runtime);
    const result = await tool.execute({ marker: 1, pinned: "yes" });
    expect(result.isError).toBe(true);
  });

  it("surfaces runtime failures from setPinned", async () => {
    const runtime: MarkerPinnedRuntime = {
      find: () => ({ i: 1, name: "x", previousPinned: false }),
      setPinned: vi.fn(() => {
        throw new Error("pack.markers is not available.");
      }),
    };
    const tool = createSetMarkerPinnedTool(runtime);
    const result = await tool.execute({ marker: 1, pinned: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.markers/);
  });
});

describe("defaultMarkerPinnedRuntime (integration)", () => {
  const drawMock = vi.fn();
  const setAttribute = vi.fn();
  const removeAttribute = vi.fn();
  const markerGroupEl = { setAttribute, removeAttribute };
  const getElementById = vi.fn((id: string) =>
    id === "markers" ? markerGroupEl : null,
  );
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalDraw = (globalThis as { drawMarkers?: unknown }).drawMarkers;

  beforeEach(() => {
    drawMock.mockReset();
    setAttribute.mockReset();
    removeAttribute.mockReset();
    getElementById.mockClear();
    (globalThis as { pack?: unknown }).pack = {
      markers: [
        { i: 2, pinned: true },
        { i: 5 },
        { i: 8, pinned: true },
      ] satisfies RawMarker[],
    };
    (globalThis as { notes?: unknown }).notes = [
      { id: "marker5", name: "Dragon Lair" },
    ] satisfies RawNote[];
    (globalThis as { document?: unknown }).document = { getElementById };
    (globalThis as { drawMarkers?: unknown }).drawMarkers = drawMock;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { notes?: unknown }).notes = originalNotes;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { drawMarkers?: unknown }).drawMarkers = originalDraw;
  });

  it("pins an unpinned marker and sets the group attribute", async () => {
    const result = await setMarkerPinnedTool.execute({
      marker: 5,
      pinned: true,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.pinned).toBe(true);
    expect(setAttribute).toHaveBeenCalledWith("pinned", "1");
    expect(removeAttribute).not.toHaveBeenCalled();
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("unpinning one of several pinned markers keeps the group attribute", async () => {
    const result = await setMarkerPinnedTool.execute({
      marker: 2,
      pinned: false,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[0]).not.toHaveProperty("pinned");
    expect(setAttribute).toHaveBeenCalledWith("pinned", "1");
    expect(removeAttribute).not.toHaveBeenCalled();
  });

  it("unpinning the last pinned marker removes the group attribute", async () => {
    await setMarkerPinnedTool.execute({ marker: 2, pinned: false });
    setAttribute.mockClear();
    removeAttribute.mockClear();
    await setMarkerPinnedTool.execute({ marker: 8, pinned: false });
    expect(removeAttribute).toHaveBeenCalledWith("pinned");
    expect(setAttribute).not.toHaveBeenCalled();
  });

  it("resolves by note name and pins", async () => {
    await setMarkerPinnedTool.execute({
      marker: "dragon lair",
      pinned: true,
    });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.pinned).toBe(true);
  });

  it("is a noop when already pinned — no attribute change, no draw", async () => {
    const result = await setMarkerPinnedTool.execute({
      marker: 2,
      pinned: true,
    });
    expect(JSON.parse(result.content).noop).toBe(true);
    expect(setAttribute).not.toHaveBeenCalled();
    expect(removeAttribute).not.toHaveBeenCalled();
    expect(drawMock).not.toHaveBeenCalled();
  });
});
