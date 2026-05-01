import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AddLakeGroupRuntime,
  addLakeGroupTool,
  createAddLakeGroupTool,
} from "./add-lake-group";
import { ToolRegistry } from "./index";

function makeRuntime(
  exists: (id: string) => { exists: boolean; tag?: string } = () => ({
    exists: false,
  }),
): {
  runtime: AddLakeGroupRuntime;
  idExists: ReturnType<typeof vi.fn<AddLakeGroupRuntime["idExists"]>>;
  appendGroup: ReturnType<typeof vi.fn<AddLakeGroupRuntime["appendGroup"]>>;
} {
  const idExists = vi.fn<AddLakeGroupRuntime["idExists"]>(exists);
  const appendGroup = vi.fn<AddLakeGroupRuntime["appendGroup"]>();
  return {
    runtime: { idExists, appendGroup },
    idExists,
    appendGroup,
  };
}

describe("add_lake_group tool", () => {
  it("happy path: creates group with sanitized id", async () => {
    const { runtime, idExists, appendGroup } = makeRuntime();
    const tool = createAddLakeGroupTool(runtime);
    const result = await tool.execute({ name: "Wetlands" });
    expect(result.isError).toBeFalsy();
    expect(idExists).toHaveBeenCalledWith("wetlands");
    expect(appendGroup).toHaveBeenCalledWith("wetlands");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "wetlands",
    });
  });

  it("sanitizes spaces and special characters", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddLakeGroupTool(runtime);
    const result = await tool.execute({ name: "My Cool Group!" });
    expect(result.isError).toBeFalsy();
    expect(appendGroup).toHaveBeenCalledWith("my_cool_group");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "my_cool_group",
    });
  });

  it("does NOT prefix the id with 'route-' (regression guard)", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddLakeGroupTool(runtime);
    const result = await tool.execute({ name: "foo" });
    expect(result.isError).toBeFalsy();
    expect(appendGroup).toHaveBeenCalledWith("foo");
    expect(appendGroup).not.toHaveBeenCalledWith("route-foo");
    expect(JSON.parse(result.content).id).toBe("foo");
  });

  it("rejects non-string name", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddLakeGroupTool(runtime);
    for (const bad of [undefined, null, 42, true, {}, []]) {
      const r = await tool.execute({ name: bad });
      expect(r.isError).toBe(true);
    }
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace-only name", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddLakeGroupTool(runtime);
    for (const bad of ["", "   ", "\t\n"]) {
      const r = await tool.execute({ name: bad });
      expect(r.isError).toBe(true);
    }
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects a name that sanitizes to empty (all punctuation)", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddLakeGroupTool(runtime);
    const result = await tool.execute({ name: "!!!" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/sanitized to empty/i);
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects a sanitized name that starts with a digit", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddLakeGroupTool(runtime);
    const result = await tool.execute({ name: "9foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/start with a letter/i);
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects when the resulting id already exists (with tag info)", async () => {
    const { runtime, appendGroup } = makeRuntime((id) =>
      id === "freshwater" ? { exists: true, tag: "g" } : { exists: false },
    );
    const tool = createAddLakeGroupTool(runtime);
    const result = await tool.execute({ name: "freshwater" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/already exists/);
    expect(body.error).toMatch(/<g>/);
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects collision with no tag info (still says already exists)", async () => {
    const { runtime, appendGroup } = makeRuntime(() => ({ exists: true }));
    const tool = createAddLakeGroupTool(runtime);
    const result = await tool.execute({ name: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/already exists/);
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("surfaces appendGroup failures", async () => {
    const runtime: AddLakeGroupRuntime = {
      idExists: () => ({ exists: false }),
      appendGroup: vi.fn(() => {
        throw new Error("lakes layer missing");
      }),
    };
    const tool = createAddLakeGroupTool(runtime);
    const result = await tool.execute({ name: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/lakes layer missing/);
  });

  it("has the expected tool name", () => {
    expect(addLakeGroupTool.name).toBe("add_lake_group");
  });

  it("registers and round-trips through ToolRegistry", async () => {
    const registry = new ToolRegistry();
    registry.register(addLakeGroupTool);
    const tools = registry.list();
    expect(tools.find((t) => t.name === "add_lake_group")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Integration tests for defaultAddLakeGroupRuntime: wire up a tiny fake DOM
// and exercise the real defaults.
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

describe("defaultAddLakeGroupRuntime (integration)", () => {
  const originalLakes = (globalThis as { lakes?: unknown }).lakes;
  const originalDoc = (globalThis as { document?: unknown }).document;

  let lakesRoot: FakeNode;
  let elementsById: Record<string, FakeNode>;
  let createElementNSCalls: Array<{ ns: string; name: string }>;

  beforeEach(() => {
    lakesRoot = makeFakeNode("g", "lakes");
    elementsById = { lakes: lakesRoot };
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
    (globalThis as { lakes?: unknown }).lakes = originalLakes;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("D3 path: appends a <g> with the new id when window.lakes is present", async () => {
    (globalThis as { lakes?: unknown }).lakes = {
      node: () => lakesRoot,
    };
    const result = await addLakeGroupTool.execute({ name: "wetlands" });
    expect(result.isError).toBeFalsy();
    expect(lakesRoot.children).toHaveLength(1);
    expect(lakesRoot.children[0].tagName).toBe("g");
    expect(lakesRoot.children[0].id).toBe("wetlands");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "wetlands",
    });
  });

  it("DOM fallback: succeeds when window.lakes is absent but #lakes element exists", async () => {
    (globalThis as { lakes?: unknown }).lakes = undefined;
    const result = await addLakeGroupTool.execute({ name: "marsh" });
    expect(result.isError).toBeFalsy();
    expect(lakesRoot.children).toHaveLength(1);
    expect(lakesRoot.children[0].id).toBe("marsh");
  });

  it("inherits attributes from #freshwater when present", async () => {
    (globalThis as { lakes?: unknown }).lakes = undefined;
    const freshwater = makeFakeNode("g", "freshwater", {
      fill: "#a6c4e0",
      stroke: "#5a87b5",
    });
    elementsById.freshwater = freshwater;
    lakesRoot.children.push(freshwater);

    const result = await addLakeGroupTool.execute({ name: "wetlands" });
    expect(result.isError).toBeFalsy();
    // freshwater is index 0; the new <g> is appended at index 1.
    expect(lakesRoot.children).toHaveLength(2);
    const newGroup = lakesRoot.children[1];
    expect(newGroup.id).toBe("wetlands");
    expect(newGroup.getAttribute("fill")).toBe("#a6c4e0");
    expect(newGroup.getAttribute("stroke")).toBe("#5a87b5");
    // No createElementNS call: we used the clone path.
    expect(createElementNSCalls).toHaveLength(0);
  });

  it("falls back to createElementNS when no #freshwater template exists", async () => {
    (globalThis as { lakes?: unknown }).lakes = undefined;
    const result = await addLakeGroupTool.execute({ name: "marsh" });
    expect(result.isError).toBeFalsy();
    expect(createElementNSCalls).toEqual([
      { ns: "http://www.w3.org/2000/svg", name: "g" },
    ]);
  });

  it("errors when neither window.lakes nor #lakes element are available", async () => {
    (globalThis as { lakes?: unknown }).lakes = undefined;
    elementsById = {}; // no #lakes anywhere
    const result = await addLakeGroupTool.execute({ name: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/#lakes.*unavailable/i);
  });

  it("collision: rejects when an existing <g id='freshwater'> blocks the id", async () => {
    (globalThis as { lakes?: unknown }).lakes = undefined;
    const freshwater = makeFakeNode("g", "freshwater");
    elementsById.freshwater = freshwater;
    lakesRoot.children.push(freshwater);

    const before = lakesRoot.children.length;
    const result = await addLakeGroupTool.execute({ name: "freshwater" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/already exists/);
    expect(body.error).toMatch(/<g>/);
    expect(lakesRoot.children).toHaveLength(before);
  });

  it("collision: rejects when an unrelated element elsewhere has the same id (global byId semantics)", async () => {
    (globalThis as { lakes?: unknown }).lakes = undefined;
    const stranger = makeFakeNode("input", "custom_group");
    elementsById.custom_group = stranger;

    const result = await addLakeGroupTool.execute({ name: "custom_group" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/already exists/);
    expect(body.error).toMatch(/<input>/);
    // No new group appended.
    expect(lakesRoot.children).toHaveLength(0);
  });
});
