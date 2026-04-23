import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMarker, RawNote } from "./_shared";
import {
  createSetMarkerTypeTool,
  type MarkerTypeRef,
  type MarkerTypeRuntime,
  setMarkerTypeTool,
} from "./set-marker-type";

function makeRuntime(find: (ref: number | string) => MarkerTypeRef | null): {
  runtime: MarkerTypeRuntime;
  setType: ReturnType<typeof vi.fn<MarkerTypeRuntime["setType"]>>;
} {
  const setType = vi.fn<MarkerTypeRuntime["setType"]>();
  return { runtime: { find, setType }, setType };
}

describe("set_marker_type tool", () => {
  it("sets the type by numeric id", async () => {
    const { runtime, setType } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Dragon Lair", previousType: "lair" } : null,
    );
    const tool = createSetMarkerTypeTool(runtime);
    const result = await tool.execute({ marker: 5, type: "volcano" });
    expect(result.isError).toBeFalsy();
    expect(setType).toHaveBeenCalledWith(5, "volcano");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Dragon Lair",
      type: "volcano",
      previousType: "lair",
      noop: false,
    });
  });

  it("resolves by case-insensitive note name", async () => {
    const find = vi.fn<MarkerTypeRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "dragon lair"
        ? { i: 5, name: "Dragon Lair", previousType: "" }
        : null,
    );
    const { runtime, setType } = makeRuntime(find);
    const tool = createSetMarkerTypeTool(runtime);
    await tool.execute({ marker: "DRAGON LAIR", type: "ruin" });
    expect(find).toHaveBeenCalledWith("DRAGON LAIR");
    expect(setType).toHaveBeenCalledWith(5, "ruin");
  });

  it("trims the type before applying", async () => {
    const { runtime, setType } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousType: "",
    }));
    const tool = createSetMarkerTypeTool(runtime);
    await tool.execute({ marker: 1, type: "  volcano  " });
    expect(setType).toHaveBeenCalledWith(1, "volcano");
  });

  it("is a noop when already the same type", async () => {
    const { runtime, setType } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousType: "volcano",
    }));
    const tool = createSetMarkerTypeTool(runtime);
    const result = await tool.execute({ marker: 1, type: "volcano" });
    expect(setType).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("errors when marker is unknown", async () => {
    const { runtime, setType } = makeRuntime(() => null);
    const tool = createSetMarkerTypeTool(runtime);
    const result = await tool.execute({ marker: 999, type: "volcano" });
    expect(result.isError).toBe(true);
    expect(setType).not.toHaveBeenCalled();
  });

  it("rejects invalid marker refs", async () => {
    const { runtime, setType } = makeRuntime(() => null);
    const tool = createSetMarkerTypeTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ marker: bad, type: "volcano" });
      expect(r.isError).toBe(true);
    }
    expect(setType).not.toHaveBeenCalled();
  });

  it("rejects non-string type", async () => {
    const { runtime, setType } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousType: "",
    }));
    const tool = createSetMarkerTypeTool(runtime);
    const result = await tool.execute({ marker: 1, type: 42 });
    expect(result.isError).toBe(true);
    expect(setType).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace-only type", async () => {
    const { runtime, setType } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousType: "",
    }));
    const tool = createSetMarkerTypeTool(runtime);
    for (const bad of ["", "   ", "\t\n"]) {
      const r = await tool.execute({ marker: 1, type: bad });
      expect(r.isError).toBe(true);
    }
    expect(setType).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures from setType", async () => {
    const runtime: MarkerTypeRuntime = {
      find: () => ({ i: 1, name: "x", previousType: "" }),
      setType: vi.fn(() => {
        throw new Error("pack.markers is not available.");
      }),
    };
    const tool = createSetMarkerTypeTool(runtime);
    const result = await tool.execute({ marker: 1, type: "volcano" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.markers/);
  });
});

describe("defaultMarkerTypeRuntime (integration)", () => {
  const drawMock = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalDraw = (globalThis as { drawMarkers?: unknown }).drawMarkers;

  beforeEach(() => {
    drawMock.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      markers: [
        { i: 2, type: "ruin" },
        { i: 5 },
        { i: 8, type: "volcano" },
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

  it("writes type by numeric id", async () => {
    const result = await setMarkerTypeTool.execute({
      marker: 5,
      type: "volcano",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.type).toBe("volcano");
  });

  it("writes type by case-insensitive note name", async () => {
    await setMarkerTypeTool.execute({
      marker: "dragon lair",
      type: "ruin",
    });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.type).toBe("ruin");
  });

  it("does not call drawMarkers (type is metadata-only)", async () => {
    await setMarkerTypeTool.execute({ marker: 5, type: "volcano" });
    expect(drawMock).not.toHaveBeenCalled();
  });

  it("is a noop when already the same type", async () => {
    const result = await setMarkerTypeTool.execute({
      marker: 8,
      type: "volcano",
    });
    expect(JSON.parse(result.content).noop).toBe(true);
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[2]?.type).toBe("volcano");
  });
});
