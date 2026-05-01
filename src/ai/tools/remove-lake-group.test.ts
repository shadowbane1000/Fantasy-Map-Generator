import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import { DEFAULT_LAKE_GROUPS } from "./list-lake-groups";
import {
  createRemoveLakeGroupTool,
  defaultRemoveLakeGroupRuntime,
  type RemoveLakeGroupRuntime,
  removeLakeGroupTool,
} from "./remove-lake-group";

interface FakeRuntimeHandles {
  runtime: RemoveLakeGroupRuntime;
  groupExists: ReturnType<typeof vi.fn<RemoveLakeGroupRuntime["groupExists"]>>;
  freshwaterExists: ReturnType<
    typeof vi.fn<RemoveLakeGroupRuntime["freshwaterExists"]>
  >;
  reassignFeaturesToFreshwater: ReturnType<
    typeof vi.fn<RemoveLakeGroupRuntime["reassignFeaturesToFreshwater"]>
  >;
  moveChildrenAndRemoveGroup: ReturnType<
    typeof vi.fn<RemoveLakeGroupRuntime["moveChildrenAndRemoveGroup"]>
  >;
  removeDropdownOption: ReturnType<
    typeof vi.fn<RemoveLakeGroupRuntime["removeDropdownOption"]>
  >;
}

function makeRuntime(
  overrides: Partial<RemoveLakeGroupRuntime> = {},
): FakeRuntimeHandles {
  const groupExists = vi.fn<RemoveLakeGroupRuntime["groupExists"]>(
    overrides.groupExists ?? (() => true),
  );
  const freshwaterExists = vi.fn<RemoveLakeGroupRuntime["freshwaterExists"]>(
    overrides.freshwaterExists ?? (() => true),
  );
  const reassignFeaturesToFreshwater = vi.fn<
    RemoveLakeGroupRuntime["reassignFeaturesToFreshwater"]
  >(overrides.reassignFeaturesToFreshwater ?? (() => 0));
  const moveChildrenAndRemoveGroup = vi.fn<
    RemoveLakeGroupRuntime["moveChildrenAndRemoveGroup"]
  >(overrides.moveChildrenAndRemoveGroup ?? (() => 0));
  const removeDropdownOption = vi.fn<
    RemoveLakeGroupRuntime["removeDropdownOption"]
  >(overrides.removeDropdownOption ?? (() => false));
  return {
    runtime: {
      groupExists,
      freshwaterExists,
      reassignFeaturesToFreshwater,
      moveChildrenAndRemoveGroup,
      removeDropdownOption,
    },
    groupExists,
    freshwaterExists,
    reassignFeaturesToFreshwater,
    moveChildrenAndRemoveGroup,
    removeDropdownOption,
  };
}

describe("remove_lake_group tool metadata", () => {
  it("has the right name and schema", () => {
    expect(removeLakeGroupTool.name).toBe("remove_lake_group");
    expect(removeLakeGroupTool.input_schema).toMatchObject({
      type: "object",
      required: ["group"],
    });
    expect(removeLakeGroupTool.input_schema.properties).toHaveProperty("group");
  });

  it("createRemoveLakeGroupTool produces an equivalent tool", () => {
    const built = createRemoveLakeGroupTool();
    expect(built.name).toBe(removeLakeGroupTool.name);
    expect(built.input_schema).toEqual(removeLakeGroupTool.input_schema);
  });

  it("default lake-group ids match the UI literal", () => {
    expect([...DEFAULT_LAKE_GROUPS]).toEqual([
      "freshwater",
      "salt",
      "sinkhole",
      "frozen",
      "lava",
      "dry",
    ]);
  });

  it("registers and round-trips through ToolRegistry", () => {
    const registry = new ToolRegistry();
    registry.register(removeLakeGroupTool);
    const tools = registry.list();
    expect(tools.find((t) => t.name === "remove_lake_group")).toBeDefined();
  });
});

