import { describe, expect, it, vi } from "vitest";
import {
  createSetReligionColorTool,
  type ReligionColorRef,
  type ReligionColorRuntime,
} from "./set-religion-color";

function makeRuntime(
  resolver: (ref: number | string) => ReligionColorRef | null,
) {
  const find = vi.fn(resolver);
  const applyColor = vi.fn<ReligionColorRuntime["applyColor"]>();
  const runtime: ReligionColorRuntime = { find, applyColor };
  return { runtime, find, applyColor };
}

describe("set_religion_color tool", () => {
  it("applies a hex color by religion id", async () => {
    const { runtime, applyColor } = makeRuntime((ref) =>
      ref === 2 ? { i: 2, name: "Sun Cult", previousColor: "#111" } : null,
    );
    const tool = createSetReligionColorTool(runtime);
    const result = await tool.execute({ religion: 2, color: "#336699" });
    expect(result.isError).toBeFalsy();
    expect(applyColor).toHaveBeenCalledWith(2, "#336699");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 2,
      name: "Sun Cult",
      previousColor: "#111",
      color: "#336699",
    });
  });

  it("resolves case-insensitive name with a named color", async () => {
    const { runtime, applyColor } = makeRuntime((ref) =>
      ref === "old faith"
        ? { i: 1, name: "Old Faith", previousColor: null }
        : null,
    );
    const tool = createSetReligionColorTool(runtime);
    await tool.execute({ religion: "old faith", color: "goldenrod" });
    expect(applyColor).toHaveBeenCalledWith(1, "goldenrod");
  });

  it("trims the color before calling the runtime", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 1,
      name: "Old Faith",
      previousColor: null,
    }));
    const tool = createSetReligionColorTool(runtime);
    await tool.execute({ religion: 1, color: "  #abc  " });
    expect(applyColor).toHaveBeenCalledWith(1, "#abc");
  });

  it("rejects religion 0 (No religion placeholder)", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 0,
      name: "No religion",
      previousColor: null,
    }));
    const tool = createSetReligionColorTool(runtime);
    const result = await tool.execute({ religion: 0, color: "#abc" });
    expect(result.isError).toBe(true);
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("errors for unknown refs", async () => {
    const { runtime, applyColor } = makeRuntime(() => null);
    const tool = createSetReligionColorTool(runtime);
    const result = await tool.execute({ religion: 999, color: "#abc" });
    expect(result.isError).toBe(true);
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("rejects invalid colors", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 1,
      name: "X",
      previousColor: null,
    }));
    const tool = createSetReligionColorTool(runtime);
    for (const bad of ["", "   ", "not a color", "#12", "rgb("]) {
      const r = await tool.execute({ religion: 1, color: bad });
      expect(r.isError).toBe(true);
    }
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("rejects invalid ref types", async () => {
    const { runtime, applyColor } = makeRuntime(() => null);
    const tool = createSetReligionColorTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      const r = await tool.execute({ religion: bad, color: "#abc" });
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
    const tool = createSetReligionColorTool(runtime);
    const result = await tool.execute({ religion: 1, color: "#abc" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/SVG/);
  });
});
