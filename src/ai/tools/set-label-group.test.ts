import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createSetLabelGroupTool,
  type LabelLookup,
  type SetLabelGroupRuntime,
  setLabelGroupTool,
  type TargetGroupLookup,
} from "./set-label-group";

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
  states: FakeElement;
  burgLabels: FakeElement;
  addedLabels: FakeElement;
  myGroup: FakeElement;
  stateLabel0: FakeElement;
  burgLabel5: FakeElement;
  addedLabel_42: FakeElement;
  outsideText: FakeElement;
  byId: Record<string, FakeElement>;
}

function setupDom(): FakeDom {
  const labelsRoot = fakeEl("g", "labels");
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
  states.appendChild(stateLabel0);
  burgLabels.appendChild(burgLabel5);
  addedLabels.appendChild(addedLabel_42);

  // A `<text>` that lives outside #labels — used for the
  // "outside_labels" error path.
  const outsideText = fakeEl("text", "loneText");

  const byId: Record<string, FakeElement> = {
    labels: labelsRoot,
    states,
    burgLabels,
    addedLabels,
    myGroup,
    stateLabel0,
    burgLabel5,
    addedLabel_42,
    loneText: outsideText,
  };

  return {
    labelsRoot,
    states,
    burgLabels,
    addedLabels,
    myGroup,
    stateLabel0,
    burgLabel5,
    addedLabel_42,
    outsideText,
    byId,
  };
}

