import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CountReliefIconsRuntime,
  countReliefIconsTool,
  createCountReliefIconsTool,
  defaultCountReliefIconsRuntime,
  type ReliefIconTypeCount,
} from "./count-relief-icons";
import { ToolRegistry } from "./index";

/**
 * Build a minimal Element-like terrain root that satisfies the runtime
 * contract (it only calls `querySelectorAll("use")` and reads
 * `getAttribute("href")` on each child).
 *
 * Pass `undefined` as a child's href to simulate a `<use>` without an
 * `href` attribute (DOM `getAttribute` returns `null`); we expect the
 * tool to skip those entries.
 */
function makeTerrain(uses: Array<string | undefined>): Element {
  const nodes = uses.map((href) => ({
    getAttribute(name: string): string | null {
      if (name === "href" && href !== undefined) return href;
      return null;
    },
  }));
  // Cast through unknown — we only use querySelectorAll and getAttribute
  // and don't need a fully-typed Element.
  return {
    querySelectorAll(selector: string) {
      // We expect "use" — sanity-check it.
      if (selector !== "use") {
        throw new Error(`unexpected selector: ${selector}`);
      }
      return nodes as unknown as NodeListOf<Element>;
    },
  } as unknown as Element;
}

function makeRuntime(root: Element | null): CountReliefIconsRuntime {
  return {
    getTerrainRoot: () => root,
  };
}

describe("count_relief_icons tool metadata", () => {
  it("has the right name and an optional `type` schema", () => {
    expect(countReliefIconsTool.name).toBe("count_relief_icons");
    expect(countReliefIconsTool.input_schema).toEqual({
      type: "object",
      properties: {
        type: {
          type: "string",
          description: expect.any(String),
        },
      },
    });
  });

  it("createCountReliefIconsTool() round-trips an equivalent tool", () => {
    const built = createCountReliefIconsTool();
    expect(built.name).toBe(countReliefIconsTool.name);
    expect(built.description).toBe(countReliefIconsTool.description);
    expect(built.input_schema).toEqual(countReliefIconsTool.input_schema);
  });

  it("registers and round-trips through ToolRegistry", () => {
    const registry = new ToolRegistry();
    registry.register(countReliefIconsTool);
    const tools = registry.list();
    expect(tools.find((t) => t.name === "count_relief_icons")).toBeDefined();
  });
});

describe("count_relief_icons tool", () => {
  it("happy path: counts and groups icons by type, sorted by count desc", async () => {
    const root = makeTerrain([
      "#relief-mount-1",
      "#relief-mount-1",
      "#relief-mount-1",
      "#relief-hill-1",
      "#relief-hill-1",
      "#relief-swamp-1",
    ]);
    const tool = createCountReliefIconsTool(makeRuntime(root));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.total).toBe(6);
    expect(body.by_type as ReliefIconTypeCount[]).toEqual([
      { type: "#relief-mount-1", count: 3 },
      { type: "#relief-hill-1", count: 2 },
      { type: "#relief-swamp-1", count: 1 },
    ]);
    expect(body.filtered_type).toBeUndefined();
  });

  it("sort tie-break: equal counts ordered by type ascending", async () => {
    const root = makeTerrain([
      "#relief-mount-1",
      "#relief-mount-1",
      "#relief-hill-1",
      "#relief-hill-1",
    ]);
    const tool = createCountReliefIconsTool(makeRuntime(root));
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.by_type).toEqual([
      { type: "#relief-hill-1", count: 2 },
      { type: "#relief-mount-1", count: 2 },
    ]);
  });

  it("filter restricts the breakdown but keeps total unfiltered", async () => {
    const root = makeTerrain([
      "#relief-mount-1",
      "#relief-mount-1",
      "#relief-mount-1",
      "#relief-hill-1",
      "#relief-hill-1",
      "#relief-swamp-1",
    ]);
    const tool = createCountReliefIconsTool(makeRuntime(root));
    const body = JSON.parse(
      (await tool.execute({ type: "#relief-mount-1" })).content,
    );
    expect(body.ok).toBe(true);
    expect(body.total).toBe(6);
    expect(body.by_type).toEqual([{ type: "#relief-mount-1", count: 3 }]);
    expect(body.filtered_type).toBe("#relief-mount-1");
  });

  it("filter that matches no icons returns count: 0 (and total still reflects all)", async () => {
    const root = makeTerrain(["#relief-mount-1", "#relief-mount-1"]);
    const tool = createCountReliefIconsTool(makeRuntime(root));
    const body = JSON.parse(
      (await tool.execute({ type: "#relief-cactus-1" })).content,
    );
    expect(body.ok).toBe(true);
    expect(body.total).toBe(2);
    expect(body.by_type).toEqual([{ type: "#relief-cactus-1", count: 0 }]);
    expect(body.filtered_type).toBe("#relief-cactus-1");
  });

  it("empty terrain: total 0, by_type empty, no filtered_type when no filter", async () => {
    const root = makeTerrain([]);
    const tool = createCountReliefIconsTool(makeRuntime(root));
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({ ok: true, total: 0, by_type: [] });
  });

  it("skips <use> elements that have no href attribute", async () => {
    const root = makeTerrain([
      "#relief-mount-1",
      undefined, // no href -> skip
      "#relief-mount-1",
      undefined,
      "#relief-hill-1",
    ]);
    const tool = createCountReliefIconsTool(makeRuntime(root));
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.total).toBe(3);
    expect(body.by_type).toEqual([
      { type: "#relief-mount-1", count: 2 },
      { type: "#relief-hill-1", count: 1 },
    ]);
  });

  it("accepts no-arg / null / undefined input uniformly", async () => {
    const root = makeTerrain(["#relief-mount-1"]);
    const tool = createCountReliefIconsTool(makeRuntime(root));
    for (const input of [{}, null, undefined]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      expect(body.ok).toBe(true);
      expect(body.total).toBe(1);
      expect(body.filtered_type).toBeUndefined();
    }
  });

  it("treats type: null as no filter", async () => {
    const root = makeTerrain(["#relief-mount-1", "#relief-hill-1"]);
    const tool = createCountReliefIconsTool(makeRuntime(root));
    const body = JSON.parse((await tool.execute({ type: null })).content);
    expect(body.filtered_type).toBeUndefined();
    expect(body.by_type).toHaveLength(2);
  });

  it("rejects non-string `type`", async () => {
    const root = makeTerrain(["#relief-mount-1"]);
    const tool = createCountReliefIconsTool(makeRuntime(root));
    for (const bad of [42, true, ["#relief-mount-1"], { type: "x" }]) {
      const result = await tool.execute({ type: bad });
      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content);
      expect(body.ok).toBe(false);
      expect(body.error).toBe("type must be a string.");
    }
  });

  it("rejects `type` without leading '#'", async () => {
    const root = makeTerrain(["#relief-mount-1"]);
    const tool = createCountReliefIconsTool(makeRuntime(root));
    const result = await tool.execute({ type: "relief-mount-1" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content)).toEqual({
      ok: false,
      error: "type must start with '#'.",
    });
  });

  it("rejects empty-string `type` (does not start with '#')", async () => {
    const root = makeTerrain(["#relief-mount-1"]);
    const tool = createCountReliefIconsTool(makeRuntime(root));
    const result = await tool.execute({ type: "" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("type must start with '#'.");
  });

  it("errors when terrain root is unavailable", async () => {
    const tool = createCountReliefIconsTool(makeRuntime(null));
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Terrain layer is unavailable/i);
  });
});

