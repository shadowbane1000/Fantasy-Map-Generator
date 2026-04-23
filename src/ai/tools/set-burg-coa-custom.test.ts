import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg } from "./_shared";
import {
  createSetBurgCoaCustomTool,
  type SetBurgCoaCustomRef,
  type SetBurgCoaCustomRuntime,
  setBurgCoaCustomTool,
} from "./set-burg-coa-custom";

function makeRuntime(
  find: (ref: number | string) => SetBurgCoaCustomRef | null,
): {
  runtime: SetBurgCoaCustomRuntime;
  apply: ReturnType<typeof vi.fn<SetBurgCoaCustomRuntime["apply"]>>;
} {
  const apply = vi.fn<SetBurgCoaCustomRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_burg_coa_custom tool", () => {
  it("sets custom: true when not previously set", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Rookhold",
      hasCoa: true,
      previousCustom: false,
    }));
    const tool = createSetBurgCoaCustomTool(runtime);
    const result = await tool.execute({ burg: 5, custom: true });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, true);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Rookhold",
      previousCustom: false,
      custom: true,
      noop: false,
    });
  });

  it("clears custom when previously true", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Rookhold",
      hasCoa: true,
      previousCustom: true,
    }));
    const tool = createSetBurgCoaCustomTool(runtime);
    const result = await tool.execute({ burg: 5, custom: false });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, false);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Rookhold",
      previousCustom: true,
      custom: false,
      noop: false,
    });
  });

  it("is a noop when custom: true is already set", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Rookhold",
      hasCoa: true,
      previousCustom: true,
    }));
    const tool = createSetBurgCoaCustomTool(runtime);
    const result = await tool.execute({ burg: 5, custom: true });
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 5,
      previousCustom: true,
      custom: true,
      noop: true,
    });
  });

  it("is a noop when custom: false is already the state", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Rookhold",
      hasCoa: true,
      previousCustom: false,
    }));
    const tool = createSetBurgCoaCustomTool(runtime);
    const result = await tool.execute({ burg: 5, custom: false });
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      noop: true,
    });
  });

  it("resolves by numeric id", async () => {
    const find = vi.fn((_ref: number | string) => ({
      i: 3,
      name: "x",
      hasCoa: true,
      previousCustom: false,
    }));
    const { runtime } = makeRuntime(find);
    const tool = createSetBurgCoaCustomTool(runtime);
    await tool.execute({ burg: 3, custom: true });
    expect(find).toHaveBeenCalledWith(3);
  });

  it("resolves by case-insensitive name", async () => {
    const find = vi.fn((_ref: number | string) => ({
      i: 3,
      name: "Ashholm",
      hasCoa: true,
      previousCustom: false,
    }));
    const { runtime } = makeRuntime(find);
    const tool = createSetBurgCoaCustomTool(runtime);
    await tool.execute({ burg: "ASHHOLM", custom: true });
    expect(find).toHaveBeenCalledWith("ASHHOLM");
  });

  it("rejects unknown burg", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBurgCoaCustomTool(runtime);
    const result = await tool.execute({ burg: 999, custom: true });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects burg with no coa", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      hasCoa: false,
      previousCustom: false,
    }));
    const tool = createSetBurgCoaCustomTool(runtime);
    const result = await tool.execute({ burg: 5, custom: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no coat of arms/i);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBurgCoaCustomTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ burg: bad, custom: true });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-boolean custom", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      hasCoa: true,
      previousCustom: false,
    }));
    const tool = createSetBurgCoaCustomTool(runtime);
    for (const bad of ["true", 1, null, undefined]) {
      const r = await tool.execute({ burg: 5, custom: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces apply errors", async () => {
    const runtime: SetBurgCoaCustomRuntime = {
      find: () => ({ i: 5, name: "x", hasCoa: true, previousCustom: false }),
      apply: vi.fn(() => {
        throw new Error("write blocked");
      }),
    };
    const tool = createSetBurgCoaCustomTool(runtime);
    const result = await tool.execute({ burg: 5, custom: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/blocked/);
  });
});

describe("defaultSetBurgCoaCustomRuntime (integration)", () => {
  const originalPack = (globalThis as unknown as { pack?: unknown }).pack;

  beforeEach(() => {
    const burgs: RawBurg[] = [];
    burgs[0] = { i: 0 };
    burgs[5] = {
      i: 5,
      name: "Rookhold",
      coa: { t1: "sable", shield: "swiss" },
    };
    burgs[6] = {
      i: 6,
      name: "Locked",
      lock: true,
      coa: { t1: "azure" },
    };
    burgs[7] = {
      i: 7,
      name: "Gone",
      removed: true,
      coa: { t1: "or" },
    };
    burgs[8] = {
      i: 8,
      name: "NoEmblem",
    };
    burgs[9] = {
      i: 9,
      name: "AlreadyCustom",
      coa: { custom: true, size: 2 },
    };
    (globalThis as unknown as { pack?: unknown }).pack = { burgs };
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
  });

  it("sets burg.coa.custom = true when the burg has a coa", async () => {
    const result = await setBurgCoaCustomTool.execute({
      burg: 5,
      custom: true,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[5]?.coa?.custom).toBe(true);
    // Other fields preserved.
    expect(pack.burgs[5]?.coa?.t1).toBe("sable");
    expect(pack.burgs[5]?.coa?.shield).toBe("swiss");
  });

  it("deletes the custom key when called with false", async () => {
    const result = await setBurgCoaCustomTool.execute({
      burg: 9,
      custom: false,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[9]?.coa).toBeDefined();
    expect("custom" in (pack.burgs[9]!.coa as object)).toBe(false);
    // Other fields preserved.
    expect(pack.burgs[9]?.coa?.size).toBe(2);
  });

  it("returns noop when already custom", async () => {
    const result = await setBurgCoaCustomTool.execute({
      burg: 9,
      custom: true,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 9,
      previousCustom: true,
      custom: true,
      noop: true,
    });
  });

  it("rejects burg 0", async () => {
    const result = await setBurgCoaCustomTool.execute({
      burg: 0,
      custom: true,
    });
    expect(result.isError).toBe(true);
  });

  it("rejects locked burgs", async () => {
    const result = await setBurgCoaCustomTool.execute({
      burg: 6,
      custom: true,
    });
    expect(result.isError).toBe(true);
    const pack = (globalThis as unknown as { pack: { burgs: RawBurg[] } }).pack;
    // Unchanged.
    expect(pack.burgs[6]?.coa?.custom).toBeUndefined();
  });

  it("rejects removed burgs", async () => {
    const result = await setBurgCoaCustomTool.execute({
      burg: 7,
      custom: true,
    });
    expect(result.isError).toBe(true);
  });

  it("rejects burgs without a coa", async () => {
    const result = await setBurgCoaCustomTool.execute({
      burg: 8,
      custom: true,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no coat of arms/i);
  });

  it("rejects when pack is missing", async () => {
    (globalThis as unknown as { pack?: unknown }).pack = undefined;
    const result = await setBurgCoaCustomTool.execute({
      burg: 5,
      custom: true,
    });
    expect(result.isError).toBe(true);
  });
});
