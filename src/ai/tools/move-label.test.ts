import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createMoveLabelTool,
  type MoveLabelRuntime,
  moveLabelTool,
} from "./move-label";
import type { LabelLookup } from "./set-label-group";

interface FakeElement {
  tagName: string;
  id: string;
  parentElement: FakeElement | null;
  children: FakeElement[];
  attrs: Map<string, string>;
  appendChild: (child: FakeElement) => void;
  querySelectorAll: (sel: string) => FakeElement[];
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
}

function fakeEl(tag: string, id: string): FakeElement {
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    id,
    parentElement: null,
    children: [],
    attrs: new Map<string, string>(),
    appendChild(child) {
      if (child.parentElement) {
        const p = child.parentElement;
        p.children = p.children.filter((c) => c !== child);
      }
      child.parentElement = el;
      el.children.push(child);
    },
    querySelectorAll(sel) {
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
    getAttribute(name) {
      return el.attrs.has(name) ? (el.attrs.get(name) as string) : null;
    },
    setAttribute(name, value) {
      el.attrs.set(name, value);
    },
  };
  return el;
}

interface FakeDom {
  labelsRoot: FakeElement;
  states: FakeElement;
  addedLabels: FakeElement;
  addedLabel_42: FakeElement;
  addedLabel_42_textPath: FakeElement;
  outsideText: FakeElement;
  byId: Record<string, FakeElement>;
}

function setupDom(): FakeDom {
  const labelsRoot = fakeEl("g", "labels");
  const states = fakeEl("g", "states");
  const addedLabels = fakeEl("g", "addedLabels");
  labelsRoot.appendChild(states);
  labelsRoot.appendChild(addedLabels);

  const addedLabel_42 = fakeEl("text", "addedLabel_42");
  addedLabel_42.setAttribute("transform", "translate(100,200)");
  const addedLabel_42_textPath = fakeEl("textPath", "");
  addedLabel_42_textPath.setAttribute("d", "M0,0 L100,0");
  addedLabels.appendChild(addedLabel_42);
  addedLabel_42.appendChild(addedLabel_42_textPath);

  // A `<text>` outside #labels — used for the "outside_labels" path.
  const outsideText = fakeEl("text", "loneText");

  const byId: Record<string, FakeElement> = {
    labels: labelsRoot,
    states,
    addedLabels,
    addedLabel_42,
    loneText: outsideText,
  };

  return {
    labelsRoot,
    states,
    addedLabels,
    addedLabel_42,
    addedLabel_42_textPath,
    outsideText,
    byId,
  };
}

