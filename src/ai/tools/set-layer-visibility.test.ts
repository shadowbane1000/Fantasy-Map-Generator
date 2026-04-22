import { describe, expect, it, vi } from "vitest";
import {
  createSetLayerVisibilityTool,
  type LayerRuntime,
} from "./set-layer-visibility";

function makeRuntime(initial: Record<string, boolean>) {
  const state = { ...initial };
  const toggle = vi.fn((toggleFn: string) => {
    // toggleFn === buttonId in all current layers, but be defensive.
    const id = toggleFn;
    state[id] = !state[id];
  });
  const isOn = vi.fn((id: string) => !!state[id]);
  const runtime: LayerRuntime = { isOn, toggle };
  return { runtime, toggle, isOn, state };
}

describe("set_layer_visibility tool", () => {
  it("turns off rivers when visible=false and rivers are on", async () => {
    const { runtime, toggle, state } = makeRuntime({ toggleRivers: true });
    const tool = createSetLayerVisibilityTool(runtime);
    const result = await tool.execute({ layer: "rivers", visible: false });
    expect(result.isError).toBeFalsy();
    expect(toggle).toHaveBeenCalledWith("toggleRivers");
    expect(state.toggleRivers).toBe(false);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      layer: "rivers",
      visible: false,
      noop: false,
    });
  });

  it("is idempotent when the layer is already in the requested state", async () => {
    const { runtime, toggle } = makeRuntime({ toggleRivers: true });
    const tool = createSetLayerVisibilityTool(runtime);
    const result = await tool.execute({ layer: "rivers", visible: true });
    expect(result.isError).toBeFalsy();
    expect(toggle).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      noop: true,
    });
  });

  it("accepts alias 'state borders' for the borders layer", async () => {
    const { runtime, toggle } = makeRuntime({ toggleBorders: false });
    const tool = createSetLayerVisibilityTool(runtime);
    const result = await tool.execute({
      layer: "state borders",
      visible: true,
    });
    expect(result.isError).toBeFalsy();
    expect(toggle).toHaveBeenCalledWith("toggleBorders");
    expect(JSON.parse(result.content)).toMatchObject({
      layer: "borders",
      visible: true,
    });
  });

  it("accepts case-insensitive layer names", async () => {
    const { runtime, toggle } = makeRuntime({ toggleRivers: false });
    const tool = createSetLayerVisibilityTool(runtime);
    const result = await tool.execute({ layer: "RIVERS", visible: true });
    expect(toggle).toHaveBeenCalledWith("toggleRivers");
    expect(JSON.parse(result.content)).toMatchObject({ layer: "rivers" });
  });

  it("returns a structured error for unknown layer names", async () => {
    const { runtime } = makeRuntime({});
    const tool = createSetLayerVisibilityTool(runtime);
    const result = await tool.execute({ layer: "shadows", visible: true });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("shadows");
    expect(Array.isArray(body.supported)).toBe(true);
    expect(body.supported).toContain("rivers");
  });

  it("rejects missing or empty layer", async () => {
    const { runtime } = makeRuntime({});
    const tool = createSetLayerVisibilityTool(runtime);
    const a = await tool.execute({ visible: true });
    const b = await tool.execute({ layer: "   ", visible: true });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
  });

  it("rejects a non-boolean visible argument", async () => {
    const { runtime, toggle } = makeRuntime({ toggleRivers: true });
    const tool = createSetLayerVisibilityTool(runtime);
    const result = await tool.execute({ layer: "rivers", visible: "off" });
    expect(result.isError).toBe(true);
    expect(toggle).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).error).toContain("boolean");
  });

  it("propagates runtime toggle failures as error results", async () => {
    const runtime: LayerRuntime = {
      isOn: () => false,
      toggle: () => {
        throw new Error("toggleRivers not defined");
      },
    };
    const tool = createSetLayerVisibilityTool(runtime);
    const result = await tool.execute({ layer: "rivers", visible: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toContain("not defined");
  });
});
