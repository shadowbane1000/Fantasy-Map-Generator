import { describe, expect, it, vi } from "vitest";
import {
  createApplyLayersPresetTool,
  type PresetRuntime,
} from "./apply-layers-preset";

function makeRuntime() {
  const apply = vi.fn();
  const runtime: PresetRuntime = { apply };
  return { runtime, apply };
}

describe("apply_layers_preset tool", () => {
  it("calls the runtime with the canonical preset name", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createApplyLayersPresetTool(runtime);
    const result = await tool.execute({ preset: "political" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("political");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      preset: "political",
    });
  });

  it("maps 'culture map' alias to 'cultural'", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createApplyLayersPresetTool(runtime);
    await tool.execute({ preset: "culture map" });
    expect(apply).toHaveBeenCalledWith("cultural");
  });

  it("maps 'religion' alias to 'religions'", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createApplyLayersPresetTool(runtime);
    await tool.execute({ preset: "religion" });
    expect(apply).toHaveBeenCalledWith("religions");
  });

  it("is case-insensitive", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createApplyLayersPresetTool(runtime);
    await tool.execute({ preset: "PHYSICAL" });
    expect(apply).toHaveBeenCalledWith("physical");
  });

  it("returns a structured error for unknown presets", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createApplyLayersPresetTool(runtime);
    const result = await tool.execute({ preset: "xyz" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("xyz");
    expect(body.supported).toContain("political");
  });

  it("rejects missing or empty preset", async () => {
    const { runtime } = makeRuntime();
    const tool = createApplyLayersPresetTool(runtime);
    const a = await tool.execute({});
    const b = await tool.execute({ preset: "   " });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
  });

  it("surfaces runtime failures as error results", async () => {
    const runtime: PresetRuntime = {
      apply: () => {
        throw new Error("handleLayersPresetChange is not available yet.");
      },
    };
    const tool = createApplyLayersPresetTool(runtime);
    const result = await tool.execute({ preset: "political" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not available");
  });
});