describe("remove_lake_group tool", () => {
  it("happy path: reassigns lakes, moves SVG children, removes <g>, removes dropdown option", async () => {
    const handles = makeRuntime({
      reassignFeaturesToFreshwater: () => 2,
      moveChildrenAndRemoveGroup: () => 2,
      removeDropdownOption: () => true,
    });
    const tool = createRemoveLakeGroupTool(handles.runtime);
    const result = await tool.execute({ group: "acidic" });

    expect(result.isError).toBeFalsy();
    expect(handles.groupExists).toHaveBeenCalledWith("acidic");
    expect(handles.freshwaterExists).toHaveBeenCalledTimes(1);
    expect(handles.reassignFeaturesToFreshwater).toHaveBeenCalledWith("acidic");
    expect(handles.moveChildrenAndRemoveGroup).toHaveBeenCalledWith("acidic");
    expect(handles.removeDropdownOption).toHaveBeenCalledWith("acidic");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "acidic",
      reassigned_count: 2,
      svg_children_moved: 2,
    });
  });

  it.each(
    DEFAULT_LAKE_GROUPS,
  )("rejects default group %s without mutating", async (group) => {
    const handles = makeRuntime();
    const tool = createRemoveLakeGroupTool(handles.runtime);
    const result = await tool.execute({ group });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Default lake group/);
    expect(handles.groupExists).not.toHaveBeenCalled();
    expect(handles.freshwaterExists).not.toHaveBeenCalled();
    expect(handles.reassignFeaturesToFreshwater).not.toHaveBeenCalled();
    expect(handles.moveChildrenAndRemoveGroup).not.toHaveBeenCalled();
    expect(handles.removeDropdownOption).not.toHaveBeenCalled();
  });

  it("errors when the group doesn't exist; nothing else is called", async () => {
    const handles = makeRuntime({ groupExists: () => false });
    const tool = createRemoveLakeGroupTool(handles.runtime);
    const result = await tool.execute({ group: "mystery" });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/mystery/);
    expect(handles.freshwaterExists).not.toHaveBeenCalled();
    expect(handles.reassignFeaturesToFreshwater).not.toHaveBeenCalled();
    expect(handles.moveChildrenAndRemoveGroup).not.toHaveBeenCalled();
    expect(handles.removeDropdownOption).not.toHaveBeenCalled();
  });

  it("errors when freshwater is missing; reassign / move are not called", async () => {
    const handles = makeRuntime({
      groupExists: () => true,
      freshwaterExists: () => false,
    });
    const tool = createRemoveLakeGroupTool(handles.runtime);
    const result = await tool.execute({ group: "acidic" });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/freshwater/);
    expect(handles.reassignFeaturesToFreshwater).not.toHaveBeenCalled();
    expect(handles.moveChildrenAndRemoveGroup).not.toHaveBeenCalled();
    expect(handles.removeDropdownOption).not.toHaveBeenCalled();
  });

  it("succeeds with counts 0 for an empty custom group; SVG element still removed", async () => {
    const handles = makeRuntime({
      reassignFeaturesToFreshwater: () => 0,
      moveChildrenAndRemoveGroup: () => 0,
    });
    const tool = createRemoveLakeGroupTool(handles.runtime);
    const result = await tool.execute({ group: "empty-group" });

    expect(result.isError).toBeFalsy();
    expect(handles.moveChildrenAndRemoveGroup).toHaveBeenCalledWith(
      "empty-group",
    );
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "empty-group",
      reassigned_count: 0,
      svg_children_moved: 0,
    });
  });

  it("rejects invalid group inputs", async () => {
    const handles = makeRuntime();
    const tool = createRemoveLakeGroupTool(handles.runtime);
    for (const bad of [null, undefined, 42, "", "   "]) {
      const r = await tool.execute({ group: bad });
      expect(r.isError).toBe(true);
    }
    expect(handles.groupExists).not.toHaveBeenCalled();
    expect(handles.reassignFeaturesToFreshwater).not.toHaveBeenCalled();
    expect(handles.moveChildrenAndRemoveGroup).not.toHaveBeenCalled();
    expect(handles.removeDropdownOption).not.toHaveBeenCalled();
  });

  it("rejects object input with no group key", async () => {
    const handles = makeRuntime();
    const tool = createRemoveLakeGroupTool(handles.runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(handles.groupExists).not.toHaveBeenCalled();
  });

  it("trims whitespace before validating / forwarding", async () => {
    const handles = makeRuntime({
      reassignFeaturesToFreshwater: () => 1,
      moveChildrenAndRemoveGroup: () => 1,
    });
    const tool = createRemoveLakeGroupTool(handles.runtime);
    const result = await tool.execute({ group: "  acidic  " });

    expect(result.isError).toBeFalsy();
    expect(handles.groupExists).toHaveBeenCalledWith("acidic");
    expect(handles.reassignFeaturesToFreshwater).toHaveBeenCalledWith("acidic");
    expect(handles.moveChildrenAndRemoveGroup).toHaveBeenCalledWith("acidic");
    expect(handles.removeDropdownOption).toHaveBeenCalledWith("acidic");
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      group: "acidic",
    });
  });

  it("trim still rejects defaults with surrounding whitespace", async () => {
    const handles = makeRuntime();
    const tool = createRemoveLakeGroupTool(handles.runtime);
    const result = await tool.execute({ group: "  freshwater  " });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Default lake group/);
    expect(handles.groupExists).not.toHaveBeenCalled();
  });

  it("surfaces errors thrown by reassignFeaturesToFreshwater; does not move SVG", async () => {
    const handles = makeRuntime({
      reassignFeaturesToFreshwater: () => {
        throw new Error("pack.features is not available.");
      },
    });
    const tool = createRemoveLakeGroupTool(handles.runtime);
    const result = await tool.execute({ group: "acidic" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.features/);
    expect(handles.moveChildrenAndRemoveGroup).not.toHaveBeenCalled();
    expect(handles.removeDropdownOption).not.toHaveBeenCalled();
  });

  it("surfaces errors thrown by moveChildrenAndRemoveGroup", async () => {
    const handles = makeRuntime({
      reassignFeaturesToFreshwater: () => 2,
      moveChildrenAndRemoveGroup: () => {
        throw new Error("#lakes SVG element not found.");
      },
    });
    const tool = createRemoveLakeGroupTool(handles.runtime);
    const result = await tool.execute({ group: "acidic" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/#lakes/);
    expect(handles.removeDropdownOption).not.toHaveBeenCalled();
  });

  it("does not fail when removeDropdownOption returns false (dropdown absent)", async () => {
    const handles = makeRuntime({
      reassignFeaturesToFreshwater: () => 1,
      moveChildrenAndRemoveGroup: () => 1,
      removeDropdownOption: () => false,
    });
    const tool = createRemoveLakeGroupTool(handles.runtime);
    const result = await tool.execute({ group: "acidic" });
    expect(result.isError).toBeFalsy();
    expect(handles.removeDropdownOption).toHaveBeenCalledWith("acidic");
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      group: "acidic",
    });
  });
});