describe("move_label tool — unit (mocked runtime)", () => {
  function makeRuntime(overrides: Partial<MoveLabelRuntime> = {}): {
    runtime: MoveLabelRuntime;
    findLabel: ReturnType<typeof vi.fn<MoveLabelRuntime["findLabel"]>>;
    getTransform: ReturnType<typeof vi.fn<MoveLabelRuntime["getTransform"]>>;
    setTransform: ReturnType<typeof vi.fn<MoveLabelRuntime["setTransform"]>>;
  } {
    const findLabel = vi.fn<MoveLabelRuntime["findLabel"]>(
      overrides.findLabel ?? (() => ({ kind: "not_found" }) as LabelLookup),
    );
    const getTransform = vi.fn<MoveLabelRuntime["getTransform"]>(
      overrides.getTransform ?? (() => null),
    );
    const setTransform = vi.fn<MoveLabelRuntime["setTransform"]>(
      overrides.setTransform ?? (() => undefined),
    );
    return {
      runtime: { findLabel, getTransform, setTransform },
      findLabel,
      getTransform,
      setTransform,
    };
  }

  function foundLabelOverrides(
    dom: FakeDom,
    overrides: Partial<MoveLabelRuntime> = {},
  ): Partial<MoveLabelRuntime> {
    return {
      findLabel: () => ({
        kind: "found",
        el: dom.addedLabel_42 as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      getTransform: () => "translate(100,200)",
      setTransform: () => undefined,
      ...overrides,
    };
  }

  it("happy path: translate(100,200) → x=300,y=400 sets translate(300,400) and reports old/new", async () => {
    const dom = setupDom();
    const { runtime, setTransform } = makeRuntime(foundLabelOverrides(dom));
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      x: 300,
      y: 400,
    });
    expect(r.isError).toBeFalsy();
    expect(setTransform).toHaveBeenCalledWith(
      dom.addedLabel_42,
      "translate(300,400)",
    );
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_x: 100,
      old_y: 200,
      new_x: 300,
      new_y: 400,
    });
  });

  it("getTransform returns null → old_x/old_y null, new still applied", async () => {
    const dom = setupDom();
    const { runtime, setTransform } = makeRuntime(
      foundLabelOverrides(dom, { getTransform: () => null }),
    );
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      x: 50,
      y: 60,
    });
    expect(r.isError).toBeFalsy();
    expect(setTransform).toHaveBeenCalledWith(
      dom.addedLabel_42,
      "translate(50,60)",
    );
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_x: null,
      old_y: null,
      new_x: 50,
      new_y: 60,
    });
  });

  it("parses 'translate(100 200)' (space separator)", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, { getTransform: () => "translate(100 200)" }),
    );
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", x: 1, y: 2 });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toMatchObject({ old_x: 100, old_y: 200 });
  });

  it("parses 'translate( 100 , 200 )' (whitespace padding)", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, {
        getTransform: () => "translate( 100 , 200 )",
      }),
    );
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", x: 1, y: 2 });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toMatchObject({ old_x: 100, old_y: 200 });
  });

  it("parses 'translate(-1.5e2,3.7E1)' (scientific notation, signed)", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, {
        getTransform: () => "translate(-1.5e2,3.7E1)",
      }),
    );
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", x: 1, y: 2 });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toMatchObject({ old_x: -150, old_y: 37 });
  });

  it("garbage 'translate(foo)' → both null, new still applied", async () => {
    const dom = setupDom();
    const { runtime, setTransform } = makeRuntime(
      foundLabelOverrides(dom, { getTransform: () => "translate(foo)" }),
    );
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", x: 5, y: 6 });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_x: null,
      old_y: null,
      new_x: 5,
      new_y: 6,
    });
    expect(setTransform).toHaveBeenCalledWith(
      dom.addedLabel_42,
      "translate(5,6)",
    );
  });

  it("unrelated transform 'rotate(45)' → both null, new still applied", async () => {
    const dom = setupDom();
    const { runtime, setTransform } = makeRuntime(
      foundLabelOverrides(dom, { getTransform: () => "rotate(45)" }),
    );
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", x: 5, y: 6 });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toMatchObject({ old_x: null, old_y: null });
    expect(setTransform).toHaveBeenCalledWith(
      dom.addedLabel_42,
      "translate(5,6)",
    );
  });

  it("negative coordinates accepted: x=-1000, y=-500", async () => {
    const dom = setupDom();
    const { runtime, setTransform } = makeRuntime(foundLabelOverrides(dom));
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      x: -1000,
      y: -500,
    });
    expect(r.isError).toBeFalsy();
    expect(setTransform).toHaveBeenCalledWith(
      dom.addedLabel_42,
      "translate(-1000,-500)",
    );
    expect(JSON.parse(r.content)).toMatchObject({
      new_x: -1000,
      new_y: -500,
    });
  });

  it("non-integer coordinates accepted: x=1.5, y=2.7", async () => {
    const dom = setupDom();
    const { runtime, setTransform } = makeRuntime(foundLabelOverrides(dom));
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      x: 1.5,
      y: 2.7,
    });
    expect(r.isError).toBeFalsy();
    expect(setTransform).toHaveBeenCalledWith(
      dom.addedLabel_42,
      "translate(1.5,2.7)",
    );
    expect(JSON.parse(r.content)).toMatchObject({ new_x: 1.5, new_y: 2.7 });
  });

  it("rejects non-finite x", async () => {
    const dom = setupDom();
    const { runtime, setTransform } = makeRuntime(foundLabelOverrides(dom));
    const tool = createMoveLabelTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "100",
      null,
      undefined,
      true,
      {},
    ]) {
      const r = await tool.execute({
        label_id: "addedLabel_42",
        x: bad,
        y: 200,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/x must be a finite number/);
    }
    expect(setTransform).not.toHaveBeenCalled();
  });

  it("rejects non-finite y", async () => {
    const dom = setupDom();
    const { runtime, setTransform } = makeRuntime(foundLabelOverrides(dom));
    const tool = createMoveLabelTool(runtime);
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "200",
      null,
      undefined,
      true,
      {},
    ]) {
      const r = await tool.execute({
        label_id: "addedLabel_42",
        x: 100,
        y: bad,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/y must be a finite number/);
    }
    expect(setTransform).not.toHaveBeenCalled();
  });

  it("missing label_id → error, no findLabel call", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createMoveLabelTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42]) {
      const r = await tool.execute({ label_id: bad, x: 1, y: 2 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/label_id/);
    }
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("missing x → error", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/x must be a finite number/);
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("missing y → error", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", x: 1 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/y must be a finite number/);
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("findLabel kind=not_found → error mentioning the id, no setTransform", async () => {
    const { runtime, setTransform } = makeRuntime({
      findLabel: () => ({ kind: "not_found" }),
    });
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "ghost", x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/ghost/);
    expect(setTransform).not.toHaveBeenCalled();
  });

  it("findLabel kind=outside_labels → error 'not found under #labels'", async () => {
    const { runtime, setTransform } = makeRuntime({
      findLabel: () => ({ kind: "outside_labels" }),
    });
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "loneText", x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not found under #labels/);
    expect(setTransform).not.toHaveBeenCalled();
  });

  it("findLabel kind=unexpected_parent → error 'unexpected parent'", async () => {
    const { runtime, setTransform } = makeRuntime({
      findLabel: () => ({ kind: "unexpected_parent" }),
    });
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "weirdLabel", x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/unexpected parent/);
    expect(setTransform).not.toHaveBeenCalled();
  });

  it("findLabel kind=labels_root_missing → error mentions #labels", async () => {
    const { runtime, setTransform } = makeRuntime({
      findLabel: () => ({ kind: "labels_root_missing" }),
    });
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({ label_id: "x", x: 1, y: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
    expect(setTransform).not.toHaveBeenCalled();
  });

  it("setTransform throwing surfaces as error", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, {
        setTransform: () => {
          throw new Error("DOM exploded");
        },
      }),
    );
    const tool = createMoveLabelTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      x: 1,
      y: 2,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/DOM exploded/);
  });

  it("registers under name 'move_label' and round-trips through registry", async () => {
    expect(moveLabelTool.name).toBe("move_label");
    const reg = new ToolRegistry();
    reg.register(moveLabelTool);
    expect(reg.list().map((t) => t.name)).toContain("move_label");
    // With no DOM in node, the default runtime returns
    // labels_root_missing; the registry should surface that as an
    // error rather than crash.
    const out = await reg.run("move_label", {
      label_id: "addedLabel_42",
      x: 1,
      y: 2,
    });
    expect(out.isError).toBe(true);
  });
});

