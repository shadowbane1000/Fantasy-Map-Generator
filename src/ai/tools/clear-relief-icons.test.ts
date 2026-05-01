import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ClearReliefIconsRuntime,
  clearReliefIconsTool,
  createClearReliefIconsTool,
  defaultClearReliefIconsRuntime,
} from "./clear-relief-icons";
import { ToolRegistry } from "./index";

/**
 * Lightweight fake `<use>` node — implements just enough of the DOM
 * Element surface for the tool's `querySelectorAll` + `.remove()`
 * pattern to work without spinning up jsdom.
 */
interface FakeUseNode {
  tag: "use";
  href: string;
  parent: FakeRoot | null;
  remove: () => void;
}

interface FakeRoot {
  children: FakeUseNode[];
  querySelectorAll: (selector: string) => FakeUseNode[];
}

function makeUse(href: string): Omit<FakeUseNode, "parent"> {
  return {
    tag: "use",
    href,
    remove() {
      /* set in addUse */
    },
  };
}

function makeRoot(): FakeRoot {
  const root: FakeRoot = {
    children: [],
    querySelectorAll(selector: string): FakeUseNode[] {
      // Recognise either `use` (all) or `use[href="..."]`.
      if (selector === "use") return [...root.children];
      const m = selector.match(/^use\[href="([^"]*)"\]$/);
      if (m) {
        const wanted = m[1];
        return root.children.filter((n) => n.href === wanted);
      }
      return [];
    },
  };
  return root;
}

function addUse(root: FakeRoot, href: string): FakeUseNode {
  const node: FakeUseNode = {
    ...makeUse(href),
    parent: root,
    remove() {
      const idx = root.children.indexOf(node);
      if (idx >= 0) root.children.splice(idx, 1);
      node.parent = null;
    },
  };
  root.children.push(node);
  return node;
}

function makeStubRuntime(root: FakeRoot | null): ClearReliefIconsRuntime {
  return {
    getTerrainRoot: () =>
      root as unknown as ReturnType<ClearReliefIconsRuntime["getTerrainRoot"]>,
  };
}

describe("clear_relief_icons tool metadata", () => {
  it("has the right name and schema", () => {
    expect(clearReliefIconsTool.name).toBe("clear_relief_icons");
    expect(clearReliefIconsTool.input_schema).toMatchObject({
      type: "object",
    });
    expect(clearReliefIconsTool.input_schema.properties).toHaveProperty("type");
    // `type` is OPTIONAL — not in `required`.
    expect(clearReliefIconsTool.input_schema.required).toBeUndefined();
  });

  it("description mentions the destructive nature and the # constraint", () => {
    const desc = clearReliefIconsTool.description.toLowerCase();
    expect(desc).toContain("permanently");
    expect(desc).toContain("relief");
    expect(desc).toContain("#");
  });

  it("createClearReliefIconsTool produces an equivalent tool", () => {
    const built = createClearReliefIconsTool();
    expect(built.name).toBe(clearReliefIconsTool.name);
    expect(built.input_schema).toEqual(clearReliefIconsTool.input_schema);
  });

  it("registers cleanly in a ToolRegistry round-trip", () => {
    const registry = new ToolRegistry();
    registry.register(clearReliefIconsTool);
    const schemas = registry.toAnthropicSchemas();
    expect(schemas.find((s) => s.name === "clear_relief_icons")).toBeDefined();
  });
});