// -------- Integration: defaultRemoveLakeGroupRuntime against a fake DOM --------

interface FakeNode {
  // Tag is empty for non-element nodes (we only need elements here).
  tagName: string;
  id: string;
  parentNode: FakeElement | null;
  // childNodes contains every child (for <g> we treat them all as element-ish);
  // children is the element-only view used by element.children. We keep a
  // single backing array and surface both views.
  _children: FakeElement[];
  remove: () => void;
  appendChild: (child: FakeElement) => FakeElement;
}

interface FakeElement extends FakeNode {
  children: FakeElement[];
  childNodes: FakeElement[];
  firstChild: FakeElement | null;
  options?: FakeElement[];
  value?: string;
  // used by HTMLOptionElement-like stubs only
  // (the dropdown <option> shape).
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
  };
  return el;
}

function fakeOption(value: string): FakeElement {
  const opt = fakeElement("option", "");
  opt.value = value;
  return opt;
}

function fakeSelect(id: string, optionValues: string[]): FakeElement {
  const sel = fakeElement("select", id);
  const options: FakeElement[] = [];
  for (const v of optionValues) {
    const opt = fakeOption(v);
    sel.appendChild(opt);
    options.push(opt);
  }
  // The `options` collection mirrors what HTMLSelectElement exposes.
  sel.options = options;
  // Removing an <option> via opt.remove() needs to also unlink it from
  // the select's `options` collection. Patch each option's remove() to
  // do both.
  for (const opt of options) {
    const baseRemove = opt.remove;
    opt.remove = () => {
      baseRemove();
      const i = sel.options?.indexOf(opt) ?? -1;
      if (i >= 0) sel.options?.splice(i, 1);
    };
  }
  return sel;
}

