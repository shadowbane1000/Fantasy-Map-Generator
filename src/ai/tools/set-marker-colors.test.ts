import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMarker, RawNote } from "./_shared";
import {
  createSetMarkerColorsTool,
  DEFAULT_MARKER_FILL,
  DEFAULT_MARKER_STROKE,
  type MarkerColorsRef,
  type MarkerColorsRuntime,
  setMarkerColorsTool,
} from "./set-marker-colors";

function makeRuntime(find: (ref: number | string) => MarkerColorsRef | null): {
  runtime: MarkerColorsRuntime;
  apply: ReturnType<typeof vi.fn<MarkerColorsRuntime["apply"]>>;
} {
  const apply = vi.fn<MarkerColorsRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_marker_colors tool", () => {
  it("sets fill only", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Lair",
      previousFill: DEFAULT_MARKER_FILL,
      previousStroke: DEFAULT_MARKER_STROKE,
    }));
    const tool = createSetMarkerColorsTool(runtime);
    const result = await tool.execute({ marker: 5, fill: "#ff0000" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, {
      fill: "#ff0000",
      stroke: undefined,
    });
    const body = JSON.parse(result.content);
    expect(body.fill).toBe("#ff0000");
    expect(body.stroke).toBe(DEFAULT_MARKER_STROKE);
    expect(body.noop).toBe(false);
  });

  it("sets stroke only", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousFill: DEFAULT_MARKER_FILL,
      previousStroke: DEFAULT_MARKER_STROKE,
    }));
    const tool = createSetMarkerColorsTool(runtime);
    await tool.execute({ marker: 5, stroke: "blue" });
    expect(apply).toHaveBeenCalledWith(5, {
      fill: undefined,
      stroke: "blue",
    });
  });

  it("sets both fill and stroke", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousFill: "#ffffff",
      previousStroke: "#000000",
    }));
    const tool = createSetMarkerColorsTool(runtime);
    await tool.execute({ marker: 5, fill: "red", stroke: "blue" });
    expect(apply).toHaveBeenCalledWith(5, { fill: "red", stroke: "blue" });
  });

  it("resolves by case-insensitive note name", async () => {
    const find = vi.fn<MarkerColorsRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "dragon lair"
        ? {
            i: 5,
            name: "Dragon Lair",
            previousFill: "#fff",
            previousStroke: "#000",
          }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetMarkerColorsTool(runtime);
    await tool.execute({ marker: "DRAGON LAIR", fill: "#f00" });
    expect(find).toHaveBeenCalledWith("DRAGON LAIR");
    expect(apply).toHaveBeenCalled();
  });

  it("rejects invalid CSS color for fill", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousFill: "#fff",
      previousStroke: "#000",
    }));
    const tool = createSetMarkerColorsTool(runtime);
    const result = await tool.execute({ marker: 5, fill: "not-a-color!" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid CSS color for stroke", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousFill: "#fff",
      previousStroke: "#000",
    }));
    const tool = createSetMarkerColorsTool(runtime);
    const result = await tool.execute({ marker: 5, stroke: "#zz" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects omitting both fill and stroke", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousFill: "#fff",
      previousStroke: "#000",
    }));
    const tool = createSetMarkerColorsTool(runtime);
    const result = await tool.execute({ marker: 5 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid marker refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetMarkerColorsTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ marker: bad, fill: "red" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown marker", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetMarkerColorsTool(runtime);
    const result = await tool.execute({ marker: 999, fill: "red" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("is a noop when both provided values match current", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousFill: "#ff0000",
      previousStroke: "#0000ff",
    }));
    const tool = createSetMarkerColorsTool(runtime);
    const result = await tool.execute({
      marker: 5,
      fill: "#ff0000",
      stroke: "#0000ff",
    });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("is a noop when only provided field matches", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousFill: "#ff0000",
      previousStroke: "#0000ff",
    }));
    const tool = createSetMarkerColorsTool(runtime);
    const result = await tool.execute({ marker: 5, fill: "#ff0000" });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: MarkerColorsRuntime = {
      find: () => ({
        i: 5,
        name: "x",
        previousFill: "#fff",
        previousStroke: "#000",
      }),
      apply: vi.fn(() => {
        throw new Error("pack.markers is not available.");
      }),
    };
    const tool = createSetMarkerColorsTool(runtime);
    const result = await tool.execute({ marker: 5, fill: "red" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/markers/);
  });
});

describe("defaultMarkerColorsRuntime (integration)", () => {
  const drawMock = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalDraw = (globalThis as { drawMarkers?: unknown }).drawMarkers;

  beforeEach(() => {
    drawMock.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      markers: [
        { i: 2, fill: "#ffffff", stroke: "#000000" },
        { i: 5, type: "volcano", fill: "#ffffff", stroke: "#000000" },
        { i: 8, type: "volcano", fill: "#ffffff", stroke: "#000000" },
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

  it("writes fill only and leaves stroke untouched", async () => {
    const result = await setMarkerColorsTool.execute({
      marker: 5,
      fill: "#ff0000",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.fill).toBe("#ff0000");
    expect(pack.markers[1]?.stroke).toBe("#000000");
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("writes both and calls drawMarkers", async () => {
    await setMarkerColorsTool.execute({
      marker: 5,
      fill: "red",
      stroke: "blue",
    });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.fill).toBe("red");
    expect(pack.markers[1]?.stroke).toBe("blue");
  });

  it("does NOT cascade to same-type markers", async () => {
    await setMarkerColorsTool.execute({ marker: 5, fill: "red" });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.fill).toBe("red");
    expect(pack.markers[2]?.fill).toBe("#ffffff");
  });

  it("succeeds when drawMarkers is missing", async () => {
    (globalThis as { drawMarkers?: unknown }).drawMarkers = undefined;
    const result = await setMarkerColorsTool.execute({
      marker: 5,
      fill: "#aaa",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.fill).toBe("#aaa");
  });
});
