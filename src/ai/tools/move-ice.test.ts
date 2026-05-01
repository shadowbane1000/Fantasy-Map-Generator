import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createMoveIceTool,
  type MoveIceLookup,
  type MoveIceRuntime,
  moveIceTool,
} from "./move-ice";

interface FakeElement {
  tagName: string;
  attrs: Map<string, string>;
  children: FakeElement[];
  parentElement: FakeElement | null;
  appendChild: (child: FakeElement) => void;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  querySelector: (sel: string) => FakeElement | null;
}

/**
 * Tiny DOM-ish element. Only supports a subset of `querySelector`
 * good enough for the tool: `[data-id="<value>"]`.
 */
function fakeEl(tag: string): FakeElement {
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    attrs: new Map<string, string>(),
    children: [],
    parentElement: null,
    appendChild(child) {
      if (child.parentElement) {
        const p = child.parentElement;
        p.children = p.children.filter((c) => c !== child);
      }
      child.parentElement = el;
      el.children.push(child);
    },
    setAttribute(name, value) {
      el.attrs.set(name, value);
    },
    getAttribute(name) {
      return el.attrs.has(name) ? (el.attrs.get(name) as string) : null;
    },
    querySelector(sel) {
      const m = /^\[data-id="([^"]+)"\]$/.exec(sel);
      if (!m) return null;
      const target = m[1];
      const stack: FakeElement[] = [...el.children];
      while (stack.length > 0) {
        const cur = stack.shift() as FakeElement;
        if (cur.attrs.get("data-id") === target) return cur;
        if (cur.children.length > 0) stack.push(...cur.children);
      }
      return null;
    },
  };
  return el;
}

