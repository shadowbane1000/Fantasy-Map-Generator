import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type AddReliefIconRuntime,
  addReliefIconTool,
  createAddReliefIconTool,
  defaultAddReliefIconRuntime,
} from "./add-relief-icon";
import { ToolRegistry } from "./index";

/**
 * Minimal Element-like stub that captures `setAttribute` calls and
 * supports `appendChild`. Sufficient for the tool's DOM mutations.
 */
interface FakeUseEl {
  tag: string;
  attrs: Record<string, string>;
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
}

interface FakeRoot {
  children: FakeUseEl[];
  ownerDocument: FakeDocument;
  appendChild: (el: FakeUseEl) => FakeUseEl;
}

interface FakeDocument {
  createdElements: FakeUseEl[];
  createElementNS?: (ns: string, name: string) => FakeUseEl;
  createElement?: (name: string) => FakeUseEl;
  getElementById?: (id: string) => FakeRoot | null;
  /** Records the last namespace passed to createElementNS. */
  lastNS?: string;
}

function makeFakeUse(tag: string): FakeUseEl {
  const el: FakeUseEl = {
    tag,
    attrs: {},
    setAttribute(k, v) {
      el.attrs[k] = v;
    },
    getAttribute(k) {
      return Object.hasOwn(el.attrs, k) ? el.attrs[k] : null;
    },
  };
  return el;
}

interface MakeFakeOptions {
  /** Whether to provide createElementNS (default true). */
  ns?: boolean;
  /** Whether to provide createElement fallback (default true). */
  legacy?: boolean;
}

function makeFake(options: MakeFakeOptions = {}): {
  root: FakeRoot;
  doc: FakeDocument;
} {
  const ns = options.ns !== false;
  const legacy = options.legacy !== false;

  const doc: FakeDocument = {
    createdElements: [],
  };
  if (ns) {
    doc.createElementNS = (namespace: string, name: string) => {
      doc.lastNS = namespace;
      const el = makeFakeUse(name);
      doc.createdElements.push(el);
      return el;
    };
  }
  if (legacy) {
    doc.createElement = (name: string) => {
      const el = makeFakeUse(name);
      doc.createdElements.push(el);
      return el;
    };
  }

  const root: FakeRoot = {
    children: [],
    ownerDocument: doc,
    appendChild(el) {
      root.children.push(el);
      return el;
    },
  };
  return { root, doc };
}

function makeStubRuntime(root: FakeRoot | null): AddReliefIconRuntime {
  return {
    getTerrainRoot: () =>
      root as unknown as ReturnType<AddReliefIconRuntime["getTerrainRoot"]>,
  };
}

describe("add_relief_icon tool metadata", () => {
  it("has the right name and schema", () => {
    expect(addReliefIconTool.name).toBe("add_relief_icon");
    expect(addReliefIconTool.input_schema).toMatchObject({
      type: "object",
    });
    expect(addReliefIconTool.input_schema.properties).toHaveProperty("type");
    expect(addReliefIconTool.input_schema.properties).toHaveProperty("x");
    expect(addReliefIconTool.input_schema.properties).toHaveProperty("y");
    expect(addReliefIconTool.input_schema.properties).toHaveProperty("size");
    // type, x, y are required; size is optional.
    expect(addReliefIconTool.input_schema.required).toEqual(["type", "x", "y"]);
  });

  it("description mentions relief icons and the <use> element", () => {
    const desc = addReliefIconTool.description.toLowerCase();
    expect(desc).toContain("relief");
    expect(desc).toContain("<use>");
    // Documents that the tool diverges from the UI.
    expect(desc).toContain("water");
  });

  it("createAddReliefIconTool produces an equivalent tool", () => {
    const built = createAddReliefIconTool();
    expect(built.name).toBe(addReliefIconTool.name);
    expect(built.input_schema).toEqual(addReliefIconTool.input_schema);
  });

  it("registers cleanly in a ToolRegistry round-trip", () => {
    const registry = new ToolRegistry();
    registry.register(addReliefIconTool);
    const schemas = registry.toAnthropicSchemas();
    expect(schemas.find((s) => s.name === "add_relief_icon")).toBeDefined();
  });
});

