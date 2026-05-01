import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createRegenerateLabelNameTool,
  defaultRegenerateLabelNameRuntime,
  type RegenerateLabelNameRuntime,
  regenerateLabelNameTool,
} from "./regenerate-label-name";
import type { LabelLookup } from "./set-label-group";

interface FakeElement {
  tagName: string;
  id: string;
  parentElement: FakeElement | null;
  children: FakeElement[];
  attrs: Map<string, string>;
  innerHTML: string;
  textContent: string;
  appendChild: (child: FakeElement) => void;
  querySelectorAll: (sel: string) => FakeElement[];
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  getBBox?: () => { x: number; y: number; width: number; height: number };
}

function fakeEl(tag: string, id = ""): FakeElement {
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    id,
    parentElement: null,
    children: [],
    attrs: new Map(),
    innerHTML: "",
    textContent: "",
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

interface MakeRuntimeReturn {
  runtime: RegenerateLabelNameRuntime;
  findLabel: ReturnType<typeof vi.fn<RegenerateLabelNameRuntime["findLabel"]>>;
  getTextpath: ReturnType<
    typeof vi.fn<RegenerateLabelNameRuntime["getTextpath"]>
  >;
  getBBox: ReturnType<typeof vi.fn<RegenerateLabelNameRuntime["getBBox"]>>;
  findCell: ReturnType<typeof vi.fn<RegenerateLabelNameRuntime["findCell"]>>;
  getStateCulture: ReturnType<
    typeof vi.fn<RegenerateLabelNameRuntime["getStateCulture"]>
  >;
  getCellCulture: ReturnType<
    typeof vi.fn<RegenerateLabelNameRuntime["getCellCulture"]>
  >;
  generateStateName: ReturnType<
    typeof vi.fn<RegenerateLabelNameRuntime["generateStateName"]>
  >;
  generateCultureName: ReturnType<
    typeof vi.fn<RegenerateLabelNameRuntime["generateCultureName"]>
  >;
  setTextpathContent: ReturnType<
    typeof vi.fn<RegenerateLabelNameRuntime["setTextpathContent"]>
  >;
}

function makeRuntime(
  overrides: Partial<RegenerateLabelNameRuntime> = {},
): MakeRuntimeReturn {
  const findLabel = vi.fn<RegenerateLabelNameRuntime["findLabel"]>(
    overrides.findLabel ?? (() => ({ kind: "not_found" }) as LabelLookup),
  );
  const getTextpath = vi.fn<RegenerateLabelNameRuntime["getTextpath"]>(
    overrides.getTextpath ?? (() => null),
  );
  const getBBox = vi.fn<RegenerateLabelNameRuntime["getBBox"]>(
    overrides.getBBox ?? (() => ({ x: 0, y: 0, width: 0, height: 0 })),
  );
  const findCell = vi.fn<RegenerateLabelNameRuntime["findCell"]>(
    overrides.findCell ?? (() => 0),
  );
  const getStateCulture = vi.fn<RegenerateLabelNameRuntime["getStateCulture"]>(
    overrides.getStateCulture ?? (() => 0),
  );
  const getCellCulture = vi.fn<RegenerateLabelNameRuntime["getCellCulture"]>(
    overrides.getCellCulture ?? (() => 0),
  );
  const generateStateName = vi.fn<
    RegenerateLabelNameRuntime["generateStateName"]
  >(overrides.generateStateName ?? (() => "State Name"));
  const generateCultureName = vi.fn<
    RegenerateLabelNameRuntime["generateCultureName"]
  >(overrides.generateCultureName ?? (() => "Culture Name"));
  const setTextpathContent = vi.fn<
    RegenerateLabelNameRuntime["setTextpathContent"]
  >(overrides.setTextpathContent ?? (() => undefined));
  return {
    runtime: {
      findLabel,
      getTextpath,
      getBBox,
      findCell,
      getStateCulture,
      getCellCulture,
      generateStateName,
      generateCultureName,
      setTextpathContent,
    },
    findLabel,
    getTextpath,
    getBBox,
    findCell,
    getStateCulture,
    getCellCulture,
    generateStateName,
    generateCultureName,
    setTextpathContent,
  };
}

function makeFoundLabel(textEl: FakeElement, parent: FakeElement): LabelLookup {
  return {
    kind: "found",
    el: textEl as unknown as Element,
    parent: parent as unknown as Element,
  };
}

describe("regenerate_label_name — unit (mocked runtime)", () => {
  it("happy path: stateLabel3 → kind=state, note set, generator called with state's culture", async () => {
    const text = fakeEl("text", "stateLabel3");
    const parent = fakeEl("g", "states");
    const tp = fakeEl("textpath");
    const oldTspan = fakeEl("tspan");
    oldTspan.textContent = "Old Name";
    tp.appendChild(oldTspan);

    const {
      runtime,
      generateStateName,
      generateCultureName,
      setTextpathContent,
    } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getStateCulture: () => 7,
      generateStateName: () => "Brand New Realm",
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "stateLabel3" });
    expect(r.isError).toBeFalsy();
    expect(generateStateName).toHaveBeenCalledWith(7);
    expect(generateCultureName).not.toHaveBeenCalled();
    expect(setTextpathContent).toHaveBeenCalledWith(
      tp,
      '<tspan x="0">Brand New Realm</tspan>',
    );
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      label_id: "stateLabel3",
      kind: "state",
      old_text: "Old Name",
      new_text: "Brand New Realm",
      note: "This is just a label. Use rename_state to change the state's actual name.",
    });
  });

  it("happy path: addedLabel_5 → kind=other, no note, bbox quirk verified", async () => {
    const text = fakeEl("text", "addedLabel_5");
    const parent = fakeEl("g", "addedLabels");
    const tp = fakeEl("textpath");
    tp.textContent = "Old";

    const {
      runtime,
      generateStateName,
      generateCultureName,
      findCell,
      setTextpathContent,
    } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getBBox: () => ({ x: 10, y: 0, width: 200, height: 50 }),
      findCell: () => 42,
      getCellCulture: () => 4,
      generateCultureName: () => "Vesterland",
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_5" });
    expect(r.isError).toBeFalsy();
    // Legacy quirk: x is (box.x + box.width) / 2 = (10 + 200)/2 = 105
    // (NOT the centroid 10 + 200/2 = 110). y is (0 + 50)/2 = 25.
    expect(findCell).toHaveBeenCalledWith(105, 25);
    expect(generateCultureName).toHaveBeenCalledWith(4);
    expect(generateStateName).not.toHaveBeenCalled();
    expect(setTextpathContent).toHaveBeenCalledWith(
      tp,
      '<tspan x="0">Vesterland</tspan>',
    );
    const body = JSON.parse(r.content);
    expect(body).toEqual({
      ok: true,
      label_id: "addedLabel_5",
      kind: "other",
      old_text: "Old",
      new_text: "Vesterland",
    });
    expect(body).not.toHaveProperty("note");
  });

  it("multi-line generator output 'Foo|Bar' produces 2 tspans with multi-line dy", async () => {
    const text = fakeEl("text", "addedLabel_1");
    const parent = fakeEl("g", "addedLabels");
    const tp = fakeEl("textpath");
    const { runtime, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getBBox: () => ({ x: 0, y: 0, width: 100, height: 100 }),
      findCell: () => 0,
      getCellCulture: () => 0,
      generateCultureName: () => "Foo|Bar",
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_1" });
    expect(r.isError).toBeFalsy();
    // top = (2-1)/-2 = -0.5; first tspan dy = -0.5em (top); rest = 1em
    expect(setTextpathContent).toHaveBeenCalledWith(
      tp,
      '<tspan x="0" dy="-0.5em">Foo</tspan><tspan x="0" dy="1em">Bar</tspan>',
    );
    expect(JSON.parse(r.content).new_text).toBe("Foo|Bar");
  });

  it("old_text round-trips a multi-line previous value (joined with '|')", async () => {
    const text = fakeEl("text", "addedLabel_1");
    const parent = fakeEl("g", "addedLabels");
    const tp = fakeEl("textpath");
    const a = fakeEl("tspan");
    a.textContent = "Top";
    const b = fakeEl("tspan");
    b.textContent = "Bot";
    tp.appendChild(a);
    tp.appendChild(b);

    const { runtime } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      findCell: () => 0,
      getCellCulture: () => 0,
      generateCultureName: () => "New",
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_1" });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content).old_text).toBe("Top|Bot");
  });

  it("old_text is null when textpath has no tspans and no textContent", async () => {
    const text = fakeEl("text", "addedLabel_1");
    const parent = fakeEl("g", "addedLabels");
    const tp = fakeEl("textpath"); // no children, empty textContent
    const { runtime } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      findCell: () => 0,
      getCellCulture: () => 0,
      generateCultureName: () => "New",
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_1" });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content).old_text).toBeNull();
  });

  it("state label with non-integer suffix → error", async () => {
    const text = fakeEl("text", "stateLabelfoo");
    const parent = fakeEl("g", "states");
    const tp = fakeEl("textpath");
    const { runtime, getStateCulture, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "stateLabelfoo" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(
      /stateLabel id must be followed by a non-negative integer/,
    );
    expect(getStateCulture).not.toHaveBeenCalled();
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("state label with empty suffix (just 'stateLabel') → error", async () => {
    const text = fakeEl("text", "stateLabel");
    const parent = fakeEl("g", "states");
    const tp = fakeEl("textpath");
    const { runtime, getStateCulture, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "stateLabel" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(
      /stateLabel id must be followed by a non-negative integer/,
    );
    expect(getStateCulture).not.toHaveBeenCalled();
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("state label with negative suffix → error", async () => {
    const text = fakeEl("text", "stateLabel-1");
    const parent = fakeEl("g", "states");
    const tp = fakeEl("textpath");
    const { runtime, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "stateLabel-1" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/non-negative integer/);
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("getStateCulture throws → error surfaces; setTextpathContent not called", async () => {
    const text = fakeEl("text", "stateLabel0");
    const parent = fakeEl("g", "states");
    const tp = fakeEl("textpath");
    const { runtime, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getStateCulture: () => {
        throw new Error("pack.states[0] is missing");
      },
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "stateLabel0" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/pack.states\[0\] is missing/);
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("generateStateName throws → error", async () => {
    const text = fakeEl("text", "stateLabel0");
    const parent = fakeEl("g", "states");
    const tp = fakeEl("textpath");
    const { runtime, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getStateCulture: () => 1,
      generateStateName: () => {
        throw new Error("Names.getState missing");
      },
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "stateLabel0" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/Names.getState missing/);
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("other label: findCell returns -1 → error; setTextpathContent not called", async () => {
    const text = fakeEl("text", "addedLabel_1");
    const parent = fakeEl("g", "addedLabels");
    const tp = fakeEl("textpath");
    const { runtime, getCellCulture, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      findCell: () => -1,
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_1" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(
      /findCell did not return a valid cell index/,
    );
    expect(getCellCulture).not.toHaveBeenCalled();
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("other label: findCell returns NaN → error", async () => {
    const text = fakeEl("text", "addedLabel_1");
    const parent = fakeEl("g", "addedLabels");
    const tp = fakeEl("textpath");
    const { runtime, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      findCell: () => Number.NaN,
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_1" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/findCell did not return/);
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("other label: getCellCulture throws → error", async () => {
    const text = fakeEl("text", "addedLabel_1");
    const parent = fakeEl("g", "addedLabels");
    const tp = fakeEl("textpath");
    const { runtime, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      findCell: () => 5,
      getCellCulture: () => {
        throw new Error("pack.cells.culture missing");
      },
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_1" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/pack.cells.culture missing/);
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("getBBox throws → error", async () => {
    const text = fakeEl("text", "addedLabel_1");
    const parent = fakeEl("g", "addedLabels");
    const tp = fakeEl("textpath");
    const { runtime, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getBBox: () => {
        throw new Error("getBBox unavailable");
      },
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_1" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/getBBox unavailable/);
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("generator throws → error; setTextpathContent not called", async () => {
    const text = fakeEl("text", "addedLabel_1");
    const parent = fakeEl("g", "addedLabels");
    const tp = fakeEl("textpath");
    const { runtime, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      findCell: () => 0,
      getCellCulture: () => 0,
      generateCultureName: () => {
        throw new Error("Names broken");
      },
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_1" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/Names broken/);
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("generator returns empty string → error; setTextpathContent not called", async () => {
    const text = fakeEl("text", "addedLabel_1");
    const parent = fakeEl("g", "addedLabels");
    const tp = fakeEl("textpath");
    const { runtime, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      findCell: () => 0,
      getCellCulture: () => 0,
      generateCultureName: () => "",
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_1" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/empty\/invalid name/);
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("generator returns whitespace → error", async () => {
    const text = fakeEl("text", "addedLabel_1");
    const parent = fakeEl("g", "addedLabels");
    const tp = fakeEl("textpath");
    const { runtime, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      findCell: () => 0,
      getCellCulture: () => 0,
      generateCultureName: () => "   ",
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_1" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/empty\/invalid name/);
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("generator returns non-string → error", async () => {
    const text = fakeEl("text", "addedLabel_1");
    const parent = fakeEl("g", "addedLabels");
    const tp = fakeEl("textpath");
    const { runtime, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      findCell: () => 0,
      getCellCulture: () => 0,
      generateCultureName: () => 42 as unknown as string,
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_1" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/empty\/invalid name/);
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("getTextpath returns null → error 'has no <textPath>'", async () => {
    const text = fakeEl("text", "addedLabel_1");
    const parent = fakeEl("g", "addedLabels");
    const { runtime, setTextpathContent } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => null,
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_1" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/has no <textPath>/);
    expect(setTextpathContent).not.toHaveBeenCalled();
  });

  it("findLabel kind=not_found → error", async () => {
    const { runtime } = makeRuntime({
      findLabel: () => ({ kind: "not_found" }),
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "ghost" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/ghost/);
  });

  it("findLabel kind=outside_labels → error", async () => {
    const { runtime } = makeRuntime({
      findLabel: () => ({ kind: "outside_labels" }),
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "loneText" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/not found under #labels/);
  });

  it("findLabel kind=unexpected_parent → error", async () => {
    const { runtime } = makeRuntime({
      findLabel: () => ({ kind: "unexpected_parent" }),
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "weirdLabel" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/unexpected parent/);
  });

  it("findLabel kind=labels_root_missing → error", async () => {
    const { runtime } = makeRuntime({
      findLabel: () => ({ kind: "labels_root_missing" }),
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "x" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
  });

  it("missing/non-string label_id → error, no findLabel call", async () => {
    const { runtime, findLabel } = makeRuntime();
    const tool = createRegenerateLabelNameTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42, {}]) {
      const r = await tool.execute({ label_id: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/label_id/);
    }
    expect(findLabel).not.toHaveBeenCalled();
  });

  it("setTextpathContent throws → error surfaces", async () => {
    const text = fakeEl("text", "addedLabel_1");
    const parent = fakeEl("g", "addedLabels");
    const tp = fakeEl("textpath");
    const { runtime } = makeRuntime({
      findLabel: () => makeFoundLabel(text, parent),
      getTextpath: () => tp as unknown as Element,
      getBBox: () => ({ x: 0, y: 0, width: 0, height: 0 }),
      findCell: () => 0,
      getCellCulture: () => 0,
      generateCultureName: () => "Xyz",
      setTextpathContent: () => {
        throw new Error("DOM exploded");
      },
    });
    const tool = createRegenerateLabelNameTool(runtime);
    const r = await tool.execute({ label_id: "addedLabel_1" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/DOM exploded/);
  });

  it("registers under name 'regenerate_label_name' and round-trips through registry", async () => {
    expect(regenerateLabelNameTool.name).toBe("regenerate_label_name");
    const reg = new ToolRegistry();
    reg.register(regenerateLabelNameTool);
    expect(reg.list().map((t) => t.name)).toContain("regenerate_label_name");
    // No DOM in node → labels_root_missing → error (not a crash).
    const out = await reg.run("regenerate_label_name", {
      label_id: "addedLabel_1",
    });
    expect(out.isError).toBe(true);
  });
});

describe("defaultRegenerateLabelNameRuntime (integration with mocked DOM + globals)", () => {
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalLabels = (globalThis as { labels?: unknown }).labels;
  const originalNames = (globalThis as { Names?: unknown }).Names;
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalFindCell = (globalThis as { findCell?: unknown }).findCell;

  let labelsRoot: FakeElement;
  let states: FakeElement;
  let addedLabels: FakeElement;
  let stateLabel0: FakeElement;
  let stateLabel0_tp: FakeElement;
  let addedLabel_42: FakeElement;
  let addedLabel_42_tp: FakeElement;
  let outsideText: FakeElement;
  let byId: Record<string, FakeElement>;

  function getCulture(culture: number, ...rest: unknown[]): string {
    if (rest.length === 0) return `Culture${culture}`;
    return `BaseFor${culture}`;
  }

  function getState(base: string, culture: number): string {
    return `State<${base}/${culture}>`;
  }

  beforeEach(() => {
    labelsRoot = fakeEl("g", "labels");
    states = fakeEl("g", "states");
    addedLabels = fakeEl("g", "addedLabels");
    labelsRoot.appendChild(states);
    labelsRoot.appendChild(addedLabels);

    stateLabel0 = fakeEl("text", "stateLabel0");
    stateLabel0_tp = fakeEl("textpath");
    const stateOldTspan = fakeEl("tspan");
    stateOldTspan.textContent = "Original";
    stateLabel0_tp.appendChild(stateOldTspan);
    stateLabel0.appendChild(stateLabel0_tp);
    states.appendChild(stateLabel0);

    addedLabel_42 = fakeEl("text", "addedLabel_42");
    addedLabel_42_tp = fakeEl("textpath");
    addedLabel_42_tp.textContent = "Old Other";
    addedLabel_42.appendChild(addedLabel_42_tp);
    addedLabel_42.getBBox = () => ({ x: 50, y: 100, width: 200, height: 40 });
    addedLabels.appendChild(addedLabel_42);

    outsideText = fakeEl("text", "loneText");

    byId = {
      labels: labelsRoot,
      states,
      addedLabels,
      stateLabel0,
      addedLabel_42,
      loneText: outsideText,
    };

    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => byId[id] ?? null,
    };
    (globalThis as { labels?: unknown }).labels = undefined;
    (globalThis as { Names?: unknown }).Names = {
      getCulture: vi.fn(getCulture),
      getState: vi.fn(getState),
    };
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, culture: 7 },
      ],
      cells: { culture: [0, 1, 2, 3, 4, 5] },
    };
    (globalThis as { findCell?: unknown }).findCell = vi.fn(
      (_x: number, _y: number) => 5,
    );
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { labels?: unknown }).labels = originalLabels;
    (globalThis as { Names?: unknown }).Names = originalNames;
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { findCell?: unknown }).findCell = originalFindCell;
  });

  it("state branch end-to-end: writes new tspan, returns kind=state with note", async () => {
    // pack.states[0] has no .culture; use stateLabel1 instead.
    stateLabel0.id = "stateLabel1";
    byId.stateLabel1 = stateLabel0;
    delete byId.stateLabel0;

    const r = await regenerateLabelNameTool.execute({
      label_id: "stateLabel1",
    });
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content);
    expect(body.kind).toBe("state");
    expect(body.label_id).toBe("stateLabel1");
    expect(body.old_text).toBe("Original");
    // generateStateName: getState(getCulture(7,4,7,""), 7) = State<BaseFor7/7>
    expect(body.new_text).toBe("State<BaseFor7/7>");
    expect(body.note).toMatch(/Use rename_state/);
    expect(stateLabel0_tp.innerHTML).toBe(
      '<tspan x="0">State<BaseFor7/7></tspan>',
    );
  });

  it("other branch end-to-end: bbox quirk x=(50+200)/2=125 y=(100+40)/2=70, returns kind=other", async () => {
    const findCellMock = (globalThis as { findCell?: ReturnType<typeof vi.fn> })
      .findCell as ReturnType<typeof vi.fn>;
    const r = await regenerateLabelNameTool.execute({
      label_id: "addedLabel_42",
    });
    expect(r.isError).toBeFalsy();
    expect(findCellMock).toHaveBeenCalledWith(125, 70);
    const body = JSON.parse(r.content);
    expect(body.kind).toBe("other");
    expect(body.label_id).toBe("addedLabel_42");
    expect(body.old_text).toBe("Old Other");
    // pack.cells.culture[5] = 5 → getCulture(5) = "Culture5"
    expect(body.new_text).toBe("Culture5");
    expect(body).not.toHaveProperty("note");
    expect(addedLabel_42_tp.innerHTML).toBe('<tspan x="0">Culture5</tspan>');
  });

  it("missing window.Names → error names Names", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const r = await regenerateLabelNameTool.execute({
      label_id: "addedLabel_42",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/Names/);
  });

  it("missing Names.getCulture → error names Names.getCulture", async () => {
    (globalThis as { Names?: unknown }).Names = { getState: () => "x" };
    const r = await regenerateLabelNameTool.execute({
      label_id: "addedLabel_42",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/Names\.getCulture/);
  });

  it("state branch missing Names.getState → error names Names.getState", async () => {
    stateLabel0.id = "stateLabel1";
    byId.stateLabel1 = stateLabel0;
    delete byId.stateLabel0;
    (globalThis as { Names?: unknown }).Names = {
      getCulture: () => "x",
    };
    const r = await regenerateLabelNameTool.execute({
      label_id: "stateLabel1",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/Names\.getState/);
  });

  it("missing window.findCell (other branch) → error names findCell", async () => {
    (globalThis as { findCell?: unknown }).findCell = undefined;
    const r = await regenerateLabelNameTool.execute({
      label_id: "addedLabel_42",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/findCell/);
  });

  it("state branch: missing pack → error mentions pack", async () => {
    stateLabel0.id = "stateLabel1";
    byId.stateLabel1 = stateLabel0;
    delete byId.stateLabel0;
    (globalThis as { pack?: unknown }).pack = undefined;
    const r = await regenerateLabelNameTool.execute({
      label_id: "stateLabel1",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/pack/);
  });

  it("state branch: pack.states[id] missing → error", async () => {
    (globalThis as { pack?: unknown }).pack = {
      states: [{ i: 0, name: "Neutrals" }],
      cells: { culture: [0, 1, 2, 3, 4, 5] },
    };
    stateLabel0.id = "stateLabel5";
    byId.stateLabel5 = stateLabel0;
    delete byId.stateLabel0;
    const r = await regenerateLabelNameTool.execute({
      label_id: "stateLabel5",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/pack\.states\[5\] is missing/);
  });

  it("state branch: state has no .culture → error", async () => {
    (globalThis as { pack?: unknown }).pack = {
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "NoCulture" },
      ],
      cells: { culture: [0, 1, 2, 3, 4, 5] },
    };
    stateLabel0.id = "stateLabel1";
    byId.stateLabel1 = stateLabel0;
    delete byId.stateLabel0;
    const r = await regenerateLabelNameTool.execute({
      label_id: "stateLabel1",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/culture/);
  });

  it("other branch: missing pack.cells.culture → error", async () => {
    (globalThis as { pack?: unknown }).pack = {
      states: [{ i: 0, name: "Neutrals" }],
      cells: {},
    };
    const r = await regenerateLabelNameTool.execute({
      label_id: "addedLabel_42",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/pack\.cells\.culture/);
  });

  it("both #labels and window.labels missing → error", async () => {
    delete byId.labels;
    (globalThis as { labels?: unknown }).labels = undefined;
    const r = await regenerateLabelNameTool.execute({
      label_id: "addedLabel_42",
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#labels/);
  });

  it("default runtime is exported as defaultRegenerateLabelNameRuntime", () => {
    expect(typeof defaultRegenerateLabelNameRuntime.findLabel).toBe("function");
    expect(typeof defaultRegenerateLabelNameRuntime.getTextpath).toBe(
      "function",
    );
    expect(typeof defaultRegenerateLabelNameRuntime.generateStateName).toBe(
      "function",
    );
    expect(typeof defaultRegenerateLabelNameRuntime.generateCultureName).toBe(
      "function",
    );
  });
});
