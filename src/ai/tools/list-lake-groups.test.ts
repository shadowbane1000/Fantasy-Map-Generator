import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createListLakeGroupsTool,
  DEFAULT_LAKE_GROUPS,
  type LakeGroupElement,
  type LakeGroupSummary,
  type ListLakeGroupsRuntime,
  listLakeGroupsTool,
} from "./list-lake-groups";

interface FakeRuntimeHandles {
  runtime: ListLakeGroupsRuntime;
  readGroupElements: ReturnType<
    typeof vi.fn<ListLakeGroupsRuntime["readGroupElements"]>
  >;
  readPackFeatures: ReturnType<
    typeof vi.fn<ListLakeGroupsRuntime["readPackFeatures"]>
  >;
}

function makeRuntime(
  overrides: Partial<ListLakeGroupsRuntime> = {},
): FakeRuntimeHandles {
  const readGroupElements = vi.fn<ListLakeGroupsRuntime["readGroupElements"]>(
    overrides.readGroupElements ?? (() => []),
  );
  const readPackFeatures = vi.fn<ListLakeGroupsRuntime["readPackFeatures"]>(
    overrides.readPackFeatures ?? (() => null),
  );
  return {
    runtime: { readGroupElements, readPackFeatures },
    readGroupElements,
    readPackFeatures,
  };
}

describe("list_lake_groups tool metadata", () => {
  it("has the right name and empty schema", () => {
    expect(listLakeGroupsTool.name).toBe("list_lake_groups");
    expect(listLakeGroupsTool.input_schema).toEqual({
      type: "object",
      properties: {},
    });
  });

  it("DEFAULT_LAKE_GROUPS matches the UI literal", () => {
    expect([...DEFAULT_LAKE_GROUPS]).toEqual([
      "freshwater",
      "salt",
      "sinkhole",
      "frozen",
      "lava",
      "dry",
    ]);
  });

  it("createListLakeGroupsTool() produces an equivalent tool", () => {
    const built = createListLakeGroupsTool();
    expect(built.name).toBe(listLakeGroupsTool.name);
    expect(built.input_schema).toEqual(listLakeGroupsTool.input_schema);
    expect(built.description).toBe(listLakeGroupsTool.description);
  });

  it("registers and round-trips through ToolRegistry", () => {
    const registry = new ToolRegistry();
    registry.register(listLakeGroupsTool);
    const tools = registry.list();
    expect(tools.find((t) => t.name === "list_lake_groups")).toBeDefined();
  });
});

