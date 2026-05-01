import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AddRouteGroupRuntime,
  addRouteGroupTool,
  createAddRouteGroupTool,
  prefixWithRoute,
  sanitizeGroupName,
} from "./add-route-group";
import { ToolRegistry } from "./index";

function makeRuntime(exists: (id: string) => boolean = () => false): {
  runtime: AddRouteGroupRuntime;
  idExists: ReturnType<typeof vi.fn<AddRouteGroupRuntime["idExists"]>>;
  appendGroup: ReturnType<typeof vi.fn<AddRouteGroupRuntime["appendGroup"]>>;
  appendSelectOption: ReturnType<
    typeof vi.fn<AddRouteGroupRuntime["appendSelectOption"]>
  >;
} {
  const idExists = vi.fn<AddRouteGroupRuntime["idExists"]>(exists);
  const appendGroup = vi.fn<AddRouteGroupRuntime["appendGroup"]>();
  const appendSelectOption =
    vi.fn<AddRouteGroupRuntime["appendSelectOption"]>();
  return {
    runtime: { idExists, appendGroup, appendSelectOption },
    idExists,
    appendGroup,
    appendSelectOption,
  };
}

describe("sanitizeGroupName", () => {
  it("lowercases input", () => {
    expect(sanitizeGroupName("FOO")).toBe("foo");
  });

  it("converts spaces to underscores", () => {
    expect(sanitizeGroupName("foo bar baz")).toBe("foo_bar_baz");
  });

  it("strips non-word non-whitespace chars", () => {
    expect(sanitizeGroupName("foo!@#bar")).toBe("foobar");
  });

  it("returns empty string for all-punctuation input", () => {
    expect(sanitizeGroupName("!!!")).toBe("");
  });

  it("preserves leading digits in the sanitized output (prefix handles it later)", () => {
    expect(sanitizeGroupName("9 trails")).toBe("9_trails");
  });
});

describe("prefixWithRoute", () => {
  it("adds the route- prefix when missing", () => {
    expect(prefixWithRoute("foo")).toBe("route-foo");
  });

  it("leaves an already-prefixed string alone", () => {
    expect(prefixWithRoute("route-bar")).toBe("route-bar");
  });
});

describe("add_route_group tool", () => {
  it("happy path: creates group with sanitized + prefixed id and updates both selects", async () => {
    const { runtime, idExists, appendGroup, appendSelectOption } =
      makeRuntime();
    const tool = createAddRouteGroupTool(runtime);
    const result = await tool.execute({ name: "Imperial Road" });
    expect(result.isError).toBeFalsy();
    expect(idExists).toHaveBeenCalledWith("route-imperial_road");
    expect(appendGroup).toHaveBeenCalledWith("route-imperial_road");
    expect(appendSelectOption).toHaveBeenNthCalledWith(
      1,
      "routeGroup",
      "route-imperial_road",
    );
    expect(appendSelectOption).toHaveBeenNthCalledWith(
      2,
      "routeCreatorGroupSelect",
      "route-imperial_road",
    );
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: "route-imperial_road",
    });
  });

  it("auto-prefixes a bare name with route-", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddRouteGroupTool(runtime);
    const result = await tool.execute({ name: "foo" });
    expect(result.isError).toBeFalsy();
    expect(appendGroup).toHaveBeenCalledWith("route-foo");
  });

  it("mirrors UI: hyphens are stripped during sanitization, so 'route-bar' → 'route-routebar'", async () => {
    // The UI's sanitization regex /[^\w\s]/gi strips the hyphen from
    // "route-bar" before the auto-prefix step, yielding "routebar"
    // and then "route-routebar". This is the exact behavior of
    // route-group-editor.js → addGroup, so we keep it.
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddRouteGroupTool(runtime);
    const result = await tool.execute({ name: "route-bar" });
    expect(result.isError).toBeFalsy();
    expect(appendGroup).toHaveBeenCalledWith("route-routebar");
  });

  it("avoids double-prefixing when the (already-sanitized) input begins with 'route-'", async () => {
    // After sanitization a name like "route_foo" remains "route_foo"
    // (underscores are \w), and prefixWithRoute leaves it alone if it
    // already begins with "route-" — but underscores aren't hyphens,
    // so this still gets the prefix. The path that actually skips
    // double-prefixing is when the *sanitized* input already starts
    // with "route-", which can only happen if the underlying input
    // somehow contained "route-" as-is (impossible after the regex
    // strip). prefixWithRoute is exercised directly elsewhere.
    expect(prefixWithRoute("route-foo")).toBe("route-foo");
    expect(prefixWithRoute("foo")).toBe("route-foo");
  });

  it("sanitizes spaces and special characters", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddRouteGroupTool(runtime);
    const result = await tool.execute({ name: "My Cool Group!" });
    expect(result.isError).toBeFalsy();
    expect(appendGroup).toHaveBeenCalledWith("route-my_cool_group");
  });

  it("rejects non-string name", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddRouteGroupTool(runtime);
    for (const bad of [undefined, null, 42, true, {}, []]) {
      const r = await tool.execute({ name: bad });
      expect(r.isError).toBe(true);
    }
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects empty / whitespace-only name", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddRouteGroupTool(runtime);
    for (const bad of ["", "   ", "\t\n"]) {
      const r = await tool.execute({ name: bad });
      expect(r.isError).toBe(true);
    }
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects a name that sanitizes to empty (all punctuation)", async () => {
    const { runtime, appendGroup } = makeRuntime();
    const tool = createAddRouteGroupTool(runtime);
    const result = await tool.execute({ name: "!!!" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/sanitized to empty/i);
    expect(appendGroup).not.toHaveBeenCalled();
  });

  it("rejects when the resulting id already exists", async () => {
    const { runtime, appendGroup, appendSelectOption } = makeRuntime(
      (id) => id === "route-foo",
    );
    const tool = createAddRouteGroupTool(runtime);
    const result = await tool.execute({ name: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/already exists/);
    expect(appendGroup).not.toHaveBeenCalled();
    expect(appendSelectOption).not.toHaveBeenCalled();
  });

  it("surfaces appendGroup failures", async () => {
    const runtime: AddRouteGroupRuntime = {
      idExists: () => false,
      appendGroup: vi.fn(() => {
        throw new Error("routes selection missing");
      }),
      appendSelectOption: vi.fn(),
    };
    const tool = createAddRouteGroupTool(runtime);
    const result = await tool.execute({ name: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /routes selection missing/,
    );
  });

  it("has the expected tool name", () => {
    expect(addRouteGroupTool.name).toBe("add_route_group");
  });

  it("registers and round-trips through ToolRegistry", async () => {
    const registry = new ToolRegistry();
    registry.register(addRouteGroupTool);
    const tools = registry.list();
    expect(tools.find((t) => t.name === "add_route_group")).toBeDefined();
  });
});

