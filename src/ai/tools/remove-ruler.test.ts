import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRemoveRulerTool,
  type RulerRemovalRuntime,
  removeRulerTool,
} from "./remove-ruler";

function makeRuntime(): {
  runtime: RulerRemovalRuntime;
  remove: ReturnType<typeof vi.fn<RulerRemovalRuntime["remove"]>>;
} {
  const remove = vi.fn<RulerRemovalRuntime["remove"]>((i) => ({ id: i }));
  return { runtime: { remove }, remove };
}

describe("remove_ruler tool", () => {
  it("delegates to runtime with the given id", async () => {
    const { runtime, remove } = makeRuntime();
    const tool = createRemoveRulerTool(runtime);
    const result = await tool.execute({ id: 3 });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalledWith(3);
    expect(JSON.parse(result.content)).toEqual({ ok: true, id: 3 });
  });

  it("allows id: 0 (first ruler)", async () => {
    const { runtime, remove } = makeRuntime();
    const tool = createRemoveRulerTool(runtime);
    const result = await tool.execute({ id: 0 });
    expect(result.isError).toBeFalsy();
    expect(remove).toHaveBeenCalledWith(0);
    expect(JSON.parse(result.content)).toEqual({ ok: true, id: 0 });
  });

  it("rejects missing id", async () => {
    const { runtime, remove } = makeRuntime();
    const tool = createRemoveRulerTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects non-number id", async () => {
    const { runtime, remove } = makeRuntime();
    const tool = createRemoveRulerTool(runtime);
    for (const bad of ["3", null, true, {}]) {
      const result = await tool.execute({ id: bad });
      expect(result.isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects non-finite id", async () => {
    const { runtime, remove } = makeRuntime();
    const tool = createRemoveRulerTool(runtime);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -Infinity]) {
      const result = await tool.execute({ id: bad });
      expect(result.isError).toBe(true);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects non-integer id", async () => {
    const { runtime, remove } = makeRuntime();
    const tool = createRemoveRulerTool(runtime);
    const result = await tool.execute({ id: 1.5 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("rejects negative id", async () => {
    const { runtime, remove } = makeRuntime();
    const tool = createRemoveRulerTool(runtime);
    const result = await tool.execute({ id: -1 });
    expect(result.isError).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: RulerRemovalRuntime = {
      remove: vi.fn(() => {
        throw new Error("Ruler 7 not found.");
      }),
    };
    const tool = createRemoveRulerTool(runtime);
    const result = await tool.execute({ id: 7 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Ruler 7 not found/);
  });

  it("stringifies non-Error throws", async () => {
    const runtime: RulerRemovalRuntime = {
      remove: vi.fn(() => {
        throw "boom";
      }),
    };
    const tool = createRemoveRulerTool(runtime);
    const result = await tool.execute({ id: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("boom");
  });

  it("tolerates null/undefined input (validation still rejects)", async () => {
    const tool = createRemoveRulerTool(makeRuntime().runtime);
    const r1 = await tool.execute(null);
    const r2 = await tool.execute(undefined);
    expect(r1.isError).toBe(true);
    expect(r2.isError).toBe(true);
  });

  it("exposes the expected schema", () => {
    const tool = createRemoveRulerTool(makeRuntime().runtime);
    expect(tool.name).toBe("remove_ruler");
    expect(tool.input_schema.required).toEqual(["id"]);
  });
});

interface FakeEl {
  remove: ReturnType<typeof vi.fn>;
}

describe("defaultRulerRemovalRuntime (integration)", () => {
  const originalRulers = (globalThis as { rulers?: unknown }).rulers;
  const originalDocument = (globalThis as { document?: unknown }).document;
  let legacyRemove: ReturnType<typeof vi.fn>;
  let domEls: Record<string, FakeEl>;

  beforeEach(() => {
    const data = [{ id: 0 }, { id: 1 }, { id: 2 }];
    legacyRemove = vi.fn((id: number) => {
      const idx = data.findIndex((r) => r.id === id);
      if (idx !== -1) data.splice(idx, 1);
    });
    (globalThis as { rulers?: unknown }).rulers = {
      data,
      remove: legacyRemove,
    };

    domEls = {
      ruler0: { remove: vi.fn() },
      ruler1: { remove: vi.fn() },
      ruler2: { remove: vi.fn() },
    };
    (globalThis as { document?: unknown }).document = {
      getElementById(id: string): FakeEl | null {
        return domEls[id] ?? null;
      },
    };
  });

  afterEach(() => {
    (globalThis as { rulers?: unknown }).rulers = originalRulers;
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("removes the target ruler from rulers.data and invokes DOM cleanup", async () => {
    const result = await removeRulerTool.execute({ id: 1 });
    expect(result.isError).toBeFalsy();
    expect(legacyRemove).toHaveBeenCalledWith(1);
    const rulers = (globalThis as { rulers?: { data: { id: number }[] } })
      .rulers;
    expect(rulers?.data).toEqual([{ id: 0 }, { id: 2 }]);
    expect(domEls.ruler1.remove).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({ ok: true, id: 1 });
  });

  it("errors when globalThis.rulers is missing", async () => {
    (globalThis as { rulers?: unknown }).rulers = undefined;
    const result = await removeRulerTool.execute({ id: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Rulers/);
  });

  it("errors when rulers shape is invalid (remove missing)", async () => {
    (globalThis as { rulers?: unknown }).rulers = { data: [{ id: 0 }] };
    const result = await removeRulerTool.execute({ id: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Rulers/);
  });

  it("errors when rulers shape is invalid (data not array)", async () => {
    (globalThis as { rulers?: unknown }).rulers = {
      data: "not-array",
      remove: legacyRemove,
    };
    const result = await removeRulerTool.execute({ id: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Rulers/);
  });

  it("errors when id isn't in rulers.data", async () => {
    const result = await removeRulerTool.execute({ id: 99 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not found/);
    expect(legacyRemove).not.toHaveBeenCalled();
  });

  it("survives rulers.remove() throwing — still splices data and reports ok", async () => {
    const data = [{ id: 0 }, { id: 1 }];
    const throwing = vi.fn(() => {
      throw new Error("svg missing");
    });
    (globalThis as { rulers?: unknown }).rulers = {
      data,
      remove: throwing,
    };
    const result = await removeRulerTool.execute({ id: 1 });
    expect(result.isError).toBeFalsy();
    expect(throwing).toHaveBeenCalledTimes(1);
    expect(data).toEqual([{ id: 0 }]);
    expect(JSON.parse(result.content)).toEqual({ ok: true, id: 1 });
  });

  it("no-ops DOM cleanup when document.getElementById returns null", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    const result = await removeRulerTool.execute({ id: 1 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ ok: true, id: 1 });
  });

  it("no-ops DOM cleanup when document is undefined", async () => {
    (globalThis as { document?: unknown }).document = undefined;
    const result = await removeRulerTool.execute({ id: 1 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ ok: true, id: 1 });
  });
});
