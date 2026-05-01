import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createListLabelGroupsTool,
  EDITOR_FILTERED_LABEL_GROUPS,
  type LabelGroupElement,
  type LabelGroupSummary,
  type ListLabelGroupsRuntime,
  listLabelGroupsTool,
} from "./list-label-groups";
import { BASIC_LABEL_GROUPS } from "./remove-label-group";

interface FakeRuntimeHandles {
  runtime: ListLabelGroupsRuntime;
  readGroupElements: ReturnType<
    typeof vi.fn<ListLabelGroupsRuntime["readGroupElements"]>
  >;
}

function makeRuntime(
  overrides: Partial<ListLabelGroupsRuntime> = {},
): FakeRuntimeHandles {
  const readGroupElements = vi.fn<ListLabelGroupsRuntime["readGroupElements"]>(
    overrides.readGroupElements ?? (() => []),
  );
  return {
    runtime: { readGroupElements },
    readGroupElements,
  };
}

describe("list_label_groups tool metadata", () => {
  it("has the right name and empty schema", () => {
    expect(listLabelGroupsTool.name).toBe("list_label_groups");
    expect(listLabelGroupsTool.input_schema).toEqual({
      type: "object",
      properties: {},
    });
  });

  it("EDITOR_FILTERED_LABEL_GROUPS matches the labels-editor literal", () => {
    expect([...EDITOR_FILTERED_LABEL_GROUPS]).toEqual(["states", "burgLabels"]);
  });

  it("BASIC_LABEL_GROUPS (re-used from remove-label-group) matches expected", () => {
    expect([...BASIC_LABEL_GROUPS]).toEqual(["states", "addedLabels"]);
  });

  it("createListLabelGroupsTool() produces an equivalent tool", () => {
    const built = createListLabelGroupsTool();
    expect(built.name).toBe(listLabelGroupsTool.name);
    expect(built.input_schema).toEqual(listLabelGroupsTool.input_schema);
    expect(built.description).toBe(listLabelGroupsTool.description);
  });

  it("registers and round-trips through ToolRegistry", () => {
    const registry = new ToolRegistry();
    registry.register(listLabelGroupsTool);
    const tools = registry.list();
    expect(tools.find((t) => t.name === "list_label_groups")).toBeDefined();
  });
});

describe("list_label_groups tool", () => {
  it("happy path: 4 groups (states, burgLabels, addedLabels, custom) with correct flags in SVG order", async () => {
    const elements: LabelGroupElement[] = [
      { id: "states", textCount: 3 },
      { id: "burgLabels", textCount: 5 },
      { id: "addedLabels", textCount: 0 },
      { id: "myGroup", textCount: 2 },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
    });
    const tool = createListLabelGroupsTool(handles.runtime);
    const result = await tool.execute({});

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(4);
    const groups: LabelGroupSummary[] = body.groups;
    expect(groups).toEqual([
      {
        id: "states",
        label_count: 3,
        is_basic: true,
        is_filtered_in_editor: true,
      },
      {
        id: "burgLabels",
        label_count: 5,
        is_basic: false,
        is_filtered_in_editor: true,
      },
      {
        id: "addedLabels",
        label_count: 0,
        is_basic: true,
        is_filtered_in_editor: false,
      },
      {
        id: "myGroup",
        label_count: 2,
        is_basic: false,
        is_filtered_in_editor: false,
      },
    ]);
  });

  it("preserves SVG / document order even when alphabetical would differ", async () => {
    const elements: LabelGroupElement[] = [
      { id: "myGroup", textCount: 1 },
      { id: "addedLabels", textCount: 0 },
      { id: "zebra", textCount: 7 },
      { id: "burgLabels", textCount: 4 },
      { id: "states", textCount: 2 },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
    });
    const tool = createListLabelGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.groups.map((g: LabelGroupSummary) => g.id)).toEqual([
      "myGroup",
      "addedLabels",
      "zebra",
      "burgLabels",
      "states",
    ]);
  });

  it("succeeds with an empty list when no <g> children exist", async () => {
    const handles = makeRuntime({
      readGroupElements: () => [],
    });
    const tool = createListLabelGroupsTool(handles.runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      count: 0,
      groups: [],
    });
  });

  it("accepts no-args / null / undefined input uniformly", async () => {
    const handles = makeRuntime({
      readGroupElements: () => [{ id: "states", textCount: 1 }],
    });
    const tool = createListLabelGroupsTool(handles.runtime);
    for (const input of [{}, null, undefined]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      expect(body.ok).toBe(true);
      expect(body.count).toBe(1);
    }
  });

  it("returns an error when the labels layer is missing", async () => {
    const handles = makeRuntime({
      readGroupElements: () => null,
    });
    const tool = createListLabelGroupsTool(handles.runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/labels layer is unavailable/i);
  });

  it("flags states as both basic and filtered_in_editor", async () => {
    const handles = makeRuntime({
      readGroupElements: () => [{ id: "states", textCount: 0 }],
    });
    const tool = createListLabelGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.groups[0]).toEqual({
      id: "states",
      label_count: 0,
      is_basic: true,
      is_filtered_in_editor: true,
    });
  });

  it("flags burgLabels as filtered_in_editor but NOT basic", async () => {
    const handles = makeRuntime({
      readGroupElements: () => [{ id: "burgLabels", textCount: 0 }],
    });
    const tool = createListLabelGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.groups[0]).toEqual({
      id: "burgLabels",
      label_count: 0,
      is_basic: false,
      is_filtered_in_editor: true,
    });
  });

  it("flags addedLabels as basic but NOT filtered_in_editor", async () => {
    const handles = makeRuntime({
      readGroupElements: () => [{ id: "addedLabels", textCount: 0 }],
    });
    const tool = createListLabelGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.groups[0]).toEqual({
      id: "addedLabels",
      label_count: 0,
      is_basic: true,
      is_filtered_in_editor: false,
    });
  });

  it("flags custom groups as neither basic nor filtered_in_editor", async () => {
    const handles = makeRuntime({
      readGroupElements: () => [{ id: "custom-arcane", textCount: 9 }],
    });
    const tool = createListLabelGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.groups[0]).toEqual({
      id: "custom-arcane",
      label_count: 9,
      is_basic: false,
      is_filtered_in_editor: false,
    });
  });
});

