import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import type { LabelLookup } from "./set-label-group";
import {
  createSetLabelLetterSpacingTool,
  type SetLabelLetterSpacingRuntime,
  setLabelLetterSpacingTool,
} from "./set-label-letter-spacing";

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
  addedLabel_42_textPath.setAttribute("letter-spacing", "3px");
  addedLabels.appendChild(addedLabel_42);
  addedLabel_42.appendChild(addedLabel_42_textPath);

  // Label with NO <textPath> child — for the "has no <textPath>" error path.
  const noTextPathLabel = fakeEl("text", "noTextPathLabel");
  addedLabels.appendChild(noTextPathLabel);

  // Label whose textPath has an unparseable letter-spacing attribute.
  const unparseableLabel = fakeEl("text", "unparseableLabel");
  const unparseableLabel_textPath = fakeEl("textPath", "");
  unparseableLabel_textPath.setAttribute("letter-spacing", "abc");
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

describe("set_label_letter_spacing tool — unit (mocked runtime)", () => {
  function makeRuntime(overrides: Partial<SetLabelLetterSpacingRuntime> = {}): {
    runtime: SetLabelLetterSpacingRuntime;
    findLabel: ReturnType<
      typeof vi.fn<SetLabelLetterSpacingRuntime["findLabel"]>
    >;
    findTextPath: ReturnType<
      typeof vi.fn<SetLabelLetterSpacingRuntime["findTextPath"]>
    >;
    getLetterSpacing: ReturnType<
      typeof vi.fn<SetLabelLetterSpacingRuntime["getLetterSpacing"]>
    >;
    setLetterSpacing: ReturnType<
      typeof vi.fn<SetLabelLetterSpacingRuntime["setLetterSpacing"]>
    >;
  } {
    const findLabel = vi.fn<SetLabelLetterSpacingRuntime["findLabel"]>(
      overrides.findLabel ?? (() => ({ kind: "not_found" }) as LabelLookup),
    );
    const findTextPath = vi.fn<SetLabelLetterSpacingRuntime["findTextPath"]>(
      overrides.findTextPath ?? (() => null),
    );
    const getLetterSpacing = vi.fn<
      SetLabelLetterSpacingRuntime["getLetterSpacing"]
    >(overrides.getLetterSpacing ?? (() => null));
    const setLetterSpacing = vi.fn<
      SetLabelLetterSpacingRuntime["setLetterSpacing"]
    >(overrides.setLetterSpacing ?? (() => undefined));
    return {
      runtime: {
        findLabel,
        findTextPath,
        getLetterSpacing,
        setLetterSpacing,
      },
      findLabel,
      findTextPath,
      getLetterSpacing,
      setLetterSpacing,
    };
  }

  function foundLabelOverrides(
    dom: FakeDom,
    overrides: Partial<SetLabelLetterSpacingRuntime> = {},
  ): Partial<SetLabelLetterSpacingRuntime> {
    return {
      findLabel: () => ({
        kind: "found",
        el: dom.addedLabel_42 as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      findTextPath: () => dom.addedLabel_42_textPath as unknown as Element,
      getLetterSpacing: () => "3px",
      setLetterSpacing: () => undefined,
      ...overrides,
    };
  }

  it("happy path: 3px → 5px, returns old=3, new=5, sets attr to '5px'", async () => {
    const dom = setupDom();
    const { runtime, setLetterSpacing } = makeRuntime(foundLabelOverrides(dom));
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      letter_spacing: 5,
    });
    expect(r.isError).toBeFalsy();
    expect(setLetterSpacing).toHaveBeenCalledWith(
      dom.addedLabel_42_textPath,
      "5px",
    );
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_letter_spacing: 3,
      new_letter_spacing: 5,
    });
  });

  it("getLetterSpacing returns null → old_letter_spacing: null, new still applied", async () => {
    const dom = setupDom();
    const { runtime, setLetterSpacing } = makeRuntime(
      foundLabelOverrides(dom, { getLetterSpacing: () => null }),
    );
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      letter_spacing: 7,
    });
    expect(r.isError).toBeFalsy();
    expect(setLetterSpacing).toHaveBeenCalledWith(
      dom.addedLabel_42_textPath,
      "7px",
    );
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_letter_spacing: null,
      new_letter_spacing: 7,
    });
  });

  it("getLetterSpacing returns 'abc' (unparseable) → old_letter_spacing: null", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, { getLetterSpacing: () => "abc" }),
    );
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      letter_spacing: 4,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_letter_spacing: null,
      new_letter_spacing: 4,
    });
  });

  it("getLetterSpacing returns '2' (no unit) → old_letter_spacing: 2", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, { getLetterSpacing: () => "2" }),
    );
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      letter_spacing: 6,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_letter_spacing: 2,
      new_letter_spacing: 6,
    });
  });

  it("getLetterSpacing returns '3.5px' → old_letter_spacing: 3.5 (parseFloat strips px)", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, { getLetterSpacing: () => "3.5px" }),
    );
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      letter_spacing: 9,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_letter_spacing: 3.5,
      new_letter_spacing: 9,
    });
  });

  it("findLabel kind=not_found → error mentioning the id, no setLetterSpacing", async () => {
    const { runtime, setLetterSpacing } = makeRuntime({
      findLabel: () => ({ kind: "not_found" }),
    });
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({ label_id: "ghost", letter_spacing: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/ghost/);
    expect(setLetterSpacing).not.toHaveBeenCalled();
  });

  it("findLabel kind=outside_labels → error 'not found under #labels'", async () => {
    const { runtime, setLetterSpacing } = makeRuntime({
      findLabel: () => ({ kind: "outside_labels" }),
    });
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({ label_id: "loneText", letter_spacing: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not found under #labels/);
    expect(setLetterSpacing).not.toHaveBeenCalled();
  });

  it("findLabel kind=unexpected_parent → error 'unexpected parent'", async () => {
    const { runtime, setLetterSpacing } = makeRuntime({
      findLabel: () => ({ kind: "unexpected_parent" }),
    });
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({
      label_id: "weirdLabel",
      letter_spacing: 5,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/unexpected parent/);
    expect(setLetterSpacing).not.toHaveBeenCalled();
  });

  it("findLabel kind=labels_root_missing → error mentions #labels", async () => {
    const { runtime, setLetterSpacing } = makeRuntime({
      findLabel: () => ({ kind: "labels_root_missing" }),
    });
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({ label_id: "x", letter_spacing: 5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
    expect(setLetterSpacing).not.toHaveBeenCalled();
  });

  it("findTextPath returns null → error 'has no <textPath>'", async () => {
    const dom = setupDom();
    const { runtime, setLetterSpacing } = makeRuntime({
      findLabel: () => ({
        kind: "found",
        el: dom.noTextPathLabel as unknown as Element,
        parent: dom.addedLabels as unknown as Element,
      }),
      findTextPath: () => null,
    });
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({
      label_id: "noTextPathLabel",
      letter_spacing: 5,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/has no <textPath>/);
    expect(setLetterSpacing).not.toHaveBeenCalled();
  });

  it("missing label_id → error, no findLabel call", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelLetterSpacingTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42]) {
      const r = await tool.execute({ label_id: bad, letter_spacing: 5 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/label_id/);
    }
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("missing/non-number letter_spacing → error 'finite number', no findLabel call", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelLetterSpacingTool(runtime);
    for (const bad of [undefined, null, "5", "abc", true, {}]) {
      const r = await tool.execute({
        label_id: "addedLabel_42",
        letter_spacing: bad,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/letter_spacing/);
    }
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("letter_spacing NaN → error 'finite number'", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      letter_spacing: Number.NaN,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/finite number/);
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("letter_spacing Infinity / -Infinity → error 'finite number'", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelLetterSpacingTool(runtime);
    for (const bad of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const r = await tool.execute({
        label_id: "addedLabel_42",
        letter_spacing: bad,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/finite number/);
    }
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("letter_spacing just below 0 (-0.01) → error names the allowed range", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      letter_spacing: -0.01,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/between 0 and 20/);
    expect(JSON.parse(r.content).error).toMatch(/-0\.01/);
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("letter_spacing just above 20 (20.01) → error names the allowed range", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      letter_spacing: 20.01,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/between 0 and 20/);
    expect(JSON.parse(r.content).error).toMatch(/20\.01/);
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("letter_spacing -10 / 100 → error names the allowed range", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createSetLabelLetterSpacingTool(runtime);
    for (const bad of [-10, 100]) {
      const r = await tool.execute({
        label_id: "addedLabel_42",
        letter_spacing: bad,
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/between 0 and 20/);
    }
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("letter_spacing = 0 (lower boundary, inclusive) → success", async () => {
    const dom = setupDom();
    const { runtime, setLetterSpacing } = makeRuntime(foundLabelOverrides(dom));
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      letter_spacing: 0,
    });
    expect(r.isError).toBeFalsy();
    expect(setLetterSpacing).toHaveBeenCalledWith(
      dom.addedLabel_42_textPath,
      "0px",
    );
    expect(JSON.parse(r.content).new_letter_spacing).toBe(0);
  });

  it("letter_spacing = 20 (upper boundary, inclusive) → success", async () => {
    const dom = setupDom();
    const { runtime, setLetterSpacing } = makeRuntime(foundLabelOverrides(dom));
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      letter_spacing: 20,
    });
    expect(r.isError).toBeFalsy();
    expect(setLetterSpacing).toHaveBeenCalledWith(
      dom.addedLabel_42_textPath,
      "20px",
    );
    expect(JSON.parse(r.content).new_letter_spacing).toBe(20);
  });

  it("setLetterSpacing throwing surfaces as error", async () => {
    const dom = setupDom();
    const { runtime } = makeRuntime(
      foundLabelOverrides(dom, {
        setLetterSpacing: () => {
          throw new Error("DOM exploded");
        },
      }),
    );
    const tool = createSetLabelLetterSpacingTool(runtime);
    const r = await tool.execute({
      label_id: "addedLabel_42",
      letter_spacing: 5,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/DOM exploded/);
  });

  it("registers under name 'set_label_letter_spacing' and round-trips through registry", async () => {
    expect(setLabelLetterSpacingTool.name).toBe("set_label_letter_spacing");
    const reg = new ToolRegistry();
    reg.register(setLabelLetterSpacingTool);
    expect(reg.list().map((t) => t.name)).toContain("set_label_letter_spacing");
    // With no DOM in node, the default runtime returns
    // labels_root_missing; the registry should surface that as an
    // error rather than crash.
    const out = await reg.run("set_label_letter_spacing", {
      label_id: "addedLabel_42",
      letter_spacing: 5,
    });
    expect(out.isError).toBe(true);
  });
});

describe("defaultSetLabelLetterSpacingRuntime (integration with mocked DOM)", () => {
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

  it("happy path: writes letter-spacing on the textPath and reports old/new", async () => {
    const r = await setLabelLetterSpacingTool.execute({
      label_id: "addedLabel_42",
      letter_spacing: 7,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "addedLabel_42",
      old_letter_spacing: 3,
      new_letter_spacing: 7,
    });
    expect(dom.addedLabel_42_textPath.getAttribute("letter-spacing")).toBe(
      "7px",
    );
  });

  it("unparseable existing letter-spacing → old_letter_spacing: null, attr is overwritten", async () => {
    const r = await setLabelLetterSpacingTool.execute({
      label_id: "unparseableLabel",
      letter_spacing: 12,
    });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "unparseableLabel",
      old_letter_spacing: null,
      new_letter_spacing: 12,
    });
    expect(dom.unparseableLabel_textPath.getAttribute("letter-spacing")).toBe(
      "12px",
    );
  });

  it("label has no <textPath> child → error", async () => {
    const r = await setLabelLetterSpacingTool.execute({
      label_id: "noTextPathLabel",
      letter_spacing: 5,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/has no <textPath>/);
  });

  it("unknown label_id → error", async () => {
    const r = await setLabelLetterSpacingTool.execute({
      label_id: "nope_does_not_exist",
      letter_spacing: 5,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/nope_does_not_exist/);
  });

  it("label outside #labels → error 'not found under #labels'", async () => {
    const r = await setLabelLetterSpacingTool.execute({
      label_id: "loneText",
      letter_spacing: 5,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not found under #labels/);
  });

  it("both window.labels and #labels missing → error", async () => {
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    (globalThis as { labels?: unknown }).labels = undefined;
    const r = await setLabelLetterSpacingTool.execute({
      label_id: "addedLabel_42",
      letter_spacing: 5,
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
  });
});
