import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createRemoveCoastlineGroupTool,
  DEFAULT_COASTLINE_GROUPS,
  defaultRemoveCoastlineGroupRuntime,
  type RemoveCoastlineGroupRuntime,
  removeCoastlineGroupTool,
} from "./remove-coastline-group";

interface FakeRuntimeHandles {
  runtime: RemoveCoastlineGroupRuntime;
  coastlineLayerExists: ReturnType<
    typeof vi.fn<RemoveCoastlineGroupRuntime["coastlineLayerExists"]>
  >;
  groupExists: ReturnType<
    typeof vi.fn<RemoveCoastlineGroupRuntime["groupExists"]>
  >;
  seaIslandExists: ReturnType<
    typeof vi.fn<RemoveCoastlineGroupRuntime["seaIslandExists"]>
  >;
  moveChildrenAndRemoveGroup: ReturnType<
    typeof vi.fn<RemoveCoastlineGroupRuntime["moveChildrenAndRemoveGroup"]>
  >;
  removeDropdownOption: ReturnType<
    typeof vi.fn<RemoveCoastlineGroupRuntime["removeDropdownOption"]>
  >;
}

function makeRuntime(
  overrides: Partial<RemoveCoastlineGroupRuntime> = {},
): FakeRuntimeHandles {
  const coastlineLayerExists = vi.fn<
    RemoveCoastlineGroupRuntime["coastlineLayerExists"]
  >(overrides.coastlineLayerExists ?? (() => true));
  const groupExists = vi.fn<RemoveCoastlineGroupRuntime["groupExists"]>(
    overrides.groupExists ?? (() => true),
  );
  const seaIslandExists = vi.fn<RemoveCoastlineGroupRuntime["seaIslandExists"]>(
    overrides.seaIslandExists ?? (() => true),
  );
  const moveChildrenAndRemoveGroup = vi.fn<
    RemoveCoastlineGroupRuntime["moveChildrenAndRemoveGroup"]
  >(overrides.moveChildrenAndRemoveGroup ?? (() => 0));
  const removeDropdownOption = vi.fn<
    RemoveCoastlineGroupRuntime["removeDropdownOption"]
  >(overrides.removeDropdownOption ?? (() => false));
  return {
    runtime: {
      coastlineLayerExists,
      groupExists,
      seaIslandExists,
      moveChildrenAndRemoveGroup,
      removeDropdownOption,
    },
    coastlineLayerExists,
    groupExists,
    seaIslandExists,
    moveChildrenAndRemoveGroup,
    removeDropdownOption,
  };
}

describe("remove_coastline_group tool metadata", () => {
  it("has the right name and schema", () => {
    expect(removeCoastlineGroupTool.name).toBe("remove_coastline_group");
    expect(removeCoastlineGroupTool.input_schema).toMatchObject({
      type: "object",
      required: ["name"],
    });
    expect(removeCoastlineGroupTool.input_schema.properties).toHaveProperty(
      "name",
    );
  });

  it("createRemoveCoastlineGroupTool produces an equivalent tool", () => {
    const built = createRemoveCoastlineGroupTool();
    expect(built.name).toBe(removeCoastlineGroupTool.name);
    expect(built.input_schema).toEqual(removeCoastlineGroupTool.input_schema);
  });

  it("default coastline-group ids match the legacy literal", () => {
    expect([...DEFAULT_COASTLINE_GROUPS]).toEqual([
      "sea_island",
      "lake_island",
    ]);
  });

  it("registers and round-trips through ToolRegistry", () => {
    const registry = new ToolRegistry();
    registry.register(removeCoastlineGroupTool);
    const tools = registry.list();
    expect(
      tools.find((t) => t.name === "remove_coastline_group"),
    ).toBeDefined();
  });
});

