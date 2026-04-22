import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRiver } from "./_shared";
import {
  createSetRiverTypeTool,
  type RiverTypeRef,
  type RiverTypeRuntime,
  setRiverTypeTool,
} from "./set-river-type";

function makeRuntime(find: (ref: number | string) => RiverTypeRef | null): {
  runtime: RiverTypeRuntime;
  apply: ReturnType<typeof vi.fn<RiverTypeRuntime["apply"]>>;
} {
  const apply = vi.fn<RiverTypeRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_river_type tool", () => {
  it("sets type by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Small Creek", previousType: "Creek" } : null,
    );
    const tool = createSetRiverTypeTool(runtime);
    const result = await tool.execute({ river: 5, type: "Stream" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, "Stream");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Small Creek",
      previousType: "Creek",
      type: "Stream",
    });
  });

  it("sets type by case-insensitive name", async () => {
    const find = vi.fn<RiverTypeRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "great river"
        ? { i: 1, name: "Great River", previousType: "River" }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetRiverTypeTool(runtime);
    await tool.execute({ river: "GREAT RIVER", type: "Canal" });
    expect(find).toHaveBeenCalledWith("GREAT RIVER");
    expect(apply).toHaveBeenCalledWith(1, "Canal");
  });

  it("trims the type before writing", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousType: null,
    }));
    const tool = createSetRiverTypeTool(runtime);
    await tool.execute({ river: 1, type: "  Ditch  " });
    expect(apply).toHaveBeenCalledWith(1, "Ditch");
  });

  it("accepts non-standard types", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousType: null,
    }));
    const tool = createSetRiverTypeTool(runtime);
    for (const type of ["Ravine", "Ditch", "Canal", "Seasonal Flow"]) {
      apply.mockClear();
      const r = await tool.execute({ river: 1, type });
      expect(r.isError).toBeFalsy();
      expect(apply).toHaveBeenCalledWith(1, type);
    }
  });

  it("errors when the river is unknown", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRiverTypeTool(runtime);
    const result = await tool.execute({ river: 999, type: "River" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid river refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRiverTypeTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ river: bad, type: "River" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid type", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousType: null,
    }));
    const tool = createSetRiverTypeTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({ river: 1, type: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: RiverTypeRuntime = {
      find: () => ({ i: 1, name: "x", previousType: null }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetRiverTypeTool(runtime);
    const result = await tool.execute({ river: 1, type: "River" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultRiverTypeRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      rivers: [
        { i: 1, name: "Great River", type: "River" },
        { i: 5, name: "Small Creek", type: "Creek" },
        { i: 9, name: "Ghost River", type: "River", removed: true },
      ] satisfies RawRiver[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("retypes the matching river at non-contiguous id", async () => {
    const result = await setRiverTypeTool.execute({
      river: 5,
      type: "Stream",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    expect(pack.rivers[1]?.type).toBe("Stream");
  });

  it("refuses to retype a removed river", async () => {
    const result = await setRiverTypeTool.execute({
      river: 9,
      type: "Canal",
    });
    expect(result.isError).toBe(true);
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    expect(pack.rivers[2]?.type).toBe("River");
  });
});
