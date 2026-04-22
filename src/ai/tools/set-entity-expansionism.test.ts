import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetEntityExpansionismTool,
  defaultEntityExpansionismRuntime,
  type EntityExpansionismRef,
  type EntityExpansionismRuntime,
  EXPANSIONABLE_TYPES,
  type ExpansionableType,
  resolveExpansionableType,
} from "./set-entity-expansionism";

function makeRuntime(
  resolver: (
    type: ExpansionableType,
    ref: number | string,
  ) => EntityExpansionismRef | null,
) {
  const find = vi.fn(resolver);
  const apply = vi.fn<EntityExpansionismRuntime["apply"]>();
  const runtime: EntityExpansionismRuntime = { find, apply };
  return { runtime, find, apply };
}

describe("set_entity_expansionism tool", () => {
  it("writes state expansionism by id", async () => {
    const { runtime, apply } = makeRuntime((type, ref) =>
      type === "state" && ref === 1
        ? { type: "state", i: 1, name: "Altaria", previousExpansionism: 1 }
        : null,
    );
    const tool = createSetEntityExpansionismTool(runtime);
    const result = await tool.execute({
      type: "state",
      entity: 1,
      expansionism: 2.5,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("state", 1, 2.5);
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      type: "state",
      i: 1,
      name: "Altaria",
      previousExpansionism: 1,
      expansionism: 2.5,
    });
  });

  it("writes culture expansionism by name", async () => {
    const { runtime, apply } = makeRuntime((type, ref) =>
      type === "culture" &&
      typeof ref === "string" &&
      ref.toLowerCase() === "highlanders"
        ? {
            type: "culture",
            i: 3,
            name: "Highlanders",
            previousExpansionism: 1.5,
          }
        : null,
    );
    const tool = createSetEntityExpansionismTool(runtime);
    await tool.execute({
      type: "cultures",
      entity: "HIGHLANDERS",
      expansionism: 3,
    });
    expect(apply).toHaveBeenCalledWith("culture", 3, 3);
  });

  it("writes religion expansionism by id", async () => {
    const { runtime, apply } = makeRuntime((type, _ref) =>
      type === "religion"
        ? {
            type: "religion",
            i: 2,
            name: "Old Faith",
            previousExpansionism: 0.8,
          }
        : null,
    );
    const tool = createSetEntityExpansionismTool(runtime);
    await tool.execute({ type: "faith", entity: 2, expansionism: 4 });
    expect(apply).toHaveBeenCalledWith("religion", 2, 4);
  });

  it("accepts plural and synonym aliases", async () => {
    const { runtime, apply } = makeRuntime((type, _ref) => ({
      type,
      i: 1,
      name: "X",
      previousExpansionism: 1,
    }));
    const tool = createSetEntityExpansionismTool(runtime);
    for (const alias of ["states", "CULTURES", "faiths", "Religion"]) {
      apply.mockClear();
      await tool.execute({ type: alias, entity: 1, expansionism: 2 });
      expect(apply).toHaveBeenCalled();
    }
  });

  it("rejects unknown type with a supported list", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetEntityExpansionismTool(runtime);
    const result = await tool.execute({
      type: "province",
      entity: 1,
      expansionism: 2,
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.supported).toEqual([...EXPANSIONABLE_TYPES]);
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors on unknown entity", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetEntityExpansionismTool(runtime);
    const result = await tool.execute({
      type: "state",
      entity: 999,
      expansionism: 2,
    });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid expansionism values", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      type: "state",
      i: 1,
      name: "X",
      previousExpansionism: 1,
    }));
    const tool = createSetEntityExpansionismTool(runtime);
    for (const bad of [
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      150,
      "2",
      null,
      undefined,
    ]) {
      expect(
        (
          await tool.execute({
            type: "state",
            entity: 1,
            expansionism: bad,
          })
        ).isError,
      ).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid ref types", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetEntityExpansionismTool(runtime);
    for (const bad of [null, "", 1.5, -1, {}]) {
      expect(
        (
          await tool.execute({
            type: "state",
            entity: bad,
            expansionism: 2,
          })
        ).isError,
      ).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime(() => ({
      type: "state",
      i: 1,
      name: "X",
      previousExpansionism: 1,
    }));
    runtime.apply = vi.fn(() => {
      throw new Error("customization active");
    });
    const tool = createSetEntityExpansionismTool(runtime);
    const result = await tool.execute({
      type: "state",
      entity: 1,
      expansionism: 2,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/customization/);
  });

  it("rejects index 0 for each type", async () => {
    const { runtime, apply } = makeRuntime((type, _ref) => ({
      type,
      i: 0,
      name: "Placeholder",
      previousExpansionism: 1,
    }));
    const tool = createSetEntityExpansionismTool(runtime);
    for (const type of EXPANSIONABLE_TYPES) {
      expect(
        (await tool.execute({ type, entity: 0, expansionism: 2 })).isError,
      ).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("resolveExpansionableType", () => {
  it("resolves all aliases", () => {
    for (const t of EXPANSIONABLE_TYPES) {
      expect(resolveExpansionableType(t)).toBe(t);
      expect(resolveExpansionableType(`${t}s`)).toBe(t);
      expect(resolveExpansionableType(t.toUpperCase())).toBe(t);
    }
    expect(resolveExpansionableType("faith")).toBe("religion");
    expect(resolveExpansionableType("faiths")).toBe("religion");
  });
  it("returns null for invalid input", () => {
    expect(resolveExpansionableType("province")).toBeNull();
    expect(resolveExpansionableType("")).toBeNull();
    expect(resolveExpansionableType(42)).toBeNull();
    expect(resolveExpansionableType(null)).toBeNull();
  });
});

describe("defaultEntityExpansionismRuntime dispatch", () => {
  let previous: unknown;
  beforeEach(() => {
    previous = (globalThis as { pack?: unknown }).pack;
  });
  afterEach(() => {
    if (previous === undefined) {
      delete (globalThis as { pack?: unknown }).pack;
    } else {
      (globalThis as { pack?: unknown }).pack = previous;
    }
  });

  it("writes to the correct collection per type", () => {
    (globalThis as { pack?: unknown }).pack = {
      states: [{ i: 0 }, { i: 1, name: "Altaria", expansionism: 1 }],
      cultures: [{ i: 0 }, { i: 1, name: "Highlanders", expansionism: 1 }],
      religions: [{ i: 0 }, { i: 1, name: "Old Faith", expansionism: 1 }],
    };
    for (const type of EXPANSIONABLE_TYPES) {
      const ref = defaultEntityExpansionismRuntime.find(type, 1);
      expect(ref).toMatchObject({ type, i: 1 });
      defaultEntityExpansionismRuntime.apply(type, 1, 5);
    }
    const pack = (globalThis as { pack: unknown }).pack as Record<
      string,
      Array<{ expansionism?: number }>
    >;
    expect(pack.states[1].expansionism).toBe(5);
    expect(pack.cultures[1].expansionism).toBe(5);
    expect(pack.religions[1].expansionism).toBe(5);
  });
});
