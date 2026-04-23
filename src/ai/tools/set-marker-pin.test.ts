import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMarker, RawNote } from "./_shared";
import {
  createSetMarkerPinTool,
  DEFAULT_MARKER_PIN,
  MARKER_PIN_SHAPES,
  type MarkerPinRef,
  type MarkerPinRuntime,
  resolveMarkerPin,
  setMarkerPinTool,
} from "./set-marker-pin";

function makeRuntime(find: (ref: number | string) => MarkerPinRef | null): {
  runtime: MarkerPinRuntime;
  setPin: ReturnType<typeof vi.fn<MarkerPinRuntime["setPin"]>>;
} {
  const setPin = vi.fn<MarkerPinRuntime["setPin"]>();
  return { runtime: { find, setPin }, setPin };
}

describe("resolveMarkerPin", () => {
  it("canonicalizes case-insensitively", () => {
    expect(resolveMarkerPin("Bubble")).toBe("bubble");
    expect(resolveMarkerPin("PIN")).toBe("pin");
    expect(resolveMarkerPin("CIRCLE")).toBe("circle");
    expect(resolveMarkerPin("shieldy")).toBe("shieldy");
  });

  it("returns null for unknown / non-string / empty", () => {
    expect(resolveMarkerPin("rhombus")).toBeNull();
    expect(resolveMarkerPin("")).toBeNull();
    expect(resolveMarkerPin(null)).toBeNull();
    expect(resolveMarkerPin(42)).toBeNull();
  });
});

describe("MARKER_PIN_SHAPES", () => {
  it("includes all 13 canonical shapes", () => {
    expect([...MARKER_PIN_SHAPES]).toEqual([
      "bubble",
      "pin",
      "square",
      "squarish",
      "diamond",
      "hex",
      "hexy",
      "shieldy",
      "shield",
      "pentagon",
      "heptagon",
      "circle",
      "no",
    ]);
  });
});

describe("set_marker_pin tool", () => {
  it("sets pin by numeric id", async () => {
    const { runtime, setPin } = makeRuntime((ref) =>
      ref === 5
        ? { i: 5, name: "Dragon Lair", previousPin: DEFAULT_MARKER_PIN }
        : null,
    );
    const tool = createSetMarkerPinTool(runtime);
    const result = await tool.execute({ marker: 5, pin: "shield" });
    expect(result.isError).toBeFalsy();
    expect(setPin).toHaveBeenCalledWith(5, "shield");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Dragon Lair",
      pin: "shield",
      previousPin: "bubble",
      noop: false,
    });
  });

  it("resolves by case-insensitive name and canonicalizes pin input", async () => {
    const find = vi.fn<MarkerPinRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "dragon lair"
        ? { i: 5, name: "Dragon Lair", previousPin: "bubble" }
        : null,
    );
    const { runtime, setPin } = makeRuntime(find);
    const tool = createSetMarkerPinTool(runtime);
    await tool.execute({ marker: "DRAGON LAIR", pin: "CIRCLE" });
    expect(find).toHaveBeenCalledWith("DRAGON LAIR");
    expect(setPin).toHaveBeenCalledWith(5, "circle");
  });

  it("rejects unknown pin shape", async () => {
    const { runtime, setPin } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousPin: "bubble",
    }));
    const tool = createSetMarkerPinTool(runtime);
    const result = await tool.execute({ marker: 1, pin: "rhombus" });
    expect(result.isError).toBe(true);
    expect(setPin).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.supported).toContain("bubble");
  });

  it("rejects empty / non-string pin", async () => {
    const { runtime, setPin } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousPin: "bubble",
    }));
    const tool = createSetMarkerPinTool(runtime);
    for (const bad of [null, undefined, 42, "", "   "]) {
      const r = await tool.execute({ marker: 1, pin: bad });
      expect(r.isError).toBe(true);
    }
    expect(setPin).not.toHaveBeenCalled();
  });

  it("rejects invalid marker refs", async () => {
    const { runtime, setPin } = makeRuntime(() => null);
    const tool = createSetMarkerPinTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ marker: bad, pin: "pin" });
      expect(r.isError).toBe(true);
    }
    expect(setPin).not.toHaveBeenCalled();
  });

  it("rejects unknown marker", async () => {
    const { runtime, setPin } = makeRuntime(() => null);
    const tool = createSetMarkerPinTool(runtime);
    const result = await tool.execute({ marker: 999, pin: "pin" });
    expect(result.isError).toBe(true);
    expect(setPin).not.toHaveBeenCalled();
  });

  it("is a noop when unchanged", async () => {
    const { runtime, setPin } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousPin: "pin",
    }));
    const tool = createSetMarkerPinTool(runtime);
    const result = await tool.execute({ marker: 1, pin: "PIN" });
    expect(setPin).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: MarkerPinRuntime = {
      find: () => ({ i: 1, name: "x", previousPin: "bubble" }),
      setPin: vi.fn(() => {
        throw new Error("pack.markers is not available.");
      }),
    };
    const tool = createSetMarkerPinTool(runtime);
    const result = await tool.execute({ marker: 1, pin: "pin" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/markers/);
  });
});

describe("defaultMarkerPinRuntime (integration)", () => {
  const drawMock = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalDraw = (globalThis as { drawMarkers?: unknown }).drawMarkers;

  beforeEach(() => {
    drawMock.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      markers: [
        { i: 2, pin: "bubble" },
        { i: 5, type: "volcano", pin: "bubble" },
        { i: 8, type: "volcano", pin: "bubble" },
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

  it("writes pin on target marker and calls drawMarkers once", async () => {
    const result = await setMarkerPinTool.execute({
      marker: 5,
      pin: "shield",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.pin).toBe("shield");
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("resolves by case-insensitive note name", async () => {
    await setMarkerPinTool.execute({ marker: "dragon lair", pin: "diamond" });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.pin).toBe("diamond");
  });

  it("does NOT cascade to same-type markers", async () => {
    await setMarkerPinTool.execute({ marker: 5, pin: "circle" });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.pin).toBe("circle");
    // marker 8 (same "volcano" type) untouched
    expect(pack.markers[2]?.pin).toBe("bubble");
  });

  it("succeeds when drawMarkers is missing", async () => {
    (globalThis as { drawMarkers?: unknown }).drawMarkers = undefined;
    const result = await setMarkerPinTool.execute({ marker: 5, pin: "pin" });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.pin).toBe("pin");
  });
});
