import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetLabelTextTool,
  defaultSetLabelTextRuntime,
  type LabelFindResult,
  type SetLabelTextRuntime,
  setLabelTextTool,
} from "./set-label-text";

function makeRuntime(find: (label: string) => LabelFindResult): {
  runtime: SetLabelTextRuntime;
  apply: ReturnType<typeof vi.fn<SetLabelTextRuntime["apply"]>>;
} {
  const apply = vi.fn<SetLabelTextRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_label_text tool", () => {
  it("has the expected name and schema", () => {
    expect(setLabelTextTool.name).toBe("set_label_text");
    expect(setLabelTextTool.input_schema.required).toEqual(["label", "text"]);
  });

  it("renames a label by DOM id", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      id: "label1",
      currentText: "Fantasy Map",
    }));
    const tool = createSetLabelTextTool(runtime);
    const result = await tool.execute({ label: "label1", text: "Eldoria" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("label1", "Eldoria");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "label1",
      previousText: "Fantasy Map",
      text: "Eldoria",
    });
  });

  it("renames a label matched by current text", async () => {
    const calls: string[] = [];
    const runtime: SetLabelTextRuntime = {
      find(label) {
        calls.push(label);
        return { id: "label42", currentText: "Fantasy Map" };
      },
      apply: vi.fn(),
    };
    const tool = createSetLabelTextTool(runtime);
    const result = await tool.execute({
      label: "Fantasy Map",
      text: "Eldoria",
    });
    expect(result.isError).toBeFalsy();
    expect(calls).toEqual(["Fantasy Map"]);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "label42",
      previousText: "Fantasy Map",
      text: "Eldoria",
    });
  });

  it("preserves pipe-split multi-line input", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      id: "stateLabel3",
      currentText: "Old",
    }));
    const tool = createSetLabelTextTool(runtime);
    const result = await tool.execute({
      label: "stateLabel3",
      text: "Ashen | Vale",
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("stateLabel3", "Ashen | Vale");
    expect(JSON.parse(result.content).text).toBe("Ashen | Vale");
  });

  it("rejects missing or invalid label", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetLabelTextTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42, {}]) {
      const r = await tool.execute({ label: bad, text: "Eldoria" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects missing, empty, or whitespace-only text", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      id: "label1",
      currentText: "old",
    }));
    const tool = createSetLabelTextTool(runtime);
    for (const bad of [undefined, null, "", "   ", "\n\t", 42, {}]) {
      const r = await tool.execute({ label: "label1", text: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when no matching label is found", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetLabelTextTool(runtime);
    const result = await tool.execute({ label: "nope", text: "x" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors with candidate ids on ambiguous text match", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      error: "ambiguous",
      ids: ["label1", "label4"],
    }));
    const tool = createSetLabelTextTool(runtime);
    const result = await tool.execute({ label: "Ashmark", text: "x" });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("label1");
    expect(result.content).toContain("label4");
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime apply failures", async () => {
    const runtime: SetLabelTextRuntime = {
      find: () => ({ id: "label1", currentText: "old" }),
      apply: vi.fn(() => {
        throw new Error("dom gone");
      }),
    };
    const tool = createSetLabelTextTool(runtime);
    const result = await tool.execute({ label: "label1", text: "x" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/dom gone/);
  });
});

// ----- defaultRuntime integration -----

interface FakeEl {
  id: string;
  tagName: string;
  children: FakeEl[];
  parentElement: FakeEl | null;
  textContent: string;
  innerHTML: string;
  appendChild: (child: FakeEl) => FakeEl;
  querySelector: (sel: string) => FakeEl | null;
  querySelectorAll: (sel: string) => FakeEl[];
}

function makeEl(tagName: string, id = ""): FakeEl {
  const el: FakeEl = {
    id,
    tagName,
    children: [],
    parentElement: null,
    textContent: "",
    innerHTML: "",
    appendChild(child) {
      child.parentElement = el;
      el.children.push(child);
      return child;
    },
    querySelector(sel: string) {
      // We only need tag selectors in this fake: "textPath" / "text".
      const stack: FakeEl[] = [...el.children];
      while (stack.length) {
        const n = stack.shift();
        if (!n) continue;
        if (n.tagName.toLowerCase() === sel.toLowerCase()) return n;
        stack.push(...n.children);
      }
      return null;
    },
    querySelectorAll(sel: string) {
      const results: FakeEl[] = [];
      const stack: FakeEl[] = [...el.children];
      while (stack.length) {
        const n = stack.shift();
        if (!n) continue;
        if (n.tagName.toLowerCase() === sel.toLowerCase()) results.push(n);
        stack.push(...n.children);
      }
      return results;
    },
  };
  return el;
}

