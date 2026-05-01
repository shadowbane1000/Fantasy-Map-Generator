import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setEmblemSizeTool as registeredTool } from "../index";
import {
  createSetEmblemSizeTool,
  EMBLEM_SIZE_MAX,
  EMBLEM_SIZE_MIN,
  type EmblemEntityType,
  type EmblemSizeRef,
  type SetEmblemSizeRuntime,
  setEmblemSizeTool,
} from "./set-emblem-size";

function makeRuntime(
  find: (
    entityType: EmblemEntityType,
    ref: number | string,
  ) => EmblemSizeRef | null,
): {
  runtime: SetEmblemSizeRuntime;
  apply: ReturnType<typeof vi.fn<SetEmblemSizeRuntime["apply"]>>;
} {
  const apply = vi.fn<SetEmblemSizeRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_emblem_size tool (custom runtime)", () => {
  it("sets size for a state by numeric id", async () => {
    const { runtime, apply } = makeRuntime((type, ref) =>
      type === "state" && ref === 3
        ? { i: 3, name: "Valoria", previousSize: 1 }
        : null,
    );
    const tool = createSetEmblemSizeTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 3,
      size: 2.5,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("state", 3, 2.5);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      entity_type: "state",
      entity: { i: 3, name: "Valoria" },
      previous_size: 1,
      size: 2.5,
    });
  });

  it("sets size for a province by numeric id", async () => {
    const { runtime, apply } = makeRuntime((type, ref) =>
      type === "province" && ref === 7
        ? { i: 7, name: "Eastern Reach", previousSize: null }
        : null,
    );
    const tool = createSetEmblemSizeTool(runtime);
    const result = await tool.execute({
      entity_type: "province",
      entity: 7,
      size: 1.5,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("province", 7, 1.5);
    const body = JSON.parse(result.content);
    expect(body.entity_type).toBe("province");
    expect(body.previous_size).toBeNull();
  });

  it("sets size for a burg by numeric id", async () => {
    const { runtime, apply } = makeRuntime((type, ref) =>
      type === "burg" && ref === 11
        ? { i: 11, name: "Foo Town", previousSize: 0.5 }
        : null,
    );
    const tool = createSetEmblemSizeTool(runtime);
    const result = await tool.execute({
      entity_type: "burg",
      entity: 11,
      size: 3,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("burg", 11, 3);
  });

  it("resolves by case-insensitive name string", async () => {
    const find = vi.fn<SetEmblemSizeRuntime["find"]>((type, ref) =>
      type === "state" &&
      typeof ref === "string" &&
      ref.toLowerCase() === "valoria"
        ? { i: 3, name: "Valoria", previousSize: null }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetEmblemSizeTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: "VALORIA",
      size: 2,
    });
    expect(result.isError).toBeFalsy();
    expect(find).toHaveBeenCalledWith("state", "VALORIA");
    expect(apply).toHaveBeenCalledWith("state", 3, 2);
  });

  it("accepts entity_type case-insensitively", async () => {
    const { runtime, apply } = makeRuntime((type) =>
      type === "burg" ? { i: 1, name: "Hi", previousSize: null } : null,
    );
    const tool = createSetEmblemSizeTool(runtime);
    const result = await tool.execute({
      entity_type: "BURG",
      entity: 1,
      size: 1,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("burg", 1, 1);
  });

  it("allows size = 0 (hides emblem)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousSize: 2,
    }));
    const tool = createSetEmblemSizeTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 1,
      size: 0,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("state", 1, 0);
    expect(JSON.parse(result.content).size).toBe(0);
  });

  it("accepts boundary values (min and max)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousSize: null,
    }));
    const tool = createSetEmblemSizeTool(runtime);
    const r1 = await tool.execute({
      entity_type: "state",
      entity: 1,
      size: EMBLEM_SIZE_MIN,
    });
    const r2 = await tool.execute({
      entity_type: "state",
      entity: 1,
      size: EMBLEM_SIZE_MAX,
    });
    expect(r1.isError).toBeFalsy();
    expect(r2.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it("rejects out-of-range size", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousSize: null,
    }));
    const tool = createSetEmblemSizeTool(runtime);
    for (const bad of [-0.1, EMBLEM_SIZE_MAX + 0.1, 100, -100]) {
      const r = await tool.execute({
        entity_type: "state",
        entity: 1,
        size: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid size types (NaN/Infinity/string/null/undefined)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousSize: null,
    }));
    const tool = createSetEmblemSizeTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "1",
      null,
      undefined,
    ]) {
      const r = await tool.execute({
        entity_type: "state",
        entity: 1,
        size: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects missing entity_type", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetEmblemSizeTool(runtime);
    const result = await tool.execute({ entity: 1, size: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "entity_type must be one of: state, province, burg.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown entity_type values", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetEmblemSizeTool(runtime);
    for (const bad of ["culture", "", "  ", "religion", 7, null]) {
      const r = await tool.execute({
        entity_type: bad,
        entity: 1,
        size: 1,
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
    const tool = createSetEmblemSizeTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 999,
      size: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("State 999 not found.");
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid entity refs", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousSize: null,
    }));
    const tool = createSetEmblemSizeTool(runtime);
    for (const bad of [0, -1, 1.5, "", null, undefined]) {
      const r = await tool.execute({
        entity_type: "state",
        entity: bad,
        size: 1,
      });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("returns previous_size = null when coa.size was unset", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 4,
      name: "Foo",
      previousSize: null,
    }));
    const tool = createSetEmblemSizeTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 4,
      size: 1,
    });
    expect(JSON.parse(result.content).previous_size).toBeNull();
  });

  it("returns previous_size from before the mutation (apply gets new size)", async () => {
    const apply = vi.fn<SetEmblemSizeRuntime["apply"]>();
    const runtime: SetEmblemSizeRuntime = {
      find: () => ({ i: 2, name: "x", previousSize: 1.5 }),
      apply,
    };
    const tool = createSetEmblemSizeTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 2,
      size: 4,
    });
    expect(apply).toHaveBeenCalledWith("state", 2, 4);
    const body = JSON.parse(result.content);
    expect(body.previous_size).toBe(1.5);
    expect(body.size).toBe(4);
  });

  it("surfaces runtime errors from apply", async () => {
    const runtime: SetEmblemSizeRuntime = {
      find: () => ({ i: 1, name: "x", previousSize: null }),
      apply: vi.fn(() => {
        throw new Error(
          "window.pack is not available; the map hasn't finished loading.",
        );
      }),
    };
    const tool = createSetEmblemSizeTool(runtime);
    const result = await tool.execute({
      entity_type: "state",
      entity: 1,
      size: 2,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack is not available/);
  });
});

