import { describe, expect, it, vi } from "vitest";
import {
  createSetHeightmapTemplateTool,
  DISPLAY_NAMES,
  type HeightmapTemplateRuntime,
  resolveTemplateKey,
  TEMPLATE_KEYS,
} from "./set-heightmap-template";

function makeRuntime(previous: string | null = "continents") {
  const read = vi.fn<HeightmapTemplateRuntime["read"]>(() => ({
    template: previous,
  }));
  const write = vi.fn<HeightmapTemplateRuntime["write"]>();
  const runtime: HeightmapTemplateRuntime = { read, write };
  return { runtime, read, write };
}

describe("set_heightmap_template tool", () => {
  it("accepts a canonical key", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetHeightmapTemplateTool(runtime);
    const result = await tool.execute({ template: "archipelago" });
    expect(result.isError).toBeFalsy();
    expect(write).toHaveBeenCalledWith("archipelago");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previousTemplate: "continents",
      template: "archipelago",
      displayName: "Archipelago",
    });
  });

  it("accepts a display name (case-insensitive, whitespace-flexible)", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetHeightmapTemplateTool(runtime);
    for (const input of ["Old World", "old world", "  OLD   WORLD  "]) {
      write.mockClear();
      await tool.execute({ template: input });
      expect(write).toHaveBeenCalledWith("oldWorld");
    }
  });

  it("accepts every canonical key and display name", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetHeightmapTemplateTool(runtime);
    for (const key of TEMPLATE_KEYS) {
      write.mockClear();
      await tool.execute({ template: key });
      expect(write).toHaveBeenCalledWith(key);
      write.mockClear();
      await tool.execute({ template: DISPLAY_NAMES[key] });
      expect(write).toHaveBeenCalledWith(key);
    }
  });

  it("rejects an unknown template with a supported list", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetHeightmapTemplateTool(runtime);
    const result = await tool.execute({ template: "saturnian" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.supported).toEqual([...TEMPLATE_KEYS]);
    expect(body.displayNames).toContain("Archipelago");
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects non-string / empty inputs", async () => {
    const { runtime, write } = makeRuntime();
    const tool = createSetHeightmapTemplateTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      expect((await tool.execute({ template: bad })).isError).toBe(true);
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime();
    runtime.write = vi.fn(() => {
      throw new Error("#templateInput is not available yet");
    });
    const tool = createSetHeightmapTemplateTool(runtime);
    const result = await tool.execute({ template: "volcano" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });

  it("reports previousTemplate from runtime.read", async () => {
    const { runtime } = makeRuntime("pangea");
    const tool = createSetHeightmapTemplateTool(runtime);
    const result = await tool.execute({ template: "volcano" });
    expect(JSON.parse(result.content).previousTemplate).toBe("pangea");
  });
});

describe("resolveTemplateKey", () => {
  it("resolves every canonical key and display name", () => {
    for (const key of TEMPLATE_KEYS) {
      expect(resolveTemplateKey(key)).toBe(key);
      expect(resolveTemplateKey(DISPLAY_NAMES[key])).toBe(key);
      expect(resolveTemplateKey(DISPLAY_NAMES[key].toLowerCase())).toBe(key);
      expect(
        resolveTemplateKey(`  ${DISPLAY_NAMES[key].toUpperCase()}  `),
      ).toBe(key);
    }
  });

  it("returns null for unknown / invalid inputs", () => {
    expect(resolveTemplateKey("saturnian")).toBeNull();
    expect(resolveTemplateKey("")).toBeNull();
    expect(resolveTemplateKey("   ")).toBeNull();
    expect(resolveTemplateKey(42)).toBeNull();
    expect(resolveTemplateKey(null)).toBeNull();
    expect(resolveTemplateKey(undefined)).toBeNull();
  });
});
