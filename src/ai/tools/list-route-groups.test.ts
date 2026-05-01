import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRoute } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createListRouteGroupsTool,
  DEFAULT_ROUTE_GROUPS,
  type ListRouteGroupsRuntime,
  listRouteGroupsTool,
  type RouteGroupElement,
  type RouteGroupSummary,
} from "./list-route-groups";

interface FakeRuntimeHandles {
  runtime: ListRouteGroupsRuntime;
  readGroupElements: ReturnType<
    typeof vi.fn<ListRouteGroupsRuntime["readGroupElements"]>
  >;
  readPackRoutes: ReturnType<
    typeof vi.fn<ListRouteGroupsRuntime["readPackRoutes"]>
  >;
}

function makeRuntime(
  overrides: Partial<ListRouteGroupsRuntime> = {},
): FakeRuntimeHandles {
  const readGroupElements = vi.fn<ListRouteGroupsRuntime["readGroupElements"]>(
    overrides.readGroupElements ?? (() => []),
  );
  const readPackRoutes = vi.fn<ListRouteGroupsRuntime["readPackRoutes"]>(
    overrides.readPackRoutes ?? (() => null),
  );
  return {
    runtime: { readGroupElements, readPackRoutes },
    readGroupElements,
    readPackRoutes,
  };
}

describe("list_route_groups tool metadata", () => {
  it("has the right name and empty schema", () => {
    expect(listRouteGroupsTool.name).toBe("list_route_groups");
    expect(listRouteGroupsTool.input_schema).toEqual({
      type: "object",
      properties: {},
    });
  });

  it("DEFAULT_ROUTE_GROUPS matches the UI literal", () => {
    expect([...DEFAULT_ROUTE_GROUPS]).toEqual(["roads", "trails", "searoutes"]);
  });

  it("createListRouteGroupsTool() produces an equivalent tool", () => {
    const built = createListRouteGroupsTool();
    expect(built.name).toBe(listRouteGroupsTool.name);
    expect(built.input_schema).toEqual(listRouteGroupsTool.input_schema);
    expect(built.description).toBe(listRouteGroupsTool.description);
  });

  it("registers and round-trips through ToolRegistry", () => {
    const registry = new ToolRegistry();
    registry.register(listRouteGroupsTool);
    const tools = registry.list();
    expect(tools.find((t) => t.name === "list_route_groups")).toBeDefined();
  });
});

describe("list_route_groups tool", () => {
  it("happy path: 3 groups (default-with-routes, default-empty, custom-with-routes) in SVG order", async () => {
    const elements: RouteGroupElement[] = [
      { id: "roads", childCount: 99 }, // SVG child count is ignored when pack.routes is available
      { id: "trails", childCount: 0 },
      { id: "route-pilgrim", childCount: 99 },
    ];
    const routes: RawRoute[] = [
      { i: 1, group: "roads" },
      { i: 2, group: "roads" },
      { i: 3, group: "roads" },
      // trails: zero
      { i: 4, group: "route-pilgrim" },
      { i: 5, group: "route-pilgrim" },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
      readPackRoutes: () => routes,
    });
    const tool = createListRouteGroupsTool(handles.runtime);
    const result = await tool.execute({});

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(3);
    const groups: RouteGroupSummary[] = body.groups;
    expect(groups).toEqual([
      { id: "roads", route_count: 3, is_default: true },
      { id: "trails", route_count: 0, is_default: true },
      { id: "route-pilgrim", route_count: 2, is_default: false },
    ]);
  });

  it("preserves SVG / document order even when alphabetical would differ", async () => {
    const elements: RouteGroupElement[] = [
      { id: "searoutes", childCount: 0 },
      { id: "roads", childCount: 0 },
      { id: "route-zeta", childCount: 0 },
      { id: "trails", childCount: 0 },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
      readPackRoutes: () => [],
    });
    const tool = createListRouteGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.groups.map((g: RouteGroupSummary) => g.id)).toEqual([
      "searoutes",
      "roads",
      "route-zeta",
      "trails",
    ]);
  });

  it("skips removed: true routes from the per-group count", async () => {
    const elements: RouteGroupElement[] = [
      { id: "roads", childCount: 0 },
      { id: "trails", childCount: 0 },
    ];
    const routes: RawRoute[] = [
      { i: 1, group: "roads" },
      { i: 2, group: "roads", removed: true },
      { i: 3, group: "roads" },
      { i: 4, group: "trails", removed: true },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
      readPackRoutes: () => routes,
    });
    const tool = createListRouteGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.groups).toEqual([
      { id: "roads", route_count: 2, is_default: true },
      { id: "trails", route_count: 0, is_default: true },
    ]);
  });

  it("falls back to childCount from SVG when pack.routes is null", async () => {
    const elements: RouteGroupElement[] = [
      { id: "roads", childCount: 5 },
      { id: "route-foo", childCount: 7 },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
      readPackRoutes: () => null,
    });
    const tool = createListRouteGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    expect(body.groups).toEqual([
      { id: "roads", route_count: 5, is_default: true },
      { id: "route-foo", route_count: 7, is_default: false },
    ]);
  });

  it("returns an error when the routes layer is missing", async () => {
    const handles = makeRuntime({
      readGroupElements: () => null,
    });
    const tool = createListRouteGroupsTool(handles.runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/routes layer is unavailable/i);
    // We never even tried to read pack.routes — failed fast.
    expect(handles.readPackRoutes).not.toHaveBeenCalled();
  });

  it("succeeds with an empty list when no <g> children exist", async () => {
    const handles = makeRuntime({
      readGroupElements: () => [],
      readPackRoutes: () => [],
    });
    const tool = createListRouteGroupsTool(handles.runtime);
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
      readGroupElements: () => [{ id: "roads", childCount: 0 }],
      readPackRoutes: () => [],
    });
    const tool = createListRouteGroupsTool(handles.runtime);
    for (const input of [{}, null, undefined]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
      const body = JSON.parse(result.content);
      expect(body.ok).toBe(true);
      expect(body.count).toBe(1);
    }
  });

  it("identifies all three default groups via is_default", async () => {
    const elements: RouteGroupElement[] = [
      { id: "roads", childCount: 0 },
      { id: "trails", childCount: 0 },
      { id: "searoutes", childCount: 0 },
      { id: "route-other", childCount: 0 },
    ];
    const handles = makeRuntime({
      readGroupElements: () => elements,
      readPackRoutes: () => [],
    });
    const tool = createListRouteGroupsTool(handles.runtime);
    const body = JSON.parse((await tool.execute({})).content);
    const flags = (body.groups as RouteGroupSummary[]).map((g) => [
      g.id,
      g.is_default,
    ]);
    expect(flags).toEqual([
      ["roads", true],
      ["trails", true],
      ["searoutes", true],
      ["route-other", false],
    ]);
  });
});

