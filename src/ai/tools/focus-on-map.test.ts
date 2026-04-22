import { describe, expect, it, vi } from "vitest";
import {
  createFocusOnMapTool,
  FOCUS_ZOOM_DURATION,
  FOCUS_ZOOM_LEVEL,
  findBurgInPack,
  findStateInPack,
  RESET_ZOOM_DURATION,
  type ZoomEntity,
  type ZoomRuntime,
} from "./focus-on-map";

function makeRuntime(overrides: Partial<ZoomRuntime> = {}) {
  const findBurg = vi.fn<ZoomRuntime["findBurg"]>(() => null);
  const findState = vi.fn<ZoomRuntime["findState"]>(() => null);
  const zoomTo = vi.fn<ZoomRuntime["zoomTo"]>();
  const resetZoom = vi.fn<ZoomRuntime["resetZoom"]>();
  const runtime: ZoomRuntime = {
    findBurg,
    findState,
    zoomTo,
    resetZoom,
    ...overrides,
  };
  return { runtime, findBurg, findState, zoomTo, resetZoom };
}

describe("focus_on_map tool", () => {
  it("zooms to a burg by name", async () => {
    const burg: ZoomEntity = { i: 5, name: "Stormport", x: 100, y: 200 };
    const findBurg = vi.fn<ZoomRuntime["findBurg"]>((ref) =>
      ref === "Stormport" ? burg : null,
    );
    const { runtime, zoomTo } = makeRuntime({ findBurg });
    const tool = createFocusOnMapTool(runtime);
    const result = await tool.execute({ type: "burg", target: "Stormport" });
    expect(result.isError).toBeFalsy();
    expect(findBurg).toHaveBeenCalledWith("Stormport");
    expect(zoomTo).toHaveBeenCalledWith(
      100,
      200,
      FOCUS_ZOOM_LEVEL,
      FOCUS_ZOOM_DURATION,
    );
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      type: "burg",
      i: 5,
      name: "Stormport",
      x: 100,
      y: 200,
    });
  });

  it("zooms to a burg by id", async () => {
    const burg: ZoomEntity = { i: 7, name: "Driftwood", x: 42, y: 42 };
    const { runtime, zoomTo } = makeRuntime({
      findBurg: vi.fn<ZoomRuntime["findBurg"]>((ref) =>
        ref === 7 ? burg : null,
      ),
    });
    const tool = createFocusOnMapTool(runtime);
    await tool.execute({ type: "burg", target: 7 });
    expect(zoomTo).toHaveBeenCalledWith(
      42,
      42,
      FOCUS_ZOOM_LEVEL,
      FOCUS_ZOOM_DURATION,
    );
  });

  it("zooms to a state (using the runtime's resolved coords)", async () => {
    const state: ZoomEntity = { i: 3, name: "Altaria", x: 50, y: 60 };
    const { runtime, zoomTo } = makeRuntime({
      findState: vi.fn<ZoomRuntime["findState"]>(() => state),
    });
    const tool = createFocusOnMapTool(runtime);
    await tool.execute({ type: "state", target: "Altaria" });
    expect(zoomTo).toHaveBeenCalledWith(
      50,
      60,
      FOCUS_ZOOM_LEVEL,
      FOCUS_ZOOM_DURATION,
    );
  });

  it("resets the zoom without touching zoomTo", async () => {
    const { runtime, zoomTo, resetZoom } = makeRuntime();
    const tool = createFocusOnMapTool(runtime);
    const result = await tool.execute({ type: "reset" });
    expect(zoomTo).not.toHaveBeenCalled();
    expect(resetZoom).toHaveBeenCalledWith(RESET_ZOOM_DURATION);
    expect(JSON.parse(result.content)).toEqual({ ok: true, mode: "reset" });
  });

  it("rejects an invalid type", async () => {
    const { runtime, zoomTo, resetZoom } = makeRuntime();
    const tool = createFocusOnMapTool(runtime);
    const result = await tool.execute({ type: "whatever" });
    expect(result.isError).toBe(true);
    expect(zoomTo).not.toHaveBeenCalled();
    expect(resetZoom).not.toHaveBeenCalled();
  });

  it("rejects missing or invalid targets (except for reset)", async () => {
    const { runtime, zoomTo } = makeRuntime();
    const tool = createFocusOnMapTool(runtime);
    const a = await tool.execute({ type: "burg" });
    const b = await tool.execute({ type: "burg", target: "" });
    const c = await tool.execute({ type: "state", target: -1 });
    const d = await tool.execute({ type: "state", target: 1.5 });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(c.isError).toBe(true);
    expect(d.isError).toBe(true);
    expect(zoomTo).not.toHaveBeenCalled();
  });

  it("returns an error when the entity cannot be found", async () => {
    const { runtime, zoomTo } = makeRuntime();
    const tool = createFocusOnMapTool(runtime);
    const result = await tool.execute({ type: "burg", target: "Nowhere" });
    expect(result.isError).toBe(true);
    expect(zoomTo).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).error).toMatch(/no burg/i);
  });

  it("surfaces runtime throw from zoomTo", async () => {
    const { runtime } = makeRuntime({
      findBurg: vi.fn<ZoomRuntime["findBurg"]>(() => ({
        i: 1,
        name: "x",
        x: 0,
        y: 0,
      })),
      zoomTo: vi.fn<ZoomRuntime["zoomTo"]>(() => {
        throw new Error("zoomTo is not available.");
      }),
    });
    const tool = createFocusOnMapTool(runtime);
    const result = await tool.execute({ type: "burg", target: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });
});

describe("findBurgInPack / findStateInPack", () => {
  it("finds a burg by id and by name (case-insensitive)", () => {
    const burgs: {
      i: number;
      name?: string;
      x?: number;
      y?: number;
      removed?: boolean;
    }[] = new Array(3);
    burgs[0] = { i: 0 };
    burgs[1] = { i: 1, name: "Stormport", x: 10, y: 20 };
    burgs[2] = { i: 2, name: "Driftwood", x: 30, y: 40, removed: true };
    expect(findBurgInPack({ burgs }, 1)).toEqual({
      i: 1,
      name: "Stormport",
      x: 10,
      y: 20,
    });
    expect(findBurgInPack({ burgs }, "stormport")).toEqual({
      i: 1,
      name: "Stormport",
      x: 10,
      y: 20,
    });
    expect(findBurgInPack({ burgs }, 2)).toBeNull(); // removed
    expect(findBurgInPack({ burgs }, "nowhere")).toBeNull();
    expect(findBurgInPack(undefined, 1)).toBeNull();
  });

  it("resolves state coords from pole, falling back to capital burg", () => {
    const burgs: {
      i: number;
      name?: string;
      x?: number;
      y?: number;
    }[] = new Array(11);
    burgs[0] = { i: 0 };
    burgs[10] = { i: 10, name: "Cap", x: 99, y: 99 };
    const states = [
      { i: 0, name: "Neutrals" },
      { i: 1, name: "Has Pole", pole: [5, 6] as [number, number], capital: 10 },
      { i: 2, name: "No Pole", capital: 10 },
      { i: 3, name: "No Pole No Cap" },
    ];
    const pack = { burgs, states };
    expect(findStateInPack(pack, 1)).toMatchObject({ i: 1, x: 5, y: 6 });
    expect(findStateInPack(pack, "no pole")).toMatchObject({
      i: 2,
      x: 99,
      y: 99,
    });
    expect(findStateInPack(pack, 3)).toBeNull();
    expect(findStateInPack(pack, 99)).toBeNull();
  });
});