function makeTspan(text: string): FakeEl {
  const t = makeEl("tspan");
  t.textContent = text;
  return t;
}

function makeLabel(id: string, lines: string[]): FakeEl {
  const textEl = makeEl("text", id);
  const textPath = makeEl("textPath");
  textEl.appendChild(textPath);
  for (const line of lines) textPath.appendChild(makeTspan(line));
  // Intercept innerHTML write so apply() can rebuild tspans
  Object.defineProperty(textPath, "innerHTML", {
    get() {
      return textPath.children
        .map((c) => `<tspan>${c.textContent}</tspan>`)
        .join("");
    },
    set(html: string) {
      // Parse out each <tspan …>…</tspan>, with or without attributes.
      textPath.children = [];
      const regex = /<tspan([^>]*)>([\s\S]*?)<\/tspan>/g;
      let match: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop
      while ((match = regex.exec(html))) {
        const tspan = makeTspan(match[2]);
        const attrs = match[1];
        const dy = /dy="([^"]+)"/.exec(attrs);
        if (dy) {
          (tspan as unknown as { dy: string }).dy = dy[1];
        }
        textPath.appendChild(tspan);
      }
    },
    configurable: true,
  });
  return textEl;
}

describe("defaultSetLabelTextRuntime (integration)", () => {
  let originalDocument: unknown;
  let labelsRoot: FakeEl;

  beforeEach(() => {
    originalDocument = (globalThis as { document?: unknown }).document;

    // <svg><g id="labels"><g id="addedLabels"><text id="label1">…</text>…
    const svg = makeEl("svg");
    labelsRoot = makeEl("g", "labels");
    svg.appendChild(labelsRoot);
    const addedLabels = makeEl("g", "addedLabels");
    labelsRoot.appendChild(addedLabels);
    const statesGroup = makeEl("g", "states");
    labelsRoot.appendChild(statesGroup);

    const label1 = makeLabel("label1", ["Fantasy Map"]);
    addedLabels.appendChild(label1);
    const label2 = makeLabel("label2", ["Ashen", "Vale"]);
    addedLabels.appendChild(label2);
    const stateLabel3 = makeLabel("stateLabel3", ["Altaria"]);
    statesGroup.appendChild(stateLabel3);

    const allById = new Map<string, FakeEl>();
    const stack: FakeEl[] = [svg];
    while (stack.length) {
      const n = stack.shift();
      if (!n) continue;
      if (n.id) allById.set(n.id, n);
      stack.push(...n.children);
    }

    (globalThis as { document?: unknown }).document = {
      getElementById(id: string) {
        return allById.get(id) ?? null;
      },
    } as unknown as Document;
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDocument;
  });

  it("renames a single-line label by DOM id", async () => {
    const result = await setLabelTextTool.execute({
      label: "label1",
      text: "Eldoria",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      id: "label1",
      previousText: "Fantasy Map",
      text: "Eldoria",
    });
    const textEl = (
      globalThis as unknown as {
        document: { getElementById: (id: string) => FakeEl | null };
      }
    ).document.getElementById("label1");
    const textPath = textEl?.querySelector("textPath");
    expect(textPath?.children).toHaveLength(1);
    expect(textPath?.children[0].textContent).toBe("Eldoria");
  });

  it("rewrites a multi-line label with pipe-split input", async () => {
    const result = await setLabelTextTool.execute({
      label: "label2",
      text: "Ashmark|Empire",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previousText).toBe("Ashen|Vale");
    expect(body.text).toBe("Ashmark|Empire");
    const textEl = (
      globalThis as unknown as {
        document: { getElementById: (id: string) => FakeEl | null };
      }
    ).document.getElementById("label2");
    const textPath = textEl?.querySelector("textPath");
    expect(textPath?.children).toHaveLength(2);
    expect(textPath?.children[0].textContent).toBe("Ashmark");
    expect(textPath?.children[1].textContent).toBe("Empire");
    expect(
      (textPath?.children[0] as unknown as { dy?: string }).dy,
    ).toBeDefined();
  });

  it("finds and renames a label by its current text when id is unknown", async () => {
    const result = await setLabelTextTool.execute({
      label: "Fantasy Map",
      text: "Eldoria",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).id).toBe("label1");
  });

  it("uses defaultSetLabelTextRuntime helpers directly", () => {
    const found = defaultSetLabelTextRuntime.find("stateLabel3");
    expect(found).toEqual({ id: "stateLabel3", currentText: "Altaria" });
  });

  it("errors when the document has no matching label", async () => {
    const result = await setLabelTextTool.execute({
      label: "does-not-exist",
      text: "Eldoria",
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("not found");
  });
});
