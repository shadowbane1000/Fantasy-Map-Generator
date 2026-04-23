import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetStylePresetTool,
  resolveStylePreset,
  STYLE_PRESETS,
  type StylePresetRuntime,
  setStylePresetTool,
} from "./set-style-preset";

describe("resolveStylePreset", () => {
  it("canonicalizes case-insensitively", () => {
    expect(resolveStylePreset("Default")).toBe("default");
    expect(resolveStylePreset("DARKSEAS")).toBe("darkSeas");
    expect(resolveStylePreset("watercolor")).toBe("watercolor");
  });

  it("returns null for unknown / non-string", () => {
    expect(resolveStylePreset("steampunk")).toBeNull();
    expect(resolveStylePreset("")).toBeNull();
    expect(resolveStylePreset(42)).toBeNull();
    expect(resolveStylePreset(null)).toBeNull();
  });
});

describe("STYLE_PRESETS", () => {
  it("has 12 presets", () => {
    expect(STYLE_PRESETS).toHaveLength(12);
  });
});

function makeRuntime(): {
  runtime: StylePresetRuntime;
  apply: ReturnType<typeof vi.fn<StylePresetRuntime["apply"]>>;
} {
  const apply = vi.fn<StylePresetRuntime["apply"]>();
  return { runtime: { apply }, apply };
}

describe("set_style_preset tool", () => {
  it("delegates with canonical preset", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetStylePresetTool(runtime);
    const result = await tool.execute({ preset: "ancient" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("ancient");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      preset: "ancient",
    });
  });

  it("canonicalizes case", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetStylePresetTool(runtime);
    await tool.execute({ preset: "DARKSEAS" });
    expect(apply).toHaveBeenCalledWith("darkSeas");
  });

  it("rejects unknown preset", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetStylePresetTool(runtime);
    const result = await tool.execute({ preset: "steampunk" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.supported).toContain("default");
  });

  it("rejects empty / non-string preset", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetStylePresetTool(runtime);
    for (const bad of [null, undefined, 42, "", "   "]) {
      const r = await tool.execute({ preset: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: StylePresetRuntime = {
      apply: vi.fn(() => {
        throw new Error("changeStyle is not available yet");
      }),
    };
    const tool = createSetStylePresetTool(runtime);
    const result = await tool.execute({ preset: "default" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/changeStyle/);
  });
});

describe("defaultStylePresetRuntime (integration)", () => {
  const changeStyle = vi.fn(async (_preset: string) => {});
  const originalChange = (globalThis as { changeStyle?: unknown }).changeStyle;

  beforeEach(() => {
    changeStyle.mockReset();
    changeStyle.mockImplementation(async (_preset: string) => {});
    (globalThis as { changeStyle?: unknown }).changeStyle = changeStyle;
  });

  afterEach(() => {
    (globalThis as { changeStyle?: unknown }).changeStyle = originalChange;
  });

  it("delegates to window.changeStyle", async () => {
    const result = await setStylePresetTool.execute({ preset: "night" });
    expect(result.isError).toBeFalsy();
    expect(changeStyle).toHaveBeenCalledWith("night");
  });

  it("errors when changeStyle is missing", async () => {
    (globalThis as { changeStyle?: unknown }).changeStyle = undefined;
    const result = await setStylePresetTool.execute({ preset: "night" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/changeStyle/);
  });
});
