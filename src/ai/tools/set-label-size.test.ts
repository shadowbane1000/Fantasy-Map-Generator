import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import type { LabelLookup } from "./set-label-group";
import {
  createSetLabelSizeTool,
  type SetLabelSizeRuntime,
  setLabelSizeTool,
} from "./set-label-size";

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
  noTextPathLabel: FakeElement;
  unparseableLabel: FakeElement;
  unparseableLabel_textPath: FakeElement;
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
  const addedLabel_42_textPath = fakeEl("textPath", "");
  addedLabel_42_textPath.setAttribute("font-size", "100%");
  addedLabels.appendChild(addedLabel_42);
  addedLabel_42.appendChild(addedLabel_42_textPath);

  // Label with NO <textPath> child — for the "has no <textPath>" error path.
  const noTextPathLabel = fakeEl("text", "noTextPathLabel");
  addedLabels.appendChild(noTextPathLabel);

  // Label whose textPath has an unparseable font-size attribute.
  const unparseableLabel = fakeEl("text", "unparseableLabel");
  const unparseableLabel_textPath = fakeEl("textPath", "");
  unparseableLabel_textPath.setAttribute("font-size", "abc");
  addedLabels.appendChild(unparseableLabel);
  unparseableLabel.appendChild(unparseableLabel_textPath);

  // A `<text>` outside #labels — used for the "outside_labels" path.
  const outsideText = fakeEl("text", "loneText");

  const byId: Record<string, FakeElement> = {
    labels: labelsRoot,
    states,
    addedLabels,
    addedLabel_42,
    noTextPathLabel,
    unparseableLabel,
    loneText: outsideText,
  };

  return {
    labelsRoot,
    states,
    addedLabels,
    addedLabel_42,
    addedLabel_42_textPath,
    noTextPathLabel,
    unparseableLabel,
    unparseableLabel_textPath,
    outsideText,
    byId,
  };
}

