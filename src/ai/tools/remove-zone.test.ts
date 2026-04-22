import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawZone } from "./_shared";
import {
  createRemoveZoneTool,
  type RemoveZoneRef,
  removeZoneTool,
  type ZoneRemovalRuntime,
} from "./remove-zone";

function makeRuntime(find: (ref: number | string) => RemoveZoneRef | null): {
  runtime: ZoneRemovalRuntime;
  remove: ReturnType<typeof vi.fn<ZoneRemovalRuntime["remove"]>>;
} {
  const remove = vi.fn<ZoneRemovalRuntime["remove"]>();
  return { runtime: { find, remove }, remove };
}

describe("remove_zone tool", () => {
  it("removes a zone by numeric id", async () => {
    const { runtime, remove } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Plague" } : null,
    );
    const tool = createRemoveZoneTool(runtime);
    const result = await tool.execute({ zone: 5 });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalledWith(5);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Plague",
    });
  });

  it("removes a zone by case-insensitive name", async () => {
    const find = vi.fn<ZoneRemovalRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "plague"
        ? { i: 5, name: "Plague" }
        : null,
    );
    const { runtime, remove } = makeRuntime(find);
    const tool = createRemoveZoneTool(runtime);
    await tool.execute({ zone: "PLAGUE" });
    expect(find).toHaveBeenCalledWith("PLAGUE");
    expect(remove).toHaveBeenCalledWith(5);
  });

  it("errors when the zone is unknown", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveZoneTool(runtime);
    const result = await tool.execute({ zone: 999 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects invalid zone refs", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveZoneTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ zone: bad });
      expect(r.isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: ZoneRemovalRuntime = {
      find: () => ({ i: 1, name: "x" }),
      remove: vi.fn(() => {
        throw new Error("pack.zones is not available.");
      }),
    };
    const tool = createRemoveZoneTool(runtime);
    const result = await tool.execute({ zone: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.zones/);
  });
});

describe("defaultZoneRemovalRuntime (integration)", () => {
  const removeFn = vi.fn();
  const unfogFn = vi.fn();
  const getElementById = vi.fn((id: string) =>
    id === "zone5" ? { remove: removeFn } : null,
  );
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalUnfog = (globalThis as { unfog?: unknown }).unfog;

  beforeEach(() => {
    removeFn.mockReset();
    unfogFn.mockReset();
    getElementById.mockClear();
    (globalThis as { pack?: unknown }).pack = {
      zones: [
        { i: 2, name: "Invasion", cells: [] },
        { i: 5, name: "Plague", cells: [] },
        { i: 8, name: "Crusade", cells: [] },
      ] satisfies RawZone[],
    };
    (globalThis as { document?: unknown }).document = { getElementById };
    (globalThis as { unfog?: unknown }).unfog = unfogFn;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { unfog?: unknown }).unfog = originalUnfog;
  });

  it("removes the zone, its SVG element, and unfogs the focus overlay", async () => {
    const result = await removeZoneTool.execute({ zone: 5 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones).toHaveLength(2);
    expect(pack.zones.some((z) => z.i === 5)).toBe(false);
    expect(removeFn).toHaveBeenCalledTimes(1);
    expect(unfogFn).toHaveBeenCalledWith("focusZone5");
  });

  it("errors when the zone id is unknown", async () => {
    const result = await removeZoneTool.execute({ zone: 999 });
    expect(result.isError).toBe(true);
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones).toHaveLength(3);
    expect(removeFn).not.toHaveBeenCalled();
    expect(unfogFn).not.toHaveBeenCalled();
  });

  it("succeeds when the SVG element is not mounted", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    const result = await removeZoneTool.execute({ zone: 2 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones.some((z) => z.i === 2)).toBe(false);
    expect(unfogFn).toHaveBeenCalledWith("focusZone2");
  });

  it("succeeds when unfog is not defined", async () => {
    (globalThis as { unfog?: unknown }).unfog = undefined;
    const result = await removeZoneTool.execute({ zone: 8 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones.some((z) => z.i === 8)).toBe(false);
  });
});
