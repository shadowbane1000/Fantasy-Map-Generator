import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRiver } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createSetRiverParentTool,
  type ResolveParentResult,
  type RiverParentRef,
  type RiverParentRuntime,
  setRiverParentTool,
} from "./set-river-parent";

function makeRuntime(
  find: (ref: number | string) => RiverParentRef | null,
  resolveParent: (parentId: number) => ResolveParentResult = () => ({
    basin: 0,
  }),
): {
  runtime: RiverParentRuntime;
  apply: ReturnType<typeof vi.fn<RiverParentRuntime["apply"]>>;
} {
  const apply = vi.fn<RiverParentRuntime["apply"]>();
  return { runtime: { find, resolveParent, apply }, apply };
}

describe("set_river_parent tool", () => {
  it("sets the parent and updates basin from parent's basin (happy path)", async () => {
    const { runtime, apply } = makeRuntime(
      (ref) =>
        ref === 5
          ? {
              i: 5,
              name: "Mistwater",
              removed: false,
              previousParent: 0,
              previousBasin: 5,
            }
          : null,
      (parentId) => (parentId === 12 ? { basin: 12 } : "not-found"),
    );
    const tool = createSetRiverParentTool(runtime);
    const result = await tool.execute({ river: 5, parent: 12 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, 12, 12);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      river: { i: 5, name: "Mistwater" },
      previous_parent: 0,
      previous_basin: 5,
      parent: 12,
      basin: 12,
    });
  });

  it("clears the parent and resets basin to river.i (parent=0)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Mistwater",
      removed: false,
      previousParent: 12,
      previousBasin: 12,
    }));
    const tool = createSetRiverParentTool(runtime);
    const result = await tool.execute({ river: 5, parent: 0 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, 0, 5);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      river: { i: 5, name: "Mistwater" },
      previous_parent: 12,
      previous_basin: 12,
      parent: 0,
      basin: 5,
    });
  });

  it("propagates basin from parent's basin field, not parent's id", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({
        i: 5,
        name: "Child",
        removed: false,
        previousParent: 0,
        previousBasin: 5,
      }),
      (parentId) => (parentId === 20 ? { basin: 3 } : "not-found"),
    );
    const tool = createSetRiverParentTool(runtime);
    const result = await tool.execute({ river: 5, parent: 20 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, 20, 3);
    const body = JSON.parse(result.content);
    expect(body.parent).toBe(20);
    expect(body.basin).toBe(3);
  });

  it("rejects setting a river as its own parent", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Self",
      removed: false,
      previousParent: 0,
      previousBasin: 5,
    }));
    const tool = createSetRiverParentTool(runtime);
    const result = await tool.execute({ river: 5, parent: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cannot set parent to the river itself.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects setting parent on a removed river", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Ghost",
      removed: true,
      previousParent: 0,
      previousBasin: 5,
    }));
    const tool = createSetRiverParentTool(runtime);
    const result = await tool.execute({ river: 5, parent: 12 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cannot set parent on removed river 5.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when parent does not resolve", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({
        i: 5,
        name: "x",
        removed: false,
        previousParent: 0,
        previousBasin: 5,
      }),
      () => "not-found",
    );
    const tool = createSetRiverParentTool(runtime);
    const result = await tool.execute({ river: 5, parent: 99 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("Parent river 99 not found.");
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when parent is removed", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({
        i: 5,
        name: "x",
        removed: false,
        previousParent: 0,
        previousBasin: 5,
      }),
      () => "removed",
    );
    const tool = createSetRiverParentTool(runtime);
    const result = await tool.execute({ river: 5, parent: 99 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Parent river 99 is removed.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects negative parent", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRiverParentTool(runtime);
    const result = await tool.execute({ river: 5, parent: -1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "parent must be a non-negative integer.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid parent values", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRiverParentTool(runtime);
    for (const bad of [1.5, "x", null, undefined, {}, true, Number.NaN]) {
      const r = await tool.execute({ river: 5, parent: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "parent must be a non-negative integer.",
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid river refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRiverParentTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ river: bad, parent: 0 });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when river string does not resolve", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRiverParentTool(runtime);
    const result = await tool.execute({ river: "ghost", parent: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe('River "ghost" not found.');
    expect(apply).not.toHaveBeenCalled();
  });

  it("captures previous_parent and previous_basin BEFORE mutation", async () => {
    // Snapshot returned by find() is the pre-mutation state.
    // Even if apply() mutates a side variable, the result should
    // still show the original snapshot values.
    let sideState = { parent: 0, basin: 5 };
    const find = vi.fn<RiverParentRuntime["find"]>(() => ({
      i: 5,
      name: "Mistwater",
      removed: false,
      previousParent: sideState.parent,
      previousBasin: sideState.basin,
    }));
    const apply = vi.fn<RiverParentRuntime["apply"]>((_i, parent, basin) => {
      sideState = { parent, basin };
    });
    const runtime: RiverParentRuntime = {
      find,
      resolveParent: () => ({ basin: 12 }),
      apply,
    };
    const tool = createSetRiverParentTool(runtime);
    const result = await tool.execute({ river: 5, parent: 12 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledOnce();
    const body = JSON.parse(result.content);
    // The snapshot was taken before apply ran, so previous_* are
    // the original (0, 5), not the mutated (12, 12).
    expect(body.previous_parent).toBe(0);
    expect(body.previous_basin).toBe(5);
    expect(body.parent).toBe(12);
    expect(body.basin).toBe(12);
  });

  it("registers and dispatches via ToolRegistry", async () => {
    const registry = new ToolRegistry();
    registry.register(setRiverParentTool);
    const tools = registry.list();
    const tool = tools.find((t) => t.name === "set_river_parent");
    expect(tool).toBeDefined();
    expect(tool?.input_schema.required).toEqual(["river", "parent"]);

    const originalPack = (globalThis as { pack?: unknown }).pack;
    (globalThis as { pack?: unknown }).pack = {
      rivers: [
        { i: 0 },
        { i: 5, name: "Mistwater", parent: 0, basin: 5 },
        { i: 12, name: "Trunk", parent: 0, basin: 12 },
      ] satisfies RawRiver[],
    };
    try {
      const result = await registry.run("set_river_parent", {
        river: 5,
        parent: 12,
      });
      expect(result.isError).toBeFalsy();
      const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
      const r = pack.rivers.find((x) => x.i === 5);
      expect(r?.parent).toBe(12);
      expect(r?.basin).toBe(12);
    } finally {
      (globalThis as { pack?: unknown }).pack = originalPack;
    }
  });

  it("exposes the expected schema", () => {
    expect(setRiverParentTool.name).toBe("set_river_parent");
    expect(setRiverParentTool.input_schema.required).toEqual([
      "river",
      "parent",
    ]);
  });
});

describe("defaultRiverParentRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      rivers: [
        { i: 0 },
        { i: 5, name: "Mistwater", parent: 0, basin: 5 },
        { i: 12, name: "Trunk", parent: 0, basin: 12 },
        { i: 20, name: "Quirk", parent: 0, basin: 3 },
        { i: 9, name: "Ghost", parent: 0, basin: 9, removed: true },
      ] satisfies RawRiver[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("errors when pack.rivers is missing (find returns null)", async () => {
    (globalThis as { pack?: unknown }).pack = {};
    const result = await setRiverParentTool.execute({
      river: 5,
      parent: 12,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("River 5 not found.");
  });

  it("resolveParent surfaces 'not-ready' when pack.rivers is missing", async () => {
    (globalThis as { pack?: unknown }).pack = {};
    const { defaultRiverParentRuntime } = await import("./set-river-parent");
    expect(defaultRiverParentRuntime.resolveParent(12)).toBe("not-ready");
  });

  it("sets parent and basin (integration)", async () => {
    const result = await setRiverParentTool.execute({
      river: 5,
      parent: 12,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    const r = pack.rivers.find((x) => x.i === 5);
    expect(r?.parent).toBe(12);
    expect(r?.basin).toBe(12);
  });

  it("clears parent (parent=0) and resets basin to river.i (integration)", async () => {
    // Pre-mutate: river 5 already flows into 12.
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    const r = pack.rivers.find((x) => x.i === 5);
    if (r) {
      r.parent = 12;
      r.basin = 12;
    }
    const result = await setRiverParentTool.execute({
      river: 5,
      parent: 0,
    });
    expect(result.isError).toBeFalsy();
    const after = pack.rivers.find((x) => x.i === 5);
    expect(after?.parent).toBe(0);
    expect(after?.basin).toBe(5);
  });

  it("propagates basin from parent's basin field, not parent id (integration)", async () => {
    // River 20 has i=20 but basin=3 (different).
    const result = await setRiverParentTool.execute({
      river: 5,
      parent: 20,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    const r = pack.rivers.find((x) => x.i === 5);
    expect(r?.parent).toBe(20);
    expect(r?.basin).toBe(3);
  });

  it("rejects a removed parent (integration)", async () => {
    const result = await setRiverParentTool.execute({
      river: 5,
      parent: 9,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("Parent river 9 is removed.");
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    const r = pack.rivers.find((x) => x.i === 5);
    expect(r?.parent).toBe(0);
    expect(r?.basin).toBe(5);
  });

  it("rejects self-parent (integration)", async () => {
    const result = await setRiverParentTool.execute({
      river: 5,
      parent: 5,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cannot set parent to the river itself.",
    );
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    const r = pack.rivers.find((x) => x.i === 5);
    expect(r?.parent).toBe(0);
    expect(r?.basin).toBe(5);
  });

  it("preserves river object identity (in-place mutation)", async () => {
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    const ref = pack.rivers.find((x) => x.i === 5);
    expect(ref).toBeDefined();
    const result = await setRiverParentTool.execute({
      river: 5,
      parent: 12,
    });
    expect(result.isError).toBeFalsy();
    const after = pack.rivers.find((x) => x.i === 5);
    // Object identity preserved.
    expect(after).toBe(ref);
    expect(after?.parent).toBe(12);
    expect(after?.basin).toBe(12);
  });
});