describe("defaultMoveLabelRuntime (integration with mocked DOM)", () => {
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalLabels = (globalThis as { labels?: unknown }).labels;
  let dom: FakeDom;

  beforeEach(() => {
    dom = setupDom();
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => dom.byId[id] ?? null,
    };
    (globalThis as { labels?: unknown }).labels = undefined;
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { labels?: unknown }).labels = originalLabels;
  });

  it("happy path: writes transform on the <text> and reports old/new", async () => {
    const r = await moveLabelTool.execute({
      label_id: "addedLabel_42",
      x: 300,
      y: 400,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_x: 100,
      old_y: 200,
      new_x: 300,
      new_y: 400,
    });
    expect(dom.addedLabel_42.getAttribute("transform")).toBe(
      "translate(300,400)",
    );
  });

  it("does NOT modify the <textPath>'s d attribute", async () => {
    const initialD = dom.addedLabel_42_textPath.getAttribute("d");
    expect(initialD).toBe("M0,0 L100,0");
    const r = await moveLabelTool.execute({
      label_id: "addedLabel_42",
      x: 999,
      y: -999,
    });
    expect(r.isError).toBeFalsy();
    // <textPath> d is unchanged.
    expect(dom.addedLabel_42_textPath.getAttribute("d")).toBe("M0,0 L100,0");
    // <text> transform IS changed.
    expect(dom.addedLabel_42.getAttribute("transform")).toBe(
      "translate(999,-999)",
    );
  });

  it("unknown label_id → error", async () => {
    const r = await moveLabelTool.execute({
      label_id: "nope_does_not_exist",
      x: 1,
      y: 2,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/nope_does_not_exist/);
  });

  it("label outside #labels → error 'not found under #labels'", async () => {
    const r = await moveLabelTool.execute({
      label_id: "loneText",
      x: 1,
      y: 2,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not found under #labels/);
  });

  it("both window.labels and #labels missing → error", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    (globalThis as { labels?: unknown }).labels = undefined;
    const r = await moveLabelTool.execute({
      label_id: "addedLabel_42",
      x: 1,
      y: 2,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
  });
});
