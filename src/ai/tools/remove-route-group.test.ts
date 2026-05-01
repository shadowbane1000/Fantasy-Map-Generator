import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRoute } from "./_shared";
import {
  createRemoveRouteGroupTool,
  DEFAULT_ROUTE_GROUPS,
  type RemoveRouteGroupRuntime,
  removeRouteGroupTool,
} from "./remove-route-group";

interface FakeRuntimeHandles {
  runtime: RemoveRouteGroupRuntime;
  groupExists: ReturnType<typeof vi.fn<RemoveRouteGroupRuntime["groupExists"]>>;
  listRoutesInGroup: ReturnType<
    typeof vi.fn<RemoveRouteGroupRuntime["listRoutesInGroup"]>
  >;
  removeRoute: ReturnType<typeof vi.fn<RemoveRouteGroupRuntime["removeRoute"]>>;
  removeGroupElement: ReturnType<
    typeof vi.fn<RemoveRouteGroupRuntime["removeGroupElement"]>
  >;
}

function makeRuntime(
  overrides: Partial<RemoveRouteGroupRuntime> = {},
): FakeRuntimeHandles {
  const groupExists = vi.fn<RemoveRouteGroupRuntime["groupExists"]>(
    overrides.groupExists ?? (() => true),
  );
  const listRoutesInGroup = vi.fn<RemoveRouteGroupRuntime["listRoutesInGroup"]>(
    overrides.listRoutesInGroup ?? (() => []),
  );
  const removeRoute = vi.fn<RemoveRouteGroupRuntime["removeRoute"]>(
    overrides.removeRoute ?? (() => {}),
  );
  const removeGroupElement = vi.fn<
    RemoveRouteGroupRuntime["removeGroupElement"]
  >(overrides.removeGroupElement ?? (() => {}));
  return {
    runtime: {
      groupExists,
      listRoutesInGroup,
      removeRoute,
      removeGroupElement,
    },
    groupExists,
    listRoutesInGroup,
    removeRoute,
    removeGroupElement,
  };
}

describe("remove_route_group tool metadata", () => {
  it("has the right name and schema", () => {
    expect(removeRouteGroupTool.name).toBe("remove_route_group");
    expect(removeRouteGroupTool.input_schema).toMatchObject({
      type: "object",
      required: ["group"],
    });
    expect(removeRouteGroupTool.input_schema.properties).toHaveProperty(
      "group",
    );
  });

  it("defaults are roads / trails / searoutes (UI literal)", () => {
    expect([...DEFAULT_ROUTE_GROUPS]).toEqual(["roads", "trails", "searoutes"]);
  });

  it("createRemoveRouteGroupTool produces an equivalent tool", () => {
    const built = createRemoveRouteGroupTool();
    expect(built.name).toBe(removeRouteGroupTool.name);
    expect(built.input_schema).toEqual(removeRouteGroupTool.input_schema);
  });
});