interface AttrCall {
  name: string;
  value: string | number;
}

interface FakeSelection {
  attr: (name: string, value: string | number) => FakeSelection;
}

interface FakeRoutes {
  append: (name: string) => FakeSelection;
  appended: string[];
  attrs: AttrCall[];
}

function makeFakeRoutes(): FakeRoutes {
  const appended: string[] = [];
  const attrs: AttrCall[] = [];
  const selection: FakeSelection = {
    attr(name, value) {
      attrs.push({ name, value });
      return selection;
    },
  };
  return {
    append(name) {
      appended.push(name);
      return selection;
    },
    appended,
    attrs,
  };
}

describe("defaultAddRouteGroupRuntime (integration)", () => {
  const originalRoutes = (globalThis as { routes?: unknown }).routes;
  const originalDoc = (globalThis as { document?: unknown }).document;

  let fakeRoutes: FakeRoutes;
  let routeGroupAdd: ReturnType<typeof vi.fn>;
  let routeCreatorGroupAdd: ReturnType<typeof vi.fn>;
  let elementsById: Record<string, unknown>;

  beforeEach(() => {
    fakeRoutes = makeFakeRoutes();
    routeGroupAdd = vi.fn();
    routeCreatorGroupAdd = vi.fn();
    elementsById = {
      routeGroup: { options: { add: routeGroupAdd } },
      routeCreatorGroupSelect: { options: { add: routeCreatorGroupAdd } },
    };
    (globalThis as { routes?: unknown }).routes = fakeRoutes;
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => elementsById[id] ?? null,
      // happy fallback for buildOption — never hit because Option is set below
      createElement: (tag: string) => {
        if (tag === "option") {
          return { value: "", textContent: "" } as unknown;
        }
        return null;
      },
    };
    // Provide an Option constructor so buildOption uses it.
    (globalThis as { Option?: unknown }).Option = function (
      this: { value: string; text: string },
      text: string,
      value: string,
    ) {
      this.value = value;
      this.text = text;
    } as unknown;
  });

  afterEach(() => {
    (globalThis as { routes?: unknown }).routes = originalRoutes;
    (globalThis as { document?: unknown }).document = originalDoc;
    delete (globalThis as { Option?: unknown }).Option;
  });

  it("appends a <g> with the four expected attrs", async () => {
    const result = await addRouteGroupTool.execute({ name: "imperial road" });
    expect(result.isError).toBeFalsy();
    expect(fakeRoutes.appended).toEqual(["g"]);
    expect(fakeRoutes.attrs).toEqual([
      { name: "id", value: "route-imperial_road" },
      { name: "stroke", value: "#000000" },
      { name: "stroke-width", value: 0.5 },
      { name: "stroke-dasharray", value: "1 0.5" },
      { name: "stroke-linecap", value: "butt" },
    ]);
  });

  it("appends an <option> to #routeGroup and #routeCreatorGroupSelect", async () => {
    await addRouteGroupTool.execute({ name: "foo" });
    expect(routeGroupAdd).toHaveBeenCalledTimes(1);
    expect(routeCreatorGroupAdd).toHaveBeenCalledTimes(1);
    const groupOpt = routeGroupAdd.mock.calls[0][0] as { value: string };
    const creatorOpt = routeCreatorGroupAdd.mock.calls[0][0] as {
      value: string;
    };
    expect(groupOpt.value).toBe("route-foo");
    expect(creatorOpt.value).toBe("route-foo");
  });

  it("soft-skips select updates when those elements are absent", async () => {
    elementsById = {}; // no #routeGroup, no #routeCreatorGroupSelect
    const result = await addRouteGroupTool.execute({ name: "foo" });
    expect(result.isError).toBeFalsy();
    expect(routeGroupAdd).not.toHaveBeenCalled();
    expect(routeCreatorGroupAdd).not.toHaveBeenCalled();
    // Group itself was still created.
    expect(fakeRoutes.appended).toEqual(["g"]);
  });

  it("errors when the id already exists in the DOM", async () => {
    elementsById["route-foo"] = { dummy: true };
    const result = await addRouteGroupTool.execute({ name: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/already exists/);
    // Group must NOT have been appended.
    expect(fakeRoutes.appended).toEqual([]);
    expect(routeGroupAdd).not.toHaveBeenCalled();
  });

  it("errors when window.routes is missing", async () => {
    (globalThis as { routes?: unknown }).routes = undefined;
    const result = await addRouteGroupTool.execute({ name: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.routes.*unavailable/,
    );
  });
});