describe("remove_coastline_group tool", () => {
  it("happy path: sanitizes name, moves children, removes <g>, removes dropdown option", async () => {
    const handles = makeRuntime({
      moveChildrenAndRemoveGroup: () => 3,
      removeDropdownOption: () => true,
    });
    const tool = createRemoveCoastlineGroupTool(handles.runtime);
    const result = await tool.execute({ name: "Shipping Lanes" });

    expect(result.isError).toBeFalsy();
    expect(handles.coastlineLayerExists).toHaveBeenCalledTimes(1);
    expect(handles.groupExists).toHaveBeenCalledWith("shipping_lanes");
    expect(handles.seaIslandExists).toHaveBeenCalledTimes(1);
    expect(handles.moveChildrenAndRemoveGroup).toHaveBeenCalledWith(
      "shipping_lanes",
    );
    expect(handles.removeDropdownOption).toHaveBeenCalledWith("shipping_lanes");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "shipping_lanes",
      moved_count: 3,
      dropdown_option_removed: true,
    });
  });

  it("sanitization: 'Storm Coast' → 'storm_coast'", async () => {
    const handles = makeRuntime({
      moveChildrenAndRemoveGroup: () => 1,
    });
    const tool = createRemoveCoastlineGroupTool(handles.runtime);
    const result = await tool.execute({ name: "Storm Coast" });
    expect(result.isError).toBeFalsy();
    expect(handles.groupExists).toHaveBeenCalledWith("storm_coast");
    expect(handles.moveChildrenAndRemoveGroup).toHaveBeenCalledWith(
      "storm_coast",
    );
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      id: "storm_coast",
    });
  });

  it.each(
    DEFAULT_COASTLINE_GROUPS,
  )("rejects default group %s without mutating", async (id) => {
    const handles = makeRuntime();
    const tool = createRemoveCoastlineGroupTool(handles.runtime);
    const result = await tool.execute({ name: id });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Cannot remove the default/,
    );
    expect(handles.coastlineLayerExists).not.toHaveBeenCalled();
    expect(handles.groupExists).not.toHaveBeenCalled();
    expect(handles.seaIslandExists).not.toHaveBeenCalled();
    expect(handles.moveChildrenAndRemoveGroup).not.toHaveBeenCalled();
    expect(handles.removeDropdownOption).not.toHaveBeenCalled();
  });

  it("rejects invalid name inputs", async () => {
    const handles = makeRuntime();
    const tool = createRemoveCoastlineGroupTool(handles.runtime);
    for (const bad of [null, undefined, 42, "", "   ", "\t\n"]) {
      const r = await tool.execute({ name: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/non-empty string/);
    }
    expect(handles.coastlineLayerExists).not.toHaveBeenCalled();
    expect(handles.groupExists).not.toHaveBeenCalled();
    expect(handles.moveChildrenAndRemoveGroup).not.toHaveBeenCalled();
  });

  it("rejects object input with no name key", async () => {
    const handles = makeRuntime();
    const tool = createRemoveCoastlineGroupTool(handles.runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/non-empty string/);
    expect(handles.groupExists).not.toHaveBeenCalled();
  });

  it("rejects names that sanitize to empty", async () => {
    const handles = makeRuntime();
    const tool = createRemoveCoastlineGroupTool(handles.runtime);
    const result = await tool.execute({ name: "!!!" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /at least one valid character/,
    );
    expect(handles.coastlineLayerExists).not.toHaveBeenCalled();
    expect(handles.groupExists).not.toHaveBeenCalled();
  });

  it("errors when the group doesn't exist; sea_island / move are not called", async () => {
    const handles = makeRuntime({ groupExists: () => false });
    const tool = createRemoveCoastlineGroupTool(handles.runtime);
    const result = await tool.execute({ name: "mystery" });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/'mystery'/);
    expect(handles.seaIslandExists).not.toHaveBeenCalled();
    expect(handles.moveChildrenAndRemoveGroup).not.toHaveBeenCalled();
    expect(handles.removeDropdownOption).not.toHaveBeenCalled();
  });

  it("errors when sea_island is missing; move is not called", async () => {
    const handles = makeRuntime({
      groupExists: () => true,
      seaIslandExists: () => false,
    });
    const tool = createRemoveCoastlineGroupTool(handles.runtime);
    const result = await tool.execute({ name: "shipping_lanes" });

    expect(result.isError).toBe(true);
    const errorText = JSON.parse(result.content).error;
    expect(errorText).toMatch(/shipping_lanes/);
    expect(errorText).toMatch(/sea_island/);
    expect(handles.moveChildrenAndRemoveGroup).not.toHaveBeenCalled();
    expect(handles.removeDropdownOption).not.toHaveBeenCalled();
  });

  it("errors when #coastline layer is unavailable; nothing else is called", async () => {
    const handles = makeRuntime({ coastlineLayerExists: () => false });
    const tool = createRemoveCoastlineGroupTool(handles.runtime);
    const result = await tool.execute({ name: "shipping_lanes" });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
    expect(handles.groupExists).not.toHaveBeenCalled();
    expect(handles.seaIslandExists).not.toHaveBeenCalled();
    expect(handles.moveChildrenAndRemoveGroup).not.toHaveBeenCalled();
  });

  it("dropdown removed → dropdown_option_removed: true", async () => {
    const handles = makeRuntime({
      moveChildrenAndRemoveGroup: () => 2,
      removeDropdownOption: () => true,
    });
    const tool = createRemoveCoastlineGroupTool(handles.runtime);
    const result = await tool.execute({ name: "shipping_lanes" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      dropdown_option_removed: true,
    });
  });

  it("dropdown absent → dropdown_option_removed: false; tool still succeeds", async () => {
    const handles = makeRuntime({
      moveChildrenAndRemoveGroup: () => 2,
      removeDropdownOption: () => false,
    });
    const tool = createRemoveCoastlineGroupTool(handles.runtime);
    const result = await tool.execute({ name: "shipping_lanes" });
    expect(result.isError).toBeFalsy();
    expect(handles.removeDropdownOption).toHaveBeenCalledWith("shipping_lanes");
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      id: "shipping_lanes",
      moved_count: 2,
      dropdown_option_removed: false,
    });
  });

  it("surfaces errors thrown by moveChildrenAndRemoveGroup", async () => {
    const handles = makeRuntime({
      moveChildrenAndRemoveGroup: () => {
        throw new Error("#coastline SVG layer is not available.");
      },
    });
    const tool = createRemoveCoastlineGroupTool(handles.runtime);
    const result = await tool.execute({ name: "shipping_lanes" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/#coastline/);
    expect(handles.removeDropdownOption).not.toHaveBeenCalled();
  });

  it("succeeds with moved_count 0 when removing an empty custom group", async () => {
    const handles = makeRuntime({
      moveChildrenAndRemoveGroup: () => 0,
    });
    const tool = createRemoveCoastlineGroupTool(handles.runtime);
    const result = await tool.execute({ name: "empty_custom" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "empty_custom",
      moved_count: 0,
      dropdown_option_removed: false,
    });
  });
});