describe("remove_route_group tool", () => {
  it("removes all routes in a non-default group and removes the <g>", async () => {
    const routes: RawRoute[] = [
      { i: 1, name: "Pilgrim Way", group: "route-pilgrim" },
      { i: 2, name: "Old Pilgrim Path", group: "route-pilgrim" },
    ];
    const handles = makeRuntime({
      groupExists: () => true,
      listRoutesInGroup: () => routes,
    });
    const tool = createRemoveRouteGroupTool(handles.runtime);
    const result = await tool.execute({ group: "route-pilgrim" });

    expect(result.isError).toBeFalsy();
    expect(handles.groupExists).toHaveBeenCalledWith("route-pilgrim");
    expect(handles.listRoutesInGroup).toHaveBeenCalledWith("route-pilgrim");
    expect(handles.removeRoute).toHaveBeenCalledTimes(2);
    expect(handles.removeRoute).toHaveBeenNthCalledWith(1, routes[0]);
    expect(handles.removeRoute).toHaveBeenNthCalledWith(2, routes[1]);
    expect(handles.removeGroupElement).toHaveBeenCalledWith("route-pilgrim");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "route-pilgrim",
      removed_count: 2,
      svg_removed: true,
    });
  });

  it.each(
    DEFAULT_ROUTE_GROUPS,
  )("removes routes but leaves the <g> for default group %s", async (group) => {
    const routes: RawRoute[] = [
      { i: 7, name: "A", group },
      { i: 8, name: "B", group },
      { i: 9, name: "C", group },
    ];
    const handles = makeRuntime({
      groupExists: () => true,
      listRoutesInGroup: () => routes,
    });
    const tool = createRemoveRouteGroupTool(handles.runtime);
    const result = await tool.execute({ group });

    expect(result.isError).toBeFalsy();
    expect(handles.removeRoute).toHaveBeenCalledTimes(3);
    expect(handles.removeGroupElement).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group,
      removed_count: 3,
      svg_removed: false,
    });
  });

  it("errors and mutates nothing when the group doesn't exist", async () => {
    const handles = makeRuntime({
      groupExists: () => false,
    });
    const tool = createRemoveRouteGroupTool(handles.runtime);
    const result = await tool.execute({ group: "route-mystery" });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/route-mystery/);
    expect(handles.listRoutesInGroup).not.toHaveBeenCalled();
    expect(handles.removeRoute).not.toHaveBeenCalled();
    expect(handles.removeGroupElement).not.toHaveBeenCalled();
  });

  it("succeeds with removed_count 0 on an empty non-default group", async () => {
    const handles = makeRuntime({
      groupExists: () => true,
      listRoutesInGroup: () => [],
    });
    const tool = createRemoveRouteGroupTool(handles.runtime);
    const result = await tool.execute({ group: "route-empty" });

    expect(result.isError).toBeFalsy();
    expect(handles.removeRoute).not.toHaveBeenCalled();
    expect(handles.removeGroupElement).toHaveBeenCalledWith("route-empty");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "route-empty",
      removed_count: 0,
      svg_removed: true,
    });
  });

  it("succeeds with removed_count 0 on an empty default group, no svg removal", async () => {
    const handles = makeRuntime({
      groupExists: () => true,
      listRoutesInGroup: () => [],
    });
    const tool = createRemoveRouteGroupTool(handles.runtime);
    const result = await tool.execute({ group: "trails" });

    expect(result.isError).toBeFalsy();
    expect(handles.removeRoute).not.toHaveBeenCalled();
    expect(handles.removeGroupElement).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "trails",
      removed_count: 0,
      svg_removed: false,
    });
  });

  it("rejects invalid group inputs", async () => {
    const handles = makeRuntime();
    const tool = createRemoveRouteGroupTool(handles.runtime);
    for (const bad of [null, undefined, 42, "", "   "]) {
      const r = await tool.execute({ group: bad });
      expect(r.isError).toBe(true);
    }
    expect(handles.groupExists).not.toHaveBeenCalled();
    expect(handles.removeRoute).not.toHaveBeenCalled();
    expect(handles.removeGroupElement).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace before validating / forwarding", async () => {
    const routes: RawRoute[] = [{ i: 1, group: "route-x" }];
    const handles = makeRuntime({
      groupExists: () => true,
      listRoutesInGroup: () => routes,
    });
    const tool = createRemoveRouteGroupTool(handles.runtime);
    const result = await tool.execute({ group: "  route-x  " });
    expect(result.isError).toBeFalsy();
    expect(handles.groupExists).toHaveBeenCalledWith("route-x");
    expect(handles.listRoutesInGroup).toHaveBeenCalledWith("route-x");
    expect(handles.removeGroupElement).toHaveBeenCalledWith("route-x");
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      group: "route-x",
    });
  });

  it("surfaces errors thrown by removeRoute", async () => {
    const routes: RawRoute[] = [{ i: 1, group: "roads" }];
    const handles = makeRuntime({
      groupExists: () => true,
      listRoutesInGroup: () => routes,
      removeRoute: () => {
        throw new Error("Routes.remove is not available yet");
      },
    });
    const tool = createRemoveRouteGroupTool(handles.runtime);
    const result = await tool.execute({ group: "roads" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });

  it("skips object-form input that has no group", async () => {
    const handles = makeRuntime();
    const tool = createRemoveRouteGroupTool(handles.runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(handles.groupExists).not.toHaveBeenCalled();
  });
});

describe("defaultRemoveRouteGroupRuntime (integration)", () => {
  const routesRemove = vi.fn();
  const groupRemove = vi.fn();
  // Selector lookup: returns a populated stub when the group exists,
  // an empty one otherwise. `routes.select("#g")` is the legacy contract.
  let knownGroups: Set<string>;

  function makeSelection(found: boolean): {
    empty: () => boolean;
    size: () => number;
    remove: () => void;
  } {
    return {
      empty: () => !found,
      size: () => (found ? 1 : 0),
      remove: () => groupRemove(found),
    };
  }

  const fakeRoutesSel = {
    select: vi.fn((selector: string) => {
      // selector arrives as "#g"
      const id = selector.startsWith("#") ? selector.slice(1) : selector;
      return makeSelection(knownGroups.has(id));
    }),
  };

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRoutes = (globalThis as { routes?: unknown }).routes;
  const originalRoutesModule = (globalThis as { Routes?: unknown }).Routes;

  beforeEach(() => {
    routesRemove.mockReset();
    groupRemove.mockReset();
    fakeRoutesSel.select.mockClear();
    knownGroups = new Set(["roads", "trails", "searoutes", "route-pilgrim"]);
    (globalThis as { pack?: unknown }).pack = {
      routes: [
        { i: 1, name: "Pilgrim Way", group: "route-pilgrim" },
        { i: 2, name: "Iron Passage", group: "roads" },
        { i: 3, name: "Old Pilgrim Path", group: "route-pilgrim" },
        {
          i: 4,
          name: "Retired Pilgrim",
          group: "route-pilgrim",
          removed: true,
        },
      ] satisfies RawRoute[],
    };
    (globalThis as { routes?: unknown }).routes = fakeRoutesSel;
    (globalThis as { Routes?: unknown }).Routes = { remove: routesRemove };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { routes?: unknown }).routes = originalRoutes;
    (globalThis as { Routes?: unknown }).Routes = originalRoutesModule;
  });

  it("removes every active route in a non-default group and removes the <g>", async () => {
    const result = await removeRouteGroupTool.execute({
      group: "route-pilgrim",
    });
    expect(result.isError).toBeFalsy();
    expect(routesRemove).toHaveBeenCalledTimes(2);
    const removedIds = routesRemove.mock.calls.map((c) => (c[0] as RawRoute).i);
    expect(removedIds.sort()).toEqual([1, 3]);
    // svg removal happened
    expect(groupRemove).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      group: "route-pilgrim",
      removed_count: 2,
      svg_removed: true,
    });
  });

  it("removes routes but leaves the <g> for default groups", async () => {
    const result = await removeRouteGroupTool.execute({ group: "roads" });
    expect(result.isError).toBeFalsy();
    expect(routesRemove).toHaveBeenCalledTimes(1);
    expect((routesRemove.mock.calls[0]?.[0] as RawRoute).i).toBe(2);
    expect(groupRemove).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      group: "roads",
      removed_count: 1,
      svg_removed: false,
    });
  });

  it("errors when the <g> is missing", async () => {
    const result = await removeRouteGroupTool.execute({
      group: "route-mystery",
    });
    expect(result.isError).toBe(true);
    expect(routesRemove).not.toHaveBeenCalled();
    expect(groupRemove).not.toHaveBeenCalled();
  });

  it("errors when Routes.remove is missing", async () => {
    (globalThis as { Routes?: unknown }).Routes = undefined;
    const result = await removeRouteGroupTool.execute({
      group: "route-pilgrim",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Routes\.remove/);
  });

  it("falls back to document.getElementById when window.routes is absent", async () => {
    (globalThis as { routes?: unknown }).routes = undefined;
    const fakeElement = { remove: vi.fn() };
    const originalDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {
      getElementById: vi.fn((id: string) =>
        id === "route-pilgrim" ? fakeElement : null,
      ),
    };
    try {
      const result = await removeRouteGroupTool.execute({
        group: "route-pilgrim",
      });
      expect(result.isError).toBeFalsy();
      expect(fakeElement.remove).toHaveBeenCalledTimes(1);
    } finally {
      (globalThis as { document?: unknown }).document = originalDoc;
    }
  });
});
