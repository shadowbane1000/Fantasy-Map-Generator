import { describe, expect, it, vi } from "vitest";
import {
  createSetProvinceColorTool,
  type ProvinceColorRef,
  type ProvinceColorRuntime,
} from "./set-province-color";

function makeRuntime(
  resolver: (ref: number | string) => ProvinceColorRef | null,
) {
  const find = vi.fn(resolver);
  const applyColor = vi.fn<ProvinceColorRuntime["applyColor"]>();
  const runtime: ProvinceColorRuntime = { find, applyColor };
  return { runtime, find, applyColor };
}

describe("set_province_color tool", () => {
  it("applies a hex color by province id", async () => {
    const { runtime, applyColor } = makeRuntime((ref) =>
      ref === 3 ? { i: 3, name: "Rookwood", previousColor: "#111" } : null,
    );
    const tool = createSetProvinceColorTool(runtime);
    const result = await tool.execute({ province: 3, color: "#336699" });
    expect(result.isError).toBeFalsy();
    expect(applyColor).toHaveBeenCalledWith(3, "#336699");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      name: "Rookwood",
      previousColor: "#111",
      color: "#336699",
    });
  });

  it("resolves case-insensitive name with a named color", async () => {
    const { runtime, applyColor } = makeRuntime((ref) =>
      ref === "rookwood"
        ? { i: 3, name: "Rookwood", previousColor: null }
        : null,
    );
    const tool = createSetProvinceColorTool(runtime);
    await tool.execute({ province: "rookwood", color: "goldenrod" });
    expect(applyColor).toHaveBeenCalledWith(3, "goldenrod");
  });

  it("trims the color before calling the runtime", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 3,
      name: "Rookwood",
      previousColor: null,
    }));
    const tool = createSetProvinceColorTool(runtime);
    await tool.execute({ province: 3, color: "  #abc  " });
    expect(applyColor).toHaveBeenCalledWith(3, "#abc");
  });

  it("rejects province 0 (placeholder)", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 0,
      name: "Placeholder",
      previousColor: null,
    }));
    const tool = createSetProvinceColorTool(runtime);
    const result = await tool.execute({ province: 0, color: "#abc" });
    expect(result.isError).toBe(true);
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("errors for unknown refs", async () => {
    const { runtime, applyColor } = makeRuntime(() => null);
    const tool = createSetProvinceColorTool(runtime);
    const result = await tool.execute({ province: 999, color: "#abc" });
    expect(result.isError).toBe(true);
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("rejects invalid colors", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 1,
      name: "X",
      previousColor: null,
    }));
    const tool = createSetProvinceColorTool(runtime);
    for (const bad of ["", "   ", "not a color", "#12", "rgb("]) {
      const r = await tool.execute({ province: 1, color: bad });
      expect(r.isError).toBe(true);
    }
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("rejects invalid ref types", async () => {
    const { runtime, applyColor } = makeRuntime(() => null);
    const tool = createSetProvinceColorTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      const r = await tool.execute({ province: bad, color: "#abc" });
      expect(r.isError).toBe(true);
    }
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 1,
      name: "X",
      previousColor: null,
    }));
    runtime.applyColor = vi.fn(() => {
      throw new Error("SVG not mounted yet");
    });
    const tool = createSetProvinceColorTool(runtime);
    const result = await tool.execute({ province: 1, color: "#abc" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/SVG/);
  });
});
