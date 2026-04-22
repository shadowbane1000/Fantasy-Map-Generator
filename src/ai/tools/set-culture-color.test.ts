import { describe, expect, it, vi } from "vitest";
import {
  type CultureColorRef,
  type CultureColorRuntime,
  createSetCultureColorTool,
} from "./set-culture-color";

function makeRuntime(
  resolver: (ref: number | string) => CultureColorRef | null,
) {
  const find = vi.fn(resolver);
  const applyColor = vi.fn<CultureColorRuntime["applyColor"]>();
  const runtime: CultureColorRuntime = { find, applyColor };
  return { runtime, find, applyColor };
}

describe("set_culture_color tool", () => {
  it("applies a hex color by culture id", async () => {
    const { runtime, applyColor } = makeRuntime((ref) =>
      ref === 2 ? { i: 2, name: "Coastalfolk", previousColor: "#111" } : null,
    );
    const tool = createSetCultureColorTool(runtime);
    const result = await tool.execute({ culture: 2, color: "#336699" });
    expect(result.isError).toBeFalsy();
    expect(applyColor).toHaveBeenCalledWith(2, "#336699");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 2,
      name: "Coastalfolk",
      previousColor: "#111",
      color: "#336699",
    });
  });

  it("resolves a case-insensitive name reference with a named color", async () => {
    const { runtime, applyColor } = makeRuntime((ref) =>
      ref === "highlanders"
        ? { i: 1, name: "Highlanders", previousColor: null }
        : null,
    );
    const tool = createSetCultureColorTool(runtime);
    await tool.execute({ culture: "highlanders", color: "seagreen" });
    expect(applyColor).toHaveBeenCalledWith(1, "seagreen");
  });

  it("trims the color before calling the runtime", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 1,
      name: "Highlanders",
      previousColor: null,
    }));
    const tool = createSetCultureColorTool(runtime);
    await tool.execute({ culture: 1, color: "  #abc  " });
    expect(applyColor).toHaveBeenCalledWith(1, "#abc");
  });

  it("rejects culture 0 (Wildlands)", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 0,
      name: "Wildlands",
      previousColor: null,
    }));
    const tool = createSetCultureColorTool(runtime);
    const result = await tool.execute({ culture: 0, color: "#abc" });
    expect(result.isError).toBe(true);
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("errors for unknown refs", async () => {
    const { runtime, applyColor } = makeRuntime(() => null);
    const tool = createSetCultureColorTool(runtime);
    const result = await tool.execute({ culture: 999, color: "#abc" });
    expect(result.isError).toBe(true);
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("rejects invalid colors", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 1,
      name: "X",
      previousColor: null,
    }));
    const tool = createSetCultureColorTool(runtime);
    for (const bad of ["", "   ", "not a color", "#12", "rgb("]) {
      const r = await tool.execute({ culture: 1, color: bad });
      expect(r.isError).toBe(true);
    }
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("rejects invalid ref types", async () => {
    const { runtime, applyColor } = makeRuntime(() => null);
    const tool = createSetCultureColorTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      const r = await tool.execute({ culture: bad, color: "#abc" });
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
    const tool = createSetCultureColorTool(runtime);
    const result = await tool.execute({ culture: 1, color: "#abc" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/SVG/);
  });
});