describe("set_label_group tool — unit (mocked runtime)", () => {
  function makeRuntime(overrides: Partial<SetLabelGroupRuntime> = {}): {
    runtime: SetLabelGroupRuntime;
    findLabel: ReturnType<typeof vi.fn<SetLabelGroupRuntime["findLabel"]>>;
    findTargetGroup: ReturnType<
      typeof vi.fn<SetLabelGroupRuntime["findTargetGroup"]>
    >;
    move: ReturnType<typeof vi.fn<SetLabelGroupRuntime["move"]>>;
  } {
    const findLabel = vi.fn<SetLabelGroupRuntime["findLabel"]>(
      overrides.findLabel ?? (() => ({ kind: "not_found" }) as LabelLookup),
    );
    const findTargetGroup = vi.fn<SetLabelGroupRuntime["findTargetGroup"]>(
      overrides.findTargetGroup ??
        (() => ({ kind: "missing", available: [] }) as TargetGroupLookup),
    );
    const move = vi.fn<SetLabelGroupRuntime["move"]>(
      overrides.move ?? (() => undefined),
    );
    return {
      runtime: { findLabel, findTargetGroup, move },
      findLabel,
      findTargetGroup,
      move,
    };
  }

  it("happy path: moves the label and reports correct old/new group", async () => {
    const dom = setupDom();
    const { runtime, move } = makeRuntime({
      findLabel: () => ({
        kind: "found",
        el: dom.addedLabel_42 as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      findTargetGroup: () => ({
        kind: "found",
        el: dom.myGroup as unknown as Element,
      }),
    });
    const tool = createSetLabelGroupTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      group: "myGroup",
    });
    expect(r.isError).toBeFalsy();
    expect(move).toHaveBeenCalledWith(dom.addedLabel_42, dom.myGroup);
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_group: "addedLabels",
      new_group: "myGroup",
      changed: true,
    });
  });

  it("same-group no-op: move not called, changed=false", async () => {
    const dom = setupDom();
    const { runtime, move } = makeRuntime({
      findLabel: () => ({
        kind: "found",
        el: dom.addedLabel_42 as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      findTargetGroup: () => ({
        kind: "found",
        el: dom.addedLabels as unknown as Element,
      }),
    });
    const tool = createSetLabelGroupTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      group: "addedLabels",
    });
    expect(r.isError).toBeFalsy();
    expect(move).not.toHaveBeenCalled();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_group: "addedLabels",
      new_group: "addedLabels",
      changed: false,
    });
  });

  it("missing label_id → error, no lookups", async () => {
    const { runtime, findLabel, findTargetGroup, move } = makeRuntime();
    const tool = createSetLabelGroupTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42]) {
      const r = await tool.execute({ label_id: bad, group: "myGroup" });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/label_id/);
    }
    expect(findLabel).not.toHaveBeenCalled();
    expect(findTargetGroup).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
  });

  it("missing group → error, no lookups", async () => {
    const { runtime, findLabel, findTargetGroup, move } = makeRuntime();
    const tool = createSetLabelGroupTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42]) {
      const r = await tool.execute({ label_id: "stateLabel0", group: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/group/);
    }
    expect(findLabel).not.toHaveBeenCalled();
    expect(findTargetGroup).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
  });

  it("findLabel kind=not_found → error mentioning the id, no move", async () => {
    const { runtime, move } = makeRuntime({
      findLabel: () => ({ kind: "not_found" }),
    });
    const tool = createSetLabelGroupTool(runtime);
    const r = await tool.execute({ label_id: "ghost", group: "myGroup" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/ghost/);
    expect(move).not.toHaveBeenCalled();
  });

  it("findLabel kind=outside_labels → error 'not found under #labels'", async () => {
    const { runtime, move } = makeRuntime({
      findLabel: () => ({ kind: "outside_labels" }),
    });
    const tool = createSetLabelGroupTool(runtime);
    const r = await tool.execute({ label_id: "loneText", group: "myGroup" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not found under #labels/);
    expect(move).not.toHaveBeenCalled();
  });

  it("findLabel kind=unexpected_parent → error 'unexpected parent'", async () => {
    const { runtime, move } = makeRuntime({
      findLabel: () => ({ kind: "unexpected_parent" }),
    });
    const tool = createSetLabelGroupTool(runtime);
    const r = await tool.execute({
      label_id: "weirdLabel",
      group: "myGroup",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/unexpected parent/);
    expect(move).not.toHaveBeenCalled();
  });

  it("findLabel kind=labels_root_missing → error mentions #labels", async () => {
    const { runtime, move } = makeRuntime({
      findLabel: () => ({ kind: "labels_root_missing" }),
    });
    const tool = createSetLabelGroupTool(runtime);
    const r = await tool.execute({ label_id: "x", group: "myGroup" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
    expect(move).not.toHaveBeenCalled();
  });

  it("findTargetGroup kind=missing → error with available list", async () => {
    const dom = setupDom();
    const { runtime, move } = makeRuntime({
      findLabel: () => ({
        kind: "found",
        el: dom.addedLabel_42 as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      findTargetGroup: () => ({
        kind: "missing",
        available: ["states", "burgLabels", "addedLabels", "myGroup"],
      }),
    });
    const tool = createSetLabelGroupTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      group: "ghostGroup",
    });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content);
    expect(body.error).toMatch(/ghostGroup/);
    expect(body.available).toEqual([
      "states",
      "burgLabels",
      "addedLabels",
      "myGroup",
    ]);
    expect(move).not.toHaveBeenCalled();
  });

  it("findTargetGroup kind=labels_root_missing → error mentions #labels", async () => {
    const dom = setupDom();
    const { runtime, move } = makeRuntime({
      findLabel: () => ({
        kind: "found",
        el: dom.addedLabel_42 as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      findTargetGroup: () => ({ kind: "labels_root_missing" }),
    });
    const tool = createSetLabelGroupTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      group: "myGroup",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
    expect(move).not.toHaveBeenCalled();
  });

  it("move throwing surfaces as error", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime({
      findLabel: () => ({
        kind: "found",
        el: dom.addedLabel_42 as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      findTargetGroup: () => ({
        kind: "found",
        el: dom.myGroup as unknown as Element,
      }),
      move: () => {
        throw new Error("DOM exploded");
      },
    });
    const tool = createSetLabelGroupTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      group: "myGroup",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/DOM exploded/);
  });

  it("registers under name 'set_label_group' and round-trips through registry", async () => {
    expect(setLabelGroupTool.name).toBe("set_label_group");
    const reg = new ToolRegistry();
    reg.register(setLabelGroupTool);
    expect(reg.list().map((t) => t.name)).toContain("set_label_group");
    // With no DOM in node, the default runtime returns
    // labels_root_missing; the registry should surface that as an
    // error rather than crash.
    const out = await reg.run("set_label_group", {
      label_id: "stateLabel0",
      group: "states",
    });
    expect(out.isError).toBe(true);
  });
});

describe("defaultSetLabelGroupRuntime (integration with mocked DOM)", () => {
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

  it("happy path: moves addedLabel_42 from addedLabels to myGroup", async () => {
    const r = await setLabelGroupTool.execute({
      label_id: "addedLabel_42",
      group: "myGroup",
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_group: "addedLabels",
      new_group: "myGroup",
      changed: true,
    });
    expect(dom.addedLabel_42.parentElement).toBe(dom.myGroup);
    expect(dom.addedLabels.children).not.toContain(dom.addedLabel_42);
    expect(dom.myGroup.children).toContain(dom.addedLabel_42);
  });

  it("same-group no-op: changed=false, idempotent (single parent)", async () => {
    const r = await setLabelGroupTool.execute({
      label_id: "addedLabel_42",
      group: "addedLabels",
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_group: "addedLabels",
      new_group: "addedLabels",
      changed: false,
    });
    expect(dom.addedLabel_42.parentElement).toBe(dom.addedLabels);
    // Parent contains it exactly once.
    const occurrences = dom.addedLabels.children.filter(
      (c) => c === dom.addedLabel_42,
    ).length;
    expect(occurrences).toBe(1);
  });

  it("moves stateLabel0 from states → myGroup (editor filters this out, AI tool does not)", async () => {
    const r = await setLabelGroupTool.execute({
      label_id: "stateLabel0",
      group: "myGroup",
    });
    expect(r.isError).toBeFalsy();
    expect(dom.stateLabel0.parentElement).toBe(dom.myGroup);
    expect(dom.states.children).not.toContain(dom.stateLabel0);
    expect(JSON.parse(r.content)).toMatchObject({
      old_group: "states",
      new_group: "myGroup",
      changed: true,
    });
  });

  it("moves burgLabel5 from burgLabels → myGroup", async () => {
    const r = await setLabelGroupTool.execute({
      label_id: "burgLabel5",
      group: "myGroup",
    });
    expect(r.isError).toBeFalsy();
    expect(dom.burgLabel5.parentElement).toBe(dom.myGroup);
    expect(dom.burgLabels.children).not.toContain(dom.burgLabel5);
    expect(JSON.parse(r.content)).toMatchObject({
      old_group: "burgLabels",
      new_group: "myGroup",
      changed: true,
    });
  });

  it("unknown label_id → error", async () => {
    const r = await setLabelGroupTool.execute({
      label_id: "nope_does_not_exist",
      group: "myGroup",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/nope_does_not_exist/);
  });

  it("unknown target group → error with available list; DOM unchanged", async () => {
    const r = await setLabelGroupTool.execute({
      label_id: "addedLabel_42",
      group: "ghostGroup",
    });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content);
    expect(body.error).toMatch(/ghostGroup/);
    expect(body.available).toEqual([
      "states",
      "burgLabels",
      "addedLabels",
      "myGroup",
    ]);
    expect(dom.addedLabel_42.parentElement).toBe(dom.addedLabels);
  });

  it("label outside #labels → error 'not found under #labels'", async () => {
    // dom.outsideText has id "loneText" but is NOT under labelsRoot.
    const r = await setLabelGroupTool.execute({
      label_id: "loneText",
      group: "myGroup",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not found under #labels/);
  });

  it("label whose parent is not a direct <g> under #labels → 'unexpected parent'", async () => {
    // Nest a deeper container so addedLabel_42 ends up inside a wrapper
    // <g> that is NOT itself a direct child of #labels.
    const inner = fakeEl("g", "innerWrapper");
    dom.addedLabels.appendChild(inner);
    inner.appendChild(dom.addedLabel_42);
    // Update byId so document.getElementById still resolves.
    dom.byId.innerWrapper = inner;
    const r = await setLabelGroupTool.execute({
      label_id: "addedLabel_42",
      group: "myGroup",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/unexpected parent/);
  });

  it("both window.labels and #labels missing → error", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    (globalThis as { labels?: unknown }).labels = undefined;
    const r = await setLabelGroupTool.execute({
      label_id: "addedLabel_42",
      group: "myGroup",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
  });

  it("uses window.labels D3 selection when present", async () => {
    // Wipe document.getElementById so resolution depends on window.labels.
    (globalThis as { labels?: unknown }).labels = {
      node: () => dom.labelsRoot,
    };
    (globalThis as { document?: unknown }).document = {
      // Allow direct id lookups for the label itself, but return null
      // for "labels" so the D3 path is what supplies labelsRoot.
      getElementById: (id: string) => {
        if (id === "labels") return null;
        return dom.byId[id] ?? null;
      },
    };
    const r = await setLabelGroupTool.execute({
      label_id: "addedLabel_42",
      group: "myGroup",
    });
    expect(r.isError).toBeFalsy();
    expect(dom.addedLabel_42.parentElement).toBe(dom.myGroup);
  });
});
