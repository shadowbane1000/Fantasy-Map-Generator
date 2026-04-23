import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMarker, RawNote } from "./_shared";
import {
  createSetMarkerIconTool,
  type MarkerIconRef,
  type MarkerIconRuntime,
  setMarkerIconTool,
} from "./set-marker-icon";

function makeRuntime(find: (ref: number | string) => MarkerIconRef | null): {
  runtime: MarkerIconRuntime;
  setIcon: ReturnType<typeof vi.fn<MarkerIconRuntime["setIcon"]>>;
} {
  const setIcon = vi.fn<MarkerIconRuntime["setIcon"]>();
  return { runtime: { find, setIcon }, setIcon };
}

describe("set_marker_icon tool", () => {
  it("sets icon by numeric id", async () => {
    const { runtime, setIcon } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Dragon Lair", previousIcon: "📍" } : null,
    );
    const tool = createSetMarkerIconTool(runtime);
    const result = await tool.execute({ marker: 5, icon: "🌋" });
    expect(result.isError).toBeFalsy();
    expect(setIcon).toHaveBeenCalledWith(5, "🌋");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Dragon Lair",
      icon: "🌋",
      previousIcon: "📍",
      noop: false,
    });
  });

  it("resolves by case-insensitive note name", async () => {
    const find = vi.fn<MarkerIconRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "dragon lair"
        ? { i: 5, name: "Dragon Lair", previousIcon: "📍" }
        : null,
    );
    const { runtime, setIcon } = makeRuntime(find);
    const tool = createSetMarkerIconTool(runtime);
    await tool.execute({ marker: "DRAGON LAIR", icon: "🐲" });
    expect(find).toHaveBeenCalledWith("DRAGON LAIR");
    expect(setIcon).toHaveBeenCalledWith(5, "🐲");
  });

  it("trims whitespace", async () => {
    const { runtime, setIcon } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousIcon: "",
    }));
    const tool = createSetMarkerIconTool(runtime);
    await tool.execute({ marker: 1, icon: "  🌋  " });
    expect(setIcon).toHaveBeenCalledWith(1, "🌋");
  });

  it("is a noop when already at target", async () => {
    const { runtime, setIcon } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousIcon: "🌋",
    }));
    const tool = createSetMarkerIconTool(runtime);
    const result = await tool.execute({ marker: 1, icon: "🌋" });
    expect(setIcon).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("rejects empty / whitespace-only icon", async () => {
    const { runtime, setIcon } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousIcon: "",
    }));
    const tool = createSetMarkerIconTool(runtime);
    for (const bad of ["", "   ", "\t\n"]) {
      const r = await tool.execute({ marker: 1, icon: bad });
      expect(r.isError).toBe(true);
    }
    expect(setIcon).not.toHaveBeenCalled();
  });

  it("rejects non-string icon", async () => {
    const { runtime, setIcon } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousIcon: "",
    }));
    const tool = createSetMarkerIconTool(runtime);
    for (const bad of [null, undefined, 42, true]) {
      const r = await tool.execute({ marker: 1, icon: bad });
      expect(r.isError).toBe(true);
    }
    expect(setIcon).not.toHaveBeenCalled();
  });

  it("rejects invalid marker refs", async () => {
    const { runtime, setIcon } = makeRuntime(() => null);
    const tool = createSetMarkerIconTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ marker: bad, icon: "🌋" });
      expect(r.isError).toBe(true);
    }
    expect(setIcon).not.toHaveBeenCalled();
  });

  it("rejects unknown marker", async () => {
    const { runtime, setIcon } = makeRuntime(() => null);
    const tool = createSetMarkerIconTool(runtime);
    const result = await tool.execute({ marker: 999, icon: "🌋" });
    expect(result.isError).toBe(true);
    expect(setIcon).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: MarkerIconRuntime = {
      find: () => ({ i: 1, name: "x", previousIcon: "" }),
      setIcon: vi.fn(() => {
        throw new Error("pack.markers is not available.");
      }),
    };
    const tool = createSetMarkerIconTool(runtime);
    const result = await tool.execute({ marker: 1, icon: "🌋" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/markers/);
  });
});

describe("defaultMarkerIconRuntime (integration)", () => {
  const drawMock = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNotes = (globalThis as { notes?: unknown }).notes;
  const originalDraw = (globalThis as { drawMarkers?: unknown }).drawMarkers;

  beforeEach(() => {
    drawMock.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      markers: [
        { i: 2, icon: "📍" },
        { i: 5, icon: "📍", type: "volcano" },
        { i: 8, icon: "📍", type: "volcano" },
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

  it("writes the icon on the target marker and calls drawMarkers once", async () => {
    const result = await setMarkerIconTool.execute({ marker: 5, icon: "🌋" });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.icon).toBe("🌋");
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("resolves by case-insensitive note name", async () => {
    await setMarkerIconTool.execute({ marker: "dragon lair", icon: "🐲" });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.icon).toBe("🐲");
  });

  it("does NOT cascade to same-type markers", async () => {
    await setMarkerIconTool.execute({ marker: 5, icon: "🌋" });
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    // marker 5 changed, marker 8 (same "volcano" type) untouched
    expect(pack.markers[1]?.icon).toBe("🌋");
    expect(pack.markers[2]?.icon).toBe("📍");
  });

  it("succeeds when drawMarkers is missing", async () => {
    (globalThis as { drawMarkers?: unknown }).drawMarkers = undefined;
    const result = await setMarkerIconTool.execute({ marker: 5, icon: "🌋" });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { markers: RawMarker[] } }).pack;
    expect(pack.markers[1]?.icon).toBe("🌋");
  });
});
