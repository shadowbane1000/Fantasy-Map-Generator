import { describe, expect, it, vi } from "vitest";
import {
  type BurgRemovalRuntime,
  createRemoveBurgTool,
  type RemoveBurgRef,
} from "./remove-burg";

function makeRuntime(resolver: (ref: number | string) => RemoveBurgRef | null) {
  const find = vi.fn(resolver);
  const remove = vi.fn<BurgRemovalRuntime["remove"]>();
  const runtime: BurgRemovalRuntime = { find, remove };
  return { runtime, find, remove };
}

describe("remove_burg tool", () => {
  it("removes a burg by id", async () => {
    const { runtime, remove } = makeRuntime((ref) =>
      ref === 7 ? { i: 7, name: "Stormport", isCapital: false } : null,
    );
    const tool = createRemoveBurgTool(runtime);
    const result = await tool.execute({ burg: 7 });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalledWith(7);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 7,
      name: "Stormport",
    });
  });

  it("resolves a case-insensitive name", async () => {
    const { runtime, remove } = makeRuntime((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "stormport"
        ? { i: 7, name: "Stormport", isCapital: false }
        : null,
    );
    const tool = createRemoveBurgTool(runtime);
    await tool.execute({ burg: "STORMPORT" });
    expect(remove).toHaveBeenCalledWith(7);
  });

  it("refuses capitals with a suggestion to call set_state_capital", async () => {
    const { runtime, remove } = makeRuntime(() => ({
      i: 3,
      name: "Altaria City",
      isCapital: true,
    }));
    const tool = createRemoveBurgTool(runtime);
    const result = await tool.execute({ burg: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/set_state_capital/);
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuses burg 0 (placeholder)", async () => {
    const { runtime, remove } = makeRuntime(() => ({
      i: 0,
      name: "Placeholder",
      isCapital: false,
    }));
    const tool = createRemoveBurgTool(runtime);
    const result = await tool.execute({ burg: 0 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("errors on unknown / removed burgs", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveBurgTool(runtime);
    const result = await tool.execute({ burg: 999 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 7,
      name: "x",
      isCapital: false,
    }));
    runtime.remove = vi.fn(() => {
      throw new Error("Burgs.remove is not available yet");
    });
    const tool = createRemoveBurgTool(runtime);
    const result = await tool.execute({ burg: 7 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });

  it("rejects invalid ref types", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveBurgTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      expect((await tool.execute({ burg: bad })).isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });
});
