import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AddCoastlineGroupRuntime,
  addCoastlineGroupTool,
  createAddCoastlineGroupTool,
} from "./add-coastline-group";
import { ToolRegistry } from "./index";

function makeRuntime(
  exists: (id: string) => { exists: boolean; tag?: string } = () => ({
    exists: false,
  }),
  clonedFrom: string | null = "sea_island",
): {
  runtime: AddCoastlineGroupRuntime;
  idExists: ReturnType<typeof vi.fn<AddCoastlineGroupRuntime["idExists"]>>;
  appendGroup: ReturnType<
    typeof vi.fn<AddCoastlineGroupRuntime["appendGroup"]>
  >;
} {
  const idExists = vi.fn<AddCoastlineGroupRuntime["idExists"]>(exists);
  const appendGroup = vi.fn<AddCoastlineGroupRuntime["appendGroup"]>(() => ({
    clonedFrom,
  }));
  return {
    runtime: { idExists, appendGroup },
    idExists,
    appendGroup,
  };
}

describe("add_coastline_group tool", () => {
  it("happy path: creates group with sanitized id and cloned_from sea_island", async () => {
    const { runtime, idExists, appendGroup } = makeRuntime();
    const tool = createAddCoastlineGroupTool(runtime);
    const result = await tool.execute({ name: "Shipping Lanes" });
    expect(result.isError).toBeFalsy();
    expect(idExists).toHaveBeenCalledWith("shipping_lanes");
    expect(appendGroup).toHaveBeenCalledWith("shipping_lanes");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "shipping_lanes",
      cloned_from: "sea_island",
    });
  });

  it("sanitizes spaces and special characters", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddCoastlineGroupTool(runtime);
    const result = await tool.execute({ name: "Storm Coast!" });
    expect(result.isError).toBeFalsy();
    expect(appendGroup).toHaveBeenCalledWith("storm_coast");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "storm_coast",
      cloned_from: "sea_island",
    });
  });

  it("does NOT prefix the id with 'coast-' or any other prefix (regression guard)", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddCoastlineGroupTool(runtime);
    const result = await tool.execute({ name: "foo" });
    expect(result.isError).toBeFalsy();
    expect(appendGroup).toHaveBeenCalledWith("foo");
    expect(appendGroup).not.toHaveBeenCalledWith("coast-foo");
    expect(JSON.parse(result.content).id).toBe("foo");
  });

  it("rejects non-string name", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddCoastlineGroupTool(runtime);
    for (const bad of [undefined, null, 42, true, {}, []]) {
      const r = await tool.execute({ name: bad });
      expect(r.isError).toBe(true);
    }
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace-only name", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddCoastlineGroupTool(runtime);
    for (const bad of ["", "   ", "\t\n"]) {
      const r = await tool.execute({ name: bad });
      expect(r.isError).toBe(true);
    }
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects a name that sanitizes to empty (all punctuation)", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddCoastlineGroupTool(runtime);
    const result = await tool.execute({ name: "!!!" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/sanitized to empty/i);
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects a sanitized name that starts with a digit", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddCoastlineGroupTool(runtime);
    const result = await tool.execute({ name: "9foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/start with a letter/i);
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects when the resulting id already exists (with tag info)", async () => {
    const { runtime, appendGroup } = makeRuntime((id) =>
      id === "sea_island" ? { exists: true, tag: "g" } : { exists: false },
    );
    const tool = createAddCoastlineGroupTool(runtime);
    const result = await tool.execute({ name: "sea_island" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/already exists/);
    expect(body.error).toMatch(/<g>/);
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects collision with no tag info (still says already exists)", async () => {
    const { runtime, appendGroup } = makeRuntime(() => ({ exists: true }));
    const tool = createAddCoastlineGroupTool(runtime);
    const result = await tool.execute({ name: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/already exists/);
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("surfaces appendGroup failures", async () => {
    const runtime: AddCoastlineGroupRuntime = {
      idExists: () => ({ exists: false }),
      appendGroup: vi.fn(() => {
        throw new Error("coastline layer missing");
      }),
    };
    const tool = createAddCoastlineGroupTool(runtime);
    const result = await tool.execute({ name: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/coastline layer missing/);
  });

  it("has the expected tool name", () => {
    expect(addCoastlineGroupTool.name).toBe("add_coastline_group");
  });

  it("registers and round-trips through ToolRegistry", async () => {
    const registry = new ToolRegistry();
    registry.register(addCoastlineGroupTool);
    const tools = registry.list();
    expect(tools.find((t) => t.name === "add_coastline_group")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Integration tests for defaultAddCoastlineGroupRuntime: wire up a tiny fake
// DOM and exercise the real defaults.
// ---------------------------------------------------------------------------

interface FakeAttrMap {
  [key: string]: string;
}

interface FakeNode {
  tagName: string;
  id: string;
  _attrs: FakeAttrMap;
  children: FakeNode[];
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
  appendChild: (node: FakeNode) => FakeNode;
  cloneNode: (deep: boolean) => FakeNode;
}

function makeFakeNode(
  tagName: string,
  id = "",
  attrs: FakeAttrMap = {},
): FakeNode {
  const node: FakeNode = {
    tagName,
    id,
    _attrs: { ...attrs },
    children: [],
    setAttribute(name: string, value: string) {
      this._attrs[name] = value;
      if (name === "id") this.id = value;
    },
    getAttribute(name: string): string | null {
      return Object.hasOwn(this._attrs, name) ? this._attrs[name] : null;
    },
    appendChild(child: FakeNode) {
      this.children.push(child);
      return child;
    },
    cloneNode(_deep: boolean) {
      // Shallow clone: copy tagName + attrs (incl. id), but no children.
      return makeFakeNode(this.tagName, this.id, this._attrs);
    },
  };
  if (id) node._attrs.id = id;
  return node;
}

describe("defaultAddCoastlineGroupRuntime (integration)", () => {
  const originalCoastline = (globalThis as { coastline?: unknown }).coastline;
  const originalDoc = (globalThis as { document?: unknown }).document;

  let coastlineRoot: FakeNode;
  let elementsById: Record<string, FakeNode>;
  let createElementNSCalls: Array<{ ns: string; name: string }>;

  beforeEach(() => {
    coastlineRoot = makeFakeNode("g", "coastline");
    elementsById = { coastline: coastlineRoot };
    createElementNSCalls = [];
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => elementsById[id] ?? null,
      createElementNS: (ns: string, name: string) => {
        createElementNSCalls.push({ ns, name });
        return makeFakeNode(name);
      },
      createElement: (name: string) => makeFakeNode(name),
    };
  });

  afterEach(() => {
    (globalThis as { coastline?: unknown }).coastline = originalCoastline;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("D3 path: appends a <g> with the new id when window.coastline is present", async () => {
    (globalThis as { coastline?: unknown }).coastline = {
      node: () => coastlineRoot,
    };
    const result = await addCoastlineGroupTool.execute({
      name: "shipping_lanes",
    });
    expect(result.isError).toBeFalsy();
    expect(coastlineRoot.children).toHaveLength(1);
    expect(coastlineRoot.children[0].tagName).toBe("g");
    expect(coastlineRoot.children[0].id).toBe("shipping_lanes");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "shipping_lanes",
      cloned_from: null,
    });
  });

  it("DOM fallback: succeeds when window.coastline is absent but #coastline element exists", async () => {
    (globalThis as { coastline?: unknown }).coastline = undefined;
    const result = await addCoastlineGroupTool.execute({ name: "marsh_edge" });
    expect(result.isError).toBeFalsy();
    expect(coastlineRoot.children).toHaveLength(1);
    expect(coastlineRoot.children[0].id).toBe("marsh_edge");
  });

  it("inherits attributes from #sea_island when present, sets new id explicitly", async () => {
    (globalThis as { coastline?: unknown }).coastline = undefined;
    const seaIsland = makeFakeNode("g", "sea_island", {
      fill: "#a6c4e0",
      stroke: "#5a87b5",
    });
    elementsById.sea_island = seaIsland;
    coastlineRoot.children.push(seaIsland);

    const result = await addCoastlineGroupTool.execute({
      name: "shipping_lanes",
    });
    expect(result.isError).toBeFalsy();
    // sea_island is index 0; the new <g> is appended at index 1.
    expect(coastlineRoot.children).toHaveLength(2);
    const newGroup = coastlineRoot.children[1];
    // Critical: even though we cloned from sea_island, the new id must
    // be set explicitly so we don't end up with two <g id="sea_island">.
    expect(newGroup.id).toBe("shipping_lanes");
    expect(newGroup.id).not.toBe("sea_island");
    expect(newGroup.getAttribute("fill")).toBe("#a6c4e0");
    expect(newGroup.getAttribute("stroke")).toBe("#5a87b5");
    // Sanity: sea_island itself was not renamed.
    expect(seaIsland.id).toBe("sea_island");
    // No createElementNS call: we used the clone path.
    expect(createElementNSCalls).toHaveLength(0);
    // Result includes cloned_from: "sea_island".
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "shipping_lanes",
      cloned_from: "sea_island",
    });
  });

  it("falls back to createElementNS when no #sea_island template exists", async () => {
    (globalThis as { coastline?: unknown }).coastline = undefined;
    const result = await addCoastlineGroupTool.execute({ name: "marsh_edge" });
    expect(result.isError).toBeFalsy();
    expect(createElementNSCalls).toEqual([
      { ns: "http://www.w3.org/2000/svg", name: "g" },
    ]);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "marsh_edge",
      cloned_from: null,
    });
  });

  it("errors when neither window.coastline nor #coastline element are available", async () => {
    (globalThis as { coastline?: unknown }).coastline = undefined;
    elementsById = {}; // no #coastline anywhere
    const result = await addCoastlineGroupTool.execute({ name: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /#coastline.*unavailable/i,
    );
  });

  it("collision: rejects when an existing <g id='sea_island'> blocks the id", async () => {
    (globalThis as { coastline?: unknown }).coastline = undefined;
    const seaIsland = makeFakeNode("g", "sea_island");
    elementsById.sea_island = seaIsland;
    coastlineRoot.children.push(seaIsland);

    const before = coastlineRoot.children.length;
    const result = await addCoastlineGroupTool.execute({ name: "sea_island" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/already exists/);
    expect(body.error).toMatch(/<g>/);
    expect(coastlineRoot.children).toHaveLength(before);
  });

  it("collision: rejects when an unrelated element elsewhere has the same id (global byId semantics)", async () => {
    (globalThis as { coastline?: unknown }).coastline = undefined;
    const stranger = makeFakeNode("input", "storm_coast");
    elementsById.storm_coast = stranger;

    const result = await addCoastlineGroupTool.execute({
      name: "Storm Coast",
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/already exists/);
    expect(body.error).toMatch(/<input>/);
    // No new group appended.
    expect(coastlineRoot.children).toHaveLength(0);
  });
});
