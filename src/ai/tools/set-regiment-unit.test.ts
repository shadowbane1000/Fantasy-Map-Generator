import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawState } from "./_shared";
import {
  createSetRegimentUnitTool,
  type RegimentUnitRef,
  type RegimentUnitRuntime,
  setRegimentUnitTool,
} from "./set-regiment-unit";

function makeRuntime(
  find: (
    stateRef: number | string,
    regRef: number | string,
    unit: string,
  ) => RegimentUnitRef | null,
): {
  runtime: RegimentUnitRuntime;
  apply: ReturnType<typeof vi.fn<RegimentUnitRuntime["apply"]>>;
} {
  const apply = vi.fn<RegimentUnitRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_regiment_unit tool", () => {
  it("sets count for existing unit", async () => {
    const { runtime, apply } = makeRuntime((sref, rref, unit) =>
      sref === 1 && rref === 0 && unit === "Swordsmen"
        ? {
            stateId: 1,
            stateName: "Rookhold",
            i: 0,
            name: "1st Army",
            previousCount: 100,
          }
        : null,
    );
    const tool = createSetRegimentUnitTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 0,
      unit: "Swordsmen",
      count: 200,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 0, "Swordsmen", 200);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      stateId: 1,
      stateName: "Rookhold",
      i: 0,
      name: "1st Army",
      unit: "Swordsmen",
      previousCount: 100,
      count: 200,
    });
  });

  it("creates a new unit key", async () => {
    const { runtime, apply } = makeRuntime((_s, _r, unit) =>
      unit === "Cavalry"
        ? {
            stateId: 1,
            stateName: "Rookhold",
            i: 0,
            name: "Army",
            previousCount: 0,
          }
        : null,
    );
    const tool = createSetRegimentUnitTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 0,
      unit: "Cavalry",
      count: 50,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 0, "Cavalry", 50);
    expect(JSON.parse(result.content).previousCount).toBe(0);
  });

  it("trims the unit name", async () => {
    const find = vi.fn<RegimentUnitRuntime["find"]>((_s, _r, unit) =>
      unit === "Cavalry"
        ? {
            stateId: 1,
            stateName: "x",
            i: 0,
            name: "r",
            previousCount: 0,
          }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetRegimentUnitTool(runtime);
    await tool.execute({
      state: 1,
      regiment: 0,
      unit: "  Cavalry  ",
      count: 10,
    });
    expect(find).toHaveBeenCalledWith(1, 0, "Cavalry");
    expect(apply).toHaveBeenCalledWith(1, 0, "Cavalry", 10);
  });

  it("accepts 0", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      stateId: 1,
      stateName: "x",
      i: 0,
      name: "r",
      previousCount: 100,
    }));
    const tool = createSetRegimentUnitTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 0,
      unit: "Swordsmen",
      count: 0,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, 0, "Swordsmen", 0);
  });

  it("rejects invalid state refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRegimentUnitTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({
        state: bad,
        regiment: 0,
        unit: "Swordsmen",
        count: 10,
      });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid regiment refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRegimentUnitTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({
        state: 1,
        regiment: bad,
        unit: "Swordsmen",
        count: 10,
      });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid unit names", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRegimentUnitTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({
        state: 1,
        regiment: 0,
        unit: bad,
        count: 10,
      });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid counts", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRegimentUnitTool(runtime);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "10"]) {
      const r = await tool.execute({
        state: 1,
        regiment: 0,
        unit: "Swordsmen",
        count: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when regiment is unknown", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetRegimentUnitTool(runtime);
    const result = await tool.execute({
      state: 999,
      regiment: 0,
      unit: "Swordsmen",
      count: 10,
    });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: RegimentUnitRuntime = {
      find: () => ({
        stateId: 1,
        stateName: "x",
        i: 0,
        name: "r",
        previousCount: 0,
      }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetRegimentUnitTool(runtime);
    const result = await tool.execute({
      state: 1,
      regiment: 0,
      unit: "Swordsmen",
      count: 10,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultRegimentUnitRuntime (integration)", () => {
  const textNode: { textContent: string } = { textContent: "" };
  const querySelector = vi.fn(() => textNode);
  const gNode = { querySelector };
  const getElementById = vi.fn((id: string) =>
    id === "regiment1-0" ? gNode : null,
  );
  const getTotal = vi.fn(() => 350);

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalMilitary = (globalThis as { Military?: unknown }).Military;

  beforeEach(() => {
    querySelector.mockClear();
    getElementById.mockClear();
    getTotal.mockReset();
    getTotal.mockImplementation(() => 350);
    textNode.textContent = "";
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals", removed: true },
        {
          i: 1,
          name: "Rookhold",
          military: [
            {
              i: 0,
              name: "1st Army",
              u: { Swordsmen: 100, Archers: 50 },
              a: 150,
            },
          ],
        },
      ] satisfies RawState[],
    };
    (globalThis as { document?: unknown }).document = { getElementById };
    (globalThis as { Military?: unknown }).Military = { getTotal };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { Military?: unknown }).Military = originalMilitary;
  });

  it("updates an existing unit and recomputes a; text uses Military.getTotal", async () => {
    const result = await setRegimentUnitTool.execute({
      state: 1,
      regiment: 0,
      unit: "Swordsmen",
      count: 200,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { states: RawState[] };
      }
    ).pack;
    const reg = pack.states[1]?.military?.[0] as {
      u: Record<string, number>;
      a: number;
    };
    expect(reg.u.Swordsmen).toBe(200);
    expect(reg.a).toBe(250);
    expect(getTotal).toHaveBeenCalledWith(reg);
    expect(textNode.textContent).toBe("350");
  });

  it("creates a new unit key; a recomputes across all units", async () => {
    const result = await setRegimentUnitTool.execute({
      state: 1,
      regiment: 0,
      unit: "Cavalry",
      count: 50,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { states: RawState[] };
      }
    ).pack;
    const reg = pack.states[1]?.military?.[0] as {
      u: Record<string, number>;
      a: number;
    };
    expect(reg.u.Cavalry).toBe(50);
    expect(reg.a).toBe(200); // 100 + 50 + 50
  });

  it("falls back to regiment.a when Military is unavailable", async () => {
    (globalThis as { Military?: unknown }).Military = undefined;
    await setRegimentUnitTool.execute({
      state: 1,
      regiment: 0,
      unit: "Swordsmen",
      count: 200,
    });
    expect(textNode.textContent).toBe("250");
  });

  it("errors when state is missing", async () => {
    const result = await setRegimentUnitTool.execute({
      state: 999,
      regiment: 0,
      unit: "Swordsmen",
      count: 10,
    });
    expect(result.isError).toBe(true);
  });

  it("errors when regiment doesn't exist in state", async () => {
    const result = await setRegimentUnitTool.execute({
      state: 1,
      regiment: 999,
      unit: "Swordsmen",
      count: 10,
    });
    expect(result.isError).toBe(true);
  });
});
