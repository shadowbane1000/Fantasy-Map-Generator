import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createRemoveLabelTool,
  type LabelLookup,
  type RemoveLabelRuntime,
  removeLabelTool,
} from "./remove-label";

interface FakeElement {
  tagName: string;
  id: string;
  parentElement: FakeElement | null;
  children: FakeElement[];
  appendChild: (child: FakeElement) => void;
  querySelectorAll: (sel: string) => FakeElement[];
  remove: () => void;
}

function fakeEl(tag: string, id: string): FakeElement {
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    id,
    parentElement: null,
    children: [],
    appendChild(child) {
      if (child.parentElement) {
        const p = child.parentElement;
        p.children = p.children.filter((c) => c !== child);
      }
      child.parentElement = el;
      el.children.push(child);
    },
    querySelectorAll(sel) {
      // Only support `text` for our purposes — descendant <text> nodes.
      if (sel !== "text") return [];
      const out: FakeElement[] = [];
      const stack: FakeElement[] = [...el.children];
      while (stack.length > 0) {
        const cur = stack.shift() as FakeElement;
        if (cur.tagName === "TEXT") out.push(cur);
        if (cur.children.length > 0) stack.push(...cur.children);
      }
      return out;
    },
    remove() {
      if (el.parentElement) {
        el.parentElement.children = el.parentElement.children.filter(
          (c) => c !== el,
        );
        el.parentElement = null;
      }
    },
  };
  return el;
}

interface FakeDom {
  labelsRoot: FakeElement;
  defsRoot: FakeElement;
  states: FakeElement;
  burgLabels: FakeElement;
  addedLabels: FakeElement;
  myGroup: FakeElement;
  stateLabel0: FakeElement;
  burgLabel5: FakeElement;
  addedLabel_42: FakeElement;
  customNoDef: FakeElement;
  outsideText: FakeElement;
  byId: Record<string, FakeElement>;
}

function setupDom(): FakeDom {
  const labelsRoot = fakeEl("g", "labels");
  const defsRoot = fakeEl("defs", "labelsDefs");
  const states = fakeEl("g", "states");
  const burgLabels = fakeEl("g", "burgLabels");
  const addedLabels = fakeEl("g", "addedLabels");
  const myGroup = fakeEl("g", "myGroup");
  labelsRoot.appendChild(states);
  labelsRoot.appendChild(burgLabels);
  labelsRoot.appendChild(addedLabels);
  labelsRoot.appendChild(myGroup);

  const stateLabel0 = fakeEl("text", "stateLabel0");
  const burgLabel5 = fakeEl("text", "burgLabel5");
  const addedLabel_42 = fakeEl("text", "addedLabel_42");
  // Custom group label that has NO companion textPath def.
  const customNoDef = fakeEl("text", "customNoDef");
  states.appendChild(stateLabel0);
  burgLabels.appendChild(burgLabel5);
  addedLabels.appendChild(addedLabel_42);
  myGroup.appendChild(customNoDef);

  // Companion textPath defs for stateLabel0, burgLabel5, addedLabel_42.
  // No def for customNoDef — the tool must still succeed there.
  const defStateLabel0 = fakeEl("textPath", "textPath_stateLabel0");
  const defBurgLabel5 = fakeEl("textPath", "textPath_burgLabel5");
  const defAddedLabel_42 = fakeEl("textPath", "textPath_addedLabel_42");
  defsRoot.appendChild(defStateLabel0);
  defsRoot.appendChild(defBurgLabel5);
  defsRoot.appendChild(defAddedLabel_42);

  // A `<text>` that lives outside #labels — used for the
  // "outside_labels" error path.
  const outsideText = fakeEl("text", "loneText");

  const byId: Record<string, FakeElement> = {
    labels: labelsRoot,
    labelsDefs: defsRoot,
    states,
    burgLabels,
    addedLabels,
    myGroup,
    stateLabel0,
    burgLabel5,
    addedLabel_42,
    customNoDef,
    loneText: outsideText,
    textPath_stateLabel0: defStateLabel0,
    textPath_burgLabel5: defBurgLabel5,
    textPath_addedLabel_42: defAddedLabel_42,
    // textPath_customNoDef intentionally absent.
  };

  return {
    labelsRoot,
    defsRoot,
    states,
    burgLabels,
    addedLabels,
    myGroup,
    stateLabel0,
    burgLabel5,
    addedLabel_42,
    customNoDef,
    outsideText,
    byId,
  };
}

