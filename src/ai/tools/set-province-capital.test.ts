import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg, RawProvince } from "./_shared";
import {
  createSetProvinceCapitalTool,
  type ProvinceCapitalBurg,
  type ProvinceCapitalProvince,
  type ProvinceCapitalRuntime,
  setProvinceCapitalTool,
} from "./set-province-capital";

function makeRuntime(
  findProvince: (ref: number | string) => ProvinceCapitalProvince | null,
  findBurg: (ref: number | string) => ProvinceCapitalBurg | null,
): {
  runtime: ProvinceCapitalRuntime;
  apply: ReturnType<typeof vi.fn<ProvinceCapitalRuntime["apply"]>>;
} {
  const apply = vi.fn<ProvinceCapitalRuntime["apply"]>();
  return {
    runtime: { findProvince, findBurg, apply },
    apply,
  };
}

describe("set_province_capital tool", () => {
  it("sets the capital by ids", async () => {
    const { runtime, apply } = makeRuntime(
      (ref) =>
        ref === 3
          ? {
              i: 3,
              name: "Rookvale",
              stateId: 1,
              previousBurgId: 0,
              previousBurgName: null,
            }
          : null,
      (ref) =>
        ref === 5 ? { i: 5, name: "Rookholm", state: 1, cell: 42 } : null,
    );
    const tool = createSetProvinceCapitalTool(runtime);
    const result = await tool.execute({ province: 3, burg: 5 });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(3, 5, 42);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      province: { i: 3, name: "Rookvale" },
      previousBurg: { id: 0, name: null },
      burg: { i: 5, name: "Rookholm" },
    });
  });

  it("sets the capital by names", async () => {
    const findProvince = vi.fn<ProvinceCapitalRuntime["findProvince"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "rookvale"
        ? {
            i: 3,
            name: "Rookvale",
            stateId: 1,
            previousBurgId: 2,
            previousBurgName: "OldCapital",
          }
        : null,
    );
    const findBurg = vi.fn<ProvinceCapitalRuntime["findBurg"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "rookholm"
        ? { i: 5, name: "Rookholm", state: 1, cell: 42 }
        : null,
    );
    const { runtime, apply } = makeRuntime(findProvince, findBurg);
    const tool = createSetProvinceCapitalTool(runtime);
    await tool.execute({ province: "ROOKVALE", burg: "rookholm" });
    expect(apply).toHaveBeenCalledWith(3, 5, 42);
  });

  it("rejects province 0", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({
        i: 0,
        name: "Placeholder",
        stateId: 0,
        previousBurgId: 0,
        previousBurgName: null,
      }),
      () => ({ i: 5, name: "x", state: 0, cell: 42 }),
    );
    const tool = createSetProvinceCapitalTool(runtime);
    const result = await tool.execute({ province: 0, burg: 5 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects burg 0", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({
        i: 1,
        name: "p",
        stateId: 1,
        previousBurgId: 0,
        previousBurgName: null,
      }),
      () => ({ i: 0, name: "Placeholder", state: 0, cell: 0 }),
    );
    const tool = createSetProvinceCapitalTool(runtime);
    const result = await tool.execute({ province: 1, burg: 0 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects cross-state pair", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({
        i: 3,
        name: "Rookvale",
        stateId: 1,
        previousBurgId: 0,
        previousBurgName: null,
      }),
      () => ({ i: 5, name: "Foreign Burg", state: 2, cell: 42 }),
    );
    const tool = createSetProvinceCapitalTool(runtime);
    const result = await tool.execute({ province: 3, burg: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/state 2/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors on unknown province/burg", async () => {
    const { runtime, apply } = makeRuntime(
      () => null,
      () => ({ i: 5, name: "x", state: 1, cell: 10 }),
    );
    const tool = createSetProvinceCapitalTool(runtime);
    expect((await tool.execute({ province: 999, burg: 5 })).isError).toBe(true);

    const { runtime: r2, apply: a2 } = makeRuntime(
      () => ({
        i: 3,
        name: "p",
        stateId: 1,
        previousBurgId: 0,
        previousBurgName: null,
      }),
      () => null,
    );
    const tool2 = createSetProvinceCapitalTool(r2);
    expect((await tool2.execute({ province: 3, burg: 999 })).isError).toBe(
      true,
    );
    expect(apply).not.toHaveBeenCalled();
    expect(a2).not.toHaveBeenCalled();
  });

  it("rejects invalid refs", async () => {
    const { runtime, apply } = makeRuntime(
      () => null,
      () => null,
    );
    const tool = createSetProvinceCapitalTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      expect((await tool.execute({ province: bad, burg: 5 })).isError).toBe(
        true,
      );
      expect((await tool.execute({ province: 3, burg: bad })).isError).toBe(
        true,
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: ProvinceCapitalRuntime = {
      findProvince: () => ({
        i: 3,
        name: "p",
        stateId: 1,
        previousBurgId: 0,
        previousBurgName: null,
      }),
      findBurg: () => ({ i: 5, name: "b", state: 1, cell: 42 }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetProvinceCapitalTool(runtime);
    const result = await tool.execute({ province: 3, burg: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultProvinceCapitalRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    const burgs: RawBurg[] = [{ i: 0, name: "Placeholder", removed: true }];
    burgs[5] = { i: 5, name: "Rookholm", state: 1, cell: 42 };
    burgs[6] = { i: 6, name: "AshTown", state: 2, cell: 77 };
    (globalThis as { pack?: unknown }).pack = {
      provinces: [
        { i: 0, name: "Placeholder", removed: true },
        { i: 1, name: "Rookvale", state: 1, burg: 0, center: 0 },
        { i: 2, name: "Ashwold", state: 2, burg: 0, center: 0 },
      ] satisfies RawProvince[],
      burgs,
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("writes province.burg and province.center in live pack", async () => {
    const result = await setProvinceCapitalTool.execute({
      province: 1,
      burg: 5,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { provinces: RawProvince[] };
      }
    ).pack;
    expect(pack.provinces[1]?.burg).toBe(5);
    expect(pack.provinces[1]?.center).toBe(42);
  });

  it("refuses cross-state pair", async () => {
    const result = await setProvinceCapitalTool.execute({
      province: 1,
      burg: 6,
    });
    expect(result.isError).toBe(true);
    const pack = (
      globalThis as {
        pack: { provinces: RawProvince[] };
      }
    ).pack;
    expect(pack.provinces[1]?.burg).toBe(0);
  });
});
