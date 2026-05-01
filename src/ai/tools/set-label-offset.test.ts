import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import type { LabelLookup } from "./set-label-group";
import {
  createSetLabelOffsetTool,
  type SetLabelOffsetRuntime,
  setLabelOffsetTool,
} from "./set-label-offset";

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
  addedLabel_42_textPath.setAttribute("startOffset", "50%");
  addedLabels.appendChild(addedLabel_42);
  addedLabel_42.appendChild(addedLabel_42_textPath);

  // Label with NO <textPath> child — for the "has no <textPath>" error path.
  const noTextPathLabel = fakeEl("text", "noTextPathLabel");
  addedLabels.appendChild(noTextPathLabel);

  // Label whose textPath has an unparseable startOffset attribute.
  const unparseableLabel = fakeEl("text", "unparseableLabel");
  const unparseableLabel_textPath = fakeEl("textPath", "");
  unparseableLabel_textPath.setAttribute("startOffset", "abc");
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

describe("set_label_offset tool — unit (mocked runtime)", () => {
  function makeRuntime(overrides: Partial<SetLabelOffsetRuntime> = {}): {
    runtime: SetLabelOffsetRuntime;
    findLabel: ReturnType<typeof vi.fn<SetLabelOffsetRuntime["findLabel"]>>;
    findTextPath: ReturnType<
      typeof vi.fn<SetLabelOffsetRuntime["findTextPath"]>
    >;
    getStartOffset: ReturnType<
      typeof vi.fn<SetLabelOffsetRuntime["getStartOffset"]>
    >;
    setStartOffset: ReturnType<
      typeof vi.fn<SetLabelOffsetRuntime["setStartOffset"]>
    >;
  } {
    const findLabel = vi.fn<SetLabelOffsetRuntime["findLabel"]>(
      overrides.findLabel ?? (() => ({ kind: "not_found" }) as LabelLookup),
    );
    const findTextPath = vi.fn<SetLabelOffsetRuntime["findTextPath"]>(
      overrides.findTextPath ?? (() => null),
    );
    const getStartOffset = vi.fn<SetLabelOffsetRuntime["getStartOffset"]>(
      overrides.getStartOffset ?? (() => null),
    );
    const setStartOffset = vi.fn<SetLabelOffsetRuntime["setStartOffset"]>(
      overrides.setStartOffset ?? (() => undefined),
    );
    return {
      runtime: { findLabel, findTextPath, getStartOffset, setStartOffset },
      findLabel,
      findTextPath,
      getStartOffset,
      setStartOffset,
    };
  }

  function foundLabelOverrides(
    dom: FakeDom,
    overrides: Partial<SetLabelOffsetRuntime> = {},
  ): Partial<SetLabelOffsetRuntime> {
    return {
      findLabel: () => ({
        kind: "found",
        el: dom.addedLabel_42 as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      findTextPath: () => dom.addedLabel_42_textPath as unknown as Element,
      getStartOffset: () => "50%",
      setStartOffset: () => undefined,
      ...overrides,
    };
  }

  it("happy path: 50% → 70%, returns old=50, new=70, sets attr to '70%'", async () => {
    const dom = setupDom();
    const { runtime, setStartOffset } = makeRuntime(foundLabelOverrides(dom));
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      offset: 70,
    });
    expect(r.isError).toBeFalsy();
    expect(setStartOffset).toHaveBeenCalledWith(
      dom.addedLabel_42_textPath,
      "70%",
    );
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_offset: 50,
      new_offset: 70,
    });
  });

  it("getStartOffset returns null → old_offset: null, new_offset still applied", async () => {
    const dom = setupDom();
    const { runtime, setStartOffset } = makeRuntime(
      foundLabelOverrides(dom, { getStartOffset: () => null }),
    );
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      offset: 60,
    });
    expect(r.isError).toBeFalsy();
    expect(setStartOffset).toHaveBeenCalledWith(
      dom.addedLabel_42_textPath,
      "60%",
    );
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_offset: null,
      new_offset: 60,
    });
  });

  it("getStartOffset returns 'abc' (unparseable) → old_offset: null", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, { getStartOffset: () => "abc" }),
    );
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      offset: 35,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_offset: null,
      new_offset: 35,
    });
  });

  it("getStartOffset returns '40px' → old_offset: 40 (parseFloat strips unit)", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, { getStartOffset: () => "40px" }),
    );
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      offset: 55,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_offset: 40,
      new_offset: 55,
    });
  });

  it("findLabel kind=not_found → error mentioning the id, no setStartOffset", async () => {
    const { runtime, setStartOffset } = makeRuntime({
      findLabel: () => ({ kind: "not_found" }),
    });
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({ label_id: "ghost", offset: 50 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/ghost/);
    expect(setStartOffset).not.toHaveBeenCalled();
  });

  it("findLabel kind=outside_labels → error 'not found under #labels'", async () => {
    const { runtime, setStartOffset } = makeRuntime({
      findLabel: () => ({ kind: "outside_labels" }),
    });
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({ label_id: "loneText", offset: 50 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not found under #labels/);
    expect(setStartOffset).not.toHaveBeenCalled();
  });

  it("findLabel kind=unexpected_parent → error 'unexpected parent'", async () => {
    const { runtime, setStartOffset } = makeRuntime({
      findLabel: () => ({ kind: "unexpected_parent" }),
    });
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({ label_id: "weirdLabel", offset: 50 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/unexpected parent/);
    expect(setStartOffset).not.toHaveBeenCalled();
  });

  it("findLabel kind=labels_root_missing → error mentions #labels", async () => {
    const { runtime, setStartOffset } = makeRuntime({
      findLabel: () => ({ kind: "labels_root_missing" }),
    });
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({ label_id: "x", offset: 50 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
    expect(setStartOffset).not.toHaveBeenCalled();
  });

  it("findTextPath returns null → error 'has no <textPath>'", async () => {
    const dom = setupDom();
    const { runtime, setStartOffset } = makeRuntime({
      findLabel: () => ({
        kind: "found",
        el: dom.noTextPathLabel as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      findTextPath: () => null,
    });
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({
      label_id: "noTextPathLabel",
      offset: 50,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/has no <textPath>/);
    expect(setStartOffset).not.toHaveBeenCalled();
  });

  it("missing label_id → error, no findLabel call", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelOffsetTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42]) {
      const r = await tool.execute({ label_id: bad, offset: 50 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/label_id/);
    }
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("missing/non-number offset → error 'finite number', no findLabel call", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelOffsetTool(runtime);
    for (const bad of [undefined, null, "50", "abc", true, {}]) {
      const r = await tool.execute({
        label_id: "addedLabel_42",
        offset: bad,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/offset/);
    }
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("offset NaN → error 'finite number'", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      offset: Number.NaN,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/finite number/);
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("offset Infinity / -Infinity → error 'finite number'", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelOffsetTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = await tool.execute({ label_id: "addedLabel_42", offset: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/finite number/);
    }
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("offset below clamp (19) → error names the allowed range", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", offset: 19 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/between 20 and 80/);
    expect(JSON.parse(r.content).error).toMatch(/19/);
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("offset above clamp (81) → error names the allowed range", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", offset: 81 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/between 20 and 80/);
    expect(JSON.parse(r.content).error).toMatch(/81/);
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("offset 100 / 0 / -10 → error names the allowed range", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelOffsetTool(runtime);
    for (const bad of [100, 0, -10]) {
      const r = await tool.execute({ label_id: "addedLabel_42", offset: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/between 20 and 80/);
    }
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("offset = 20 (lower boundary, inclusive) → success", async () => {
    const dom = setupDom();
    const { runtime, setStartOffset } = makeRuntime(foundLabelOverrides(dom));
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", offset: 20 });
    expect(r.isError).toBeFalsy();
    expect(setStartOffset).toHaveBeenCalledWith(
      dom.addedLabel_42_textPath,
      "20%",
    );
    expect(JSON.parse(r.content).new_offset).toBe(20);
  });

  it("offset = 80 (upper boundary, inclusive) → success", async () => {
    const dom = setupDom();
    const { runtime, setStartOffset } = makeRuntime(foundLabelOverrides(dom));
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", offset: 80 });
    expect(r.isError).toBeFalsy();
    expect(setStartOffset).toHaveBeenCalledWith(
      dom.addedLabel_42_textPath,
      "80%",
    );
    expect(JSON.parse(r.content).new_offset).toBe(80);
  });

  it("setStartOffset throwing surfaces as error", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, {
        setStartOffset: () => {
          throw new Error("DOM exploded");
        },
      }),
    );
    const tool = createSetLabelOffsetTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_42", offset: 50 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/DOM exploded/);
  });

  it("registers under name 'set_label_offset' and round-trips through registry", async () => {
    expect(setLabelOffsetTool.name).toBe("set_label_offset");
    const reg = new ToolRegistry();
    reg.register(setLabelOffsetTool);
    expect(reg.list().map((t) => t.name)).toContain("set_label_offset");
    // With no DOM in node, the default runtime returns
    // labels_root_missing; the registry should surface that as an
    // error rather than crash.
    const out = await reg.run("set_label_offset", {
      label_id: "addedLabel_42",
      offset: 50,
    });
    expect(out.isError).toBe(true);
  });
});

describe("defaultSetLabelOffsetRuntime (integration with mocked DOM)", () => {
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

  it("happy path: writes startOffset on the textPath and reports old/new", async () => {
    const r = await setLabelOffsetTool.execute({
      label_id: "addedLabel_42",
      offset: 70,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_offset: 50,
      new_offset: 70,
    });
    expect(dom.addedLabel_42_textPath.getAttribute("startOffset")).toBe("70%");
  });

  it("unparseable existing startOffset → old_offset: null, attr is overwritten", async () => {
    const r = await setLabelOffsetTool.execute({
      label_id: "unparseableLabel",
      offset: 45,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "unparseableLabel",
      old_offset: null,
      new_offset: 45,
    });
    expect(dom.unparseableLabel_textPath.getAttribute("startOffset")).toBe(
      "45%",
    );
  });

  it("label has no <textPath> child → error", async () => {
    const r = await setLabelOffsetTool.execute({
      label_id: "noTextPathLabel",
      offset: 50,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/has no <textPath>/);
  });

  it("unknown label_id → error", async () => {
    const r = await setLabelOffsetTool.execute({
      label_id: "nope_does_not_exist",
      offset: 50,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/nope_does_not_exist/);
  });

  it("label outside #labels → error 'not found under #labels'", async () => {
    const r = await setLabelOffsetTool.execute({
      label_id: "loneText",
      offset: 50,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not found under #labels/);
  });

  it("both window.labels and #labels missing → error", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    (globalThis as { labels?: unknown }).labels = undefined;
    const r = await setLabelOffsetTool.execute({
      label_id: "addedLabel_42",
      offset: 50,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
  });
});