describe("remove_label tool — unit (mocked runtime)", () => {
  function makeRuntime(overrides: Partial<RemoveLabelRuntime> = {}): {
    runtime: RemoveLabelRuntime;
    findLabel: ReturnType<typeof vi.fn<RemoveLabelRuntime["findLabel"]>>;
    removeTextpath: ReturnType<
      typeof vi.fn<RemoveLabelRuntime["removeTextpath"]>
    >;
    removeLabel: ReturnType<typeof vi.fn<RemoveLabelRuntime["removeLabel"]>>;
  } {
    const findLabel = vi.fn<RemoveLabelRuntime["findLabel"]>(
      overrides.findLabel ?? (() => ({ kind: "not_found" }) as LabelLookup),
    );
    const removeTextpath = vi.fn<RemoveLabelRuntime["removeTextpath"]>(
      overrides.removeTextpath ?? (() => false),
    );
    const removeLabel = vi.fn<RemoveLabelRuntime["removeLabel"]>(
      overrides.removeLabel ?? (() => undefined),
    );
    return {
      runtime: { findLabel, removeTextpath, removeLabel },
      findLabel,
      removeTextpath,
      removeLabel,
    };
  }

  it("happy path with companion def: removes both, reports textpath_removed:true", async () => {
    const dom = setupDom();
    const { runtime, removeTextpath, removeLabel } = makeRuntime({
      findLabel: () => ({
        kind: "found",
        el: dom.addedLabel_42 as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      removeTextpath: () => true,
    });
    const tool = createRemoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42" });
    expect(r.isError).toBeFalsy();
    expect(removeTextpath).toHaveBeenCalledWith("addedLabel_42");
    expect(removeLabel).toHaveBeenCalledWith(dom.addedLabel_42);
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      textpath_removed: true,
    });
  });

  it("happy path WITHOUT companion def: removes <text>, reports textpath_removed:false", async () => {
    const dom = setupDom();
    const { runtime, removeLabel } = makeRuntime({
      findLabel: () => ({
        kind: "found",
        el: dom.customNoDef as unknown as Element,
        parent: dom.myGroup as unknown as Element,
      }),
      removeTextpath: () => false,
    });
    const tool = createRemoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "customNoDef" });
    expect(r.isError).toBeFalsy();
    expect(removeLabel).toHaveBeenCalledWith(dom.customNoDef);
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "customNoDef",
      textpath_removed: false,
    });
  });

  it("trims whitespace before lookup / forwarding", async () => {
    const dom = setupDom();
    const { runtime, findLabel, removeTextpath, removeLabel } = makeRuntime({
      findLabel: () => ({
        kind: "found",
        el: dom.addedLabel_42 as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      removeTextpath: () => true,
    });
    const tool = createRemoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "  addedLabel_42  " });
    expect(r.isError).toBeFalsy();
    expect(findLabel).toHaveBeenCalledWith("addedLabel_42");
    expect(removeTextpath).toHaveBeenCalledWith("addedLabel_42");
    expect(removeLabel).toHaveBeenCalledWith(dom.addedLabel_42);
    expect(JSON.parse(r.content)).toMatchObject({
      label_id: "addedLabel_42",
      textpath_removed: true,
    });
  });

  it("missing label_id → error, no lookups", async () => {
    const { runtime, findLabel, removeTextpath, removeLabel } = makeRuntime();
    const tool = createRemoveLabelTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42]) {
      const r = await tool.execute({ label_id: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/label_id/);
    }
    expect(findLabel).not.toHaveBeenCalled();
    expect(removeTextpath).not.toHaveBeenCalled();
    expect(removeLabel).not.toHaveBeenCalled();
  });

  it("rejects object input with no label_id key", async () => {
    const { runtime, findLabel, removeTextpath, removeLabel } = makeRuntime();
    const tool = createRemoveLabelTool(runtime);
    const r = await tool.execute({});
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/label_id/);
    expect(findLabel).not.toHaveBeenCalled();
    expect(removeTextpath).not.toHaveBeenCalled();
    expect(removeLabel).not.toHaveBeenCalled();
  });

  it("findLabel kind=not_found → error mentioning the id, nothing removed", async () => {
    const { runtime, removeTextpath, removeLabel } = makeRuntime({
      findLabel: () => ({ kind: "not_found" }),
    });
    const tool = createRemoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "ghost" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/ghost/);
    expect(removeTextpath).not.toHaveBeenCalled();
    expect(removeLabel).not.toHaveBeenCalled();
  });

  it("findLabel kind=outside_labels → error 'not found under #labels'", async () => {
    const { runtime, removeTextpath, removeLabel } = makeRuntime({
      findLabel: () => ({ kind: "outside_labels" }),
    });
    const tool = createRemoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "loneText" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not found under #labels/);
    expect(removeTextpath).not.toHaveBeenCalled();
    expect(removeLabel).not.toHaveBeenCalled();
  });

  it("findLabel kind=unexpected_parent → error 'unexpected parent'", async () => {
    const { runtime, removeTextpath, removeLabel } = makeRuntime({
      findLabel: () => ({ kind: "unexpected_parent" }),
    });
    const tool = createRemoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "weirdLabel" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/unexpected parent/);
    expect(removeTextpath).not.toHaveBeenCalled();
    expect(removeLabel).not.toHaveBeenCalled();
  });

  it("findLabel kind=labels_root_missing → error mentions #labels", async () => {
    const { runtime, removeTextpath, removeLabel } = makeRuntime({
      findLabel: () => ({ kind: "labels_root_missing" }),
    });
    const tool = createRemoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "x" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
    expect(removeTextpath).not.toHaveBeenCalled();
    expect(removeLabel).not.toHaveBeenCalled();
  });

  it("removeLabel throwing surfaces as error", async () => {
    const dom = setupDom();
    const { runtime, removeTextpath } = makeRuntime({
      findLabel: () => ({
        kind: "found",
        el: dom.addedLabel_42 as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      removeTextpath: () => true,
      removeLabel: () => {
        throw new Error("DOM exploded");
      },
    });
    const tool = createRemoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/DOM exploded/);
    // textpath was attempted (and reported removed) before <text> failed.
    expect(removeTextpath).toHaveBeenCalledWith("addedLabel_42");
  });

  it("registers under name 'remove_label' and round-trips through registry", async () => {
    expect(removeLabelTool.name).toBe("remove_label");
    const reg = new ToolRegistry();
    reg.register(removeLabelTool);
    expect(reg.list().map((t) => t.name)).toContain("remove_label");
    // With no DOM in node, the default runtime returns
    // labels_root_missing; the registry should surface that as an
    // error rather than crash.
    const out = await reg.run("remove_label", { label_id: "stateLabel0" });
    expect(out.isError).toBe(true);
  });

  it("description mentions destructiveness", () => {
    expect(removeLabelTool.description.toLowerCase()).toMatch(
      /destructive|irreversible|permanent/,
    );
  });

  it("input_schema requires only label_id", () => {
    expect(removeLabelTool.input_schema).toMatchObject({
      type: "object",
      required: ["label_id"],
    });
    expect(removeLabelTool.input_schema.properties).toHaveProperty("label_id");
  });
});