describe("clear_relief_icons (stub runtime)", () => {
  it("removes ALL <use> when no type is provided", async () => {
    const root = makeRoot();
    addUse(root, "#relief-mount-1");
    addUse(root, "#relief-mount-1");
    addUse(root, "#relief-mount-2");
    addUse(root, "#relief-hill-1");
    addUse(root, "#relief-hill-2");

    const tool = createClearReliefIconsTool(makeStubRuntime(root));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: null,
      removed_count: 5,
    });
    expect(root.children).toHaveLength(0);
  });

  it("removes only matching <use> when a type is provided", async () => {
    const root = makeRoot();
    const m1 = addUse(root, "#relief-mount-1");
    const m2 = addUse(root, "#relief-mount-1");
    const m3 = addUse(root, "#relief-mount-1");
    const h1 = addUse(root, "#relief-hill-1");
    const h2 = addUse(root, "#relief-hill-2");

    const tool = createClearReliefIconsTool(makeStubRuntime(root));
    const result = await tool.execute({ type: "#relief-mount-1" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: "#relief-mount-1",
      removed_count: 3,
    });
    // Only the hills survive.
    expect(root.children).toEqual([h1, h2]);
    // Mountains are detached.
    expect(m1.parent).toBeNull();
    expect(m2.parent).toBeNull();
    expect(m3.parent).toBeNull();
  });

  it("succeeds with removed_count: 0 on an empty terrain", async () => {
    const root = makeRoot();
    const tool = createClearReliefIconsTool(makeStubRuntime(root));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: null,
      removed_count: 0,
    });
  });

  it("succeeds with removed_count: 0 when type matches nothing", async () => {
    const root = makeRoot();
    addUse(root, "#relief-hill-1");
    const tool = createClearReliefIconsTool(makeStubRuntime(root));
    const result = await tool.execute({ type: "#relief-mount-1" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: "#relief-mount-1",
      removed_count: 0,
    });
    // Existing hill is untouched.
    expect(root.children).toHaveLength(1);
  });

  it("errors when type is missing the leading '#'", async () => {
    const root = makeRoot();
    addUse(root, "#relief-mount-1");
    const tool = createClearReliefIconsTool(makeStubRuntime(root));
    const result = await tool.execute({ type: "relief-mount-1" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/'#'/);
    // Nothing removed.
    expect(root.children).toHaveLength(1);
  });

  it("errors when type is not a string", async () => {
    const root = makeRoot();
    addUse(root, "#relief-mount-1");
    const tool = createClearReliefIconsTool(makeStubRuntime(root));

    for (const bad of [42, true, false, {}, [], Symbol("x")]) {
      const result = await tool.execute({ type: bad as unknown });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content).error).toMatch(/string/);
    }
    // Nothing removed.
    expect(root.children).toHaveLength(1);
  });

  it("errors when getTerrainRoot returns null", async () => {
    const tool = createClearReliefIconsTool(makeStubRuntime(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Terrain/);
  });

  it("treats null/undefined input as no filter", async () => {
    const root = makeRoot();
    addUse(root, "#relief-mount-1");
    addUse(root, "#relief-hill-1");
    const tool = createClearReliefIconsTool(makeStubRuntime(root));
    const r1 = await tool.execute(null);
    expect(r1.isError).toBeFalsy();
    expect(JSON.parse(r1.content)).toEqual({
      ok: true,
      type: null,
      removed_count: 2,
    });
  });
});

describe("defaultClearReliefIconsRuntime (integration)", () => {
  const originalTerrain = (globalThis as { terrain?: unknown }).terrain;
  const originalDocument = (globalThis as { document?: unknown }).document;

  let root: FakeRoot;

  beforeEach(() => {
    root = makeRoot();
    addUse(root, "#relief-mount-1");
    addUse(root, "#relief-mount-1");
    addUse(root, "#relief-hill-1");
  });

  afterEach(() => {
    (globalThis as { terrain?: unknown }).terrain = originalTerrain;
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("uses window.terrain.node() when available (preferred path)", async () => {
    (globalThis as { terrain?: unknown }).terrain = {
      node: () => root,
    };
    // Make sure we're not falling through to the document fallback.
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };

    const result = await clearReliefIconsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: null,
      removed_count: 3,
    });
    expect(root.children).toHaveLength(0);
  });

  it("falls back to document.getElementById('terrain')", async () => {
    (globalThis as { terrain?: unknown }).terrain = undefined;
    (globalThis as { document?: unknown }).document = {
      getElementById(id: string) {
        return id === "terrain" ? root : null;
      },
    };

    const result = await clearReliefIconsTool.execute({
      type: "#relief-mount-1",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: "#relief-mount-1",
      removed_count: 2,
    });
    // Hill survives.
    expect(root.children.map((c) => c.href)).toEqual(["#relief-hill-1"]);
  });

  it("falls back when window.terrain.node() returns null", async () => {
    (globalThis as { terrain?: unknown }).terrain = { node: () => null };
    (globalThis as { document?: unknown }).document = {
      getElementById(id: string) {
        return id === "terrain" ? root : null;
      },
    };

    const result = await clearReliefIconsTool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: null,
      removed_count: 3,
    });
  });

  it("errors when neither window.terrain nor #terrain element exists", async () => {
    (globalThis as { terrain?: unknown }).terrain = undefined;
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };

    const result = await clearReliefIconsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Terrain/);
  });

  it("defaultClearReliefIconsRuntime.getTerrainRoot returns null when nothing is present", () => {
    (globalThis as { terrain?: unknown }).terrain = undefined;
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    expect(defaultClearReliefIconsRuntime.getTerrainRoot()).toBeNull();
  });
});
