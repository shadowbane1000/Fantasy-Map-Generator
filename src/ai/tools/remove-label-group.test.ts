import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  BASIC_LABEL_GROUPS,
  createRemoveLabelGroupTool,
  defaultRemoveLabelGroupRuntime,
  type RemoveLabelGroupRuntime,
  removeLabelGroupTool,
} from "./remove-label-group";

interface FakeRuntimeHandles {
  runtime: RemoveLabelGroupRuntime;
  groupExists: ReturnType<typeof vi.fn<RemoveLabelGroupRuntime["groupExists"]>>;
  removeAllLabelsAndTextpaths: ReturnType<
    typeof vi.fn<RemoveLabelGroupRuntime["removeAllLabelsAndTextpaths"]>
  >;
  removeGroupElement: ReturnType<
    typeof vi.fn<RemoveLabelGroupRuntime["removeGroupElement"]>
  >;
}

function makeRuntime(
  overrides: Partial<RemoveLabelGroupRuntime> = {},
): FakeRuntimeHandles {
  const groupExists = vi.fn<RemoveLabelGroupRuntime["groupExists"]>(
    overrides.groupExists ?? (() => true),
  );
  const removeAllLabelsAndTextpaths = vi.fn<
    RemoveLabelGroupRuntime["removeAllLabelsAndTextpaths"]
  >(
    overrides.removeAllLabelsAndTextpaths ??
      (() => ({ labelsRemoved: 0, textpathsRemoved: 0 })),
  );
  const removeGroupElement = vi.fn<
    RemoveLabelGroupRuntime["removeGroupElement"]
  >(overrides.removeGroupElement ?? (() => true));
  return {
    runtime: {
      groupExists,
      removeAllLabelsAndTextpaths,
      removeGroupElement,
    },
    groupExists,
    removeAllLabelsAndTextpaths,
    removeGroupElement,
  };
}

describe("remove_label_group tool metadata", () => {
  it("has the right name and schema", () => {
    expect(removeLabelGroupTool.name).toBe("remove_label_group");
    expect(removeLabelGroupTool.input_schema).toMatchObject({
      type: "object",
      required: ["group"],
    });
    expect(removeLabelGroupTool.input_schema.properties).toHaveProperty(
      "group",
    );
  });

  it("createRemoveLabelGroupTool produces an equivalent tool", () => {
    const built = createRemoveLabelGroupTool();
    expect(built.name).toBe(removeLabelGroupTool.name);
    expect(built.input_schema).toEqual(removeLabelGroupTool.input_schema);
  });

  it("BASIC_LABEL_GROUPS matches the UI literal", () => {
    expect([...BASIC_LABEL_GROUPS]).toEqual(["states", "addedLabels"]);
  });

  it("registers and round-trips through ToolRegistry", () => {
    const registry = new ToolRegistry();
    registry.register(removeLabelGroupTool);
    const tools = registry.list();
    expect(tools.find((t) => t.name === "remove_label_group")).toBeDefined();
  });

  it("description mentions destructiveness", () => {
    expect(removeLabelGroupTool.description.toLowerCase()).toMatch(
      /destructive|irreversible|permanent/,
    );
  });
});