describe("defaultCountReliefIconsRuntime (integration)", () => {
  const originalTerrain = (globalThis as { terrain?: unknown }).terrain;
  const originalDoc = (globalThis as { document?: unknown }).document;

  afterEach(() => {
    (globalThis as { terrain?: unknown }).terrain = originalTerrain;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("reads from window.terrain.node() when present", async () => {
    const root = makeTerrain(["#relief-mount-1", "#relief-mount-1"]);
    (globalThis as { terrain?: unknown }).terrain = {
      node: () => root,
    };
    const result = await countReliefIconsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(2);
    expect(body.by_type).toEqual([{ type: "#relief-mount-1", count: 2 }]);
  });

  it("falls back to document.getElementById('terrain') when terrain selection is absent", async () => {
    (globalThis as { terrain?: unknown }).terrain = undefined;
    const root = makeTerrain(["#relief-hill-1"]);
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => (id === "terrain" ? root : null),
    };
    const result = await countReliefIconsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.total).toBe(1);
    expect(body.by_type).toEqual([{ type: "#relief-hill-1", count: 1 }]);
  });

  it("errors when neither window.terrain nor #terrain element is available", async () => {
    (globalThis as { terrain?: unknown }).terrain = undefined;
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    const result = await countReliefIconsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Terrain layer is unavailable/i,
    );
  });

  it("falls back through to DOM when terrain.node() returns null", async () => {
    const root = makeTerrain(["#relief-swamp-1"]);
    (globalThis as { terrain?: unknown }).terrain = {
      node: () => null,
    };
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => (id === "terrain" ? root : null),
    };
    const body = JSON.parse((await countReliefIconsTool.execute({})).content);
    expect(body.total).toBe(1);
  });
});

describe("defaultCountReliefIconsRuntime (no document)", () => {
  let originalTerrain: unknown;
  let originalDoc: unknown;

  beforeEach(() => {
    originalTerrain = (globalThis as { terrain?: unknown }).terrain;
    originalDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { terrain?: unknown }).terrain = undefined;
    (globalThis as { document?: unknown }).document = undefined;
  });

  afterEach(() => {
    (globalThis as { terrain?: unknown }).terrain = originalTerrain;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("errors when neither terrain selection nor document exists", async () => {
    expect(defaultCountReliefIconsRuntime.getTerrainRoot()).toBeNull();
    const result = await countReliefIconsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Terrain layer is unavailable/i,
    );
  });
});