describe("defaultRemoveLabelRuntime (integration with mocked DOM)", () => {
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalLabels = (globalThis as { labels?: unknown }).labels;
  let dom: FakeDom;

  beforeEach(() => {
    dom = setupDom();
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => dom.byId[id] ?? null,
    };
    // No window.labels — we want the default runtime to fall back to
    // document.getElementById("labels").
    (globalThis as { labels?: unknown }).labels = undefined;
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { labels?: unknown }).labels = originalLabels;
  });

  it("happy path: removes addedLabel_42 plus its companion def", async () => {
    const r = await removeLabelTool.execute({ label_id: "addedLabel_42" });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      textpath_removed: true,
    });
    // <text> is gone from its parent.
    expect(dom.addedLabels.children).not.toContain(dom.addedLabel_42);
    // textPath def is gone from defs.
    expect(
      dom.defsRoot.children.find((c) => c.id === "textPath_addedLabel_42"),
    ).toBeUndefined();
  });

  it("removes label that has no companion def — textpath_removed:false", async () => {
    const r = await removeLabelTool.execute({ label_id: "customNoDef" });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "customNoDef",
      textpath_removed: false,
    });
    expect(dom.myGroup.children).not.toContain(dom.customNoDef);
  });

  it("removes a label from the basic 'states' group plus its def", async () => {
    const r = await removeLabelTool.execute({ label_id: "stateLabel0" });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toMatchObject({
      label_id: "stateLabel0",
      textpath_removed: true,
    });
    expect(dom.states.children).not.toContain(dom.stateLabel0);
    expect(
      dom.defsRoot.children.find((c) => c.id === "textPath_stateLabel0"),
    ).toBeUndefined();
  });

  it("removes a label from 'burgLabels' plus its def", async () => {
    const r = await removeLabelTool.execute({ label_id: "burgLabel5" });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toMatchObject({
      label_id: "burgLabel5",
      textpath_removed: true,
    });
    expect(dom.burgLabels.children).not.toContain(dom.burgLabel5);
    expect(
      dom.defsRoot.children.find((c) => c.id === "textPath_burgLabel5"),
    ).toBeUndefined();
  });

  it("unknown label_id → error; DOM unchanged", async () => {
    const r = await removeLabelTool.execute({
      label_id: "nope_does_not_exist",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/nope_does_not_exist/);
    // DOM still intact.
    expect(dom.addedLabels.children).toContain(dom.addedLabel_42);
    expect(
      dom.defsRoot.children.find((c) => c.id === "textPath_addedLabel_42"),
    ).toBeDefined();
  });

  it("label outside #labels → error 'not found under #labels'; nothing removed", async () => {
    const r = await removeLabelTool.execute({ label_id: "loneText" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not found under #labels/);
    // outsideText still exists (still detached from any parent, but the
    // important thing is that we did not remove anything else).
    expect(dom.addedLabels.children).toContain(dom.addedLabel_42);
  });

  it("label whose parent is not a direct <g> under #labels → 'unexpected parent'", async () => {
    // Nest a deeper container so addedLabel_42 ends up inside a wrapper
    // <g> that is NOT itself a direct child of #labels.
    const inner = fakeEl("g", "innerWrapper");
    dom.addedLabels.appendChild(inner);
    inner.appendChild(dom.addedLabel_42);
    dom.byId.innerWrapper = inner;
    const r = await removeLabelTool.execute({ label_id: "addedLabel_42" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/unexpected parent/);
    // Nothing was removed — def still in place, label still in inner.
    expect(inner.children).toContain(dom.addedLabel_42);
    expect(
      dom.defsRoot.children.find((c) => c.id === "textPath_addedLabel_42"),
    ).toBeDefined();
  });

  it("both window.labels and #labels missing → error", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    (globalThis as { labels?: unknown }).labels = undefined;
    const r = await removeLabelTool.execute({ label_id: "addedLabel_42" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
  });

  it("uses window.labels D3 selection when present", async () => {
    (globalThis as { labels?: unknown }).labels = {
      node: () => dom.labelsRoot,
    };
    (globalThis as { document?: unknown }).document = {
      // Allow direct id lookups for the label and its def, but return
      // null for "labels" so the D3 path is what supplies labelsRoot.
      getElementById: (id: string) => {
        if (id === "labels") return null;
        return dom.byId[id] ?? null;
      },
    };
    const r = await removeLabelTool.execute({ label_id: "addedLabel_42" });
    expect(r.isError).toBeFalsy();
    expect(dom.addedLabels.children).not.toContain(dom.addedLabel_42);
    expect(
      dom.defsRoot.children.find((c) => c.id === "textPath_addedLabel_42"),
    ).toBeUndefined();
  });

  it("falls back to scoped <text> scan when global getElementById misses but #labels has the label", async () => {
    // Simulate document.getElementById returning labelsRoot only via a
    // synthetic "labels" lookup; for any other id, return null. Force
    // the runtime to use the querySelectorAll fallback.
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => {
        if (id === "labels") return dom.labelsRoot;
        // Allow textPath lookups so the def is still removable.
        if (id.startsWith("textPath_")) return dom.byId[id] ?? null;
        return null;
      },
    };
    (globalThis as { labels?: unknown }).labels = undefined;
    const r = await removeLabelTool.execute({ label_id: "addedLabel_42" });
    expect(r.isError).toBeFalsy();
    expect(dom.addedLabels.children).not.toContain(dom.addedLabel_42);
    expect(
      dom.defsRoot.children.find((c) => c.id === "textPath_addedLabel_42"),
    ).toBeUndefined();
  });
});