describe("set_label_size tool — unit (mocked runtime)", () => {
  function makeRuntime(overrides: Partial<SetLabelSizeRuntime> = {}): {
    runtime: SetLabelSizeRuntime;
    findLabel: ReturnType<typeof vi.fn<SetLabelSizeRuntime["findLabel"]>>;
    findTextPath: ReturnType<typeof vi.fn<SetLabelSizeRuntime["findTextPath"]>>;
    getFontSize: ReturnType<typeof vi.fn<SetLabelSizeRuntime["getFontSize"]>>;
    setFontSize: ReturnType<typeof vi.fn<SetLabelSizeRuntime["setFontSize"]>>;
  } {
    const findLabel = vi.fn<SetLabelSizeRuntime["findLabel"]>(
      overrides.findLabel ?? (() => ({ kind: "not_found" }) as LabelLookup),
    );
    const findTextPath = vi.fn<SetLabelSizeRuntime["findTextPath"]>(
      overrides.findTextPath ?? (() => null),
    );
    const getFontSize = vi.fn<SetLabelSizeRuntime["getFontSize"]>(
      overrides.getFontSize ?? (() => null),
    );
    const setFontSize = vi.fn<SetLabelSizeRuntime["setFontSize"]>(
      overrides.setFontSize ?? (() => undefined),
    );
    return {
      runtime: { findLabel, findTextPath, getFontSize, setFontSize },
      findLabel,
      findTextPath,
      getFontSize,
      setFontSize,
    };
  }

  function foundLabelOverrides(
    dom: FakeDom,
    overrides: Partial<SetLabelSizeRuntime> = {},
  ): Partial<SetLabelSizeRuntime> {
    return {
      findLabel: () => ({
        kind: "found",
        el: dom.addedLabel_42 as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      findTextPath: () => dom.addedLabel_42_textPath as unknown as Element,
      getFontSize: () => "100%",
      setFontSize: () => undefined,
      ...overrides,
    };
  }

  it("happy path: 100% → 150%, returns old=100, new=150, sets attr to '150%'", async () => {
    const dom = setupDom();
    const { runtime, setFontSize } = makeRuntime(foundLabelOverrides(dom));
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      size: 150,
    });
    expect(r.isError).toBeFalsy();
    expect(setFontSize).toHaveBeenCalledWith(
      dom.addedLabel_42_textPath,
      "150%",
    );
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_size: 100,
      new_size: 150,
    });
  });

  it("getFontSize returns null → old_size: null, new_size still applied", async () => {
    const dom = setupDom();
    const { runtime, setFontSize } = makeRuntime(
      foundLabelOverrides(dom, { getFontSize: () => null }),
    );
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      size: 200,
    });
    expect(r.isError).toBeFalsy();
    expect(setFontSize).toHaveBeenCalledWith(
      dom.addedLabel_42_textPath,
      "200%",
    );
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_size: null,
      new_size: 200,
    });
  });

  it("getFontSize returns 'abc' (unparseable) → old_size: null", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, { getFontSize: () => "abc" }),
    );
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      size: 75,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_size: null,
      new_size: 75,
    });
  });

  it("getFontSize returns '120px' → old_size: 120 (parseFloat strips unit)", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, { getFontSize: () => "120px" }),
    );
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      size: 130,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_size: 120,
      new_size: 130,
    });
  });

  it("findLabel kind=not_found → error mentioning the id, no setFontSize", async () => {
    const { runtime, setFontSize } = makeRuntime({
      findLabel: () => ({ kind: "not_found" }),
    });
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({ label_id: "ghost", size: 100 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/ghost/);
    expect(setFontSize).not.toHaveBeenCalled();
  });

  it("findLabel kind=outside_labels → error 'not found under #labels'", async () => {
    const { runtime, setFontSize } = makeRuntime({
      findLabel: () => ({ kind: "outside_labels" }),
    });
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({ label_id: "loneText", size: 100 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not found under #labels/);
    expect(setFontSize).not.toHaveBeenCalled();
  });

  it("findLabel kind=unexpected_parent → error 'unexpected parent'", async () => {
    const { runtime, setFontSize } = makeRuntime({
      findLabel: () => ({ kind: "unexpected_parent" }),
    });
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({ label_id: "weirdLabel", size: 100 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/unexpected parent/);
    expect(setFontSize).not.toHaveBeenCalled();
  });

  it("findLabel kind=labels_root_missing → error mentions #labels", async () => {
    const { runtime, setFontSize } = makeRuntime({
      findLabel: () => ({ kind: "labels_root_missing" }),
    });
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({ label_id: "x", size: 100 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
    expect(setFontSize).not.toHaveBeenCalled();
  });

  it("findTextPath returns null → error 'has no <textPath>'", async () => {
    const dom = setupDom();
    const { runtime, setFontSize } = makeRuntime({
      findLabel: () => ({
        kind: "found",
        el: dom.noTextPathLabel as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      findTextPath: () => null,
    });
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({
      label_id: "noTextPathLabel",
      size: 100,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/has no <textPath>/);
    expect(setFontSize).not.toHaveBeenCalled();
  });

  it("missing label_id → error, no findLabel call", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelSizeTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42]) {
      const r = await tool.execute({ label_id: bad, size: 100 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/label_id/);
    }
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("missing/non-number size → error 'finite positive number', no findLabel call", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelSizeTool(runtime);
    for (const bad of [undefined, null, "100", "abc", true, {}]) {
      const r = await tool.execute({ label_id: "addedLabel_42", size: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/size/);
    }
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("size NaN → error 'finite positive number'", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      size: Number.NaN,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/finite positive/);
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("size 0 / negative / Infinity / -Infinity → error 'finite positive number'", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelSizeTool(runtime);
    for (const bad of [
      0,
      -1,
      -100,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const r = await tool.execute({ label_id: "addedLabel_42", size: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/finite positive/);
    }
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("size below clamp (9) → error names the allowed range", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", size: 9 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/between 10 and 1000/);
    expect(JSON.parse(r.content).error).toMatch(/9/);
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("size above clamp (1001) → error names the allowed range", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", size: 1001 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/between 10 and 1000/);
    expect(JSON.parse(r.content).error).toMatch(/1001/);
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("size = 10 (lower boundary, inclusive) → success", async () => {
    const dom = setupDom();
    const { runtime, setFontSize } = makeRuntime(foundLabelOverrides(dom));
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", size: 10 });
    expect(r.isError).toBeFalsy();
    expect(setFontSize).toHaveBeenCalledWith(dom.addedLabel_42_textPath, "10%");
    expect(JSON.parse(r.content).new_size).toBe(10);
  });

  it("size = 1000 (upper boundary, inclusive) → success", async () => {
    const dom = setupDom();
    const { runtime, setFontSize } = makeRuntime(foundLabelOverrides(dom));
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", size: 1000 });
    expect(r.isError).toBeFalsy();
    expect(setFontSize).toHaveBeenCalledWith(
      dom.addedLabel_42_textPath,
      "1000%",
    );
    expect(JSON.parse(r.content).new_size).toBe(1000);
  });

  it("setFontSize throwing surfaces as error", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, {
        setFontSize: () => {
          throw new Error("DOM exploded");
        },
      }),
    );
    const tool = createSetLabelSizeTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", size: 150 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/DOM exploded/);
  });

  it("registers under name 'set_label_size' and round-trips through registry", async () => {
    expect(setLabelSizeTool.name).toBe("set_label_size");
    const reg = new ToolRegistry();
    reg.register(setLabelSizeTool);
    expect(reg.list().map((t) => t.name)).toContain("set_label_size");
    // With no DOM in node, the default runtime returns
    // labels_root_missing; the registry should surface that as an
    // error rather than crash.
    const out = await reg.run("set_label_size", {
      label_id: "addedLabel_42",
      size: 150,
    });
    expect(out.isError).toBe(true);
  });
});

describe("defaultSetLabelSizeRuntime (integration with mocked DOM)", () => {
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

  it("happy path: writes font-size on the textPath and reports old/new", async () => {
    const r = await setLabelSizeTool.execute({
      label_id: "addedLabel_42",
      size: 150,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_size: 100,
      new_size: 150,
    });
    expect(dom.addedLabel_42_textPath.getAttribute("font-size")).toBe("150%");
  });

  it("unparseable existing font-size → old_size: null, attr is overwritten", async () => {
    const r = await setLabelSizeTool.execute({
      label_id: "unparseableLabel",
      size: 80,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "unparseableLabel",
      old_size: null,
      new_size: 80,
    });
    expect(dom.unparseableLabel_textPath.getAttribute("font-size")).toBe("80%");
  });

  it("label has no <textPath> child → error", async () => {
    const r = await setLabelSizeTool.execute({
      label_id: "noTextPathLabel",
      size: 100,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/has no <textPath>/);
  });

  it("unknown label_id → error", async () => {
    const r = await setLabelSizeTool.execute({
      label_id: "nope_does_not_exist",
      size: 100,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/nope_does_not_exist/);
  });

  it("label outside #labels → error 'not found under #labels'", async () => {
    const r = await setLabelSizeTool.execute({
      label_id: "loneText",
      size: 100,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not found under #labels/);
  });

  it("both window.labels and #labels missing → error", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    (globalThis as { labels?: unknown }).labels = undefined;
    const r = await setLabelSizeTool.execute({
      label_id: "addedLabel_42",
      size: 100,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
  });
});
