import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawZone } from "./_shared";
import {
  createSetZoneVisibilityTool,
  defaultZoneVisibilityRuntime,
  findZoneByRef,
  setZoneVisibilityTool,
  type ZoneVisibilityRef,
  type ZoneVisibilityRuntime,
} from "./set-zone-visibility";

function makeRuntime(
  find: (ref: number | string) => ZoneVisibilityRef | null,
): {
  runtime: ZoneVisibilityRuntime;
  setHidden: ReturnType<typeof vi.fn<ZoneVisibilityRuntime["setHidden"]>>;
} {
  const setHidden = vi.fn<ZoneVisibilityRuntime["setHidden"]>();
  return { runtime: { find, setHidden }, setHidden };
}

describe("set_zone_visibility tool", () => {
  it("hides a visible zone by id", async () => {
    const { runtime, setHidden } = makeRuntime((ref) =>
      ref === 3
        ? { i: 3, name: "Invasion of the North", previousHidden: false }
        : null,
    );
    const tool = createSetZoneVisibilityTool(runtime);
    const result = await tool.execute({ zone: 3, visible: false });
    expect(result.isError).toBeFalsy();
    expect(setHidden).toHaveBeenCalledWith(3, true);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      name: "Invasion of the North",
      visible: false,
      previousVisible: true,
      noop: false,
    });
  });

  it("shows a hidden zone by id", async () => {
    const { runtime, setHidden } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Plague", previousHidden: true } : null,
    );
    const tool = createSetZoneVisibilityTool(runtime);
    const result = await tool.execute({ zone: 5, visible: true });
    expect(result.isError).toBeFalsy();
    expect(setHidden).toHaveBeenCalledWith(5, false);
    const body = JSON.parse(result.content);
    expect(body.visible).toBe(true);
    expect(body.previousVisible).toBe(false);
    expect(body.noop).toBe(false);
  });

  it("resolves the zone by case-insensitive name", async () => {
    const find = vi.fn<ZoneVisibilityRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "plague"
        ? { i: 5, name: "Plague", previousHidden: false }
        : null,
    );
    const { runtime, setHidden } = makeRuntime(find);
    const tool = createSetZoneVisibilityTool(runtime);
    await tool.execute({ zone: "PLAGUE", visible: false });
    expect(find).toHaveBeenCalledWith("PLAGUE");
    expect(setHidden).toHaveBeenCalledWith(5, true);
  });

  it("returns noop when asked to hide an already-hidden zone", async () => {
    const { runtime, setHidden } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousHidden: true,
    }));
    const tool = createSetZoneVisibilityTool(runtime);
    const result = await tool.execute({ zone: 1, visible: false });
    expect(setHidden).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("returns noop when asked to show an already-visible zone", async () => {
    const { runtime, setHidden } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousHidden: false,
    }));
    const tool = createSetZoneVisibilityTool(runtime);
    const result = await tool.execute({ zone: 1, visible: true });
    expect(setHidden).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("errors when the zone is unknown", async () => {
    const { runtime, setHidden } = makeRuntime(() => null);
    const tool = createSetZoneVisibilityTool(runtime);
    const result = await tool.execute({ zone: 999, visible: false });
    expect(result.isError).toBe(true);
    expect(setHidden).not.toHaveBeenCalled();
  });

  it("rejects invalid zone refs", async () => {
    const { runtime, setHidden } = makeRuntime(() => null);
    const tool = createSetZoneVisibilityTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ zone: bad, visible: false });
      expect(r.isError).toBe(true);
    }
    expect(setHidden).not.toHaveBeenCalled();
  });

  it("rejects non-boolean visible", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousHidden: false,
    }));
    const tool = createSetZoneVisibilityTool(runtime);
    const result = await tool.execute({ zone: 1, visible: "yes" });
    expect(result.isError).toBe(true);
  });

  it("surfaces runtime failures from setHidden", async () => {
    const runtime: ZoneVisibilityRuntime = {
      find: () => ({ i: 1, name: "x", previousHidden: false }),
      setHidden: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetZoneVisibilityTool(runtime);
    const result = await tool.execute({ zone: 1, visible: false });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("findZoneByRef", () => {
  const zones: RawZone[] = [
    { i: 2, name: "Invasion" },
    { i: 5, name: "Plague" },
    { i: 8, name: "Crusade" },
  ];

  it("returns null when zones array is missing", () => {
    expect(findZoneByRef(undefined, 1)).toBeNull();
  });

  it("matches by numeric i even with non-contiguous ids", () => {
    expect(findZoneByRef(zones, 5)).toBe(zones[1]);
    expect(findZoneByRef(zones, 8)).toBe(zones[2]);
    expect(findZoneByRef(zones, 3)).toBeNull();
  });

  it("matches names case-insensitively and trims whitespace", () => {
    expect(findZoneByRef(zones, "plague")).toBe(zones[1]);
    expect(findZoneByRef(zones, "  PLAGUE  ")).toBe(zones[1]);
    expect(findZoneByRef(zones, "nope")).toBeNull();
  });

  it("rejects invalid refs", () => {
    expect(findZoneByRef(zones, 1.5)).toBeNull();
    expect(findZoneByRef(zones, "")).toBeNull();
    expect(findZoneByRef(zones, "   ")).toBeNull();
  });
});

describe("defaultZoneVisibilityRuntime (integration)", () => {
  const drawMock = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDraw = (globalThis as { drawZones?: unknown }).drawZones;

  beforeEach(() => {
    drawMock.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      zones: [
        { i: 2, name: "Invasion", cells: [] },
        { i: 5, name: "Plague", cells: [] },
        { i: 8, name: "Crusade", hidden: true, cells: [] },
      ] satisfies RawZone[],
    };
    (globalThis as { drawZones?: () => void }).drawZones = drawMock;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { drawZones?: unknown }).drawZones = originalDraw;
  });

  it("hides a visible zone at non-contiguous id and calls drawZones", async () => {
    const result = await setZoneVisibilityTool.execute({
      zone: 5,
      visible: false,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones[1]?.hidden).toBe(true);
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("shows a hidden zone by deleting the hidden key", async () => {
    const result = await setZoneVisibilityTool.execute({
      zone: 8,
      visible: true,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones[2]).not.toHaveProperty("hidden");
    expect(drawMock).toHaveBeenCalledTimes(1);
  });

  it("noop does not call drawZones", async () => {
    await setZoneVisibilityTool.execute({ zone: 5, visible: true });
    expect(drawMock).not.toHaveBeenCalled();
  });

  it("uses the default runtime's find path (sanity)", () => {
    const ref = defaultZoneVisibilityRuntime.find("crusade");
    expect(ref).toEqual({ i: 8, name: "Crusade", previousHidden: true });
  });
});