describe("defaultListLabelGroupsRuntime (integration)", () => {
  const originalLabels = (globalThis as { labels?: unknown }).labels;
  const originalDoc = (globalThis as { document?: unknown }).document;

  afterEach(() => {
    (globalThis as { labels?: unknown }).labels = originalLabels;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("reads <g> nodes from window.labels._groups[0] in order with descendant text counts", async () => {
    const fakeNodes = [
      {
        id: "states",
        getElementsByTagName: vi.fn((tag: string) => {
          expect(tag).toBe("text");
          return { length: 3 };
        }),
      },
      {
        id: "burgLabels",
        getElementsByTagName: vi.fn(() => ({ length: 5 })),
      },
      {
        id: "addedLabels",
        getElementsByTagName: vi.fn(() => ({ length: 0 })),
      },
      {
        id: "myGroup",
        getElementsByTagName: vi.fn(() => ({ length: 2 })),
      },
    ];
    const fakeLabelsSel = {
      selectAll: vi.fn((selector: string) => {
        expect(selector).toBe(":scope > g");
        return { _groups: [fakeNodes] };
      }),
    };
    (globalThis as { labels?: unknown }).labels = fakeLabelsSel;

    const result = await listLabelGroupsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.count).toBe(4);
    expect(body.groups).toEqual([
      {
        id: "states",
        label_count: 3,
        is_basic: true,
        is_filtered_in_editor: true,
      },
      {
        id: "burgLabels",
        label_count: 5,
        is_basic: false,
        is_filtered_in_editor: true,
      },
      {
        id: "addedLabels",
        label_count: 0,
        is_basic: true,
        is_filtered_in_editor: false,
      },
      {
        id: "myGroup",
        label_count: 2,
        is_basic: false,
        is_filtered_in_editor: false,
      },
    ]);
    expect(fakeLabelsSel.selectAll).toHaveBeenCalledWith(":scope > g");
  });

  it("falls back to document.getElementById('labels') when window.labels is absent", async () => {
    (globalThis as { labels?: unknown }).labels = undefined;
    const fakeRoot = {
      children: {
        length: 4,
        0: {
          tagName: "g",
          id: "states",
          getElementsByTagName: () => ({ length: 1 }),
        },
        1: {
          tagName: "DEFS", // ignored: not a <g>
          id: "anything",
          getElementsByTagName: () => ({ length: 99 }),
        },
        2: {
          tagName: "g",
          id: "burgLabels",
          getElementsByTagName: () => ({ length: 4 }),
        },
        3: {
          tagName: "g",
          id: "myGroup",
          getElementsByTagName: () => ({ length: 7 }),
        },
      },
    };
    (globalThis as { document?: unknown }).document = {
      getElementById: vi.fn((id: string) =>
        id === "labels" ? fakeRoot : null,
      ),
    };

    const result = await listLabelGroupsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.groups).toEqual([
      {
        id: "states",
        label_count: 1,
        is_basic: true,
        is_filtered_in_editor: true,
      },
      {
        id: "burgLabels",
        label_count: 4,
        is_basic: false,
        is_filtered_in_editor: true,
      },
      {
        id: "myGroup",
        label_count: 7,
        is_basic: false,
        is_filtered_in_editor: false,
      },
    ]);
  });

  it("errors when neither window.labels nor #labels element is available", async () => {
    (globalThis as { labels?: unknown }).labels = undefined;
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };

    const result = await listLabelGroupsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /labels layer is unavailable/i,
    );
  });
});

describe("defaultListLabelGroupsRuntime (no-document environment)", () => {
  // When there's no document at all (extreme headless), the DOM
  // fallback short-circuits to null and the tool errors. We test
  // this in an isolated block so we can fully delete `document`.
  let originalDoc: unknown;
  let originalLabels: unknown;

  beforeEach(() => {
    originalDoc = (globalThis as { document?: unknown }).document;
    originalLabels = (globalThis as { labels?: unknown }).labels;
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { labels?: unknown }).labels = undefined;
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { labels?: unknown }).labels = originalLabels;
  });

  it("errors when there's no DOM and no D3 selection", async () => {
    const result = await listLabelGroupsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /labels layer is unavailable/i,
    );
  });
});
