import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawZone } from "./_shared";
import {
  createRenameZoneTool,
  renameZoneTool,
  type ZoneRenameRef,
  type ZoneRenameRuntime,
} from "./rename-zone";

function makeRuntime(find: (ref: number | string) => ZoneRenameRef | null): {
  runtime: ZoneRenameRuntime;
  rename: ReturnType<typeof vi.fn<ZoneRenameRuntime["rename"]>>;
} {
  const rename = vi.fn<ZoneRenameRuntime["rename"]>();
  return { runtime: { find, rename }, rename };
}

describe("rename_zone tool", () => {
  it("renames a zone by numeric id", async () => {
    const { runtime, rename } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Plague" } : null,
    );
    const tool = createRenameZoneTool(runtime);
    const result = await tool.execute({ zone: 5, name: "Black Death" });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(5, "Black Death");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      previousName: "Plague",
      name: "Black Death",
    });
  });

  it("renames a zone by case-insensitive name", async () => {
    const find = vi.fn<ZoneRenameRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "plague"
        ? { i: 5, name: "Plague" }
        : null,
    );
    const { runtime, rename } = makeRuntime(find);
    const tool = createRenameZoneTool(runtime);
    await tool.execute({ zone: "PLAGUE", name: "Black Death" });
    expect(find).toHaveBeenCalledWith("PLAGUE");
    expect(rename).toHaveBeenCalledWith(5, "Black Death");
  });

  it("trims the name before writing", async () => {
    const { runtime, rename } = makeRuntime(() => ({ i: 1, name: "x" }));
    const tool = createRenameZoneTool(runtime);
    await tool.execute({ zone: 1, name: "  Black Death  " });
    expect(rename).toHaveBeenCalledWith(1, "Black Death");
  });

  it("errors when the zone is unknown", async () => {
    const { runtime, rename } = makeRuntime(() => null);
    const tool = createRenameZoneTool(runtime);
    const result = await tool.execute({ zone: 999, name: "new" });
    expect(result.isError).toBe(true);
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects invalid zone refs", async () => {
    const { runtime, rename } = makeRuntime(() => null);
    const tool = createRenameZoneTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ zone: bad, name: "new" });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects invalid name", async () => {
    const { runtime, rename } = makeRuntime(() => ({ i: 1, name: "x" }));
    const tool = createRenameZoneTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({ zone: 1, name: bad });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("renames to the same name without short-circuiting", async () => {
    const { runtime, rename } = makeRuntime(() => ({ i: 1, name: "Plague" }));
    const tool = createRenameZoneTool(runtime);
    const result = await tool.execute({ zone: 1, name: "Plague" });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(1, "Plague");
  });

  it("surfaces runtime failures", async () => {
    const runtime: ZoneRenameRuntime = {
      find: () => ({ i: 1, name: "x" }),
      rename: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createRenameZoneTool(runtime);
    const result = await tool.execute({ zone: 1, name: "y" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultZoneRenameRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const setAttribute = vi.fn();

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      zones: [
        { i: 2, name: "Invasion", cells: [] },
        { i: 5, name: "Plague", cells: [] },
        { i: 8, name: "Crusade", cells: [] },
      ] satisfies RawZone[],
    };
    setAttribute.mockReset();
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) =>
        id === "zone5" ? { setAttribute } : null,
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("renames pack.zones[k].name at non-contiguous id and updates SVG data-description", async () => {
    const result = await renameZoneTool.execute({
      zone: 5,
      name: "Black Death",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones[1]?.name).toBe("Black Death");
    expect(setAttribute).toHaveBeenCalledWith(
      "data-description",
      "Black Death",
    );
  });

  it("still renames when the SVG element is not mounted", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    const result = await renameZoneTool.execute({
      zone: "invasion",
      name: "Red Tide",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { zones: RawZone[] } }).pack;
    expect(pack.zones[0]?.name).toBe("Red Tide");
  });
});
