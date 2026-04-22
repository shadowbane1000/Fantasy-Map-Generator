import { describe, expect, it, vi } from "vitest";
import {
  createSetStateColorTool,
  isValidCssColor,
  type StateColorRef,
  type StateColorRuntime,
} from "./set-state-color";

function makeRuntime(resolver: (ref: number | string) => StateColorRef | null) {
  const find = vi.fn(resolver);
  const applyColor = vi.fn<StateColorRuntime["applyColor"]>();
  const runtime: StateColorRuntime = { find, applyColor };
  return { runtime, find, applyColor };
}

describe("set_state_color tool", () => {
  it("applies a hex color by state id", async () => {
    const { runtime, applyColor } = makeRuntime((ref) =>
      ref === 2 ? { i: 2, name: "Borgnia", previousColor: "#111" } : null,
    );
    const tool = createSetStateColorTool(runtime);
    const result = await tool.execute({ state: 2, color: "#abcdef" });
    expect(result.isError).toBeFalsy();
    expect(applyColor).toHaveBeenCalledWith(2, "#abcdef");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 2,
      name: "Borgnia",
      previousColor: "#111",
      color: "#abcdef",
    });
  });

  it("accepts a named color and a string ref", async () => {
    const { runtime, applyColor } = makeRuntime((ref) =>
      ref === "altaria" ? { i: 1, name: "Altaria", previousColor: null } : null,
    );
    const tool = createSetStateColorTool(runtime);
    await tool.execute({ state: "altaria", color: "red" });
    expect(applyColor).toHaveBeenCalledWith(1, "red");
  });

  it("trims the color value before passing it to the runtime", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 1,
      name: "Altaria",
      previousColor: null,
    }));
    const tool = createSetStateColorTool(runtime);
    await tool.execute({ state: 1, color: "  #abc  " });
    expect(applyColor).toHaveBeenCalledWith(1, "#abc");
  });

  it("rejects state 0 (Neutrals)", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 0,
      name: "Neutrals",
      previousColor: null,
    }));
    const tool = createSetStateColorTool(runtime);
    const result = await tool.execute({ state: 0, color: "#abc" });
    expect(result.isError).toBe(true);
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("errors for unknown state refs", async () => {
    const { runtime, applyColor } = makeRuntime(() => null);
    const tool = createSetStateColorTool(runtime);
    const result = await tool.execute({ state: 999, color: "#abc" });
    expect(result.isError).toBe(true);
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("rejects invalid colors", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 1,
      name: "Altaria",
      previousColor: null,
    }));
    const tool = createSetStateColorTool(runtime);
    for (const bad of ["", "   ", "not a color", "#12", "#gggggg", "rgb("]) {
      const r = await tool.execute({ state: 1, color: bad });
      expect(r.isError).toBe(true);
    }
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("rejects invalid ref types", async () => {
    const { runtime, applyColor } = makeRuntime(() => null);
    const tool = createSetStateColorTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      const r = await tool.execute({ state: bad, color: "#abc" });
      expect(r.isError).toBe(true);
    }
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 1,
      name: "Altaria",
      previousColor: null,
    }));
    runtime.applyColor = vi.fn(() => {
      throw new Error("SVG not mounted yet");
    });
    const tool = createSetStateColorTool(runtime);
    const result = await tool.execute({ state: 1, color: "#abc" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/SVG/);
  });
});

describe("isValidCssColor", () => {
  it("accepts valid hex, functional, and named colors", () => {
    for (const good of [
      "#abc",
      "#abcd",
      "#abcdef",
      "#abcdef12",
      "#ABC",
      "rgb(1, 2, 3)",
      "RGB(1,2,3)",
      "rgba(1, 2, 3, 0.5)",
      "hsl(0, 100%, 50%)",
      "hsla(0, 100%, 50%, 0.5)",
      "red",
      "mediumseagreen",
      "rebeccapurple",
    ]) {
      expect(isValidCssColor(good)).toBe(true);
    }
  });

  it("rejects invalid colors and non-strings", () => {
    for (const bad of [
      "",
      "   ",
      "not a color",
      "#12",
      "#gg",
      "#abcde",
      "rgb(",
      "red_blue",
      "rgb abc",
      123,
      null,
      undefined,
      {},
      [] as unknown,
    ]) {
      expect(isValidCssColor(bad)).toBe(false);
    }
  });
});
