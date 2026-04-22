import { describe, expect, it, vi } from "vitest";
import {
  createSaveMapTool,
  resolveSaveTarget,
  type SaveMapRuntime,
  type SaveMethod,
} from "./save-map";

function makeRuntime(behavior: "resolve" | "reject" = "resolve") {
  const save = vi.fn<(m: SaveMethod) => Promise<void>>(async (_m) => {
    void _m;
    if (behavior === "reject") throw new Error("saveMap is not available yet.");
  });
  const runtime: SaveMapRuntime = { save };
  return { runtime, save };
}

describe("save_map tool", () => {
  it("defaults to the 'download' target (machine method)", async () => {
    const { runtime, save } = makeRuntime();
    const tool = createSaveMapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(save).toHaveBeenCalledWith("machine");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      target: "download",
      canonical: "machine",
    });
  });

  it("accepts the 'download' alias for machine", async () => {
    const { runtime, save } = makeRuntime();
    const tool = createSaveMapTool(runtime);
    await tool.execute({ target: "download" });
    expect(save).toHaveBeenCalledWith("machine");
  });

  it("saves to storage when asked", async () => {
    const { runtime, save } = makeRuntime();
    const tool = createSaveMapTool(runtime);
    const result = await tool.execute({ target: "storage" });
    expect(save).toHaveBeenCalledWith("storage");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      target: "storage",
      canonical: "storage",
    });
  });

  it("accepts 'browser' and 'local' as storage aliases", async () => {
    const { runtime, save } = makeRuntime();
    const tool = createSaveMapTool(runtime);
    await tool.execute({ target: "browser" });
    await tool.execute({ target: "LOCAL" });
    expect(save).toHaveBeenNthCalledWith(1, "storage");
    expect(save).toHaveBeenNthCalledWith(2, "storage");
  });

  it("rejects unknown targets", async () => {
    const { runtime, save } = makeRuntime();
    const tool = createSaveMapTool(runtime);
    for (const bad of ["cloud", "xyz", " ", true, 1]) {
      const r = await tool.execute({ target: bad });
      if (bad === " ") {
        // blank falls back to default — still accepted
        expect(r.isError).toBeFalsy();
      } else {
        expect(r.isError).toBe(true);
      }
    }
    // default + blank both invoke save("machine"); the other three short-circuit
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("surfaces runtime rejections", async () => {
    const { runtime, save } = makeRuntime("reject");
    const tool = createSaveMapTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(JSON.parse(result.content).error).toMatch(/not available/i);
  });

  it("ignores case in target string", async () => {
    const { runtime, save } = makeRuntime();
    const tool = createSaveMapTool(runtime);
    await tool.execute({ target: "DOWNLOAD" });
    expect(save).toHaveBeenCalledWith("machine");
  });
});

describe("resolveSaveTarget", () => {
  it("maps all documented aliases", () => {
    expect(resolveSaveTarget(undefined)).toBe("machine");
    expect(resolveSaveTarget(null)).toBe("machine");
    expect(resolveSaveTarget("")).toBe("machine");
    expect(resolveSaveTarget("   ")).toBe("machine");
    expect(resolveSaveTarget("machine")).toBe("machine");
    expect(resolveSaveTarget("download")).toBe("machine");
    expect(resolveSaveTarget("file")).toBe("machine");
    expect(resolveSaveTarget("storage")).toBe("storage");
    expect(resolveSaveTarget("browser")).toBe("storage");
    expect(resolveSaveTarget("local")).toBe("storage");
    expect(resolveSaveTarget("indexeddb")).toBe("storage");
  });
  it("returns null for unknown aliases and non-strings", () => {
    expect(resolveSaveTarget("cloud")).toBeNull();
    expect(resolveSaveTarget(42)).toBeNull();
    expect(resolveSaveTarget({})).toBeNull();
  });
});
