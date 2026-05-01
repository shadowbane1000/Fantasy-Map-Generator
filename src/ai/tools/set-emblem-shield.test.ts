import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg, RawProvince, RawState } from "./_shared";
import { ToolRegistry } from "./index";
import { CULTURE_SHIELDS } from "./set-culture-shield";
import {
  createSetEmblemShieldTool,
  type EmblemShieldEntityType,
  type EmblemShieldRef,
  type EmblemShieldRuntime,
  setEmblemShieldTool,
} from "./set-emblem-shield";

function makeRuntime(
  find: (
    type: EmblemShieldEntityType,
    ref: number | string,
  ) => EmblemShieldRef | null = () => null,
): {
  runtime: EmblemShieldRuntime;
  find: ReturnType<typeof vi.fn<EmblemShieldRuntime["find"]>>;
  apply: ReturnType<typeof vi.fn<EmblemShieldRuntime["apply"]>>;
} {
  const findFn = vi.fn<EmblemShieldRuntime["find"]>(find);
  const apply = vi.fn<EmblemShieldRuntime["apply"]>();
  return { runtime: { find: findFn, apply }, find: findFn, apply };
}

describe("set_emblem_shield tool", () => {
  it("happy path: state by numeric id", async () => {
    const { runtime, find, apply } = makeRuntime((type, ref) =>
      type === "state" && ref === 7
        ? { i: 7, name: "Valoria", previousShield: "heater" }
        : null,
    );
    const tool = createSetEmblemShieldTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 7,
      shield: "oval",
    });
    expect(result.isError).toBeFalsy();
    expect(find).toHaveBeenCalledWith("state", 7);
    expect(apply).toHaveBeenCalledWith("state", 7, "oval");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      entity_type: "state",
      entity: { i: 7, name: "Valoria" },
      previous_shield: "heater",
      shield: "oval",
    });
  });

  it("happy path: province by numeric id", async () => {
    const { runtime, find, apply } = makeRuntime((type, ref) =>
      type === "province" && ref === 4
        ? { i: 4, name: "North Mark", previousShield: "heater" }
        : null,
    );
    const tool = createSetEmblemShieldTool(runtime);
    const result = await tool.execute({
      entity_type: "province",
      entity: 4,
      shield: "swiss",
    });
    expect(result.isError).toBeFalsy();
    expect(find).toHaveBeenCalledWith("province", 4);
    expect(apply).toHaveBeenCalledWith("province", 4, "swiss");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      entity_type: "province",
      entity: { i: 4, name: "North Mark" },
      previous_shield: "heater",
      shield: "swiss",
    });
  });

  it("happy path: burg by numeric id", async () => {
    const { runtime, find, apply } = makeRuntime((type, ref) =>
      type === "burg" && ref === 5
        ? { i: 5, name: "Rookhold", previousShield: "swiss" }
        : null,
    );
    const tool = createSetEmblemShieldTool(runtime);
    const result = await tool.execute({
      entity_type: "burg",
      entity: 5,
      shield: "noldor",
    });
    expect(result.isError).toBeFalsy();
    expect(find).toHaveBeenCalledWith("burg", 5);
    expect(apply).toHaveBeenCalledWith("burg", 5, "noldor");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      entity_type: "burg",
      entity: { i: 5, name: "Rookhold" },
      previous_shield: "swiss",
      shield: "noldor",
    });
  });

  it("resolves entity by case-insensitive name and canonicalises shield", async () => {
    const { runtime, find, apply } = makeRuntime((type, ref) =>
      type === "burg" && ref === "ASHHOLM"
        ? { i: 3, name: "Ashholm", previousShield: null }
        : null,
    );
    const tool = createSetEmblemShieldTool(runtime);
    const result = await tool.execute({
      entity_type: "BURG",
      entity: "ASHHOLM",
      shield: "Heater",
    });
    expect(result.isError).toBeFalsy();
    expect(find).toHaveBeenCalledWith("burg", "ASHHOLM");
    expect(apply).toHaveBeenCalledWith("burg", 3, "heater");
    expect(JSON.parse(result.content).previous_shield).toBeNull();
  });

  it("returns previous_shield: null when entity.coa.shield is unset", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 1,
      name: "X",
      previousShield: null,
    }));
    const tool = createSetEmblemShieldTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 1,
      shield: "heater",
    });
    expect(JSON.parse(result.content).previous_shield).toBeNull();
  });

  it("trims and lowercases entity_type", async () => {
    const { runtime, find } = makeRuntime(() => ({
      i: 1,
      name: "X",
      previousShield: null,
    }));
    const tool = createSetEmblemShieldTool(runtime);
    for (const value of [" State ", "STATE", "state"]) {
      find.mockClear();
      await tool.execute({ entity_type: value, entity: 1, shield: "heater" });
      expect(find).toHaveBeenCalledWith("state", 1);
    }
  });

  it("rejects unknown entity_type values", async () => {
    const { runtime, find, apply } = makeRuntime();
    const tool = createSetEmblemShieldTool(runtime);
    for (const value of ["foo", "states", "kingdom", "", "   "]) {
      const r = await tool.execute({
        entity_type: value,
        entity: 1,
        shield: "heater",
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "entity_type must be one of: state, province, burg.",
      );
    }
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects missing entity_type", async () => {
    const { runtime, find, apply } = makeRuntime();
    const tool = createSetEmblemShieldTool(runtime);
    const r = await tool.execute({ entity: 1, shield: "heater" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "entity_type must be one of: state, province, burg.",
    );
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-string entity_type", async () => {
    const { runtime, find, apply } = makeRuntime();
    const tool = createSetEmblemShieldTool(runtime);
    for (const value of [42, null, true, []]) {
      const r = await tool.execute({
        entity_type: value,
        entity: 1,
        shield: "heater",
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "entity_type must be one of: state, province, burg.",
      );
    }
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects entity 0", async () => {
    const { runtime, find, apply } = makeRuntime();
    const tool = createSetEmblemShieldTool(runtime);
    const r = await tool.execute({
      entity_type: "state",
      entity: 0,
      shield: "heater",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(
      /entity must be a positive integer id/,
    );
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects negative / non-integer entity", async () => {
    const { runtime, find } = makeRuntime();
    const tool = createSetEmblemShieldTool(runtime);
    for (const value of [-1, 1.5, Number.NaN]) {
      const r = await tool.execute({
        entity_type: "state",
        entity: value,
        shield: "heater",
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /entity must be a positive integer id/,
      );
    }
    expect(find).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace / non-numeric non-string entity", async () => {
    const { runtime, find } = makeRuntime();
    const tool = createSetEmblemShieldTool(runtime);
    for (const value of ["", "   ", null, undefined, true]) {
      const r = await tool.execute({
        entity_type: "state",
        entity: value,
        shield: "heater",
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /entity must be a positive integer id/,
      );
    }
    expect(find).not.toHaveBeenCalled();
  });

  it("rejects entity not found with title-cased entity type and ref", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetEmblemShieldTool(runtime);

    let r = await tool.execute({
      entity_type: "state",
      entity: 999,
      shield: "heater",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe("State 999 not found.");

    r = await tool.execute({
      entity_type: "province",
      entity: 999,
      shield: "heater",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe("Province 999 not found.");

    r = await tool.execute({
      entity_type: "burg",
      entity: 999,
      shield: "heater",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe("Burg 999 not found.");

    r = await tool.execute({
      entity_type: "state",
      entity: "Ghost",
      shield: "heater",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe("State Ghost not found.");

    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects missing shield with supported list", async () => {
    const { runtime, find, apply } = makeRuntime();
    const tool = createSetEmblemShieldTool(runtime);
    const r = await tool.execute({ entity_type: "state", entity: 1 });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content);
    expect(body.error).toBe("shield must be a non-empty string.");
    expect(body.supported).toEqual([...CULTURE_SHIELDS]);
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace shield", async () => {
    const { runtime, find, apply } = makeRuntime();
    const tool = createSetEmblemShieldTool(runtime);
    for (const value of ["", "   "]) {
      const r = await tool.execute({
        entity_type: "state",
        entity: 1,
        shield: value,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "shield must be a non-empty string.",
      );
    }
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-string shield", async () => {
    const { runtime, find, apply } = makeRuntime();
    const tool = createSetEmblemShieldTool(runtime);
    for (const value of [42, null, true, []]) {
      const r = await tool.execute({
        entity_type: "state",
        entity: 1,
        shield: value,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "shield must be a non-empty string.",
      );
    }
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown shield with the recognized list in the message", async () => {
    const { runtime, find, apply } = makeRuntime();
    const tool = createSetEmblemShieldTool(runtime);
    const r = await tool.execute({
      entity_type: "state",
      entity: 1,
      shield: "notashape",
    });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content);
    expect(body.error).toMatch(/^Unknown shield 'notashape'\. Valid shields: /);
    expect(body.error).toContain("heater");
    expect(body.error).toContain("swiss");
    expect(body.error).toContain("oval");
    expect(body.supported).toEqual([...CULTURE_SHIELDS]);
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("canonicalises shield case-insensitively (HEATER, Heater, heater, '  heater  ')", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "X",
      previousShield: null,
    }));
    const tool = createSetEmblemShieldTool(runtime);
    for (const value of ["HEATER", "Heater", "heater", "  heater  "]) {
      apply.mockClear();
      await tool.execute({
        entity_type: "state",
        entity: 1,
        shield: value,
      });
      expect(apply).toHaveBeenCalledWith("state", 1, "heater");
    }
  });

  it("surfaces apply errors", async () => {
    const runtime: EmblemShieldRuntime = {
      find: () => ({ i: 1, name: "X", previousShield: null }),
      apply: vi.fn(() => {
        throw new Error("write blocked");
      }),
    };
    const tool = createSetEmblemShieldTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 1,
      shield: "heater",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/write blocked/);
  });

  it("validates in order: entity_type → entity → shield", async () => {
    const { runtime } = makeRuntime();
    const tool = createSetEmblemShieldTool(runtime);

    let r = await tool.execute({});
    expect(JSON.parse(r.content).error).toBe(
      "entity_type must be one of: state, province, burg.",
    );

    r = await tool.execute({ entity_type: "state" });
    expect(JSON.parse(r.content).error).toMatch(
      /entity must be a positive integer id/,
    );

    r = await tool.execute({ entity_type: "state", entity: 1 });
    expect(JSON.parse(r.content).error).toBe(
      "shield must be a non-empty string.",
    );
  });

  it("tolerates null / undefined / extraneous input properties", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 1,
      name: "X",
      previousShield: null,
    }));
    const tool = createSetEmblemShieldTool(runtime);

    let r = await tool.execute(null);
    expect(JSON.parse(r.content).error).toBe(
      "entity_type must be one of: state, province, burg.",
    );

    r = await tool.execute(undefined);
    expect(JSON.parse(r.content).error).toBe(
      "entity_type must be one of: state, province, burg.",
    );

    r = await tool.execute({
      entity_type: "state",
      entity: 1,
      shield: "heater",
      bogus: "x",
    });
    expect(r.isError).toBeFalsy();
  });

  it("captures previous_shield BEFORE mutation (load-bearing)", async () => {
    // The find() result reports previousShield "heater". Even if a
    // hypothetical apply() were to read entity.coa.shield AFTER the
    // mutation, the response MUST still reflect the value find()
    // returned. We pin this down with a stub apply that mutates a
    // local proxy shield string and assert the response uses the
    // pre-mutation value.
    let stubShield = "heater";
    const runtime: EmblemShieldRuntime = {
      find: () => ({
        i: 7,
        name: "Valoria",
        previousShield: stubShield,
      }),
      apply: vi.fn((_t, _i, shield) => {
        stubShield = shield;
      }),
    };
    const tool = createSetEmblemShieldTool(runtime);
    const r = await tool.execute({
      entity_type: "state",
      entity: 7,
      shield: "oval",
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content).previous_shield).toBe("heater");
    // Also confirm the stub did mutate
    expect(stubShield).toBe("oval");
  });

  it("registers cleanly in a ToolRegistry round-trip", () => {
    expect(setEmblemShieldTool.name).toBe("set_emblem_shield");
    expect(setEmblemShieldTool.input_schema.type).toBe("object");
    expect(setEmblemShieldTool.input_schema.required).toEqual([
      "entity_type",
      "entity",
      "shield",
    ]);
    const props = setEmblemShieldTool.input_schema.properties as Record<
      string,
      unknown
    >;
    expect(props.entity_type).toBeDefined();
    expect(props.entity).toBeDefined();
    expect(props.shield).toBeDefined();

    const registry = new ToolRegistry();
    registry.register(setEmblemShieldTool);
    expect(
      registry
        .list()
        .map((t) => t.name)
        .includes("set_emblem_shield"),
    ).toBe(true);
  });
});

describe("defaultEmblemShieldRuntime (integration)", () => {
  const trigger = vi.fn();
  const removeFn = vi.fn();
  const getElementById = vi.fn<(id: string) => unknown>();

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRenderer = (globalThis as { COArenderer?: unknown })
    .COArenderer;
  const originalDoc = (globalThis as { document?: unknown }).document;

  function setupPack(): void {
    const states: RawState[] = [];
    states[0] = { i: 0, name: "Neutrals" };
    states[3] = {
      i: 3,
      name: "Valoria",
      coa: { t1: "or", shield: "heater", size: 1.2 },
    };

    const provinces: RawProvince[] = [];
    provinces[0] = { i: 0 };
    provinces[7] = {
      i: 7,
      name: "North Mark",
      coa: { t1: "azure", shield: "swiss" },
    };

    const burgs: RawBurg[] = [];
    burgs[0] = { i: 0 };
    burgs[5] = {
      i: 5,
      name: "Rookhold",
      coa: { t1: "sable", shield: "swiss" },
    };

    (globalThis as { pack?: unknown }).pack = { states, provinces, burgs };
  }

  beforeEach(() => {
    trigger.mockReset();
    removeFn.mockReset();
    getElementById.mockReset();
    getElementById.mockImplementation((id: string) =>
      id === "stateCOA3" || id === "provinceCOA7" || id === "burgCOA5"
        ? { remove: removeFn }
        : null,
    );
    setupPack();
    (globalThis as { COArenderer?: unknown }).COArenderer = { trigger };
    (globalThis as { document?: unknown }).document = { getElementById };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { COArenderer?: unknown }).COArenderer = originalRenderer;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("end-to-end: state — sets coa.shield, removes DOM node, triggers renderer", async () => {
    const result = await setEmblemShieldTool.execute({
      entity_type: "state",
      entity: 3,
      shield: "oval",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[3]?.coa?.shield).toBe("oval");
    expect(pack.states[3]?.coa?.t1).toBe("or");
    expect(pack.states[3]?.coa?.size).toBe(1.2);
    expect(getElementById).toHaveBeenCalledWith("stateCOA3");
    expect(removeFn).toHaveBeenCalled();
    expect(trigger).toHaveBeenCalledWith("stateCOA3", pack.states[3]?.coa);
    const body = JSON.parse(result.content);
    expect(body.previous_shield).toBe("heater");
    expect(body.shield).toBe("oval");
  });

  it("end-to-end: province — sets coa.shield with id provinceCOA{i}", async () => {
    const result = await setEmblemShieldTool.execute({
      entity_type: "province",
      entity: 7,
      shield: "noldor",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { provinces: RawProvince[] } }).pack;
    expect(pack.provinces[7]?.coa?.shield).toBe("noldor");
    expect(getElementById).toHaveBeenCalledWith("provinceCOA7");
    expect(trigger).toHaveBeenCalledWith(
      "provinceCOA7",
      pack.provinces[7]?.coa,
    );
  });

  it("end-to-end: burg — sets coa.shield with id burgCOA{i}", async () => {
    const result = await setEmblemShieldTool.execute({
      entity_type: "burg",
      entity: 5,
      shield: "fantasy1",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[5]?.coa?.shield).toBe("fantasy1");
    expect(getElementById).toHaveBeenCalledWith("burgCOA5");
    expect(trigger).toHaveBeenCalledWith("burgCOA5", pack.burgs[5]?.coa);
  });

  it("initialises coa when missing", async () => {
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    pack.burgs[5] = { i: 5, name: "Rookhold" };
    const result = await setEmblemShieldTool.execute({
      entity_type: "burg",
      entity: 5,
      shield: "heater",
    });
    expect(result.isError).toBeFalsy();
    expect(pack.burgs[5]?.coa).toEqual({ shield: "heater" });
    expect(JSON.parse(result.content).previous_shield).toBeNull();
  });

  it("preserves other coa fields when only shield is set (load-bearing)", async () => {
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    const charges = [{ type: "lion" }];
    pack.burgs[5] = {
      i: 5,
      name: "Rookhold",
      coa: {
        t1: "sable",
        t2: "or",
        charges,
        size: 1.2,
        shield: "swiss",
        custom: true,
      },
    };
    const result = await setEmblemShieldTool.execute({
      entity_type: "burg",
      entity: 5,
      shield: "heater",
    });
    expect(result.isError).toBeFalsy();
    const coa = pack.burgs[5]?.coa;
    expect(coa?.shield).toBe("heater");
    expect(coa?.t1).toBe("sable");
    expect(coa?.t2).toBe("or");
    expect(coa?.charges).toBe(charges); // reference equality
    expect(coa?.size).toBe(1.2);
    expect(coa?.custom).toBe(true);
  });

  it("captures previous_shield BEFORE mutation (load-bearing, integration)", async () => {
    const result = await setEmblemShieldTool.execute({
      entity_type: "state",
      entity: 3,
      shield: "oval",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previous_shield).toBe("heater");
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[3]?.coa?.shield).toBe("oval");
  });

  it("resolves entity by case-insensitive name (integration)", async () => {
    const result = await setEmblemShieldTool.execute({
      entity_type: "burg",
      entity: "rookhold",
      shield: "heater",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[5]?.coa?.shield).toBe("heater");
  });

  it("rejects entity 0 (integration)", async () => {
    const result = await setEmblemShieldTool.execute({
      entity_type: "state",
      entity: 0,
      shield: "heater",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /entity must be a positive integer id/,
    );
    expect(trigger).not.toHaveBeenCalled();
  });

  it("rejects removed entities (integration)", async () => {
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    pack.burgs[5] = {
      i: 5,
      name: "Rookhold",
      removed: true,
      coa: { shield: "swiss" },
    };
    const result = await setEmblemShieldTool.execute({
      entity_type: "burg",
      entity: 5,
      shield: "heater",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("Burg 5 not found.");
    expect(trigger).not.toHaveBeenCalled();
  });

  it("errors when pack is missing", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await setEmblemShieldTool.execute({
      entity_type: "state",
      entity: 3,
      shield: "heater",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/State 3 not found/);
  });

  it("errors when collection is missing", async () => {
    (globalThis as { pack?: unknown }).pack = {};
    const result = await setEmblemShieldTool.execute({
      entity_type: "state",
      entity: 3,
      shield: "heater",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/State 3 not found/);
  });

  it("succeeds when COArenderer is missing (best-effort)", async () => {
    (globalThis as { COArenderer?: unknown }).COArenderer = undefined;
    const result = await setEmblemShieldTool.execute({
      entity_type: "state",
      entity: 3,
      shield: "oval",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[3]?.coa?.shield).toBe("oval");
  });

  it("succeeds when COArenderer.trigger throws (best-effort)", async () => {
    (globalThis as { COArenderer?: unknown }).COArenderer = {
      trigger: vi.fn(() => {
        throw new Error("renderer down");
      }),
    };
    const result = await setEmblemShieldTool.execute({
      entity_type: "state",
      entity: 3,
      shield: "oval",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[3]?.coa?.shield).toBe("oval");
  });

  it("succeeds when document is missing (best-effort)", async () => {
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { COArenderer?: unknown }).COArenderer = { trigger };
    const result = await setEmblemShieldTool.execute({
      entity_type: "state",
      entity: 3,
      shield: "oval",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[3]?.coa?.shield).toBe("oval");
    expect(trigger).toHaveBeenCalledWith("stateCOA3", pack.states[3]?.coa);
  });

  it("succeeds when document.getElementById returns null (best-effort)", async () => {
    getElementById.mockReturnValue(null);
    const result = await setEmblemShieldTool.execute({
      entity_type: "state",
      entity: 3,
      shield: "oval",
    });
    expect(result.isError).toBeFalsy();
    expect(removeFn).not.toHaveBeenCalled();
    expect(trigger).toHaveBeenCalled();
  });

  it("registry round-trip end-to-end", async () => {
    const registry = new ToolRegistry();
    registry.register(setEmblemShieldTool);
    const result = await registry.run("set_emblem_shield", {
      entity_type: "state",
      entity: 3,
      shield: "oval",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.shield).toBe("oval");
  });
});
