import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawState } from "./_shared";
import {
  createSetStateCoaCustomTool,
  type SetStateCoaCustomRef,
  type SetStateCoaCustomRuntime,
  setStateCoaCustomTool,
} from "./set-state-coa-custom";

function makeRuntime(
  find: (ref: number | string) => SetStateCoaCustomRef | null,
): {
  runtime: SetStateCoaCustomRuntime;
  apply: ReturnType<typeof vi.fn<SetStateCoaCustomRuntime["apply"]>>;
} {
  const apply = vi.fn<SetStateCoaCustomRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_state_coa_custom tool", () => {
  it("sets custom: true when not previously set", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "Altaria",
      hasCoa: true,
      previousCustom: false,
    }));
    const tool = createSetStateCoaCustomTool(runtime);
    const result = await tool.execute({ state: 3, custom: true });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(3, true);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      name: "Altaria",
      previousCustom: false,
      custom: true,
      noop: false,
    });
  });

  it("clears custom when previously true", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "Altaria",
      hasCoa: true,
      previousCustom: true,
    }));
    const tool = createSetStateCoaCustomTool(runtime);
    const result = await tool.execute({ state: 3, custom: false });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(3, false);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      name: "Altaria",
      previousCustom: true,
      custom: false,
      noop: false,
    });
  });

  it("is a noop when custom: true is already set", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "Altaria",
      hasCoa: true,
      previousCustom: true,
    }));
    const tool = createSetStateCoaCustomTool(runtime);
    const result = await tool.execute({ state: 3, custom: true });
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 3,
      previousCustom: true,
      custom: true,
      noop: true,
    });
  });

  it("is a noop when custom: false is already the state", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "Altaria",
      hasCoa: true,
      previousCustom: false,
    }));
    const tool = createSetStateCoaCustomTool(runtime);
    const result = await tool.execute({ state: 3, custom: false });
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      noop: true,
    });
  });

  it("resolves by numeric id", async () => {
    const find = vi.fn((_ref: number | string) => ({
      i: 4,
      name: "x",
      hasCoa: true,
      previousCustom: false,
    }));
    const { runtime } = makeRuntime(find);
    const tool = createSetStateCoaCustomTool(runtime);
    await tool.execute({ state: 4, custom: true });
    expect(find).toHaveBeenCalledWith(4);
  });

  it("resolves by case-insensitive name", async () => {
    const find = vi.fn((_ref: number | string) => ({
      i: 4,
      name: "Altaria",
      hasCoa: true,
      previousCustom: false,
    }));
    const { runtime } = makeRuntime(find);
    const tool = createSetStateCoaCustomTool(runtime);
    await tool.execute({ state: "ALTARIA", custom: true });
    expect(find).toHaveBeenCalledWith("ALTARIA");
  });

  it("rejects unknown state", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetStateCoaCustomTool(runtime);
    const result = await tool.execute({ state: 999, custom: true });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects state with no coa", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "x",
      hasCoa: false,
      previousCustom: false,
    }));
    const tool = createSetStateCoaCustomTool(runtime);
    const result = await tool.execute({ state: 3, custom: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no coat of arms/i);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetStateCoaCustomTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad, custom: true });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-boolean custom", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "x",
      hasCoa: true,
      previousCustom: false,
    }));
    const tool = createSetStateCoaCustomTool(runtime);
    for (const bad of ["true", 1, null, undefined]) {
      const r = await tool.execute({ state: 3, custom: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces apply errors", async () => {
    const runtime: SetStateCoaCustomRuntime = {
      find: () => ({ i: 3, name: "x", hasCoa: true, previousCustom: false }),
      apply: vi.fn(() => {
        throw new Error("write blocked");
      }),
    };
    const tool = createSetStateCoaCustomTool(runtime);
    const result = await tool.execute({ state: 3, custom: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/blocked/);
  });

  it("rejects explicit state: 0 with a Neutrals-specific message", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetStateCoaCustomTool(runtime);
    const result = await tool.execute({ state: 0, custom: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/neutrals/i);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("defaultSetStateCoaCustomRuntime (integration)", () => {
  const originalPack = (globalThis as unknown as { pack?: unknown }).pack;

  beforeEach(() => {
    const states: RawState[] = [];
    states[0] = { i: 0, name: "Neutrals" };
    states[3] = {
      i: 3,
      name: "Altaria",
      coa: { t1: "sable", shield: "swiss" },
    };
    states[4] = {
      i: 4,
      name: "Locked",
      lock: true,
      coa: { t1: "azure" },
    };
    states[5] = {
      i: 5,
      name: "Gone",
      removed: true,
      coa: { t1: "or" },
    };
    states[6] = {
      i: 6,
      name: "NoEmblem",
    };
    states[7] = {
      i: 7,
      name: "AlreadyCustom",
      coa: { custom: true, size: 2 },
    };
    (globalThis as unknown as { pack?: unknown }).pack = { states };
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
  });

  it("sets state.coa.custom = true when the state has a coa", async () => {
    const result = await setStateCoaCustomTool.execute({
      state: 3,
      custom: true,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    expect(pack.states[3]?.coa?.custom).toBe(true);
    // Other fields preserved.
    expect(pack.states[3]?.coa?.t1).toBe("sable");
    expect(pack.states[3]?.coa?.shield).toBe("swiss");
  });

  it("deletes the custom key when called with false", async () => {
    const result = await setStateCoaCustomTool.execute({
      state: 7,
      custom: false,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    expect(pack.states[7]?.coa).toBeDefined();
    expect("custom" in (pack.states[7]!.coa as object)).toBe(false);
    // Other fields preserved.
    expect(pack.states[7]?.coa?.size).toBe(2);
  });

  it("returns noop when already custom", async () => {
    const result = await setStateCoaCustomTool.execute({
      state: 7,
      custom: true,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      i: 7,
      previousCustom: true,
      custom: true,
      noop: true,
    });
  });

  it("rejects state 0 (Neutrals)", async () => {
    const result = await setStateCoaCustomTool.execute({
      state: 0,
      custom: true,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/neutrals/i);
  });

  it("rejects locked states", async () => {
    const result = await setStateCoaCustomTool.execute({
      state: 4,
      custom: true,
    });
    expect(result.isError).toBe(true);
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    // Unchanged.
    expect(pack.states[4]?.coa?.custom).toBeUndefined();
  });

  it("rejects removed states", async () => {
    const result = await setStateCoaCustomTool.execute({
      state: 5,
      custom: true,
    });
    expect(result.isError).toBe(true);
  });

  it("rejects states without a coa", async () => {
    const result = await setStateCoaCustomTool.execute({
      state: 6,
      custom: true,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no coat of arms/i);
  });

  it("rejects when pack is missing", async () => {
    (globalThis as unknown as { pack?: unknown }).pack = undefined;
    const result = await setStateCoaCustomTool.execute({
      state: 3,
      custom: true,
    });
    expect(result.isError).toBe(true);
  });
});
