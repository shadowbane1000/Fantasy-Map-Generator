import { describe, expect, it, vi } from "vitest";
import {
  BURG_TYPES,
  type BurgTypeRef,
  type BurgTypeRuntime,
  createSetBurgTypeTool,
  resolveBurgType,
} from "./set-burg-type";

function makeRuntime(resolver: (ref: number | string) => BurgTypeRef | null) {
  const find = vi.fn(resolver);
  const apply = vi.fn<BurgTypeRuntime["apply"]>();
  const runtime: BurgTypeRuntime = { find, apply };
  return { runtime, find, apply };
}

describe("set_burg_type tool", () => {
  it("applies a canonical type by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Stormport", previousType: "Generic" } : null,
    );
    const tool = createSetBurgTypeTool(runtime);
    const result = await tool.execute({ burg: 5, type: "Naval" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, "Naval");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Stormport",
      previousType: "Generic",
      type: "Naval",
    });
  });

  it("is case-insensitive on type and resolves name refs", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "stormport"
        ? { i: 5, name: "Stormport", previousType: null }
        : null,
    );
    const tool = createSetBurgTypeTool(runtime);
    await tool.execute({ burg: "stormport", type: "HIGHLAND" });
    expect(apply).toHaveBeenCalledWith(5, "Highland");
  });

  it("rejects burg 0 (placeholder)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 0,
      name: "Placeholder",
      previousType: null,
    }));
    const tool = createSetBurgTypeTool(runtime);
    const result = await tool.execute({ burg: 0, type: "Naval" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors on unknown burg", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBurgTypeTool(runtime);
    const result = await tool.execute({ burg: 999, type: "Naval" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown types with the supported list", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousType: null,
    }));
    const tool = createSetBurgTypeTool(runtime);
    const result = await tool.execute({ burg: 5, type: "Mountain" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.supported).toEqual([...BURG_TYPES]);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid type inputs", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousType: null,
    }));
    const tool = createSetBurgTypeTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      expect((await tool.execute({ burg: 5, type: bad })).isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid ref types", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBurgTypeTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      expect((await tool.execute({ burg: bad, type: "Naval" })).isError).toBe(
        true,
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousType: null,
    }));
    runtime.apply = vi.fn(() => {
      throw new Error("customization active");
    });
    const tool = createSetBurgTypeTool(runtime);
    const result = await tool.execute({ burg: 5, type: "Naval" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/customization/);
  });
});

describe("resolveBurgType", () => {
  it("resolves every canonical type and alternate casing", () => {
    for (const type of BURG_TYPES) {
      expect(resolveBurgType(type)).toBe(type);
      expect(resolveBurgType(type.toLowerCase())).toBe(type);
      expect(resolveBurgType(`  ${type.toUpperCase()}  `)).toBe(type);
    }
  });

  it("returns null for unknown / invalid inputs", () => {
    expect(resolveBurgType("Mountain")).toBeNull();
    expect(resolveBurgType("")).toBeNull();
    expect(resolveBurgType("   ")).toBeNull();
    expect(resolveBurgType(42)).toBeNull();
    expect(resolveBurgType(null)).toBeNull();
    expect(resolveBurgType(undefined)).toBeNull();
  });
});
