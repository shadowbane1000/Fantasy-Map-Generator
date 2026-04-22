import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawZone } from "./_shared";
import {
  createSetZoneColorTool,
  setZoneColorTool,
  type ZoneColorRef,
  type ZoneColorRuntime,
} from "./set-zone-color";

function makeRuntime(find: (ref: number | string) => ZoneColorRef | null): {
  runtime: ZoneColorRuntime;
  applyColor: ReturnType<typeof vi.fn<ZoneColorRuntime["applyColor"]>>;
} {
  const applyColor = vi.fn<ZoneColorRuntime["applyColor"]>();
  return { runtime: { find, applyColor }, applyColor };
}

describe("set_zone_color tool", () => {
  it("recolors a zone by numeric id", async () => {
    const { runtime, applyColor } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Plague", previousColor: "#550055" } : null,
    );
    const tool = createSetZoneColorTool(runtime);
    const result = await tool.execute({ zone: 5, color: "#ff00ff" });
    expect(result.isError).toBeFalsy();
    expect(applyColor).toHaveBeenCalledWith(5, "#ff00ff");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Plague",
      previousColor: "#550055",
      color: "#ff00ff",
    });
  });

  it("resolves zone by case-insensitive name", async () => {
    const find = vi.fn<ZoneColorRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "plague"
        ? { i: 5, name: "Plague", previousColor: null }
        : null,
    );
    const { runtime, applyColor } = makeRuntime(find);
    const tool = createSetZoneColorTool(runtime);
    await tool.execute({ zone: "PLAGUE", color: "crimson" });
    expect(find).toHaveBeenCalledWith("PLAGUE");
    expect(applyColor).toHaveBeenCalledWith(5, "crimson");
  });

  it("accepts every valid color form", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousColor: null,
    }));
    const tool = createSetZoneColorTool(runtime);
    for (const color of [
      "#abc",
      "#abcd",
      "#aabbcc",
      "#aabbccdd",
      "rgb(1,2,3)",
      "rgba(1,2,3,0.5)",
      "hsl(120,50%,50%)",
      "hsla(120,50%,50%,0.3)",
      "red",
      "SeaGreen",
    ]) {
      applyColor.mockClear();
      const r = await tool.execute({ zone: 1, color });
      expect(r.isError).toBeFalsy();
      expect(applyColor).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects invalid colors", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousColor: null,
    }));
    const tool = createSetZoneColorTool(runtime);
    for (const bad of [null, undefined, "", "   ", "not-a-color", 42, {}]) {
      const r = await tool.execute({ zone: 1, color: bad });
      expect(r.isError).toBe(true);
    }
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("errors when the zone is unknown", async () => {
    const { runtime, applyColor } = makeRuntime(() => null);
    const tool = createSetZoneColorTool(runtime);
    const result = await tool.execute({ zone: 999, color: "red" });
    expect(result.isError).toBe(true);
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("rejects invalid zone refs", async () => {
    const { runtime, applyColor } = makeRuntime(() => null);
    const tool = createSetZoneColorTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ zone: bad, color: "red" });
      expect(r.isError).toBe(true);
    }
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: ZoneColorRuntime = {
      find: () => ({ i: 1, name: "x", previousColor: null }),
      applyColor: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetZoneColorTool(runtime);
    const result = await tool.execute({ zone: 1, color: "red" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultZoneColorRuntime (integration)", () => {
  const drawMock = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDraw = (globalThis as { drawZones?: unknown }).drawZones;

  beforeEach(() => {
    drawMock.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      zones: [
        { i: 2, name: "Invasion", color: "#ff0000", cells: [] },
        { i: 5, name: "Plague", color: "#550055", cells: [] },
        { i: 8, name: "Crusade", color: "#ffff00", cells: [] },
      ] satisfies RawZone[],
    };
    (globalThis as { drawZones?: () => void }).drawZones = drawMock;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { drawZones?: unknown }).drawZones = originalDraw;
  });

  it("recolors at non-contiguous id and calls drawZones", async () => {
    const result = await setZoneColorTool.execute({
      zone: 5,
      color: "#ff00ff",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones[1]?.color).toBe("#ff00ff");
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("reports an error when the zone does not exist", async () => {
    const result = await setZoneColorTool.execute({
      zone: 999,
      color: "red",
    });
    expect(result.isError).toBe(true);
    expect(drawMock).not.toHaveBeenCalled();
  });
});