describe("add_relief_icon (stub runtime)", () => {
  it("appends a <use> with the right attributes (happy path)", async () => {
    const { root, doc } = makeFake();
    const tool = createAddReliefIconTool(makeStubRuntime(root));
    const result = await tool.execute({
      type: "#relief-mount-1",
      x: 100,
      y: 200,
      size: 10,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: "#relief-mount-1",
      center: [100, 200],
      size: 10,
      attributes: { x: 95, y: 195, width: 10, height: 10 },
    });
    expect(root.children).toHaveLength(1);
    const use = root.children[0];
    expect(use.tag).toBe("use");
    expect(use.attrs).toEqual({
      href: "#relief-mount-1",
      x: "95",
      y: "195",
      width: "10",
      height: "10",
    });
    // Created via SVG namespace.
    expect(doc.lastNS).toBe("http://www.w3.org/2000/svg");
  });

  it("uses size=5 when omitted", async () => {
    const { root } = makeFake();
    const tool = createAddReliefIconTool(makeStubRuntime(root));
    const result = await tool.execute({
      type: "#relief-hill-1",
      x: 50,
      y: 60,
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: "#relief-hill-1",
      center: [50, 60],
      size: 5,
      attributes: { x: 47.5, y: 57.5, width: 5, height: 5 },
    });
    expect(root.children[0].attrs).toEqual({
      href: "#relief-hill-1",
      x: "47.5",
      y: "57.5",
      width: "5",
      height: "5",
    });
  });

  it("accepts boundary sizes 2 and 50", async () => {
    for (const size of [2, 50]) {
      const { root } = makeFake();
      const tool = createAddReliefIconTool(makeStubRuntime(root));
      const result = await tool.execute({
        type: "#relief-mount-1",
        x: 100,
        y: 100,
        size,
      });
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      expect(body.size).toBe(size);
      expect(root.children).toHaveLength(1);
    }
  });

  it("rejects out-of-range sizes", async () => {
    const cases = [1.99, 50.01, 0, -1, 100];
    for (const size of cases) {
      const { root } = makeFake();
      const tool = createAddReliefIconTool(makeStubRuntime(root));
      const result = await tool.execute({
        type: "#relief-mount-1",
        x: 100,
        y: 100,
        size,
      });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toMatch(/\[2, 50\]/);
      // Nothing appended.
      expect(root.children).toHaveLength(0);
    }
  });

  it("rejects non-finite size, x, or y", async () => {
    const { root } = makeFake();
    const tool = createAddReliefIconTool(makeStubRuntime(root));

    const bad = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];

    for (const size of bad) {
      const r = await tool.execute({
        type: "#relief-mount-1",
        x: 100,
        y: 100,
        size,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/\[2, 50\]/);
    }
    for (const x of bad) {
      const r = await tool.execute({ type: "#relief-mount-1", x, y: 100 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/x/);
    }
    for (const y of bad) {
      const r = await tool.execute({ type: "#relief-mount-1", x: 100, y });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/y/);
    }
    expect(root.children).toHaveLength(0);
  });

  it("rounds attributes to 2 decimals", async () => {
    const { root } = makeFake();
    const tool = createAddReliefIconTool(makeStubRuntime(root));
    const result = await tool.execute({
      type: "#relief-mount-1",
      x: 100.123,
      y: 200,
      size: 5,
    });
    expect(result.isError).toBeFalsy();
    // 100.123 - 2.5 = 97.623 -> rounded to 2 decimals = 97.62
    const body = JSON.parse(result.content);
    expect(body.attributes.x).toBe(97.62);
    expect(root.children[0].attrs.x).toBe("97.62");
  });

  it("errors when type is missing the leading '#'", async () => {
    const { root } = makeFake();
    const tool = createAddReliefIconTool(makeStubRuntime(root));
    const result = await tool.execute({
      type: "relief-mount-1",
      x: 100,
      y: 100,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/'#'/);
    expect(root.children).toHaveLength(0);
  });

  it("errors when type is not a string", async () => {
    const { root } = makeFake();
    const tool = createAddReliefIconTool(makeStubRuntime(root));
    for (const bad of [42, true, false, {}, [], undefined, null]) {
      const r = await tool.execute({
        type: bad as unknown,
        x: 100,
        y: 100,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/string/);
    }
    expect(root.children).toHaveLength(0);
  });

  it("errors when getTerrainRoot returns null", async () => {
    const tool = createAddReliefIconTool(makeStubRuntime(null));
    const result = await tool.execute({
      type: "#relief-mount-1",
      x: 100,
      y: 100,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Terrain/);
  });

  it("appends successive icons (not insert)", async () => {
    const { root } = makeFake();
    const tool = createAddReliefIconTool(makeStubRuntime(root));

    await tool.execute({ type: "#relief-mount-1", x: 0, y: 0, size: 4 });
    await tool.execute({ type: "#relief-hill-1", x: 10, y: 10, size: 6 });
    await tool.execute({ type: "#relief-swamp-1", x: 20, y: 20 });

    expect(root.children).toHaveLength(3);
    expect(root.children.map((c) => c.attrs.href)).toEqual([
      "#relief-mount-1",
      "#relief-hill-1",
      "#relief-swamp-1",
    ]);
  });

  it("falls back to createElement when createElementNS is unavailable", async () => {
    const { root } = makeFake({ ns: false, legacy: true });
    const tool = createAddReliefIconTool(makeStubRuntime(root));
    const result = await tool.execute({
      type: "#relief-mount-1",
      x: 100,
      y: 100,
      size: 5,
    });
    expect(result.isError).toBeFalsy();
    expect(root.children).toHaveLength(1);
    expect(root.children[0].tag).toBe("use");
  });
});

describe("defaultAddReliefIconRuntime (integration)", () => {
  const originalTerrain = (globalThis as { terrain?: unknown }).terrain;
  const originalDocument = (globalThis as { document?: unknown }).document;

  let root: FakeRoot;
  let doc: FakeDocument;

  beforeEach(() => {
    const fake = makeFake();
    root = fake.root;
    doc = fake.doc;
    // The default runtime falls back to document.getElementById when
    // window.terrain is missing.
    doc.getElementById = (id: string) => (id === "terrain" ? root : null);
  });

  afterEach(() => {
    (globalThis as { terrain?: unknown }).terrain = originalTerrain;
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("uses window.terrain.node() when available (preferred path)", async () => {
    (globalThis as { terrain?: unknown }).terrain = {
      node: () => root,
    };
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };

    const result = await addReliefIconTool.execute({
      type: "#relief-mount-1",
      x: 10,
      y: 20,
      size: 5,
    });
    expect(result.isError).toBeFalsy();
    expect(root.children).toHaveLength(1);
    expect(root.children[0].attrs).toEqual({
      href: "#relief-mount-1",
      x: "7.5",
      y: "17.5",
      width: "5",
      height: "5",
    });
  });

  it("falls back to document.getElementById('terrain')", async () => {
    (globalThis as { terrain?: unknown }).terrain = undefined;
    (globalThis as { document?: unknown }).document = doc;

    const result = await addReliefIconTool.execute({
      type: "#relief-hill-1",
      x: 30,
      y: 40,
    });
    expect(result.isError).toBeFalsy();
    expect(root.children).toHaveLength(1);
    expect(root.children[0].attrs.href).toBe("#relief-hill-1");
  });

  it("falls back when window.terrain.node() returns null", async () => {
    (globalThis as { terrain?: unknown }).terrain = { node: () => null };
    (globalThis as { document?: unknown }).document = doc;

    const result = await addReliefIconTool.execute({
      type: "#relief-mount-1",
      x: 10,
      y: 20,
    });
    expect(result.isError).toBeFalsy();
    expect(root.children).toHaveLength(1);
  });

  it("errors when neither window.terrain nor #terrain element exists", async () => {
    (globalThis as { terrain?: unknown }).terrain = undefined;
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };

    const result = await addReliefIconTool.execute({
      type: "#relief-mount-1",
      x: 10,
      y: 20,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Terrain/);
  });

  it("defaultAddReliefIconRuntime.getTerrainRoot returns null when nothing is present", () => {
    (globalThis as { terrain?: unknown }).terrain = undefined;
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    expect(defaultAddReliefIconRuntime.getTerrainRoot()).toBeNull();
  });
});
