import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRiver } from "./_shared";
import {
  createRemoveRiverTool,
  type RemoveRiverRef,
  type RiverRemovalRuntime,
  removeRiverTool,
} from "./remove-river";

function makeRuntime(find: (ref: number | string) => RemoveRiverRef | null): {
  runtime: RiverRemovalRuntime;
  remove: ReturnType<typeof vi.fn<RiverRemovalRuntime["remove"]>>;
} {
  const remove = vi.fn<RiverRemovalRuntime["remove"]>();
  return { runtime: { find, remove }, remove };
}

describe("remove_river tool", () => {
  it("removes by numeric id", async () => {
    const { runtime, remove } = makeRuntime((ref) =>
      ref === 5 ? { i: 5, name: "Ashwater", type: "River" } : null,
    );
    const tool = createRemoveRiverTool(runtime);
    const result = await tool.execute({ river: 5 });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalledWith(5);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      previousName: "Ashwater",
      previousType: "River",
    });
  });

  it("removes by case-insensitive name", async () => {
    const find = vi.fn<RiverRemovalRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "ashwater"
        ? { i: 5, name: "Ashwater", type: "River" }
        : null,
    );
    const { runtime, remove } = makeRuntime(find);
    const tool = createRemoveRiverTool(runtime);
    await tool.execute({ river: "ASHWATER" });
    expect(find).toHaveBeenCalledWith("ASHWATER");
    expect(remove).toHaveBeenCalledWith(5);
  });

  it("errors when the river is unknown", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveRiverTool(runtime);
    const result = await tool.execute({ river: 999 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects invalid river refs", async () => {
    const { runtime, remove } = makeRuntime(() => null);
    const tool = createRemoveRiverTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ river: bad });
      expect(r.isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: RiverRemovalRuntime = {
      find: () => ({ i: 1, name: "x", type: "" }),
      remove: vi.fn(() => {
        throw new Error("Rivers.remove is not available yet");
      }),
    };
    const tool = createRemoveRiverTool(runtime);
    const result = await tool.execute({ river: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });
});

describe("defaultRiverRemovalRuntime (integration)", () => {
  const riversRemove = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRivers = (globalThis as { Rivers?: unknown }).Rivers;

  beforeEach(() => {
    riversRemove.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      rivers: [
        { i: 1, name: "Ashwater", type: "River" },
        { i: 5, name: "Blackflow", type: "Stream" },
        { i: 9, name: "Retired Creek", type: "Creek", removed: true },
      ] satisfies RawRiver[],
    };
    (globalThis as { Rivers?: unknown }).Rivers = { remove: riversRemove };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Rivers?: unknown }).Rivers = originalRivers;
  });

  it("calls Rivers.remove with the river id", async () => {
    const result = await removeRiverTool.execute({ river: 5 });
    expect(result.isError).toBeFalsy();
    expect(riversRemove).toHaveBeenCalledTimes(1);
    expect(riversRemove).toHaveBeenCalledWith(5);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      previousName: "Blackflow",
      previousType: "Stream",
    });
  });

  it("refuses to remove an already-removed river", async () => {
    const result = await removeRiverTool.execute({ river: 9 });
    expect(result.isError).toBe(true);
    expect(riversRemove).not.toHaveBeenCalled();
  });

  it("errors when Rivers is not available", async () => {
    (globalThis as { Rivers?: unknown }).Rivers = undefined;
    const result = await removeRiverTool.execute({ river: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Rivers\.remove/);
  });
});
