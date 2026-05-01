import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setEmblemPositionTool as registeredTool } from "../index";
import type { RawBurg, RawProvince, RawState } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createSetEmblemPositionTool,
  type EmblemPositionRef,
  type SetEmblemPositionRuntime,
  setEmblemPositionTool,
} from "./set-emblem-position";
import type { EmblemEntityType } from "./set-emblem-size";

function makeRuntime(
  find: (
    entityType: EmblemEntityType,
    ref: number | string,
  ) => EmblemPositionRef | null = () => null,
): {
  runtime: SetEmblemPositionRuntime;
  find: ReturnType<typeof vi.fn<SetEmblemPositionRuntime["find"]>>;
  apply: ReturnType<typeof vi.fn<SetEmblemPositionRuntime["apply"]>>;
} {
  const findFn = vi.fn<SetEmblemPositionRuntime["find"]>(find);
  const apply = vi.fn<SetEmblemPositionRuntime["apply"]>();
  return { runtime: { find: findFn, apply }, find: findFn, apply };
}

describe("set_emblem_position tool (custom runtime)", () => {
  it("happy path: SET for state by numeric id", async () => {
    const { runtime, find, apply } = makeRuntime((type, ref) =>
      type === "state" && ref === 3
        ? { i: 3, name: "Valoria", previousX: 102.3, previousY: 88.5 }
        : null,
    );
    const tool = createSetEmblemPositionTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 3,
      x: 120.4,
      y: 95,
    });
    expect(result.isError).toBeFalsy();
    expect(find).toHaveBeenCalledWith("state", 3);
    expect(apply).toHaveBeenCalledWith("state", 3, 120.4, 95);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      entity_type: "state",
      entity: { i: 3, name: "Valoria" },
      previous_x: 102.3,
      previous_y: 88.5,
      x: 120.4,
      y: 95,
    });
  });

  it("happy path: SET for province by numeric id", async () => {
    const { runtime, apply } = makeRuntime((type, ref) =>
      type === "province" && ref === 7
        ? { i: 7, name: "Eastern Reach", previousX: null, previousY: null }
        : null,
    );
    const tool = createSetEmblemPositionTool(runtime);
    const result = await tool.execute({
      entity_type: "province",
      entity: 7,
      x: 50,
      y: 75,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("province", 7, 50, 75);
    const body = JSON.parse(result.content);
    expect(body.entity_type).toBe("province");
    expect(body.previous_x).toBeNull();
    expect(body.previous_y).toBeNull();
  });

  it("happy path: SET for burg by numeric id", async () => {
    const { runtime, apply } = makeRuntime((type, ref) =>
      type === "burg" && ref === 11
        ? { i: 11, name: "Foo Town", previousX: 10, previousY: 20 }
        : null,
    );
    const tool = createSetEmblemPositionTool(runtime);
    const result = await tool.execute({
      entity_type: "burg",
      entity: 11,
      x: 33,
      y: 44,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("burg", 11, 33, 44);
  });

  it("happy path: CLEAR (both null) calls apply with (_,_, null, null)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 3,
      name: "Valoria",
      previousX: 102.3,
      previousY: 88.5,
    }));
    const tool = createSetEmblemPositionTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 3,
      x: null,
      y: null,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("state", 3, null, null);
    const body = JSON.parse(result.content);
    expect(body.x).toBeNull();
    expect(body.y).toBeNull();
    expect(body.previous_x).toBe(102.3);
    expect(body.previous_y).toBe(88.5);
  });

  it("resolves entity by case-insensitive name string", async () => {
    const { runtime, find, apply } = makeRuntime((type, ref) =>
      type === "state" &&
      typeof ref === "string" &&
      ref.toLowerCase() === "valoria"
        ? { i: 3, name: "Valoria", previousX: null, previousY: null }
        : null,
    );
    const tool = createSetEmblemPositionTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: "VALORIA",
      x: 1,
      y: 2,
    });
    expect(result.isError).toBeFalsy();
    expect(find).toHaveBeenCalledWith("state", "VALORIA");
    expect(apply).toHaveBeenCalledWith("state", 3, 1, 2);
  });

  it("accepts entity_type case-insensitively", async () => {
    const { runtime, apply } = makeRuntime((type) =>
      type === "burg"
        ? { i: 1, name: "Hi", previousX: null, previousY: null }
        : null,
    );
    const tool = createSetEmblemPositionTool(runtime);
    const result = await tool.execute({
      entity_type: "BURG",
      entity: 1,
      x: 1,
      y: 1,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("burg", 1, 1, 1);
  });

  it("rejects partial null: x number, y null", async () => {
    const { runtime, find, apply } = makeRuntime();
    const tool = createSetEmblemPositionTool(runtime);
    const r = await tool.execute({
      entity_type: "state",
      entity: 1,
      x: 5,
      y: null,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "x and y must be both numbers or both null.",
    );
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects partial null: x null, y number", async () => {
    const { runtime, find, apply } = makeRuntime();
    const tool = createSetEmblemPositionTool(runtime);
    const r = await tool.execute({
      entity_type: "state",
      entity: 1,
      x: null,
      y: 5,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "x and y must be both numbers or both null.",
    );
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid x types when y is a number", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetEmblemPositionTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "1",
      undefined,
    ]) {
      const r = await tool.execute({
        entity_type: "state",
        entity: 1,
        x: bad,
        y: 5,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "x and y must be both numbers or both null.",
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid y types when x is a number", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetEmblemPositionTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "1",
      undefined,
    ]) {
      const r = await tool.execute({
        entity_type: "state",
        entity: 1,
        x: 5,
        y: bad,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "x and y must be both numbers or both null.",
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects both NaN", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetEmblemPositionTool(runtime);
    const r = await tool.execute({
      entity_type: "state",
      entity: 1,
      x: Number.NaN,
      y: Number.NaN,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "x and y must be both numbers or both null.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects both Infinity", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetEmblemPositionTool(runtime);
    const r = await tool.execute({
      entity_type: "state",
      entity: 1,
      x: Number.POSITIVE_INFINITY,
      y: Number.POSITIVE_INFINITY,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "x and y must be both numbers or both null.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects missing entity_type", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetEmblemPositionTool(runtime);
    const result = await tool.execute({ entity: 1, x: 1, y: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "entity_type must be one of: state, province, burg.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown entity_type values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createSetEmblemPositionTool(runtime);
    for (const bad of ["culture", "", "  ", "religion", 7, null]) {
      const r = await tool.execute({
        entity_type: bad,
        entity: 1,
        x: 1,
        y: 1,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "entity_type must be one of: state, province, burg.",
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown entity (find returns null)", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetEmblemPositionTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 999,
      x: 1,
      y: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("State 999 not found.");
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid entity refs", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousX: null,
      previousY: null,
    }));
    const tool = createSetEmblemPositionTool(runtime);
    for (const bad of [0, -1, 1.5, "", null, undefined]) {
      const r = await tool.execute({
        entity_type: "state",
        entity: bad,
        x: 1,
        y: 1,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /entity must be a positive integer id/,
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("returns previous_x/y = null when entity has no coa", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 4,
      name: "Foo",
      previousX: null,
      previousY: null,
    }));
    const tool = createSetEmblemPositionTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 4,
      x: 1,
      y: 2,
    });
    const body = JSON.parse(result.content);
    expect(body.previous_x).toBeNull();
    expect(body.previous_y).toBeNull();
  });

  it("captures previous_x/y BEFORE mutation", async () => {
    let stubX: number | null = 10;
    let stubY: number | null = 20;
    const runtime: SetEmblemPositionRuntime = {
      find: () => ({
        i: 7,
        name: "Valoria",
        previousX: stubX,
        previousY: stubY,
      }),
      apply: vi.fn((_t, _i, x, y) => {
        stubX = x;
        stubY = y;
      }),
    };
    const tool = createSetEmblemPositionTool(runtime);
    const r = await tool.execute({
      entity_type: "state",
      entity: 7,
      x: 99,
      y: 88,
    });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.previous_x).toBe(10);
    expect(body.previous_y).toBe(20);
    expect(stubX).toBe(99);
    expect(stubY).toBe(88);
  });

  it("surfaces runtime errors from apply", async () => {
    const runtime: SetEmblemPositionRuntime = {
      find: () => ({ i: 1, name: "x", previousX: null, previousY: null }),
      apply: vi.fn(() => {
        throw new Error(
          "window.pack is not available; the map hasn't finished loading.",
        );
      }),
    };
    const tool = createSetEmblemPositionTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 1,
      x: 1,
      y: 2,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack is not available/);
  });

  it("CLEAR succeeds when entity has no prior x/y (no-op-but-ok)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousX: null,
      previousY: null,
    }));
    const tool = createSetEmblemPositionTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 1,
      x: null,
      y: null,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("state", 1, null, null);
    const body = JSON.parse(result.content);
    expect(body.previous_x).toBeNull();
    expect(body.previous_y).toBeNull();
    expect(body.x).toBeNull();
    expect(body.y).toBeNull();
  });

  it("rounds x and y to 2 decimals before calling apply", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousX: null,
      previousY: null,
    }));
    const tool = createSetEmblemPositionTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 1,
      x: 12.345,
      y: 67.891,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("state", 1, 12.35, 67.89);
    const body = JSON.parse(result.content);
    expect(body.x).toBe(12.35);
    expect(body.y).toBe(67.89);
  });

  it("validates entity_type first — invalid type bypasses other checks", async () => {
    const { runtime, find, apply } = makeRuntime();
    const tool = createSetEmblemPositionTool(runtime);
    const r = await tool.execute({
      entity_type: "kingdom",
      entity: 0, // also bad
      x: "bad", // also bad
      y: "bad", // also bad
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "entity_type must be one of: state, province, burg.",
    );
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("registers cleanly in a ToolRegistry round-trip", () => {
    expect(setEmblemPositionTool.name).toBe("set_emblem_position");
    expect(setEmblemPositionTool.input_schema.type).toBe("object");
    expect(setEmblemPositionTool.input_schema.required).toEqual([
      "entity_type",
      "entity",
      "x",
      "y",
    ]);
    const registry = new ToolRegistry();
    registry.register(setEmblemPositionTool);
    expect(
      registry
        .list()
        .map((t) => t.name)
        .includes("set_emblem_position"),
    ).toBe(true);
  });
});

describe("defaultSetEmblemPositionRuntime (integration)", () => {
  const trigger = vi.fn();
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRenderer = (globalThis as { COArenderer?: unknown })
    .COArenderer;

  function setupPack(): void {
    const states: RawState[] = [];
    states[0] = { i: 0, name: "Neutrals" };
    states[1] = {
      i: 1,
      name: "Valoria",
      pole: [100, 200],
      coa: { shield: "heater", size: 1.2, x: 50, y: 60 },
    };
    states[2] = { i: 2, name: "Removed", removed: true };

    const provinces: RawProvince[] = [];
    provinces[0] = { i: 0 };
    provinces[1] = {
      i: 1,
      name: "Eastern Reach",
      pole: [50, 75],
    };

    const burgs: RawBurg[] = [];
    burgs[0] = { i: 0 };
    burgs[1] = { i: 1, name: "Foo Town", x: 10, y: 20 };
    burgs[5] = {
      i: 5,
      name: "Rookhold",
      coa: { shield: "swiss", size: 0.8, x: 70.5, y: 80.5, custom: true },
    };

    (globalThis as { pack?: unknown }).pack = { states, provinces, burgs };
  }

  beforeEach(() => {
    trigger.mockReset();
    setupPack();
    (globalThis as { COArenderer?: unknown }).COArenderer = { trigger };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { COArenderer?: unknown }).COArenderer = originalRenderer;
  });

  it("SET writes coa.x and coa.y on a state", async () => {
    const result = await setEmblemPositionTool.execute({
      entity_type: "state",
      entity: 1,
      x: 200,
      y: 300,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[1]?.coa?.x).toBe(200);
    expect(pack.states[1]?.coa?.y).toBe(300);
  });

  it("SET writes coa.x and coa.y on a province", async () => {
    const result = await setEmblemPositionTool.execute({
      entity_type: "province",
      entity: 1,
      x: 11,
      y: 22,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { provinces: RawProvince[] } }).pack;
    expect(pack.provinces[1]?.coa?.x).toBe(11);
    expect(pack.provinces[1]?.coa?.y).toBe(22);
  });

  it("SET writes coa.x and coa.y on a burg", async () => {
    const result = await setEmblemPositionTool.execute({
      entity_type: "burg",
      entity: 1,
      x: 33,
      y: 44,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[1]?.coa?.x).toBe(33);
    expect(pack.burgs[1]?.coa?.y).toBe(44);
  });

  it("SET initializes missing coa to {} and writes x/y; previous = null", async () => {
    const before = (globalThis as { pack: { provinces: RawProvince[] } }).pack
      .provinces[1]?.coa;
    expect(before).toBeUndefined();
    const result = await setEmblemPositionTool.execute({
      entity_type: "province",
      entity: 1,
      x: 5,
      y: 7,
    });
    expect(result.isError).toBeFalsy();
    const after = (globalThis as { pack: { provinces: RawProvince[] } }).pack
      .provinces[1]?.coa;
    expect(after).toBeDefined();
    expect(after?.x).toBe(5);
    expect(after?.y).toBe(7);
    const body = JSON.parse(result.content);
    expect(body.previous_x).toBeNull();
    expect(body.previous_y).toBeNull();
  });

  it("SET preserves existing coa.shield and coa.size when only position is set", async () => {
    const result = await setEmblemPositionTool.execute({
      entity_type: "burg",
      entity: 5,
      x: 1,
      y: 2,
    });
    expect(result.isError).toBeFalsy();
    const coa = (globalThis as { pack: { burgs: RawBurg[] } }).pack.burgs[5]
      ?.coa;
    expect(coa?.shield).toBe("swiss");
    expect(coa?.size).toBe(0.8);
    expect(coa?.custom).toBe(true);
    expect(coa?.x).toBe(1);
    expect(coa?.y).toBe(2);
  });

  it("CLEAR deletes both coa.x and coa.y (verified with `'x' in coa === false`)", async () => {
    const result = await setEmblemPositionTool.execute({
      entity_type: "burg",
      entity: 5,
      x: null,
      y: null,
    });
    expect(result.isError).toBeFalsy();
    const coa = (globalThis as { pack: { burgs: RawBurg[] } }).pack.burgs[5]
      ?.coa as RawBurg["coa"];
    expect(coa).toBeDefined();
    expect("x" in (coa as object)).toBe(false);
    expect("y" in (coa as object)).toBe(false);
  });

  it("CLEAR preserves other coa fields (shield, size, custom)", async () => {
    const result = await setEmblemPositionTool.execute({
      entity_type: "burg",
      entity: 5,
      x: null,
      y: null,
    });
    expect(result.isError).toBeFalsy();
    const coa = (globalThis as { pack: { burgs: RawBurg[] } }).pack.burgs[5]
      ?.coa;
    expect(coa?.shield).toBe("swiss");
    expect(coa?.size).toBe(0.8);
    expect(coa?.custom).toBe(true);
  });

  it("CLEAR when coa is absent is a no-op (does NOT initialize coa)", async () => {
    const before = (globalThis as { pack: { provinces: RawProvince[] } }).pack
      .provinces[1]?.coa;
    expect(before).toBeUndefined();
    const result = await setEmblemPositionTool.execute({
      entity_type: "province",
      entity: 1,
      x: null,
      y: null,
    });
    expect(result.isError).toBeFalsy();
    const after = (globalThis as { pack: { provinces: RawProvince[] } }).pack
      .provinces[1]?.coa;
    expect(after).toBeUndefined();
    const body = JSON.parse(result.content);
    expect(body.previous_x).toBeNull();
    expect(body.previous_y).toBeNull();
    expect(body.x).toBeNull();
    expect(body.y).toBeNull();
  });

  it("rounds x/y to 2 decimals when writing", async () => {
    const result = await setEmblemPositionTool.execute({
      entity_type: "state",
      entity: 1,
      x: 12.345,
      y: 67.891,
    });
    expect(result.isError).toBeFalsy();
    const coa = (globalThis as { pack: { states: RawState[] } }).pack.states[1]
      ?.coa;
    expect(coa?.x).toBe(12.35);
    expect(coa?.y).toBe(67.89);
  });

  it("rejects when pack is absent", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await setEmblemPositionTool.execute({
      entity_type: "state",
      entity: 1,
      x: 1,
      y: 1,
    });
    expect(result.isError).toBe(true);
    // find returns null because pack is undefined → "State 1 not found."
    expect(JSON.parse(result.content).error).toBe("State 1 not found.");
  });

  it("rejects when the pack collection is absent", async () => {
    (globalThis as { pack?: unknown }).pack = { burgs: [] };
    const result = await setEmblemPositionTool.execute({
      entity_type: "state",
      entity: 1,
      x: 1,
      y: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("State 1 not found.");
  });

  it("rejects removed entities (skipped by findEntityByRef)", async () => {
    const result = await setEmblemPositionTool.execute({
      entity_type: "state",
      entity: 2,
      x: 1,
      y: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("State 2 not found.");
  });

  it("succeeds when COArenderer is missing (best-effort)", async () => {
    (globalThis as { COArenderer?: unknown }).COArenderer = undefined;
    const result = await setEmblemPositionTool.execute({
      entity_type: "state",
      entity: 1,
      x: 100,
      y: 200,
    });
    expect(result.isError).toBeFalsy();
    const coa = (globalThis as { pack: { states: RawState[] } }).pack.states[1]
      ?.coa;
    expect(coa?.x).toBe(100);
    expect(coa?.y).toBe(200);
  });

  it("succeeds when COArenderer.trigger throws (best-effort)", async () => {
    (globalThis as { COArenderer?: unknown }).COArenderer = {
      trigger: vi.fn(() => {
        throw new Error("renderer down");
      }),
    };
    const result = await setEmblemPositionTool.execute({
      entity_type: "state",
      entity: 1,
      x: 100,
      y: 200,
    });
    expect(result.isError).toBeFalsy();
    const coa = (globalThis as { pack: { states: RawState[] } }).pack.states[1]
      ?.coa;
    expect(coa?.x).toBe(100);
    expect(coa?.y).toBe(200);
  });

  it("calls COArenderer.trigger with `<type>COA<i>` and the post-mutation coa for SET", async () => {
    const result = await setEmblemPositionTool.execute({
      entity_type: "state",
      entity: 1,
      x: 100,
      y: 200,
    });
    expect(result.isError).toBeFalsy();
    const coa = (globalThis as { pack: { states: RawState[] } }).pack.states[1]
      ?.coa;
    expect(trigger).toHaveBeenCalledWith("stateCOA1", coa);
  });

  it("captures previous_x/y from BEFORE the mutation (integration)", async () => {
    const result = await setEmblemPositionTool.execute({
      entity_type: "state",
      entity: 1,
      x: 999,
      y: 888,
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_x).toBe(50);
    expect(body.previous_y).toBe(60);
    const coa = (globalThis as { pack: { states: RawState[] } }).pack.states[1]
      ?.coa;
    expect(coa?.x).toBe(999);
    expect(coa?.y).toBe(888);
  });
});

describe("set_emblem_position registry round-trip", () => {
  it("is exported from the ai barrel", () => {
    expect(registeredTool).toBeDefined();
    expect(registeredTool.name).toBe("set_emblem_position");
  });
});