describe("defaultListRouteGroupsRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRoutes = (globalThis as { routes?: unknown }).routes;
  const originalDoc = (globalThis as { document?: unknown }).document;

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { routes?: unknown }).routes = originalRoutes;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("reads <g> nodes from window.routes._groups[0] in order", async () => {
    const fakeNodes = [
      { id: "roads", children: { length: 4 } },
      { id: "trails", children: { length: 0 } },
      { id: "route-pilgrim", children: { length: 2 } },
    ];
    const fakeRoutesSel = {
      selectAll: vi.fn((selector: string) => {
        expect(selector).toBe("g");
        return { _groups: [fakeNodes] };
      }),
    };
    (globalThis as { routes?: unknown }).routes = fakeRoutesSel;
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        { i: 1, group: "roads" },
        { i: 2, group: "roads" },
        { i: 3, group: "roads" },
        { i: 4, group: "roads" },
        { i: 5, group: "route-pilgrim" },
        { i: 6, group: "route-pilgrim" },
        { i: 7, group: "route-pilgrim", removed: true },
      ] satisfies RawRoute[],
    };

    const result = await listRouteGroupsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.count).toBe(3);
    expect(body.groups).toEqual([
      { id: "roads", route_count: 4, is_default: true },
      { id: "trails", route_count: 0, is_default: true },
      { id: "route-pilgrim", route_count: 2, is_default: false },
    ]);
    expect(fakeRoutesSel.selectAll).toHaveBeenCalledWith("g");
  });

  it("falls back to document.getElementById('routes') when window.routes is absent", async () => {
    (globalThis as { routes?: unknown }).routes = undefined;
    const fakeRoot = {
      children: {
        length: 3,
        0: {
          tagName: "g",
          id: "roads",
          children: { length: 2 },
        },
        1: {
          tagName: "DEFS", // ignored: not a <g>
          id: "anything",
          children: { length: 0 },
        },
        2: {
          tagName: "g",
          id: "route-pilgrim",
          children: { length: 1 },
        },
      },
    };
    (globalThis as { document?: unknown }).document = {
      getElementById: vi.fn((id: string) =>
        id === "routes" ? fakeRoot : null,
      ),
    };
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        { i: 1, group: "roads" },
        { i: 2, group: "route-pilgrim" },
      ] satisfies RawRoute[],
    };

    const result = await listRouteGroupsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.groups).toEqual([
      { id: "roads", route_count: 1, is_default: true },
      { id: "route-pilgrim", route_count: 1, is_default: false },
    ]);
  });

  it("uses childCount fallback when pack.routes is unavailable", async () => {
    const fakeNodes = [
      { id: "roads", children: { length: 4 } },
      { id: "route-foo", children: { length: 9 } },
    ];
    (globalThis as { routes?: unknown }).routes = {
      selectAll: () => ({ _groups: [fakeNodes] }),
    };
    (globalThis as { pack?: unknown }).pack = undefined;

    const result = await listRouteGroupsTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.groups).toEqual([
      { id: "roads", route_count: 4, is_default: true },
      { id: "route-foo", route_count: 9, is_default: false },
    ]);
  });

  it("errors when neither window.routes nor #routes element is available", async () => {
    (globalThis as { routes?: unknown }).routes = undefined;
    (globalThis as { document?: unknown }).document = {
      getElementById: () => null,
    };
    (globalThis as { pack?: unknown }).pack = { routes: [] };

    const result = await listRouteGroupsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /routes layer is unavailable/i,
    );
  });
});

describe("defaultListRouteGroupsRuntime (no-document environment)", () => {
  // When there's no document at all (extreme headless), the DOM
  // fallback short-circuits to null and the tool errors. We test
  // this in an isolated block so we can fully delete `document`.
  let originalDoc: unknown;
  let originalRoutes: unknown;
  let originalPack: unknown;

  beforeEach(() => {
    originalDoc = (globalThis as { document?: unknown }).document;
    originalRoutes = (globalThis as { routes?: unknown }).routes;
    originalPack = (globalThis as { pack?: unknown }).pack;
    (globalThis as { document?: unknown }).document = undefined;
    (globalThis as { routes?: unknown }).routes = undefined;
    (globalThis as { pack?: unknown }).pack = undefined;
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { routes?: unknown }).routes = originalRoutes;
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("errors when there's no DOM and no D3 selection", async () => {
    const result = await listRouteGroupsTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /routes layer is unavailable/i,
    );
  });
});