// -------- Integration: defaultRemoveCoastlineGroupRuntime against a fake DOM --------

interface FakeNode {
  tagName: string;
  id: string;
  parentNode: FakeElement | null;
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
  sel.options = options;
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

describe("defaultRemoveCoastlineGroupRuntime (integration)", () => {
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalCoastline = (globalThis as { coastline?: unknown }).coastline;

  let coastlineRoot: FakeElement;
  let seaIsland: FakeElement;
  let lakeIsland: FakeElement;
  let shipping: FakeElement;
  let useA: FakeElement;
  let useB: FakeElement;
  let useC: FakeElement;
  let select: FakeElement;

  function buildDom(): void {
    coastlineRoot = fakeElement("g", "coastline");
    seaIsland = fakeElement("g", "sea_island");
    lakeIsland = fakeElement("g", "lake_island");
    shipping = fakeElement("g", "shipping_lanes");
    useA = fakeElement("use", "use_a");
    useB = fakeElement("use", "use_b");
    useC = fakeElement("use", "use_c");
    shipping.appendChild(useA);
    shipping.appendChild(useB);
    shipping.appendChild(useC);
    coastlineRoot.appendChild(seaIsland);
    coastlineRoot.appendChild(lakeIsland);
    coastlineRoot.appendChild(shipping);

    select = fakeSelect("coastlineGroup", [
      "sea_island",
      "lake_island",
      "shipping_lanes",
    ]);
  }

  beforeEach(() => {
    buildDom();
    (globalThis as { document?: unknown }).document = makeFakeDocument([
      coastlineRoot,
      select,
    ]);
    // Default tests do NOT supply a D3 selection — exercise the
    // document fallback path. Tests that need the D3 path will set
    // it explicitly.
    (globalThis as { coastline?: unknown }).coastline = undefined;
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { coastline?: unknown }).coastline = originalCoastline;
  });

  it("happy path: moves children into sea_island, removes <g>, cleans dropdown, preserves order", async () => {
    const result = await removeCoastlineGroupTool.execute({
      name: "shipping_lanes",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "shipping_lanes",
      moved_count: 3,
      dropdown_option_removed: true,
    });

    // <g id="shipping_lanes"> is gone.
    expect(
      coastlineRoot._children.find((c) => c.id === "shipping_lanes"),
    ).toBeUndefined();
    // All three <use> elements are now under sea_island in original order.
    expect(useA.parentNode).toBe(seaIsland);
    expect(useB.parentNode).toBe(seaIsland);
    expect(useC.parentNode).toBe(seaIsland);
    expect(seaIsland._children.map((c) => c.id)).toEqual([
      "use_a",
      "use_b",
      "use_c",
    ]);

    // Dropdown option was removed.
    expect(select.options?.map((o) => o.value)).toEqual([
      "sea_island",
      "lake_island",
    ]);
  });

  it.each(
    DEFAULT_COASTLINE_GROUPS,
  )("rejects default group %s at the SVG-integration layer too", async (id) => {
    const result = await removeCoastlineGroupTool.execute({ name: id });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Cannot remove the default/,
    );
  });

