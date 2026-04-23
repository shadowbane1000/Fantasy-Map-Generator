import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg } from "./_shared";
import {
  type BurgGroupRef,
  type BurgGroupRuntime,
  createSetBurgGroupTool,
  setBurgGroupTool,
} from "./set-burg-group";

function makeRuntime(
  find: (ref: number | string) => BurgGroupRef | null,
  groups: string[] = ["capital", "city", "fort"],
): {
  runtime: BurgGroupRuntime;
  apply: ReturnType<typeof vi.fn<BurgGroupRuntime["apply"]>>;
  listGroups: ReturnType<typeof vi.fn<BurgGroupRuntime["listGroups"]>>;
} {
  const apply = vi.fn<BurgGroupRuntime["apply"]>();
  const listGroups = vi.fn<BurgGroupRuntime["listGroups"]>(() => groups);
  return { runtime: { find, listGroups, apply }, apply, listGroups };
}

describe("set_burg_group tool", () => {
  it("sets by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 3 ? { i: 3, name: "Rookhold", previousGroup: "city" } : null,
    );
    const tool = createSetBurgGroupTool(runtime);
    const result = await tool.execute({ burg: 3, group: "fort" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalled();
    const [refArg, groupArg] = apply.mock.calls[0] ?? [];
    expect(refArg).toMatchObject({ i: 3 });
    expect(groupArg).toBe("fort");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      name: "Rookhold",
      group: "fort",
      previousGroup: "city",
      noop: false,
    });
  });

  it("resolves by case-insensitive name and canonicalizes group", async () => {
    const find = vi.fn<BurgGroupRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "rookhold"
        ? { i: 3, name: "Rookhold", previousGroup: "city" }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetBurgGroupTool(runtime);
    await tool.execute({ burg: "ROOKHOLD", group: "CAPITAL" });
    expect(apply).toHaveBeenCalled();
    const [, groupArg] = apply.mock.calls[0] ?? [];
    expect(groupArg).toBe("capital");
  });

  it("rejects an unknown group when list is non-empty", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "x",
      previousGroup: "city",
    }));
    const tool = createSetBurgGroupTool(runtime);
    const result = await tool.execute({ burg: 3, group: "floating" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.supported).toEqual(["capital", "city", "fort"]);
    expect(apply).not.toHaveBeenCalled();
  });

  it("accepts any group when list is empty (fallback)", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({ i: 3, name: "x", previousGroup: "" }),
      [],
    );
    const tool = createSetBurgGroupTool(runtime);
    await tool.execute({ burg: 3, group: "floating" });
    expect(apply).toHaveBeenCalled();
    const [, groupArg] = apply.mock.calls[0] ?? [];
    expect(groupArg).toBe("floating");
  });

  it("rejects empty / non-string group", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "x",
      previousGroup: "city",
    }));
    const tool = createSetBurgGroupTool(runtime);
    for (const bad of [null, undefined, 42, "", "   "]) {
      const r = await tool.execute({ burg: 3, group: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid burg refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBurgGroupTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ burg: bad, group: "fort" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown burg", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBurgGroupTool(runtime);
    const result = await tool.execute({ burg: 999, group: "fort" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("is a noop when already at target", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "x",
      previousGroup: "fort",
    }));
    const tool = createSetBurgGroupTool(runtime);
    const result = await tool.execute({ burg: 3, group: "fort" });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: BurgGroupRuntime = {
      find: () => ({ i: 3, name: "x", previousGroup: "city" }),
      listGroups: () => ["city", "fort"],
      apply: vi.fn(() => {
        throw new Error("Burgs.changeGroup is not available yet");
      }),
    };
    const tool = createSetBurgGroupTool(runtime);
    const result = await tool.execute({ burg: 3, group: "fort" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/changeGroup/);
  });
});

describe("defaultBurgGroupRuntime (integration)", () => {
  const changeGroup = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalBurgs = (globalThis as { Burgs?: unknown }).Burgs;

  beforeEach(() => {
    changeGroup.mockReset();
    (globalThis as { pack?: unknown }).pack = {
      burgs: [
        { i: 0 },
        { i: 1, name: "Rookhold", group: "city" },
        { i: 2, name: "Gone", group: "city", removed: true },
      ] satisfies RawBurg[],
    };
    (globalThis as { Burgs?: unknown }).Burgs = {
      groups: [{ name: "capital" }, { name: "city" }, { name: "fort" }],
      changeGroup,
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Burgs?: unknown }).Burgs = originalBurgs;
  });

  it("delegates to Burgs.changeGroup with canonical group name", async () => {
    const result = await setBurgGroupTool.execute({
      burg: 1,
      group: "FORT",
    });
    expect(result.isError).toBeFalsy();
    expect(changeGroup).toHaveBeenCalledTimes(1);
    const call = changeGroup.mock.calls[0];
    expect(call?.[0]).toMatchObject({ i: 1, name: "Rookhold" });
    expect(call?.[1]).toBe("fort");
  });

  it("rejects a group not in the live list", async () => {
    const result = await setBurgGroupTool.execute({
      burg: 1,
      group: "floating",
    });
    expect(result.isError).toBe(true);
    expect(changeGroup).not.toHaveBeenCalled();
  });

  it("rejects a removed burg", async () => {
    const result = await setBurgGroupTool.execute({
      burg: 2,
      group: "fort",
    });
    expect(result.isError).toBe(true);
  });

  it("rejects burg 0", async () => {
    const result = await setBurgGroupTool.execute({
      burg: 0,
      group: "fort",
    });
    expect(result.isError).toBe(true);
  });

  it("errors when Burgs.changeGroup is not available", async () => {
    (globalThis as { Burgs?: unknown }).Burgs = {
      groups: [{ name: "fort" }],
    };
    const result = await setBurgGroupTool.execute({
      burg: 1,
      group: "fort",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/changeGroup/);
  });
});