interface FakeDocument {
  getElementById: (id: string) => FakeElement | null;
}

function makeFakeDocument(elements: FakeElement[]): FakeDocument {
  return {
    getElementById(id) {
      const stack = [...elements];
      while (stack.length) {
        const e = stack.shift() as FakeElement;
        if (e.id === id) return e;
        stack.push(...e._children);
      }
      return null;
    },
  };
}

describe("defaultRemoveLakeGroupRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;

  let lakesRoot: FakeElement;
  let freshwater: FakeElement;
  let acidic: FakeElement;
  let useFresh5: FakeElement;
  let useAcid7: FakeElement;
  let useAcid9: FakeElement;
  let select: FakeElement;

  function buildDom(): { withSelect: boolean } {
    lakesRoot = fakeElement("g", "lakes");
    freshwater = fakeElement("g", "freshwater");
    acidic = fakeElement("g", "acidic");
    useFresh5 = fakeElement("use", "lake_5");
    useAcid7 = fakeElement("use", "lake_7");
    useAcid9 = fakeElement("use", "lake_9");
    freshwater.appendChild(useFresh5);
    acidic.appendChild(useAcid7);
    acidic.appendChild(useAcid9);
    lakesRoot.appendChild(freshwater);
    lakesRoot.appendChild(acidic);

    select = fakeSelect("lakeGroup", ["freshwater", "acidic"]);

    return { withSelect: true };
  }

  function buildPack(): void {
    (globalThis as { pack?: unknown }).pack = {
      features: [
        0,
        { i: 1, type: "ocean" },
        { i: 2, type: "island" },
        { i: 5, type: "lake", group: "freshwater" },
        { i: 7, type: "lake", group: "acidic" },
        { i: 9, type: "lake", group: "acidic" },
        { i: 11, type: "lake", group: "acidic", removed: true },
      ],
    };
  }

  beforeEach(() => {
    buildDom();
    buildPack();
    (globalThis as { document?: unknown }).document = makeFakeDocument([
      lakesRoot,
      select,
    ]);
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("happy path: reassigns pack lakes, moves SVG children, removes <g>, cleans dropdown", async () => {
    const result = await removeLakeGroupTool.execute({ group: "acidic" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "acidic",
      reassigned_count: 2,
      svg_children_moved: 2,
    });

    const pack = (globalThis as { pack?: { features: unknown[] } }).pack;
    const features = pack?.features ?? [];
    // Live lakes (i=7, i=9) reassigned to "freshwater".
    expect((features[4] as { group?: string }).group).toBe("freshwater");
    expect((features[5] as { group?: string }).group).toBe("freshwater");
    // Removed lake (i=11) NOT reassigned.
    expect((features[6] as { group?: string }).group).toBe("acidic");

    // <g id="acidic"> is gone from #lakes.
    expect(lakesRoot._children.find((c) => c.id === "acidic")).toBeUndefined();
    // Both <use> elements are now under freshwater.
    expect(useAcid7.parentNode).toBe(freshwater);
    expect(useAcid9.parentNode).toBe(freshwater);
    expect(freshwater._children.length).toBe(3); // useFresh5 + useAcid7 + useAcid9

    // Dropdown option was removed.
    const remainingOptionValues = select.options?.map((o) => o.value);
    expect(remainingOptionValues).toEqual(["freshwater"]);
  });

  it("errors when <g id={group}> is missing; pack and SVG unchanged", async () => {
    const result = await removeLakeGroupTool.execute({ group: "mystery" });
    expect(result.isError).toBe(true);
    expect(lakesRoot._children.find((c) => c.id === "acidic")).toBeDefined();
    const pack = (globalThis as { pack?: { features: unknown[] } }).pack;
    expect((pack?.features?.[4] as { group?: string }).group).toBe("acidic");
  });

  it('errors when <g id="freshwater"> is missing; pack and SVG unchanged', async () => {
    freshwater.remove();
    const result = await removeLakeGroupTool.execute({ group: "acidic" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/freshwater/);
    expect(lakesRoot._children.find((c) => c.id === "acidic")).toBeDefined();
    const pack = (globalThis as { pack?: { features: unknown[] } }).pack;
    expect((pack?.features?.[4] as { group?: string }).group).toBe("acidic");
  });

  it("errors when pack.features is missing; SVG unchanged", async () => {
    (globalThis as { pack?: unknown }).pack = {};
    const result = await removeLakeGroupTool.execute({ group: "acidic" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.features/);
    expect(lakesRoot._children.find((c) => c.id === "acidic")).toBeDefined();
    expect(useAcid7.parentNode).toBe(acidic);
  });

  it('succeeds when <select id="lakeGroup"> dropdown is absent', async () => {
    // Remove the select from the fake document by returning null for it.
    (globalThis as { document?: unknown }).document = makeFakeDocument([
      lakesRoot,
    ]);
    const result = await removeLakeGroupTool.execute({ group: "acidic" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      group: "acidic",
      reassigned_count: 2,
      svg_children_moved: 2,
    });
    expect(lakesRoot._children.find((c) => c.id === "acidic")).toBeUndefined();
  });

  it("rejects every default group at the SVG-integration layer too", async () => {
    for (const group of DEFAULT_LAKE_GROUPS) {
      const result = await removeLakeGroupTool.execute({ group });
      expect(result.isError).toBe(true);
    }
    // Nothing was moved or removed.
    expect(lakesRoot._children.find((c) => c.id === "acidic")).toBeDefined();
    expect(
      lakesRoot._children.find((c) => c.id === "freshwater"),
    ).toBeDefined();
  });

  it("empty custom group: counts both 0; <g> removed", async () => {
    const empty = fakeElement("g", "empty");
    lakesRoot.appendChild(empty);
    const result = await removeLakeGroupTool.execute({ group: "empty" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "empty",
      reassigned_count: 0,
      svg_children_moved: 0,
    });
    expect(lakesRoot._children.find((c) => c.id === "empty")).toBeUndefined();
  });
});

describe("defaultRemoveLakeGroupRuntime unit edges", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("groupExists returns false when document is absent", () => {
    (globalThis as { document?: unknown }).document = undefined;
    expect(defaultRemoveLakeGroupRuntime.groupExists("acidic")).toBe(false);
  });

  it("groupExists returns false when #lakes is absent", () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    expect(defaultRemoveLakeGroupRuntime.groupExists("acidic")).toBe(false);
  });

  it("freshwaterExists returns false when document is absent", () => {
    (globalThis as { document?: unknown }).document = undefined;
    expect(defaultRemoveLakeGroupRuntime.freshwaterExists()).toBe(false);
  });

  it("reassignFeaturesToFreshwater throws when pack is undefined", () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    expect(() =>
      defaultRemoveLakeGroupRuntime.reassignFeaturesToFreshwater("acidic"),
    ).toThrow(/pack\.features/);
  });

  it("removeDropdownOption returns false when document is absent", () => {
    (globalThis as { document?: unknown }).document = undefined;
    expect(defaultRemoveLakeGroupRuntime.removeDropdownOption("acidic")).toBe(
      false,
    );
  });

  it("removeDropdownOption returns false when select is absent", () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    expect(defaultRemoveLakeGroupRuntime.removeDropdownOption("acidic")).toBe(
      false,
    );
  });
});
