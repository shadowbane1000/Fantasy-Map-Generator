import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawCoa, RawState } from "./_shared";
import {
  createRegenerateStateCoaTool,
  type RegenerateStateCoaRef,
  type RegenerateStateCoaRuntime,
  regenerateStateCoaTool,
} from "./regenerate-state-coa";

function makeRuntime(
  find: (ref: number | string) => RegenerateStateCoaRef | null,
  generated: RawCoa = { t1: "or", shield: "heater" },
): {
  runtime: RegenerateStateCoaRuntime;
  generate: ReturnType<typeof vi.fn<RegenerateStateCoaRuntime["generate"]>>;
  apply: ReturnType<typeof vi.fn<RegenerateStateCoaRuntime["apply"]>>;
} {
  const generate = vi.fn<RegenerateStateCoaRuntime["generate"]>(
    () => generated,
  );
  const apply = vi.fn<RegenerateStateCoaRuntime["apply"]>();
  return { runtime: { find, generate, apply }, generate, apply };
}

describe("regenerate_state_coa tool", () => {
  it("regenerates by numeric id and returns previous + new coa", async () => {
    const previousCoa: RawCoa = { t1: "sable", shield: "swiss" };
    const newCoa: RawCoa = { t1: "or", shield: "heater" };
    const { runtime, generate, apply } = makeRuntime(
      () => ({ i: 2, name: "Altaria", coa: previousCoa }),
      newCoa,
    );
    const tool = createRegenerateStateCoaTool(runtime);
    const result = await tool.execute({ state: 2 });
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledWith(2, undefined);
    expect(apply).toHaveBeenCalledWith(2, newCoa);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 2,
      previousCoa,
      coa: newCoa,
    });
  });

  it("resolves by case-insensitive name", async () => {
    const find = vi.fn((_ref: number | string) => ({
      i: 3,
      name: "Altaria",
      coa: undefined,
    }));
    const { runtime, generate } = makeRuntime(find);
    const tool = createRegenerateStateCoaTool(runtime);
    await tool.execute({ state: "ALTARIA" });
    expect(find).toHaveBeenCalledWith("ALTARIA");
    expect(generate).toHaveBeenCalledWith(3, undefined);
  });

  it("passes explicit shield override through to generate", async () => {
    const { runtime, generate } = makeRuntime(() => ({
      i: 2,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateStateCoaTool(runtime);
    await tool.execute({ state: 2, shield: "fantasy1" });
    expect(generate).toHaveBeenCalledWith(2, "fantasy1");
  });

  it("trims shield overrides", async () => {
    const { runtime, generate } = makeRuntime(() => ({
      i: 2,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateStateCoaTool(runtime);
    await tool.execute({ state: 2, shield: "  noldor  " });
    expect(generate).toHaveBeenCalledWith(2, "noldor");
  });

  it("returns null previousCoa when state had no coa", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 2,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateStateCoaTool(runtime);
    const result = await tool.execute({ state: 2 });
    expect(JSON.parse(result.content).previousCoa).toBeNull();
  });

  it("rejects unknown state", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createRegenerateStateCoaTool(runtime);
    const result = await tool.execute({ state: 999 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createRegenerateStateCoaTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects state 0 with a Neutrals-specific message", async () => {
    const { runtime, generate, apply } = makeRuntime(() => ({
      i: 0,
      name: "Neutrals",
      coa: undefined,
    }));
    const tool = createRegenerateStateCoaTool(runtime);
    const result = await tool.execute({ state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Neutrals/);
    expect(generate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects empty-string shield override", async () => {
    const { runtime, generate, apply } = makeRuntime(() => ({
      i: 2,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateStateCoaTool(runtime);
    const a = await tool.execute({ state: 2, shield: "" });
    const b = await tool.execute({ state: 2, shield: "   " });
    expect(a.isError).toBe(true);
    expect(b.isError).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-string shield override", async () => {
    const { runtime, generate } = makeRuntime(() => ({
      i: 2,
      name: "x",
      coa: undefined,
    }));
    const tool = createRegenerateStateCoaTool(runtime);
    const result = await tool.execute({ state: 2, shield: 42 });
    expect(result.isError).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });

  it("surfaces generator errors", async () => {
    const runtime: RegenerateStateCoaRuntime = {
      find: () => ({ i: 2, name: "x", coa: undefined }),
      generate: vi.fn(() => {
        throw new Error("COA.generate is not available");
      }),
      apply: vi.fn(),
    };
    const tool = createRegenerateStateCoaTool(runtime);
    const result = await tool.execute({ state: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/COA\.generate/);
  });

  it("surfaces apply errors", async () => {
    const runtime: RegenerateStateCoaRuntime = {
      find: () => ({ i: 2, name: "x", coa: undefined }),
      generate: () => ({ t1: "or" }),
      apply: vi.fn(() => {
        throw new Error("write blocked");
      }),
    };
    const tool = createRegenerateStateCoaTool(runtime);
    const result = await tool.execute({ state: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/blocked/);
  });

  it("errors when generator returns non-object", async () => {
    const runtime: RegenerateStateCoaRuntime = {
      find: () => ({ i: 2, name: "x", coa: undefined }),
      generate: () => null as unknown as RawCoa,
      apply: vi.fn(),
    };
    const tool = createRegenerateStateCoaTool(runtime);
    const result = await tool.execute({ state: 2 });
    expect(result.isError).toBe(true);
  });
});

describe("defaultRegenerateStateCoaRuntime (integration)", () => {
  const generateCoa =
    vi.fn<
      (
        parent: RawCoa | null,
        kinship: number | null,
        dominion: number | null,
        type?: string | null,
      ) => RawCoa
    >();
  const getShield = vi.fn((_culture: number, _state?: number) => "heater");
  const trigger = vi.fn();
  const existingCoaEl = { remove: vi.fn() };
  const getElementById = vi.fn((id: string) =>
    id === "stateCOA2" ? existingCoaEl : null,
  );

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalCoa = (globalThis as { COA?: unknown }).COA;
  const originalRenderer = (globalThis as { COArenderer?: unknown })
    .COArenderer;
  const originalDoc = (globalThis as { document?: unknown }).document;

  beforeEach(() => {
    generateCoa.mockReset();
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    getShield.mockReset();
    getShield.mockReturnValue("heater");
    trigger.mockReset();
    existingCoaEl.remove.mockReset();
    getElementById.mockReset();
    getElementById.mockImplementation((id: string) =>
      id === "stateCOA2" ? existingCoaEl : null,
    );

    const states: RawState[] = [];
    states[0] = { i: 0, name: "Neutrals" };
    states[2] = {
      i: 2,
      name: "Altaria",
      culture: 3,
      coa: { t1: "gules", shield: "swiss" },
    };

    (globalThis as unknown as { pack?: unknown }).pack = {
      states,
    };
    (globalThis as { COA?: unknown }).COA = {
      generate: generateCoa,
      getShield,
    };
    (globalThis as { COArenderer?: unknown }).COArenderer = { trigger };
    (globalThis as { document?: unknown }).document = { getElementById };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { COA?: unknown }).COA = originalCoa;
    (globalThis as { COArenderer?: unknown }).COArenderer = originalRenderer;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("regenerates with explicit shield, updates state.coa and triggers renderer", async () => {
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    const result = await regenerateStateCoaTool.execute({
      state: 2,
      shield: "noldor",
    });
    expect(result.isError).toBeFalsy();

    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    expect(pack.states[2]?.coa).toEqual({ t1: "or", shield: "noldor" });

    expect(generateCoa).toHaveBeenCalledTimes(1);
    // states are top-level in the heraldry hierarchy — parent must be null.
    expect(generateCoa.mock.calls[0]?.[0]).toBeNull();
    expect(generateCoa.mock.calls[0]?.[1]).toBe(0.3);
    expect(generateCoa.mock.calls[0]?.[2]).toBe(0.1);
    expect(generateCoa.mock.calls[0]?.[3]).toBeNull();

    expect(existingCoaEl.remove).toHaveBeenCalled();
    expect(trigger).toHaveBeenCalledWith("stateCOA2", {
      t1: "or",
      shield: "noldor",
    });
  });

  it("preserves existing state.coa.shield when no override provided", async () => {
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    await regenerateStateCoaTool.execute({ state: 2 });
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    expect(pack.states[2]?.coa?.shield).toBe("swiss");
    expect(getShield).not.toHaveBeenCalled();
  });

  it("falls back to COA.getShield when no existing shield and no override", async () => {
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    pack.states[2] = {
      ...pack.states[2]!,
      coa: { t1: "sable" }, // no shield
    };
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    getShield.mockReturnValue("heater");
    await regenerateStateCoaTool.execute({ state: 2 });
    expect(getShield).toHaveBeenCalledWith(3, 2);
    expect(pack.states[2]?.coa?.shield).toBe("heater");
  });

  it("errors when pack is missing", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await regenerateStateCoaTool.execute({ state: 2 });
    expect(result.isError).toBe(true);
  });

  it("errors when COA is missing", async () => {
    (globalThis as { COA?: unknown }).COA = undefined;
    const result = await regenerateStateCoaTool.execute({ state: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/COA/);
  });

  it("errors when state is unknown", async () => {
    const result = await regenerateStateCoaTool.execute({ state: 999 });
    expect(result.isError).toBe(true);
  });

  it("rejects locked states", async () => {
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    pack.states[2] = { ...pack.states[2]!, lock: true };
    const result = await regenerateStateCoaTool.execute({ state: 2 });
    expect(result.isError).toBe(true);
    expect(generateCoa).not.toHaveBeenCalled();
  });

  it("rejects removed states", async () => {
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    pack.states[2] = { ...pack.states[2]!, removed: true };
    const result = await regenerateStateCoaTool.execute({ state: 2 });
    expect(result.isError).toBe(true);
    expect(generateCoa).not.toHaveBeenCalled();
  });

  it("rejects state 0 (Neutrals)", async () => {
    const result = await regenerateStateCoaTool.execute({ state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Neutrals/);
    expect(generateCoa).not.toHaveBeenCalled();
  });

  it("succeeds even when COArenderer is missing (best-effort DOM refresh)", async () => {
    (globalThis as { COArenderer?: unknown }).COArenderer = undefined;
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    const result = await regenerateStateCoaTool.execute({
      state: 2,
      shield: "noldor",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    expect(pack.states[2]?.coa).toEqual({ t1: "or", shield: "noldor" });
  });

  it("does not throw when #stateCOA{i} DOM node is missing", async () => {
    getElementById.mockReturnValue(null);
    generateCoa.mockImplementation(() => ({ t1: "or" }));
    const result = await regenerateStateCoaTool.execute({
      state: 2,
      shield: "noldor",
    });
    expect(result.isError).toBeFalsy();
    expect(trigger).toHaveBeenCalledWith("stateCOA2", {
      t1: "or",
      shield: "noldor",
    });
  });
});