  it("errors when the group is missing; nothing else is touched", async () => {
    const result = await removeCoastlineGroupTool.execute({
      name: "mystery_group",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/'mystery_group'/);
    // shipping_lanes still present.
    expect(
      coastlineRoot._children.find((c) => c.id === "shipping_lanes"),
    ).toBeDefined();
  });

  it("errors when sea_island is missing; nothing is moved", async () => {
    seaIsland.remove();
    const result = await removeCoastlineGroupTool.execute({
      name: "shipping_lanes",
    });
    expect(result.isError).toBe(true);
    const errorText = JSON.parse(result.content).error;
    expect(errorText).toMatch(/shipping_lanes/);
    expect(errorText).toMatch(/sea_island/);
    // <use> elements still under shipping_lanes.
    expect(useA.parentNode).toBe(shipping);
    expect(useB.parentNode).toBe(shipping);
    expect(useC.parentNode).toBe(shipping);
  });

  it("errors when #coastline is missing entirely", async () => {
    (globalThis as { document?: unknown }).document = makeFakeDocument([]);
    const result = await removeCoastlineGroupTool.execute({
      name: "shipping_lanes",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });

  it("succeeds when <select id='coastlineGroup'> is absent", async () => {
    (globalThis as { document?: unknown }).document = makeFakeDocument([
      coastlineRoot,
    ]);
    const result = await removeCoastlineGroupTool.execute({
      name: "shipping_lanes",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      id: "shipping_lanes",
      moved_count: 3,
      dropdown_option_removed: false,
    });
    expect(
      coastlineRoot._children.find((c) => c.id === "shipping_lanes"),
    ).toBeUndefined();
  });

  it("D3 path: globalThis.coastline.node() resolves the layer", async () => {
    // Replace document.getElementById("coastline") with a null result so
    // we can prove the D3 selection path is the one being used.
    const originalGet = (
      globalThis as { document?: { getElementById: (id: string) => unknown } }
    ).document?.getElementById;
    (
      globalThis as {
        document?: { getElementById: (id: string) => FakeElement | null };
      }
    ).document = {
      getElementById: (id: string) => {
        if (id === "coastline") return null;
        // Delegate to the real fake-doc lookup for everything else
        // (sea_island, the dropdown if present, etc.). We need the
        // <select> lookup to still work for the dropdown test below,
        // but here we keep it simple — unrelated lookups still go via
        // the original fake document.
        return originalGet
          ? (originalGet.call(
              (globalThis as { document?: unknown }).document,
              id,
            ) as FakeElement | null)
          : null;
      },
    };
    (globalThis as { coastline?: unknown }).coastline = {
      node: () => coastlineRoot,
    };
    const result = await removeCoastlineGroupTool.execute({
      name: "shipping_lanes",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      id: "shipping_lanes",
      moved_count: 3,
    });
    expect(
      coastlineRoot._children.find((c) => c.id === "shipping_lanes"),
    ).toBeUndefined();
  });

  it("preserves child order across move (named children)", async () => {
    // Wipe the existing children + rebuild with named children + a
    // pre-populated sea_island so we can assert the final ordering.
    while (shipping.firstChild) shipping.firstChild.remove();
    while (seaIsland.firstChild) seaIsland.firstChild.remove();
    const s1 = fakeElement("use", "s1");
    const s2 = fakeElement("use", "s2");
    seaIsland.appendChild(s1);
    seaIsland.appendChild(s2);
    const a = fakeElement("use", "a");
    const b = fakeElement("use", "b");
    const c = fakeElement("use", "c");
    const d = fakeElement("use", "d");
    shipping.appendChild(a);
    shipping.appendChild(b);
    shipping.appendChild(c);
    shipping.appendChild(d);

    const result = await removeCoastlineGroupTool.execute({
      name: "shipping_lanes",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toMatchObject({
      moved_count: 4,
    });
    expect(seaIsland._children.map((x) => x.id)).toEqual([
      "s1",
      "s2",
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});

describe("defaultRemoveCoastlineGroupRuntime unit edges", () => {
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalCoastline = (globalThis as { coastline?: unknown }).coastline;

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { coastline?: unknown }).coastline = originalCoastline;
  });

  it("coastlineLayerExists returns false when both selection and document are absent", () => {
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { coastline?: unknown }).coastline = undefined;
    expect(defaultRemoveCoastlineGroupRuntime.coastlineLayerExists()).toBe(
      false,
    );
  });

  it("coastlineLayerExists returns false when #coastline is absent and no D3 selection", () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    (globalThis as { coastline?: unknown }).coastline = undefined;
    expect(defaultRemoveCoastlineGroupRuntime.coastlineLayerExists()).toBe(
      false,
    );
  });

  it("groupExists returns false when document is absent", () => {
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { coastline?: unknown }).coastline = undefined;
    expect(
      defaultRemoveCoastlineGroupRuntime.groupExists("shipping_lanes"),
    ).toBe(false);
  });

  it("seaIslandExists returns false when document is absent", () => {
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { coastline?: unknown }).coastline = undefined;
    expect(defaultRemoveCoastlineGroupRuntime.seaIslandExists()).toBe(false);
  });

  it("removeDropdownOption returns false when document is absent", () => {
    (globalThis as { document?: unknown }).document = undefined;
    expect(
      defaultRemoveCoastlineGroupRuntime.removeDropdownOption("shipping_lanes"),
    ).toBe(false);
  });

  it("removeDropdownOption returns false when select is absent", () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    expect(
      defaultRemoveCoastlineGroupRuntime.removeDropdownOption("shipping_lanes"),
    ).toBe(false);
  });

  it("moveChildrenAndRemoveGroup throws when #coastline is missing", () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    (globalThis as { coastline?: unknown }).coastline = undefined;
    expect(() =>
      defaultRemoveCoastlineGroupRuntime.moveChildrenAndRemoveGroup(
        "shipping_lanes",
      ),
    ).toThrow(/#coastline/);
  });
});
