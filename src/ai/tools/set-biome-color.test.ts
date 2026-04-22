import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BiomeColorRef,
  type BiomeColorRuntime,
  createSetBiomeColorTool,
  setBiomeColorTool,
} from "./set-biome-color";

function makeRuntime(find: (ref: number | string) => BiomeColorRef | null): {
  runtime: BiomeColorRuntime;
  applyColor: ReturnType<typeof vi.fn<BiomeColorRuntime["applyColor"]>>;
} {
  const applyColor = vi.fn<BiomeColorRuntime["applyColor"]>();
  return { runtime: { find, applyColor }, applyColor };
}

describe("set_biome_color tool", () => {
  it("recolors by numeric id", async () => {
    const { runtime, applyColor } = makeRuntime((ref) =>
      ref === 1 ? { i: 1, name: "Hot desert", previousColor: "#fbe79f" } : null,
    );
    const tool = createSetBiomeColorTool(runtime);
    const result = await tool.execute({ biome: 1, color: "#ff9933" });
    expect(result.isError).toBeFalsy();
    expect(applyColor).toHaveBeenCalledWith(1, "#ff9933");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      name: "Hot desert",
      previousColor: "#fbe79f",
      color: "#ff9933",
    });
  });

  it("recolors by case-insensitive name", async () => {
    const find = vi.fn<BiomeColorRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "grassland"
        ? { i: 4, name: "Grassland", previousColor: "#c8d68f" }
        : null,
    );
    const { runtime, applyColor } = makeRuntime(find);
    const tool = createSetBiomeColorTool(runtime);
    await tool.execute({ biome: "GRASSLAND", color: "seagreen" });
    expect(find).toHaveBeenCalledWith("GRASSLAND");
    expect(applyColor).toHaveBeenCalledWith(4, "seagreen");
  });

  it("accepts every canonical color form", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousColor: null,
    }));
    const tool = createSetBiomeColorTool(runtime);
    for (const color of [
      "#abc",
      "#aabbccdd",
      "rgb(1,2,3)",
      "rgba(1,2,3,0.5)",
      "hsl(120,50%,50%)",
      "red",
      "SeaGreen",
    ]) {
      applyColor.mockClear();
      const r = await tool.execute({ biome: 1, color });
      expect(r.isError).toBeFalsy();
      expect(applyColor).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects invalid biome refs", async () => {
    const { runtime, applyColor } = makeRuntime(() => null);
    const tool = createSetBiomeColorTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ biome: bad, color: "red" });
      expect(r.isError).toBe(true);
    }
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("rejects invalid colors", async () => {
    const { runtime, applyColor } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousColor: null,
    }));
    const tool = createSetBiomeColorTool(runtime);
    for (const bad of [null, undefined, "", "   ", "not-a-color", 42]) {
      const r = await tool.execute({ biome: 1, color: bad });
      expect(r.isError).toBe(true);
    }
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("errors when the biome is unknown", async () => {
    const { runtime, applyColor } = makeRuntime(() => null);
    const tool = createSetBiomeColorTool(runtime);
    const result = await tool.execute({ biome: 999, color: "red" });
    expect(result.isError).toBe(true);
    expect(applyColor).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: BiomeColorRuntime = {
      find: () => ({ i: 1, name: "x", previousColor: null }),
      applyColor: vi.fn(() => {
        throw new Error("biomesData missing");
      }),
    };
    const tool = createSetBiomeColorTool(runtime);
    const result = await tool.execute({ biome: 1, color: "red" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/biomesData missing/);
  });
});

describe("defaultBiomeColorRuntime (integration)", () => {
  const setAttribute = vi.fn();
  const getElementById = vi.fn((id: string) =>
    id === "biome1" ? { setAttribute } : null,
  );

  const originalBiomes = (globalThis as { biomesData?: unknown }).biomesData;
  const originalDoc = (globalThis as { document?: unknown }).document;

  beforeEach(() => {
    setAttribute.mockReset();
    getElementById.mockClear();
    (globalThis as { biomesData?: unknown }).biomesData = {
      i: [0, 1, 2, 3],
      name: ["Marine", "Hot desert", "removed", "Savanna"],
      color: ["#466eab", "#fbe79f", "", "#d2d082"],
    };
    (globalThis as { document?: unknown }).document = { getElementById };
  });

  afterEach(() => {
    (globalThis as { biomesData?: unknown }).biomesData = originalBiomes;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("recolors a live biome and updates the SVG attributes", async () => {
    const result = await setBiomeColorTool.execute({
      biome: 1,
      color: "#ff9933",
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (globalThis as { biomesData: { color: string[] } })
      .biomesData;
    expect(biomesData.color[1]).toBe("#ff9933");
    expect(setAttribute.mock.calls).toEqual([
      ["fill", "#ff9933"],
      ["stroke", "#ff9933"],
    ]);
  });

  it("refuses to recolor a removed biome", async () => {
    const result = await setBiomeColorTool.execute({
      biome: 2,
      color: "red",
    });
    expect(result.isError).toBe(true);
    const biomesData = (globalThis as { biomesData: { color: string[] } })
      .biomesData;
    expect(biomesData.color[2]).toBe("");
    expect(setAttribute).not.toHaveBeenCalled();
  });

  it("succeeds when the SVG element is not mounted", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    const result = await setBiomeColorTool.execute({
      biome: "savanna",
      color: "#888",
    });
    expect(result.isError).toBeFalsy();
    const biomesData = (globalThis as { biomesData: { color: string[] } })
      .biomesData;
    expect(biomesData.color[3]).toBe("#888");
  });
});