describe("move_ice tool — unit (mocked runtime)", () => {
  function makeRuntime(overrides: Partial<MoveIceRuntime> = {}): {
    runtime: MoveIceRuntime;
    findIce: ReturnType<typeof vi.fn<MoveIceRuntime["findIce"]>>;
    setTransform: ReturnType<typeof vi.fn<MoveIceRuntime["setTransform"]>>;
    setOffset: ReturnType<typeof vi.fn<MoveIceRuntime["setOffset"]>>;
  } {
    const findIce = vi.fn<MoveIceRuntime["findIce"]>(
      overrides.findIce ?? (() => ({ kind: "not_found" }) as MoveIceLookup),
    );
    const setTransform = vi.fn<MoveIceRuntime["setTransform"]>(
      overrides.setTransform ?? (() => undefined),
    );
    const setOffset = vi.fn<MoveIceRuntime["setOffset"]>(
      overrides.setOffset ?? (() => undefined),
    );
    return {
      runtime: { findIce, setTransform, setOffset },
      findIce,
      setTransform,
      setOffset,
    };
  }

  function foundOverrides(opts: {
    type: "glacier" | "iceberg";
    id?: number;
    iceData?: { i: number; type?: "glacier" | "iceberg"; offset?: unknown };
  }): Partial<MoveIceRuntime> {
    const id = opts.id ?? 7;
    const svgEl = fakeEl("polygon");
    svgEl.setAttribute("data-id", String(id));
    const iceData = (opts.iceData ?? {
      i: id,
      type: opts.type,
      offset: [10, 20],
    }) as {
      i: number;
      type?: "glacier" | "iceberg";
      offset?: [number, number] | null;
    };
    return {
      findIce: () => ({
        kind: "found",
        ref: { i: id, type: opts.type },
        svgEl: svgEl as unknown as Element,
        iceData,
      }),
    };
  }

  it("happy path iceberg: id=7, x=100, y=200 → setTransform & setOffset called, reports old/new", async () => {
    const id = 7;
    const svgEl = fakeEl("polygon");
    svgEl.setAttribute("data-id", String(id));
    const iceData = {
      i: id,
      type: "iceberg" as const,
      offset: [10, 20] as [number, number],
    };
    const { runtime, setTransform, setOffset } = makeRuntime({
      findIce: () => ({
        kind: "found",
        ref: { i: id, type: "iceberg" },
        svgEl: svgEl as unknown as Element,
        iceData,
      }),
    });
    const tool = createMoveIceTool(runtime);
    const r = await tool.execute({ id, x: 100, y: 200 });
    expect(r.isError).toBeFalsy();
    expect(setTransform).toHaveBeenCalledWith(svgEl, "translate(100,200)");
    expect(setOffset).toHaveBeenCalledWith(iceData, 100, 200);
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      id: 7,
      type: "iceberg",
      old_offset: [10, 20],
      new_offset: [100, 200],
    });
  });

  it("happy path glacier: type='glacier' carried through to the response", async () => {
    const { runtime, setTransform } = makeRuntime(
      foundOverrides({ type: "glacier" }),
    );
    const tool = createMoveIceTool(runtime);
    const r = await tool.execute({ id: 7, x: 1, y: 2 });
    expect(r.isError).toBeFalsy();
    expect(setTransform).toHaveBeenCalled();
    expect(JSON.parse(r.content)).toMatchObject({
      ok: true,
      type: "glacier",
      new_offset: [1, 2],
    });
  });

  it("first move (no prior offset): old_offset = null, new still applied", async () => {
    const id = 4;
    const svgEl = fakeEl("polygon");
    svgEl.setAttribute("data-id", String(id));
    const iceData: { i: number; type: "iceberg"; offset?: unknown } = {
      i: id,
      type: "iceberg",
    };
    const { runtime, setTransform, setOffset } = makeRuntime({
      findIce: () => ({
        kind: "found",
        ref: { i: id, type: "iceberg" },
        svgEl: svgEl as unknown as Element,
        iceData: iceData as never,
      }),
    });
    const tool = createMoveIceTool(runtime);
    const r = await tool.execute({ id, x: 50, y: 60 });
    expect(r.isError).toBeFalsy();
    expect(setTransform).toHaveBeenCalledWith(svgEl, "translate(50,60)");
    expect(setOffset).toHaveBeenCalledWith(iceData, 50, 60);
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      id: 4,
      type: "iceberg",
      old_offset: null,
      new_offset: [50, 60],
    });
  });

  it("malformed prior offset (non-array, short array, non-finite values) → old_offset null", async () => {
    for (const malformed of [
      "garbage",
      [42],
      [Number.NaN, 5],
      [5, Number.POSITIVE_INFINITY],
      null,
      undefined,
    ]) {
      const { runtime } = makeRuntime(
        foundOverrides({
          type: "iceberg",
          iceData: { i: 7, type: "iceberg", offset: malformed as never },
        }),
      );
      const tool = createMoveIceTool(runtime);
      const r = await tool.execute({ id: 7, x: 1, y: 2 });
      expect(r.isError).toBeFalsy();
      expect(JSON.parse(r.content).old_offset).toBeNull();
    }
  });

  it("negative coordinates accepted: x=-50, y=-100", async () => {
    const { runtime, setTransform } = makeRuntime(
      foundOverrides({ type: "iceberg" }),
    );
    const tool = createMoveIceTool(runtime);
    const r = await tool.execute({ id: 7, x: -50, y: -100 });
    expect(r.isError).toBeFalsy();
    expect(setTransform).toHaveBeenCalledWith(
      expect.anything(),
      "translate(-50,-100)",
    );
    expect(JSON.parse(r.content).new_offset).toEqual([-50, -100]);
  });

  it("non-integer coordinates accepted: x=1.5, y=2.7", async () => {
    const { runtime, setTransform } = makeRuntime(
      foundOverrides({ type: "iceberg" }),
    );
    const tool = createMoveIceTool(runtime);
    const r = await tool.execute({ id: 7, x: 1.5, y: 2.7 });
    expect(r.isError).toBeFalsy();
    expect(setTransform).toHaveBeenCalledWith(
      expect.anything(),
      "translate(1.5,2.7)",
    );
    expect(JSON.parse(r.content).new_offset).toEqual([1.5, 2.7]);
  });

  it("findIce kind=not_found → error mentioning the id, no setTransform/setOffset", async () => {
    const { runtime, setTransform, setOffset } = makeRuntime({
      findIce: () => ({ kind: "not_found" }),
    });
    const tool = createMoveIceTool(runtime);
    const r = await tool.execute({ id: 99, x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/99/);
    expect(setTransform).not.toHaveBeenCalled();
    expect(setOffset).not.toHaveBeenCalled();
  });

  it("findIce kind=svg_not_found → error mentioning the id, no setTransform/setOffset", async () => {
    const { runtime, setTransform, setOffset } = makeRuntime({
      findIce: () => ({ kind: "svg_not_found" }),
    });
    const tool = createMoveIceTool(runtime);
    const r = await tool.execute({ id: 7, x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/SVG element not found.*7/);
    expect(setTransform).not.toHaveBeenCalled();
    expect(setOffset).not.toHaveBeenCalled();
  });

  it("findIce kind=ice_root_missing → error mentions #ice", async () => {
    const { runtime, setTransform, setOffset } = makeRuntime({
      findIce: () => ({ kind: "ice_root_missing" }),
    });
    const tool = createMoveIceTool(runtime);
    const r = await tool.execute({ id: 7, x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#ice/);
    expect(setTransform).not.toHaveBeenCalled();
    expect(setOffset).not.toHaveBeenCalled();
  });

  it("findIce throwing surfaces as error", async () => {
    const { runtime, setTransform } = makeRuntime({
      findIce: () => {
        throw new Error("pack.ice is not available.");
      },
    });
    const tool = createMoveIceTool(runtime);
    const r = await tool.execute({ id: 7, x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/pack\.ice/);
    expect(setTransform).not.toHaveBeenCalled();
  });

  it("setTransform throwing surfaces as error; setOffset not called", async () => {
    const { runtime, setOffset } = makeRuntime(
      foundOverrides({ type: "iceberg" }),
    );
    runtime.setTransform = vi.fn(() => {
      throw new Error("DOM exploded");
    });
    const tool = createMoveIceTool(runtime);
    const r = await tool.execute({ id: 7, x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/DOM exploded/);
    expect(setOffset).not.toHaveBeenCalled();
  });

  it("setOffset throwing surfaces as error", async () => {
    const { runtime } = makeRuntime(foundOverrides({ type: "iceberg" }));
    runtime.setOffset = vi.fn(() => {
      throw new Error("offset write failed");
    });
    const tool = createMoveIceTool(runtime);
    const r = await tool.execute({ id: 7, x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/offset write failed/);
  });

  it("rejects non-finite x and missing y", async () => {
    const { runtime, findIce } = makeRuntime();
    const tool = createMoveIceTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "100",
      null,
      undefined,
      true,
      {},
    ]) {
      const r = await tool.execute({ id: 7, x: bad, y: 2 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/x must be a finite number/);
    }
    expect(findIce).not.toHaveBeenCalled();
  });

  it("rejects non-finite y", async () => {
    const { runtime, findIce } = makeRuntime();
    const tool = createMoveIceTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "100",
      null,
      undefined,
      true,
      {},
    ]) {
      const r = await tool.execute({ id: 7, x: 1, y: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/y must be a finite number/);
    }
    expect(findIce).not.toHaveBeenCalled();
  });

  it("rejects bad id (missing/null/non-number/non-integer/negative/non-finite)", async () => {
    const { runtime, findIce } = makeRuntime();
    const tool = createMoveIceTool(runtime);
    for (const bad of [
      undefined,
      null,
      "7",
      true,
      1.5,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      const r = await tool.execute({ id: bad, x: 1, y: 2 });
      expect(r.isError).toBe(true);
      const errMsg = JSON.parse(r.content).error;
      expect(errMsg).toMatch(/id (is required|must be a non-negative integer)/);
    }
    expect(findIce).not.toHaveBeenCalled();
  });

  it("registers under name 'move_ice' and round-trips through registry", async () => {
    expect(moveIceTool.name).toBe("move_ice");
    const reg = new ToolRegistry();
    reg.register(moveIceTool);
    expect(reg.list().map((t) => t.name)).toContain("move_ice");
    // With no DOM/pack in node, the default runtime errors out; the
    // registry should surface that as an error rather than crash.
    const out = await reg.run("move_ice", { id: 7, x: 1, y: 2 });
    expect(out.isError).toBe(true);
  });
});

describe("defaultMoveIceRuntime (integration with mocked DOM and pack)", () => {
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalIce = (globalThis as { ice?: unknown }).ice;
  const originalPack = (globalThis as { pack?: unknown }).pack;

  let iceRoot: FakeElement;
  let ice7: FakeElement;
  let pack: { ice: { i: number; type: string; offset?: unknown }[] };

  beforeEach(() => {
    iceRoot = fakeEl("g");
    iceRoot.setAttribute("id", "ice");
    ice7 = fakeEl("polygon");
    ice7.setAttribute("data-id", "7");
    iceRoot.appendChild(ice7);

    pack = {
      ice: [{ i: 7, type: "iceberg", offset: [10, 20] }],
    };

    (globalThis as { pack?: unknown }).pack = pack;
    (globalThis as { ice?: unknown }).ice = { node: () => iceRoot };
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => (id === "ice" ? iceRoot : null),
    };
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { ice?: unknown }).ice = originalIce;
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("happy path via window.ice: writes transform on the polygon and offset on pack.ice", async () => {
    const r = await moveIceTool.execute({ id: 7, x: 300, y: 400 });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      id: 7,
      type: "iceberg",
      old_offset: [10, 20],
      new_offset: [300, 400],
    });
    expect(ice7.getAttribute("transform")).toBe("translate(300,400)");
    expect(pack.ice[0].offset).toEqual([300, 400]);
  });

  it("falls back to document.getElementById('ice') when window.ice is missing", async () => {
    (globalThis as { ice?: unknown }).ice = undefined;
    const r = await moveIceTool.execute({ id: 7, x: 1, y: 2 });
    expect(r.isError).toBeFalsy();
    expect(ice7.getAttribute("transform")).toBe("translate(1,2)");
    expect(pack.ice[0].offset).toEqual([1, 2]);
  });

  it("both window.ice and #ice missing → error '#ice SVG element not found.'", async () => {
    (globalThis as { ice?: unknown }).ice = undefined;
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    const r = await moveIceTool.execute({ id: 7, x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#ice/);
    // pack.ice unchanged
    expect(pack.ice[0].offset).toEqual([10, 20]);
  });

  it("unknown id → error, pack.ice unchanged", async () => {
    const r = await moveIceTool.execute({ id: 99, x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/99/);
    expect(pack.ice[0].offset).toEqual([10, 20]);
  });

  it("pack entry exists but SVG element is absent → error, pack.ice unchanged", async () => {
    // Remove the polygon from the iceRoot so querySelector misses.
    iceRoot.children = [];
    const r = await moveIceTool.execute({ id: 7, x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/SVG element not found.*7/);
    expect(pack.ice[0].offset).toEqual([10, 20]);
  });

  it("pack present but pack.ice missing → error", async () => {
    (globalThis as { pack?: unknown }).pack = {};
    const r = await moveIceTool.execute({ id: 7, x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/pack\.ice/);
  });
});