describe("remove_label_group tool", () => {
  it("happy path on a custom group: forwards counts, removes <g>", async () => {
    const handles = makeRuntime({
      removeAllLabelsAndTextpaths: () => ({
        labelsRemoved: 2,
        textpathsRemoved: 2,
      }),
      removeGroupElement: () => true,
    });
    const tool = createRemoveLabelGroupTool(handles.runtime);
    const result = await tool.execute({ group: "myCustom" });

    expect(result.isError).toBeFalsy();
    expect(handles.groupExists).toHaveBeenCalledWith("myCustom");
    expect(handles.removeAllLabelsAndTextpaths).toHaveBeenCalledWith(
      "myCustom",
    );
    expect(handles.removeGroupElement).toHaveBeenCalledWith("myCustom");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "myCustom",
      labels_removed: 2,
      textpaths_removed: 2,
      group_removed: true,
    });
  });

  it.each(
    BASIC_LABEL_GROUPS,
  )("basic group %s: removes labels but NOT the <g> shell", async (group) => {
    const handles = makeRuntime({
      removeAllLabelsAndTextpaths: () => ({
        labelsRemoved: 3,
        textpathsRemoved: 3,
      }),
    });
    const tool = createRemoveLabelGroupTool(handles.runtime);
    const result = await tool.execute({ group });

    expect(result.isError).toBeFalsy();
    expect(handles.removeAllLabelsAndTextpaths).toHaveBeenCalledWith(group);
    expect(handles.removeGroupElement).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group,
      labels_removed: 3,
      textpaths_removed: 3,
      group_removed: false,
    });
  });

  it("textpaths_removed may be less than labels_removed (missing defs)", async () => {
    const handles = makeRuntime({
      removeAllLabelsAndTextpaths: () => ({
        labelsRemoved: 4,
        textpathsRemoved: 2,
      }),
    });
    const tool = createRemoveLabelGroupTool(handles.runtime);
    const result = await tool.execute({ group: "myCustom" });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      labels_removed: 4,
      textpaths_removed: 2,
      group_removed: true,
    });
  });

  it("empty custom group: counts 0; <g> still removed", async () => {
    const handles = makeRuntime({
      removeAllLabelsAndTextpaths: () => ({
        labelsRemoved: 0,
        textpathsRemoved: 0,
      }),
      removeGroupElement: () => true,
    });
    const tool = createRemoveLabelGroupTool(handles.runtime);
    const result = await tool.execute({ group: "emptyCustom" });

    expect(result.isError).toBeFalsy();
    expect(handles.removeGroupElement).toHaveBeenCalledWith("emptyCustom");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "emptyCustom",
      labels_removed: 0,
      textpaths_removed: 0,
      group_removed: true,
    });
  });

  it("empty basic group: counts 0; <g> preserved", async () => {
    const handles = makeRuntime({
      removeAllLabelsAndTextpaths: () => ({
        labelsRemoved: 0,
        textpathsRemoved: 0,
      }),
    });
    const tool = createRemoveLabelGroupTool(handles.runtime);
    const result = await tool.execute({ group: "states" });

    expect(result.isError).toBeFalsy();
    expect(handles.removeGroupElement).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "states",
      labels_removed: 0,
      textpaths_removed: 0,
      group_removed: false,
    });
  });

  it("errors when group missing; nothing else is called", async () => {
    const handles = makeRuntime({ groupExists: () => false });
    const tool = createRemoveLabelGroupTool(handles.runtime);
    const result = await tool.execute({ group: "ghost" });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/ghost/);
    expect(handles.removeAllLabelsAndTextpaths).not.toHaveBeenCalled();
    expect(handles.removeGroupElement).not.toHaveBeenCalled();
  });

  it("surfaces errors thrown by removeAllLabelsAndTextpaths; does not remove <g>", async () => {
    const handles = makeRuntime({
      removeAllLabelsAndTextpaths: () => {
        throw new Error("#labels SVG element not found.");
      },
    });
    const tool = createRemoveLabelGroupTool(handles.runtime);
    const result = await tool.execute({ group: "myCustom" });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/#labels/);
    expect(handles.removeGroupElement).not.toHaveBeenCalled();
  });

  it("rejects invalid group inputs", async () => {
    const handles = makeRuntime();
    const tool = createRemoveLabelGroupTool(handles.runtime);
    for (const bad of [null, undefined, 42, "", "   "]) {
      const r = await tool.execute({ group: bad });
      expect(r.isError).toBe(true);
    }
    expect(handles.groupExists).not.toHaveBeenCalled();
    expect(handles.removeAllLabelsAndTextpaths).not.toHaveBeenCalled();
    expect(handles.removeGroupElement).not.toHaveBeenCalled();
  });

  it("rejects object input with no group key", async () => {
    const handles = makeRuntime();
    const tool = createRemoveLabelGroupTool(handles.runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(handles.groupExists).not.toHaveBeenCalled();
  });

  it("trims whitespace before validating / forwarding", async () => {
    const handles = makeRuntime({
      removeAllLabelsAndTextpaths: () => ({
        labelsRemoved: 1,
        textpathsRemoved: 1,
      }),
    });
    const tool = createRemoveLabelGroupTool(handles.runtime);
    const result = await tool.execute({ group: "  myCustom  " });

    expect(result.isError).toBeFalsy();
    expect(handles.groupExists).toHaveBeenCalledWith("myCustom");
    expect(handles.removeAllLabelsAndTextpaths).toHaveBeenCalledWith(
      "myCustom",
    );
    expect(handles.removeGroupElement).toHaveBeenCalledWith("myCustom");
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      group: "myCustom",
    });
  });

  it("trims whitespace and still treats `  states  ` as basic", async () => {
    const handles = makeRuntime({
      removeAllLabelsAndTextpaths: () => ({
        labelsRemoved: 2,
        textpathsRemoved: 2,
      }),
    });
    const tool = createRemoveLabelGroupTool(handles.runtime);
    const result = await tool.execute({ group: "  states  " });

    expect(result.isError).toBeFalsy();
    expect(handles.groupExists).toHaveBeenCalledWith("states");
    expect(handles.removeGroupElement).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      group: "states",
      group_removed: false,
    });
  });
});

