import { describe, expect, it, vi } from "vitest";
import {
  createRegenerateMapTool,
  type RegenerateOptions,
  type RegenerateRuntime,
} from "./regenerate-map";

function makeRuntime(waitBehavior: "resolve" | "reject" | "throw" = "resolve") {
  const regenerate = vi.fn();
  const waitForRegeneration = vi.fn(async (_ms: number) => {
    void _ms;
    if (waitBehavior === "reject")
      throw new Error("Timed out after 5ms waiting for map:generated.");
  });
  const runtime: RegenerateRuntime = { regenerate, waitForRegeneration };
  return { runtime, regenerate, waitForRegeneration };
}

describe("regenerate_map tool", () => {
  it("triggers regeneration with a default reason string when no seed is given", async () => {
    const { runtime, regenerate, waitForRegeneration } = makeRuntime();
    const tool = createRegenerateMapTool(runtime, 500);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(regenerate).toHaveBeenCalledWith("ai-chat");
    expect(waitForRegeneration).toHaveBeenCalledWith(500);
    expect(JSON.parse(result.content)).toEqual({ ok: true, seed: null });
  });

  it("forwards a string seed as {seed}", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateMapTool(runtime, 500);
    const result = await tool.execute({ seed: "12345" });
    expect(result.isError).toBeFalsy();
    expect(regenerate).toHaveBeenCalledWith({ seed: "12345" });
    expect(JSON.parse(result.content)).toEqual({ ok: true, seed: "12345" });
  });

  it("coerces a numeric seed to a string", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateMapTool(runtime, 500);
    const result = await tool.execute({ seed: 42 });
    expect(result.isError).toBeFalsy();
    expect(regenerate).toHaveBeenCalledWith({ seed: "42" });
  });

  it("rejects non-string / non-number seed values", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateMapTool(runtime, 500);
    const invalids: RegenerateOptions[] = [];
    void invalids; // silence unused-var lint in case the ref gets optimized
    const resultObj = await tool.execute({ seed: { a: 1 } });
    const resultBool = await tool.execute({ seed: true });
    const resultEmpty = await tool.execute({ seed: "   " });
    expect(resultObj.isError).toBe(true);
    expect(resultBool.isError).toBe(true);
    expect(resultEmpty.isError).toBe(true);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("surfaces timeouts from waitForRegeneration as error results", async () => {
    const { runtime, regenerate } = makeRuntime("reject");
    const tool = createRegenerateMapTool(runtime, 10);
    const result = await tool.execute({});
    expect(regenerate).toHaveBeenCalledOnce();
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.triggered).toBe(true);
    expect(body.error).toMatch(/timed out/i);
  });

  it("surfaces regenerate-throws as error results and does not wait", async () => {
    const waitForRegeneration = vi.fn();
    const runtime: RegenerateRuntime = {
      regenerate: () => {
        throw new Error("regenerateMap is not available yet");
      },
      waitForRegeneration,
    };
    const tool = createRegenerateMapTool(runtime, 100);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(waitForRegeneration).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).error).toMatch(/not available/i);
  });

  it("ignores null/undefined seed fields", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateMapTool(runtime, 100);
    await tool.execute({ seed: null });
    await tool.execute({ seed: undefined });
    expect(regenerate).toHaveBeenNthCalledWith(1, "ai-chat");
    expect(regenerate).toHaveBeenNthCalledWith(2, "ai-chat");
  });
});