describe("list_lake_groups tool", () => {
  it("happy path: 3 groups (default-with-lakes, default-empty, custom-with-lakes) in SVG order", async () => {
    const elements: LakeGroupElement[] = [
      { id: "freshwater", childCount: 99 }, // SVG child count is ignored when pack.features is available
      { id: "salt", childCount: 0 },
      { id: "lake-custom", childCount: 99 },
    ];
    // pack.features[0] is a placeholder.
    const features: unknown[] = [
      0,
      { i: 1, type: "lake", group: "freshwater" },
      { i: 2, type: "lake", group: "freshwater" },
      // salt: zero
      { i: 3, type: "lake", group: "lake-custom" },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
      readPackFeatures: () => features,
    });
    const tool = createListLakeGroupsTool(handles.runtime);
    const result = await tool.execute({});

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(3);
    const groups: LakeGroupSummary[] = body.groups;
    expect(groups).toEqual([
      { id: "freshwater", lake_count: 2, is_default: true },
      { id: "salt", lake_count: 0, is_default: true },
      { id: "lake-custom", lake_count: 1, is_default: false },
    ]);
  });

  it("preserves SVG / document order even when alphabetical would differ", async () => {
    const elements: LakeGroupElement[] = [
      { id: "salt", childCount: 0 },
      { id: "freshwater", childCount: 0 },
      { id: "zeta-lake", childCount: 0 },
      { id: "dry", childCount: 0 },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
      readPackFeatures: () => [0],
    });
    const tool = createListLakeGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.groups.map((g: LakeGroupSummary) => g.id)).toEqual([
      "salt",
      "freshwater",
      "zeta-lake",
      "dry",
    ]);
  });

  it("skips removed: true lakes from the per-group count", async () => {
    const elements: LakeGroupElement[] = [
      { id: "freshwater", childCount: 0 },
      { id: "salt", childCount: 0 },
    ];
    const features: unknown[] = [
      0,
      { i: 1, type: "lake", group: "freshwater" },
      { i: 2, type: "lake", group: "freshwater", removed: true },
      { i: 3, type: "lake", group: "freshwater" },
      { i: 4, type: "lake", group: "salt", removed: true },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
      readPackFeatures: () => features,
    });
    const tool = createListLakeGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.groups).toEqual([
      { id: "freshwater", lake_count: 2, is_default: true },
      { id: "salt", lake_count: 0, is_default: true },
    ]);
  });

  it("skips features whose type !== 'lake'", async () => {
    const elements: LakeGroupElement[] = [{ id: "freshwater", childCount: 0 }];
    const features: unknown[] = [
      0,
      { i: 1, type: "lake", group: "freshwater" },
      { i: 2, type: "ocean", group: "freshwater" },
      { i: 3, type: "island", group: "freshwater" },
      { i: 4, type: "lake", group: "freshwater" },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
      readPackFeatures: () => features,
    });
    const tool = createListLakeGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.groups).toEqual([
      { id: "freshwater", lake_count: 2, is_default: true },
    ]);
  });

  it("skips the index-0 placeholder", async () => {
    const elements: LakeGroupElement[] = [{ id: "freshwater", childCount: 0 }];
    // If we erroneously read index 0, we'd inflate the count. Use a
    // bogus zero-position lake-shaped object to make sure it's ignored.
    const features: unknown[] = [
      { i: 0, type: "lake", group: "freshwater" }, // should be skipped
      { i: 1, type: "lake", group: "freshwater" },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
      readPackFeatures: () => features,
    });
    const tool = createListLakeGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.groups).toEqual([
      { id: "freshwater", lake_count: 1, is_default: true },
    ]);
  });

  it("falls back to childCount from SVG when pack.features is null", async () => {
    const elements: LakeGroupElement[] = [
      { id: "freshwater", childCount: 5 },
      { id: "lake-foo", childCount: 7 },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
      readPackFeatures: () => null,
    });
    const tool = createListLakeGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.groups).toEqual([
      { id: "freshwater", lake_count: 5, is_default: true },
      { id: "lake-foo", lake_count: 7, is_default: false },
    ]);
  });

  it("returns an error when the lakes layer is missing", async () => {
    const handles = makeRuntime({
      readGroupElements: () => null,
    });
    const tool = createListLakeGroupsTool(handles.runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/lakes layer is unavailable/i);
    // We never even tried to read pack.features — failed fast.
    expect(handles.readPackFeatures).not.toHaveBeenCalled();
  });

  it("succeeds with an empty list when no <g> children exist", async () => {
    const handles = makeRuntime({
      readGroupElements: () => [],
      readPackFeatures: () => [0],
    });
    const tool = createListLakeGroupsTool(handles.runtime);
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
      readGroupElements: () => [{ id: "freshwater", childCount: 0 }],
      readPackFeatures: () => [0],
    });
    const tool = createListLakeGroupsTool(handles.runtime);
    for (const input of [{}, null, undefined]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      expect(body.ok).toBe(true);
      expect(body.count).toBe(1);
    }
  });

  it("identifies all six default groups via is_default", async () => {
    const elements: LakeGroupElement[] = [
      { id: "freshwater", childCount: 0 },
      { id: "salt", childCount: 0 },
      { id: "sinkhole", childCount: 0 },
      { id: "frozen", childCount: 0 },
      { id: "lava", childCount: 0 },
      { id: "dry", childCount: 0 },
      { id: "lake-other", childCount: 0 },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
      readPackFeatures: () => [0],
    });
    const tool = createListLakeGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    const flags = (body.groups as LakeGroupSummary[]).map((g) => [
      g.id,
      g.is_default,
    ]);
    expect(flags).toEqual([
      ["freshwater", true],
      ["salt", true],
      ["sinkhole", true],
      ["frozen", true],
      ["lava", true],
      ["dry", true],
      ["lake-other", false],
    ]);
  });
});