// -------- Integration: defaultRemoveLabelGroupRuntime against a fake DOM --------

interface FakeElement {
  tagName: string;
  id: string;
  parentNode: FakeElement | null;
  _children: FakeElement[];
  children: FakeElement[];
  childNodes: FakeElement[];
  firstChild: FakeElement | null;
  appendChild: (child: FakeElement) => FakeElement;
  remove: () => void;
  getElementsByTagName: (tag: string) => FakeElement[];
}

function fakeElement(tag: string, id: string): FakeElement {
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    id,
    parentNode: null,
    _children: [],
    children: [],
    childNodes: [],
    firstChild: null,
    appendChild(child) {
      // Detach from old parent.
      if (child.parentNode) {
        const p = child.parentNode;
        const idx = p._children.indexOf(child);
        if (idx >= 0) {
          p._children.splice(idx, 1);
          p.children.splice(idx, 1);
          p.childNodes.splice(idx, 1);
        }
        p.firstChild = p._children[0] ?? null;
      }
      child.parentNode = el;
      el._children.push(child);
      el.children.push(child);
      el.childNodes.push(child);
      el.firstChild = el._children[0] ?? null;
      return child;
    },
    remove() {
      const p = el.parentNode;
      if (!p) return;
      const idx = p._children.indexOf(el);
      if (idx >= 0) {
        p._children.splice(idx, 1);
        p.children.splice(idx, 1);
        p.childNodes.splice(idx, 1);
      }
      p.firstChild = p._children[0] ?? null;
      el.parentNode = null;
    },
    // Descendant-inclusive lookup. Walks the subtree and collects
    // every element whose tagName matches (case-insensitive).
    getElementsByTagName(tag: string) {
      const target = tag.toUpperCase();
      const out: FakeElement[] = [];
      const stack: FakeElement[] = [...el._children];
      while (stack.length) {
        const cur = stack.shift() as FakeElement;
        if (cur.tagName === target) out.push(cur);
        stack.push(...cur._children);
      }
      return out;
    },
  };
  return el;
}

interface FakeDocument {
  getElementById: (id: string) => FakeElement | null;
}

function makeFakeDocument(roots: FakeElement[]): FakeDocument {
  return {
    getElementById(id) {
      const stack = [...roots];
      while (stack.length) {
        const e = stack.shift() as FakeElement;
        if (e.id === id) return e;
        stack.push(...e._children);
      }
      return null;
    },
  };
}