interface FakeEmblemsSelection {
  select: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  attr: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
}

function makeFakeEmblems(
  options: { appendThrows?: boolean; missingUseElement?: boolean } = {},
): FakeEmblemsSelection {
  const node: FakeEmblemsSelection = {
    select: vi.fn(),
    remove: vi.fn(),
    attr: vi.fn(),
    append: vi.fn(),
  };
  // selecting always returns the same chainable node
  node.select.mockImplementation((selector: string) => {
    if (options.missingUseElement && selector.startsWith("[data-i=")) {
      return node; // remove() on missing is a noop in d3, but we just return a node
    }
    return node;
  });
  node.remove.mockReturnValue(undefined);
  node.attr.mockImplementation((_name: string, value?: unknown) => {
    if (value === undefined) return "12"; // pretend font-size = 12
    return node;
  });
  node.append.mockImplementation(() => {
    if (options.appendThrows) throw new Error("append exploded");
    return node;
  });
  return node;
}

describe("defaultSetEmblemSizeRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalD3 = (globalThis as { d3?: unknown }).d3;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Valoria", pole: [100, 200], coa: { shield: "heater" } },
        { i: 2, name: "Removed", removed: true },
      ],
      provinces: [{ i: 0 }, { i: 1, name: "Eastern Reach", pole: [50, 75] }],
      burgs: [{ i: 0 }, { i: 1, name: "Foo Town", x: 10, y: 20 }],
    };
    // No DOM by default — DOM update is best-effort and skipped.
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { d3?: unknown }).d3 = undefined;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { d3?: unknown }).d3 = originalD3;
  });

  function installFakeDom(fake: FakeEmblemsSelection): void {
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) =>
        id === "emblems" ? ({ id: "emblems" } as unknown as Element) : null,
    } as unknown as Document;
    (globalThis as { d3?: unknown }).d3 = { select: () => fake };
  }

  it("writes coa.size on a state", async () => {
    const result = await setEmblemSizeTool.execute({
      entity_type: "state",
      entity: 1,
      size: 2.5,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as { pack: { states: { coa?: { size?: number } }[] } }
    ).pack;
    expect(pack.states[1]?.coa?.size).toBe(2.5);
  });

  it("writes coa.size on a province", async () => {
    const result = await setEmblemSizeTool.execute({
      entity_type: "province",
      entity: 1,
      size: 1,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as { pack: { provinces: { coa?: { size?: number } }[] } }
    ).pack;
    expect(pack.provinces[1]?.coa?.size).toBe(1);
  });

  it("writes coa.size on a burg", async () => {
    const result = await setEmblemSizeTool.execute({
      entity_type: "burg",
      entity: 1,
      size: 4,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as { pack: { burgs: { coa?: { size?: number } }[] } }
    ).pack;
    expect(pack.burgs[1]?.coa?.size).toBe(4);
  });

  it("initializes missing coa to {} and writes size", async () => {
    // province 1 has no coa initially
    const before = (globalThis as { pack: { provinces: { coa?: unknown }[] } })
      .pack.provinces[1]?.coa;
    expect(before).toBeUndefined();
    const result = await setEmblemSizeTool.execute({
      entity_type: "province",
      entity: 1,
      size: 1.5,
    });
    expect(result.isError).toBeFalsy();
    const after = (
      globalThis as {
        pack: { provinces: { coa?: { size?: number } }[] };
      }
    ).pack.provinces[1]?.coa;
    expect(after).toBeDefined();
    expect(after?.size).toBe(1.5);
    // previous_size is null when coa was undefined
    expect(JSON.parse(result.content).previous_size).toBeNull();
  });

  it("preserves existing coa.shield when only size is set", async () => {
    const result = await setEmblemSizeTool.execute({
      entity_type: "state",
      entity: 1,
      size: 2,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as {
        pack: { states: { coa?: { shield?: string; size?: number } }[] };
      }
    ).pack;
    expect(pack.states[1]?.coa?.shield).toBe("heater");
    expect(pack.states[1]?.coa?.size).toBe(2);
  });

  it("rejects when pack is absent", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await setEmblemSizeTool.execute({
      entity_type: "state",
      entity: 1,
      size: 1,
    });
    expect(result.isError).toBe(true);
    // find returns null because pack is undefined → "State 1 not found."
    expect(JSON.parse(result.content).error).toBe("State 1 not found.");
  });

  it("rejects when the pack collection is absent", async () => {
    (globalThis as { pack?: unknown }).pack = { burgs: [] };
    const result = await setEmblemSizeTool.execute({
      entity_type: "state",
      entity: 1,
      size: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("State 1 not found.");
  });

  it("rejects removed entities (skipped by findEntityByRef)", async () => {
    const result = await setEmblemSizeTool.execute({
      entity_type: "state",
      entity: 2,
      size: 1,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("State 2 not found.");
  });

  it("succeeds when document/d3 are undefined (DOM best-effort)", async () => {
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { d3?: unknown }).d3 = undefined;
    const result = await setEmblemSizeTool.execute({
      entity_type: "state",
      entity: 1,
      size: 2,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as { pack: { states: { coa?: { size?: number } }[] } }
    ).pack;
    expect(pack.states[1]?.coa?.size).toBe(2);
  });

  it("succeeds when the existing <use> element is missing (size > 0 still appends)", async () => {
    const fake = makeFakeEmblems({ missingUseElement: true });
    installFakeDom(fake);
    const result = await setEmblemSizeTool.execute({
      entity_type: "state",
      entity: 1,
      size: 2,
    });
    expect(result.isError).toBeFalsy();
    expect(fake.append).toHaveBeenCalledWith("use");
  });

  it("succeeds even when g.append throws", async () => {
    const fake = makeFakeEmblems({ appendThrows: true });
    installFakeDom(fake);
    const result = await setEmblemSizeTool.execute({
      entity_type: "state",
      entity: 1,
      size: 2,
    });
    expect(result.isError).toBeFalsy();
    const pack = (
      globalThis as { pack: { states: { coa?: { size?: number } }[] } }
    ).pack;
    expect(pack.states[1]?.coa?.size).toBe(2);
  });

  it("removes existing <use> but does NOT append new one when size = 0", async () => {
    const fake = makeFakeEmblems();
    installFakeDom(fake);
    const result = await setEmblemSizeTool.execute({
      entity_type: "state",
      entity: 1,
      size: 0,
    });
    expect(result.isError).toBeFalsy();
    // remove was called on the matched <use>
    expect(fake.remove).toHaveBeenCalled();
    // but append was NOT called (size = 0 returns early)
    expect(fake.append).not.toHaveBeenCalled();
    const pack = (
      globalThis as { pack: { states: { coa?: { size?: number } }[] } }
    ).pack;
    expect(pack.states[1]?.coa?.size).toBe(0);
  });
});

describe("set_emblem_size registry round-trip", () => {
  it("is exported from the ai barrel", () => {
    expect(registeredTool).toBeDefined();
    expect(registeredTool.name).toBe("set_emblem_size");
  });
});
