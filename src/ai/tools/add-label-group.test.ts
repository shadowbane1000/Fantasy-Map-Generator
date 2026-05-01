import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AddLabelGroupRuntime,
  addLabelGroupTool,
  createAddLabelGroupTool,
} from "./add-label-group";
import { ToolRegistry } from "./index";

function makeRuntime(
  exists: (id: string) => { exists: boolean; tag?: string } = () => ({
    exists: false,
  }),
): {
  runtime: AddLabelGroupRuntime;
  idExists: ReturnType<typeof vi.fn<AddLabelGroupRuntime["idExists"]>>;
  appendGroup: ReturnType<typeof vi.fn<AddLabelGroupRuntime["appendGroup"]>>;
} {
  const idExists = vi.fn<AddLabelGroupRuntime["idExists"]>(exists);
  const appendGroup = vi.fn<AddLabelGroupRuntime["appendGroup"]>();
  return {
    runtime: { idExists, appendGroup },
    idExists,
    appendGroup,
  };
}

describe("add_label_group tool", () => {
  it("happy path: creates group with sanitized id", async () => {
    const { runtime, idExists, appendGroup } = makeRuntime();
    const tool = createAddLabelGroupTool(runtime);
    const result = await tool.execute({ name: "Regions" });
    expect(result.isError).toBeFalsy();
    expect(idExists).toHaveBeenCalledWith("regions");
    expect(appendGroup).toHaveBeenCalledWith("regions");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "regions",
    });
  });

  it("sanitizes spaces and special characters", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddLabelGroupTool(runtime);
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
    const tool = createAddLabelGroupTool(runtime);
    const result = await tool.execute({ name: "foo" });
    expect(result.isError).toBeFalsy();
    expect(appendGroup).toHaveBeenCalledWith("foo");
    expect(appendGroup).not.toHaveBeenCalledWith("route-foo");
    expect(JSON.parse(result.content).id).toBe("foo");
  });

  it("rejects non-string name", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddLabelGroupTool(runtime);
    for (const bad of [undefined, null, 42, true, {}, []]) {
      const r = await tool.execute({ name: bad });
      expect(r.isError).toBe(true);
    }
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace-only name", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddLabelGroupTool(runtime);
    for (const bad of ["", "   ", "\t\n"]) {
      const r = await tool.execute({ name: bad });
      expect(r.isError).toBe(true);
    }
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects a name that sanitizes to empty (all punctuation)", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddLabelGroupTool(runtime);
    const result = await tool.execute({ name: "!!!" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/sanitized to empty/i);
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects a sanitized name that starts with a digit", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddLabelGroupTool(runtime);
    const result = await tool.execute({ name: "9foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/start with a letter/i);
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects when the resulting id already exists (with tag info)", async () => {
    const { runtime, appendGroup } = makeRuntime((id) =>
      id === "states" ? { exists: true, tag: "g" } : { exists: false },
    );
    const tool = createAddLabelGroupTool(runtime);
    const result = await tool.execute({ name: "states" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/already exists/);
    expect(body.error).toMatch(/<g>/);
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects collision with no tag info (still says already exists)", async () => {
    const { runtime, appendGroup } = makeRuntime(() => ({ exists: true }));
    const tool = createAddLabelGroupTool(runtime);
    const result = await tool.execute({ name: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/already exists/);
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("surfaces appendGroup failures", async () => {
    const runtime: AddLabelGroupRuntime = {
      idExists: () => ({ exists: false }),
      appendGroup: vi.fn(() => {
        throw new Error("labels layer missing");
      }),
    };
    const tool = createAddLabelGroupTool(runtime);
    const result = await tool.execute({ name: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/labels layer missing/);
  });

  it("has the expected tool name", () => {
    expect(addLabelGroupTool.name).toBe("add_label_group");
  });

  it("registers and round-trips through ToolRegistry", async () => {
    const registry = new ToolRegistry();
    registry.register(addLabelGroupTool);
    const tools = registry.list();
    expect(tools.find((t) => t.name === "add_label_group")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Integration tests for defaultAddLabelGroupRuntime: wire up a tiny fake DOM
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

describe("defaultAddLabelGroupRuntime (integration)", () => {
  const originalLabels = (globalThis as { labels?: unknown }).labels;
  const originalDoc = (globalThis as { document?: unknown }).document;

  let labelsRoot: FakeNode;
  let elementsById: Record<string, FakeNode>;
  let createElementNSCalls: Array<{ ns: string; name: string }>;

  beforeEach(() => {
    labelsRoot = makeFakeNode("g", "labels");
    elementsById = { labels: labelsRoot };
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
    (globalThis as { labels?: unknown }).labels = originalLabels;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("D3 path: appends a <g> with the new id when window.labels is present", async () => {
    (globalThis as { labels?: unknown }).labels = {
      node: () => labelsRoot,
    };
    const result = await addLabelGroupTool.execute({ name: "regions" });
    expect(result.isError).toBeFalsy();
    expect(labelsRoot.children).toHaveLength(1);
    expect(labelsRoot.children[0].tagName).toBe("g");
    expect(labelsRoot.children[0].id).toBe("regions");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "regions",
    });
  });

  it("DOM fallback: succeeds when window.labels is absent but #labels element exists", async () => {
    (globalThis as { labels?: unknown }).labels = undefined;
    const result = await addLabelGroupTool.execute({ name: "landmarks" });
    expect(result.isError).toBeFalsy();
    expect(labelsRoot.children).toHaveLength(1);
    expect(labelsRoot.children[0].id).toBe("landmarks");
  });

  it("inherits attributes from #states when present", async () => {
    (globalThis as { labels?: unknown }).labels = undefined;
    const states = makeFakeNode("g", "states", {
      "font-family": "Almendra SC",
      "font-size": "1",
      fill: "#3e3e4b",
    });
    elementsById.states = states;
    labelsRoot.children.push(states);

    const result = await addLabelGroupTool.execute({ name: "regions" });
    expect(result.isError).toBeFalsy();
    // states is index 0; the new <g> is appended at index 1.
    expect(labelsRoot.children).toHaveLength(2);
    const newGroup = labelsRoot.children[1];
    expect(newGroup.id).toBe("regions");
    expect(newGroup.getAttribute("font-family")).toBe("Almendra SC");
    expect(newGroup.getAttribute("font-size")).toBe("1");
    expect(newGroup.getAttribute("fill")).toBe("#3e3e4b");
    // No createElementNS call: we used the clone path.
    expect(createElementNSCalls).toHaveLength(0);
  });

  it("falls back to createElementNS when no #states template exists", async () => {
    (globalThis as { labels?: unknown }).labels = undefined;
    const result = await addLabelGroupTool.execute({ name: "landmarks" });
    expect(result.isError).toBeFalsy();
    expect(createElementNSCalls).toEqual([
      { ns: "http://www.w3.org/2000/svg", name: "g" },
    ]);
  });

  it("errors when neither window.labels nor #labels element are available", async () => {
    (globalThis as { labels?: unknown }).labels = undefined;
    elementsById = {}; // no #labels anywhere
    const result = await addLabelGroupTool.execute({ name: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/#labels.*unavailable/i);
  });

  it("collision: rejects when an existing <g id='states'> blocks the id", async () => {
    (globalThis as { labels?: unknown }).labels = undefined;
    const states = makeFakeNode("g", "states");
    elementsById.states = states;
    labelsRoot.children.push(states);

    const before = labelsRoot.children.length;
    const result = await addLabelGroupTool.execute({ name: "states" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/already exists/);
    expect(body.error).toMatch(/<g>/);
    expect(labelsRoot.children).toHaveLength(before);
  });

  it("collision: rejects when an unrelated element elsewhere has the same id (global byId semantics)", async () => {
    (globalThis as { labels?: unknown }).labels = undefined;
    const stranger = makeFakeNode("input", "custom_group");
    elementsById.custom_group = stranger;

    const result = await addLabelGroupTool.execute({ name: "custom_group" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/already exists/);
    expect(body.error).toMatch(/<input>/);
    // No new group appended.
    expect(labelsRoot.children).toHaveLength(0);
  });
});