describe("defaultRemoveLabelGroupRuntime (integration)", () => {
  const originalDoc = (globalThis as { document?: unknown }).document;

  let labelsRoot: FakeElement;
  let defsRoot: FakeElement;
  let statesGroup: FakeElement;
  let addedLabelsGroup: FakeElement;
  let customGroup: FakeElement;

  function buildDom(): void {
    labelsRoot = fakeElement("g", "labels");
    defsRoot = fakeElement("defs", "labelsDefs");

    statesGroup = fakeElement("g", "states");
    addedLabelsGroup = fakeElement("g", "addedLabels");
    customGroup = fakeElement("g", "myCustom");

    // 3 state labels, each with a textPath def.
    for (const id of ["stateLabel1", "stateLabel2", "stateLabel3"]) {
      const t = fakeElement("text", id);
      statesGroup.appendChild(t);
      const def = fakeElement("textPath", `textPath_${id}`);
      defsRoot.appendChild(def);
    }
    // 1 addedLabel + def.
    {
      const t = fakeElement("text", "added0");
      addedLabelsGroup.appendChild(t);
      const def = fakeElement("textPath", "textPath_added0");
      defsRoot.appendChild(def);
    }
    // 2 custom labels: one has a def, one does NOT.
    {
      const t = fakeElement("text", "custom_a");
      customGroup.appendChild(t);
      const def = fakeElement("textPath", "textPath_custom_a");
      defsRoot.appendChild(def);
    }
    {
      const t = fakeElement("text", "custom_b_no_def");
      customGroup.appendChild(t);
      // no matching def
    }

    labelsRoot.appendChild(statesGroup);
    labelsRoot.appendChild(addedLabelsGroup);
    labelsRoot.appendChild(customGroup);
  }

  beforeEach(() => {
    buildDom();
    (globalThis as { document?: unknown }).document = makeFakeDocument([
      labelsRoot,
      defsRoot,
    ]);
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("custom group: removes both texts, removes 1 def (one was missing), removes <g>", async () => {
    const result = await removeLabelGroupTool.execute({ group: "myCustom" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "myCustom",
      labels_removed: 2,
      textpaths_removed: 1,
      group_removed: true,
    });

    // <g id="myCustom"> is gone from #labels.
    expect(
      labelsRoot._children.find((c) => c.id === "myCustom"),
    ).toBeUndefined();
    // The def that existed is gone.
    expect(
      defsRoot._children.find((d) => d.id === "textPath_custom_a"),
    ).toBeUndefined();
  });

  it("basic group `states`: removes 3 texts + 3 defs; <g> preserved", async () => {
    const result = await removeLabelGroupTool.execute({ group: "states" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "states",
      labels_removed: 3,
      textpaths_removed: 3,
      group_removed: false,
    });
    // <g id="states"> is still there but empty.
    const stillThere = labelsRoot._children.find((c) => c.id === "states");
    expect(stillThere).toBeDefined();
    expect(stillThere?._children.length).toBe(0);
    // All three defs gone.
    expect(
      defsRoot._children.find((d) => d.id === "textPath_stateLabel1"),
    ).toBeUndefined();
    expect(
      defsRoot._children.find((d) => d.id === "textPath_stateLabel2"),
    ).toBeUndefined();
    expect(
      defsRoot._children.find((d) => d.id === "textPath_stateLabel3"),
    ).toBeUndefined();
  });

  it("basic group `addedLabels`: removes 1 text + 1 def; <g> preserved", async () => {
    const result = await removeLabelGroupTool.execute({
      group: "addedLabels",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "addedLabels",
      labels_removed: 1,
      textpaths_removed: 1,
      group_removed: false,
    });
    expect(
      labelsRoot._children.find((c) => c.id === "addedLabels"),
    ).toBeDefined();
    expect(
      defsRoot._children.find((d) => d.id === "textPath_added0"),
    ).toBeUndefined();
  });

  it("empty custom group: counts 0; <g> removed", async () => {
    const empty = fakeElement("g", "emptyCustom");
    labelsRoot.appendChild(empty);
    const result = await removeLabelGroupTool.execute({ group: "emptyCustom" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "emptyCustom",
      labels_removed: 0,
      textpaths_removed: 0,
      group_removed: true,
    });
    expect(
      labelsRoot._children.find((c) => c.id === "emptyCustom"),
    ).toBeUndefined();
  });

  it("empty basic group: counts 0; <g> preserved", async () => {
    // Empty out states first.
    while (statesGroup._children.length) {
      statesGroup._children[0]?.remove();
    }
    const result = await removeLabelGroupTool.execute({ group: "states" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "states",
      labels_removed: 0,
      textpaths_removed: 0,
      group_removed: false,
    });
    expect(labelsRoot._children.find((c) => c.id === "states")).toBeDefined();
  });

  it("unknown group id: error; SVG unchanged", async () => {
    const result = await removeLabelGroupTool.execute({ group: "ghost" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/ghost/);
    expect(labelsRoot._children.length).toBe(3);
    expect(
      defsRoot._children.find((d) => d.id === "textPath_stateLabel1"),
    ).toBeDefined();
  });

  it("#labels missing: error", async () => {
    // Replace document so nothing has id "labels".
    (globalThis as { document?: unknown }).document = makeFakeDocument([
      defsRoot,
    ]);
    const result = await removeLabelGroupTool.execute({ group: "states" });
    expect(result.isError).toBe(true);
  });

  it("does not match a non-direct descendant <g>: error when group is nested deeper", async () => {
    const grandchild = fakeElement("g", "deeplyNested");
    customGroup.appendChild(grandchild);
    const result = await removeLabelGroupTool.execute({
      group: "deeplyNested",
    });
    expect(result.isError).toBe(true);
  });
});

describe("defaultRemoveLabelGroupRuntime unit edges", () => {
  const originalDoc = (globalThis as { document?: unknown }).document;

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("groupExists returns false when document is absent", () => {
    (globalThis as { document?: unknown }).document = undefined;
    expect(defaultRemoveLabelGroupRuntime.groupExists("custom")).toBe(false);
  });

  it("groupExists returns false when #labels is absent", () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    expect(defaultRemoveLabelGroupRuntime.groupExists("custom")).toBe(false);
  });

  it("removeAllLabelsAndTextpaths throws when document is absent", () => {
    (globalThis as { document?: unknown }).document = undefined;
    expect(() =>
      defaultRemoveLabelGroupRuntime.removeAllLabelsAndTextpaths("custom"),
    ).toThrow(/document/);
  });

  it("removeAllLabelsAndTextpaths throws when #labels is missing", () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    expect(() =>
      defaultRemoveLabelGroupRuntime.removeAllLabelsAndTextpaths("custom"),
    ).toThrow(/#labels/);
  });

  it("removeAllLabelsAndTextpaths throws when group is missing", () => {
    const labelsRoot = fakeElement("g", "labels");
    (globalThis as { document?: unknown }).document = makeFakeDocument([
      labelsRoot,
    ]);
    expect(() =>
      defaultRemoveLabelGroupRuntime.removeAllLabelsAndTextpaths("custom"),
    ).toThrow(/custom/);
  });

  it("removeGroupElement returns false when document is absent", () => {
    (globalThis as { document?: unknown }).document = undefined;
    expect(defaultRemoveLabelGroupRuntime.removeGroupElement("custom")).toBe(
      false,
    );
  });

  it("removeGroupElement returns false when #labels is absent", () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    expect(defaultRemoveLabelGroupRuntime.removeGroupElement("custom")).toBe(
      false,
    );
  });

  it("removeGroupElement returns false when the group element is absent", () => {
    const labelsRoot = fakeElement("g", "labels");
    (globalThis as { document?: unknown }).document = makeFakeDocument([
      labelsRoot,
    ]);
    expect(defaultRemoveLabelGroupRuntime.removeGroupElement("custom")).toBe(
      false,
    );
  });
});
