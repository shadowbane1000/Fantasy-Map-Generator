import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ClearRulersRuntime,
  clearRulersTool,
  createClearRulersTool,
} from "./clear-rulers";

function makeRuntime(cleared = 3): {
  runtime: ClearRulersRuntime;
  clearAll: ReturnType<typeof vi.fn<ClearRulersRuntime["clearAll"]>>;
} {
  const clearAll = vi.fn<ClearRulersRuntime["clearAll"]>(() => ({ cleared }));
  return { runtime: { clearAll }, clearAll };
}

describe("clear_rulers tool", () => {
  it("delegates to the runtime and reports cleared count", async () => {
    const { runtime, clearAll } = makeRuntime(4);
    const tool = createClearRulersTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({ ok: true, cleared: 4 });
  });

  it("is idempotent — returns cleared: 0 when there are no rulers", async () => {
    const { runtime } = makeRuntime(0);
    const tool = createClearRulersTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ ok: true, cleared: 0 });
  });

  it("ignores extraneous input properties", async () => {
    const { runtime, clearAll } = makeRuntime(2);
    const tool = createClearRulersTool(runtime);
    const result = await tool.execute({ bogus: "value", count: 7 });
    expect(result.isError).toBeFalsy();
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({ ok: true, cleared: 2 });
  });

  it("tolerates null/undefined input", async () => {
    const { runtime } = makeRuntime(1);
    const tool = createClearRulersTool(runtime);
    const r1 = await tool.execute(null);
    const r2 = await tool.execute(undefined);
    expect(r1.isError).toBeFalsy();
    expect(r2.isError).toBeFalsy();
  });

  it("surfaces runtime errors", async () => {
    const runtime: ClearRulersRuntime = {
      clearAll: vi.fn(() => {
        throw new Error("Rulers is not available yet");
      }),
    };
    const tool = createClearRulersTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Rulers/);
  });

  it("stringifies non-Error throws", async () => {
    const runtime: ClearRulersRuntime = {
      clearAll: vi.fn(() => {
        throw "boom";
      }),
    };
    const tool = createClearRulersTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("boom");
  });

  it("has empty input_schema.properties (no params)", () => {
    const tool = createClearRulersTool();
    expect(tool.name).toBe("clear_rulers");
    expect(tool.input_schema).toEqual({ type: "object", properties: {} });
  });
});

interface FakeNode {
  children: FakeNode[];
  firstChild: FakeNode | null;
  appendChild(child: FakeNode): void;
  removeChild(child: FakeNode): void;
}

function makeFakeNode(): FakeNode {
  const children: FakeNode[] = [];
  const node: FakeNode = {
    children,
    get firstChild() {
      return children[0] ?? null;
    },
    appendChild(child) {
      children.push(child);
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx >= 0) children.splice(idx, 1);
    },
  };
  return node;
}

describe("defaultClearRulersRuntime (integration)", () => {
  const undraw = vi.fn();
  const originalRulers = (globalThis as { rulers?: unknown }).rulers;
  const originalDocument = (globalThis as { document?: unknown }).document;
  let rulerGroup: FakeNode;

  beforeEach(() => {
    undraw.mockReset();
    (globalThis as { rulers?: unknown }).rulers = {
      data: [{ id: 0 }, { id: 1 }, { id: 2 }],
      undraw,
    };

    rulerGroup = makeFakeNode();
    rulerGroup.appendChild(makeFakeNode());
    rulerGroup.appendChild(makeFakeNode());

    (globalThis as { document?: unknown }).document = {
      getElementById(id: string): FakeNode | null {
        return id === "ruler" ? rulerGroup : null;
      },
    };
  });

  afterEach(() => {
    (globalThis as { rulers?: unknown }).rulers = originalRulers;
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("calls rulers.undraw(), empties data, and wipes #ruler DOM", async () => {
    const result = await clearRulersTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(undraw).toHaveBeenCalledTimes(1);

    const rulers = (globalThis as { rulers?: { data: unknown[] } }).rulers;
    expect(rulers?.data).toEqual([]);

    expect(rulerGroup.children.length).toBe(0);

    expect(JSON.parse(result.content)).toEqual({ ok: true, cleared: 3 });
  });

  it("errors when globalThis.rulers is missing", async () => {
    (globalThis as { rulers?: unknown }).rulers = undefined;
    const result = await clearRulersTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Rulers/);
  });

  it("errors when rulers shape is invalid (undraw missing)", async () => {
    (globalThis as { rulers?: unknown }).rulers = { data: [] };
    const result = await clearRulersTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Rulers/);
  });

  it("errors when rulers shape is invalid (data not array)", async () => {
    (globalThis as { rulers?: unknown }).rulers = {
      data: "not-array",
      undraw,
    };
    const result = await clearRulersTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Rulers/);
  });

  it("reports cleared: 0 when the rulers list is already empty", async () => {
    (globalThis as { rulers?: unknown }).rulers = {
      data: [] as unknown[],
      undraw,
    };
    const result = await clearRulersTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ ok: true, cleared: 0 });
    // undraw is still called, but has no data to iterate.
    expect(undraw).toHaveBeenCalledTimes(1);
  });

  it("survives undraw() throwing — still empties data and reports count", async () => {
    const throwing = vi.fn(() => {
      throw new Error("svg missing");
    });
    (globalThis as { rulers?: unknown }).rulers = {
      data: [{ id: 0 }, { id: 1 }],
      undraw: throwing,
    };
    const result = await clearRulersTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(throwing).toHaveBeenCalledTimes(1);
    const rulers = (globalThis as { rulers?: { data: unknown[] } }).rulers;
    expect(rulers?.data).toEqual([]);
    expect(JSON.parse(result.content)).toEqual({ ok: true, cleared: 2 });
  });

  it("no-ops DOM wipe when document.getElementById returns null", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    const result = await clearRulersTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ ok: true, cleared: 3 });
  });

  it("no-ops DOM wipe when document is undefined", async () => {
    (globalThis as { document?: unknown }).document = undefined;
    const result = await clearRulersTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({ ok: true, cleared: 3 });
  });
});