describe("defaultListLakeGroupsRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalLakes = (globalThis as { lakes?: unknown }).lakes;
  const originalDoc = (globalThis as { document?: unknown }).document;

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { lakes?: unknown }).lakes = originalLakes;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("reads <g> nodes from window.lakes._groups[0] in order", async () => {
    const fakeNodes = [
      { id: "freshwater", children: { length: 4 } },
      { id: "salt", children: { length: 0 } },
      { id: "lake-pilgrim", children: { length: 2 } },
    ];
    const fakeLakesSel = {
      selectAll: vi.fn((selector: string) => {
        expect(selector).toBe("g");
        return { _groups: [fakeNodes] };
      }),
    };
    (globalThis as { lakes?: unknown }).lakes = fakeLakesSel;
    (globalThis as { pack?: unknown }).pack = {
      features: [
        0,
        { i: 1, type: "lake", group: "freshwater" },
        { i: 2, type: "lake", group: "freshwater" },
        { i: 3, type: "lake", group: "freshwater" },
        { i: 4, type: "lake", group: "freshwater" },
        { i: 5, type: "lake", group: "lake-pilgrim" },
        { i: 6, type: "lake", group: "lake-pilgrim" },
        { i: 7, type: "lake", group: "lake-pilgrim", removed: true },
        { i: 8, type: "ocean", group: "freshwater" }, // wrong type, ignored
      ],
    };

    const result = await listLakeGroupsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.count).toBe(3);
    expect(body.groups).toEqual([
      { id: "freshwater", lake_count: 4, is_default: true },
      { id: "salt", lake_count: 0, is_default: true },
      { id: "lake-pilgrim", lake_count: 2, is_default: false },
    ]);
    expect(fakeLakesSel.selectAll).toHaveBeenCalledWith("g");
  });

  it("falls back to document.getElementById('lakes') when window.lakes is absent", async () => {
    (globalThis as { lakes?: unknown }).lakes = undefined;
    const fakeRoot = {
      children: {
        length: 3,
        0: {
          tagName: "g",
          id: "freshwater",
          children: { length: 2 },
        },
        1: {
          tagName: "DEFS", // ignored: not a <g>
          id: "anything",
          children: { length: 0 },
        },
        2: {
          tagName: "g",
          id: "lake-pilgrim",
          children: { length: 1 },
        },
      },
    };
    (globalThis as { document?: unknown }).document = {
      getElementById: vi.fn((id: string) => (id === "lakes" ? fakeRoot : null)),
    };
    (globalThis as { pack?: unknown }).pack = {
      features: [
        0,
        { i: 1, type: "lake", group: "freshwater" },
        { i: 2, type: "lake", group: "lake-pilgrim" },
      ],
    };

    const result = await listLakeGroupsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.groups).toEqual([
      { id: "freshwater", lake_count: 1, is_default: true },
      { id: "lake-pilgrim", lake_count: 1, is_default: false },
    ]);
  });

  it("uses childCount fallback when pack.features is unavailable", async () => {
    const fakeNodes = [
      { id: "freshwater", children: { length: 4 } },
      { id: "lake-foo", children: { length: 9 } },
    ];
    (globalThis as { lakes?: unknown }).lakes = {
      selectAll: () => ({ _groups: [fakeNodes] }),
    };
    (globalThis as { pack?: unknown }).pack = undefined;

    const result = await listLakeGroupsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.groups).toEqual([
      { id: "freshwater", lake_count: 4, is_default: true },
      { id: "lake-foo", lake_count: 9, is_default: false },
    ]);
  });

  it("errors when neither window.lakes nor #lakes element is available", async () => {
    (globalThis as { lakes?: unknown }).lakes = undefined;
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    (globalThis as { pack?: unknown }).pack = { features: [0] };

    const result = await listLakeGroupsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /lakes layer is unavailable/i,
    );
  });
});

describe("defaultListLakeGroupsRuntime (no-document environment)", () => {
  // When there's no document at all (extreme headless), the DOM
  // fallback short-circuits to null and the tool errors. We test
  // this in an isolated block so we can fully delete `document`.
  let originalDoc: unknown;
  let originalLakes: unknown;
  let originalPack: unknown;

  beforeEach(() => {
    originalDoc = (globalThis as { document?: unknown }).document;
    originalLakes = (globalThis as { lakes?: unknown }).lakes;
    originalPack = (globalThis as { pack?: unknown }).pack;
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { lakes?: unknown }).lakes = undefined;
    (globalThis as { pack?: unknown }).pack = undefined;
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { lakes?: unknown }).lakes = originalLakes;
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("errors when there's no DOM and no D3 selection", async () => {
    const result = await listLakeGroupsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /lakes layer is unavailable/i,
    );
  });
});
