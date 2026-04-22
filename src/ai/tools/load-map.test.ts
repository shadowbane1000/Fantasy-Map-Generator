import { describe, expect, it, vi } from "vitest";
import {
  createLoadMapTool,
  isValidMapUrl,
  type LoadMapRuntime,
  resolveLoadSource,
} from "./load-map";

function makeRuntime(waitBehavior: "resolve" | "reject" = "resolve") {
  const load = vi.fn<LoadMapRuntime["load"]>();
  const waitForLoad = vi.fn<LoadMapRuntime["waitForLoad"]>(async (_ms) => {
    void _ms;
    if (waitBehavior === "reject")
      throw new Error("Timed out after 5ms waiting for map:generated.");
  });
  const runtime: LoadMapRuntime = { load, waitForLoad };
  return { runtime, load, waitForLoad };
}

describe("load_map tool", () => {
  it("loads from storage and waits for map:generated", async () => {
    const { runtime, load, waitForLoad } = makeRuntime();
    const tool = createLoadMapTool(runtime, 500);
    const result = await tool.execute({ source: "storage" });
    expect(result.isError).toBeFalsy();
    expect(load).toHaveBeenCalledWith({ source: "storage" });
    expect(waitForLoad).toHaveBeenCalledWith(500);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      source: "storage",
    });
  });

  it("accepts 'browser' as a storage alias", async () => {
    const { runtime, load } = makeRuntime();
    const tool = createLoadMapTool(runtime, 500);
    await tool.execute({ source: "browser" });
    expect(load).toHaveBeenCalledWith({ source: "storage" });
  });

  it("loads from a valid https URL", async () => {
    const { runtime, load } = makeRuntime();
    const tool = createLoadMapTool(runtime, 500);
    const result = await tool.execute({
      source: "url",
      url: "https://example.com/fantasy.map",
    });
    expect(result.isError).toBeFalsy();
    expect(load).toHaveBeenCalledWith({
      source: "url",
      url: "https://example.com/fantasy.map",
    });
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      source: "url",
      url: "https://example.com/fantasy.map",
    });
  });

  it("rejects source=url without a url", async () => {
    const { runtime, load } = makeRuntime();
    const tool = createLoadMapTool(runtime, 500);
    const result = await tool.execute({ source: "url" });
    expect(result.isError).toBe(true);
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects unsafe URL schemes", async () => {
    const { runtime, load } = makeRuntime();
    const tool = createLoadMapTool(runtime, 500);
    for (const url of [
      "file:///etc/passwd",
      "javascript:alert(1)",
      "ftp://host/x",
      "data:text/plain,x",
    ]) {
      const r = await tool.execute({ source: "url", url });
      expect(r.isError).toBe(true);
    }
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace url", async () => {
    const { runtime, load } = makeRuntime();
    const tool = createLoadMapTool(runtime, 500);
    for (const url of ["", "   ", "http://"]) {
      const r = await tool.execute({ source: "url", url });
      expect(r.isError).toBe(true);
    }
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects unknown source aliases with a supported list", async () => {
    const { runtime, load } = makeRuntime();
    const tool = createLoadMapTool(runtime, 500);
    const result = await tool.execute({ source: "cloud" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.supported).toEqual(["storage", "url"]);
    expect(load).not.toHaveBeenCalled();
  });

  it("surfaces runtime.load failures and does not wait", async () => {
    const { runtime, waitForLoad } = makeRuntime();
    runtime.load = vi.fn(() => {
      throw new Error("no stored map found");
    });
    const tool = createLoadMapTool(runtime, 500);
    const result = await tool.execute({ source: "storage" });
    expect(result.isError).toBe(true);
    expect(waitForLoad).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).error).toMatch(/no stored map/);
  });

  it("surfaces waitForLoad timeouts with triggered:true", async () => {
    const { runtime, load } = makeRuntime("reject");
    const tool = createLoadMapTool(runtime, 10);
    const result = await tool.execute({ source: "storage" });
    expect(load).toHaveBeenCalled();
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.triggered).toBe(true);
    expect(body.error).toMatch(/timed out/i);
  });

  it("rejects non-string sources", async () => {
    const { runtime, load } = makeRuntime();
    const tool = createLoadMapTool(runtime, 500);
    for (const bad of [null, undefined, 123, true, {}]) {
      const r = await tool.execute({ source: bad });
      expect(r.isError).toBe(true);
    }
    expect(load).not.toHaveBeenCalled();
  });
});

describe("resolveLoadSource", () => {
  it("maps documented aliases", () => {
    expect(resolveLoadSource("storage")).toBe("storage");
    expect(resolveLoadSource("browser")).toBe("storage");
    expect(resolveLoadSource("LOCAL")).toBe("storage");
    expect(resolveLoadSource("last")).toBe("storage");
    expect(resolveLoadSource("url")).toBe("url");
    expect(resolveLoadSource("http")).toBe("url");
    expect(resolveLoadSource("HTTPS")).toBe("url");
    expect(resolveLoadSource("link")).toBe("url");
  });
  it("returns null for unknown or non-string inputs", () => {
    expect(resolveLoadSource("")).toBeNull();
    expect(resolveLoadSource("   ")).toBeNull();
    expect(resolveLoadSource("cloud")).toBeNull();
    expect(resolveLoadSource(42)).toBeNull();
    expect(resolveLoadSource(null)).toBeNull();
  });
});

describe("isValidMapUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isValidMapUrl("http://example.com/a.map")).toBe(true);
    expect(isValidMapUrl("https://example.com/a.map")).toBe(true);
    expect(isValidMapUrl("HTTPS://EXAMPLE.COM/a.map")).toBe(true);
    expect(isValidMapUrl("  https://example.com/a.map  ")).toBe(true);
  });
  it("rejects other schemes and non-strings", () => {
    for (const bad of [
      "file:///tmp/x",
      "javascript:alert(1)",
      "ftp://host/x",
      "data:text/plain,x",
      "example.com/a.map",
      "",
      "   ",
      "http://", // too short
      42,
      null,
      {},
    ]) {
      expect(isValidMapUrl(bad)).toBe(false);
    }
  });

  it("rejects insanely long URLs", () => {
    const huge = `https://example.com/${"a".repeat(3000)}`;
    expect(isValidMapUrl(huge)).toBe(false);
  });
});

it("default runtime calls quickLoad for storage and loadMapFromURL for url", async () => {
  const { defaultLoadMapRuntime } = await import("./load-map");
  const quickLoad = vi.fn();
  const loadMapFromURL = vi.fn();
  Object.assign(globalThis, { quickLoad, loadMapFromURL });
  try {
    await defaultLoadMapRuntime.load({ source: "storage" });
    expect(quickLoad).toHaveBeenCalledOnce();
    await defaultLoadMapRuntime.load({
      source: "url",
      url: "https://x.com/a.map",
    });
    expect(loadMapFromURL).toHaveBeenCalledWith("https://x.com/a.map");
  } finally {
    delete (globalThis as { quickLoad?: unknown }).quickLoad;
    delete (globalThis as { loadMapFromURL?: unknown }).loadMapFromURL;
  }
});
