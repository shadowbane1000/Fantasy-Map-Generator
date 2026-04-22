import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawZone } from "./_shared";
import {
  createSetZoneTypeTool,
  setZoneTypeTool,
  type ZoneTypeRef,
  type ZoneTypeRuntime,
} from "./set-zone-type";

function makeRuntime(find: (ref: number | string) => ZoneTypeRef | null): {
  runtime: ZoneTypeRuntime;
  apply: ReturnType<typeof vi.fn<ZoneTypeRuntime["apply"]>>;
} {
  const apply = vi.fn<ZoneTypeRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_zone_type tool", () => {
  it("sets type by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Plague", previousType: "Disease" } : null,
    );
    const tool = createSetZoneTypeTool(runtime);
    const result = await tool.execute({ zone: 5, type: "Famine" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, "Famine");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Plague",
      previousType: "Disease",
      type: "Famine",
    });
  });

  it("sets type by case-insensitive name", async () => {
    const find = vi.fn<ZoneTypeRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "plague"
        ? { i: 5, name: "Plague", previousType: "Disease" }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetZoneTypeTool(runtime);
    await tool.execute({ zone: "PLAGUE", type: "Famine" });
    expect(find).toHaveBeenCalledWith("PLAGUE");
    expect(apply).toHaveBeenCalledWith(5, "Famine");
  });

  it("trims the type before writing", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousType: null,
    }));
    const tool = createSetZoneTypeTool(runtime);
    await tool.execute({ zone: 1, type: "  Flood  " });
    expect(apply).toHaveBeenCalledWith(1, "Flood");
  });

  it("errors when the zone is unknown", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetZoneTypeTool(runtime);
    const result = await tool.execute({ zone: 999, type: "Flood" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid zone refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetZoneTypeTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ zone: bad, type: "X" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid types", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousType: null,
    }));
    const tool = createSetZoneTypeTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({ zone: 1, type: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: ZoneTypeRuntime = {
      find: () => ({ i: 1, name: "x", previousType: null }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetZoneTypeTool(runtime);
    const result = await tool.execute({ zone: 1, type: "X" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultZoneTypeRuntime (integration)", () => {
  const setAttribute = vi.fn();
  const getElementById = vi.fn((id: string) =>
    id === "zone5" ? { setAttribute } : null,
  );
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;

  beforeEach(() => {
    setAttribute.mockReset();
    getElementById.mockClear();
    (globalThis as { pack?: unknown }).pack = {
      zones: [
        { i: 2, name: "Invasion", type: "Invasion", cells: [] },
        { i: 5, name: "Plague", type: "Disease", cells: [] },
        { i: 8, name: "Crusade", type: "Crusade", cells: [] },
      ] satisfies RawZone[],
    };
    (globalThis as { document?: unknown }).document = { getElementById };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("retypes and updates data-type attribute", async () => {
    const result = await setZoneTypeTool.execute({ zone: 5, type: "Famine" });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones[1]?.type).toBe("Famine");
    expect(setAttribute).toHaveBeenCalledWith("data-type", "Famine");
  });

  it("still succeeds when the SVG element is missing", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    const result = await setZoneTypeTool.execute({ zone: 2, type: "Rebels" });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones[0]?.type).toBe("Rebels");
  });
});
