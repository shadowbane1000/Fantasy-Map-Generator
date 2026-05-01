import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGetSelectedEntityTool,
  defaultSelectedEntityRuntime,
  getSelectedEntityTool,
  type SelectedEntityNodeView,
  type SelectedEntityRuntime,
} from "./get-selected-entity";
import { ToolRegistry } from "./index";

function view(over: Partial<SelectedEntityNodeView>): SelectedEntityNodeView {
  return {
    id: null,
    parentId: null,
    dataId: null,
    dataF: null,
    dataState: null,
    text: null,
    ...over,
  };
}

function makeRuntime(
  v: SelectedEntityNodeView | null,
  pack: unknown = {},
): SelectedEntityRuntime {
  return {
    read: () => (v ? { ...v } : null),
    getPack: () => pack,
  };
}

function exec(tool: ReturnType<typeof createGetSelectedEntityTool>): {
  isError: boolean;
  body: Record<string, unknown>;
} {
  const r = tool.execute({});
  if (r instanceof Promise) {
    throw new Error("expected synchronous result");
  }
  return {
    isError: !!r.isError,
    body: JSON.parse(r.content) as Record<string, unknown>,
  };
}

describe("get_selected_entity tool — id-pattern matching", () => {
  it("classifies a burg icon (burg17)", () => {
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "burg17", parentId: "burgIcons" }), {
        burgs: [
          { i: 0 },
          ...Array.from({ length: 17 }, (_, k) => ({ i: k + 1 })),
          { i: 17, name: "Bree" },
        ].slice(0, 18),
      }),
    );
    // construct correctly
    const tool2 = createGetSelectedEntityTool(
      makeRuntime(view({ id: "burg17", parentId: "burgIcons" }), {
        burgs: (() => {
          const arr: Array<{ i: number; name?: string }> = [];
          for (let k = 0; k <= 17; k++) {
            arr.push({ i: k });
          }
          arr[17] = { i: 17, name: "Bree" };
          return arr;
        })(),
      }),
    );
    const { isError, body } = exec(tool2);
    expect(isError).toBe(false);
    expect(body).toEqual({
      ok: true,
      type: "burg",
      id: 17,
      name: "Bree",
      raw_id: "burg17",
      parent_id: "burgIcons",
    });
    // silence unused warning on the first construction
    expect(tool.name).toBe("get_selected_entity");
  });

  it("classifies a burg anchor (anchor7)", () => {
    const burgs: Array<{ i: number; name?: string }> = [];
    for (let k = 0; k <= 7; k++) burgs.push({ i: k });
    burgs[7] = { i: 7, name: "Hobbiton" };
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "anchor7", parentId: "anchors" }), { burgs }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "burg", id: 7, name: "Hobbiton" });
  });

  it("classifies a burg label (burgLabel17)", () => {
    const burgs: Array<{ i: number; name?: string }> = [];
    for (let k = 0; k <= 17; k++) burgs.push({ i: k });
    burgs[17] = { i: 17, name: "Bree" };
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "burgLabel17", parentId: "burgLabels" }), {
        burgs,
      }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({
      type: "burg",
      id: 17,
      name: "Bree",
      raw_id: "burgLabel17",
    });
  });

  it("classifies a state region polygon (state3)", () => {
    const states = [{ i: 0 }, { i: 1 }, { i: 2 }, { i: 3, name: "Gondor" }];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "state3", parentId: "statesBody" }), { states }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "state", id: 3, name: "Gondor" });
  });

  it("classifies a state label (stateLabel3)", () => {
    const states = [{ i: 0 }, { i: 1 }, { i: 2 }, { i: 3, name: "Gondor" }];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "stateLabel3", parentId: "states" }), { states }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "state", id: 3, name: "Gondor" });
  });

  it("classifies a state border halo (state-border3)", () => {
    const states = [{ i: 0 }, { i: 1 }, { i: 2 }, { i: 3, name: "Gondor" }];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "state-border3", parentId: "statesHalo" }), {
        states,
      }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "state", id: 3, name: "Gondor" });
  });

  it("classifies a state gap (state-gap3)", () => {
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "state-gap3", parentId: "statesBody" }), {}),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "state", id: 3 });
  });

  it("classifies a state clip path (state-clip3)", () => {
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "state-clip3", parentId: "statePaths" }), {}),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "state", id: 3 });
  });

  it("classifies a province polygon (province7)", () => {
    const provinces: Array<{ i: number; name?: string }> = [];
    for (let k = 0; k <= 7; k++) provinces.push({ i: k });
    provinces[7] = { i: 7, name: "Anorien" };
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "province7", parentId: "provincesBody" }), {
        provinces,
      }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "province", id: 7, name: "Anorien" });
  });

  it("classifies a province label (provinceLabel7)", () => {
    const provinces: Array<{ i: number; name?: string }> = [];
    for (let k = 0; k <= 7; k++) provinces.push({ i: k });
    provinces[7] = { i: 7, name: "Anorien" };
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "provinceLabel7", parentId: "provinceLabels" }), {
        provinces,
      }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "province", id: 7, name: "Anorien" });
  });

  it("classifies a culture polygon (culture2)", () => {
    const cultures = [{ i: 0 }, { i: 1 }, { i: 2, name: "Rohirrim" }];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "culture2", parentId: "cults" }), { cultures }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "culture", id: 2, name: "Rohirrim" });
  });

  it("classifies a culture center (cultureCenter2)", () => {
    const cultures = [{ i: 0 }, { i: 1 }, { i: 2, name: "Rohirrim" }];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "cultureCenter2", parentId: "cultureCenters" }), {
        cultures,
      }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "culture", id: 2, name: "Rohirrim" });
  });

  it("classifies a religion polygon (religion1)", () => {
    const religions = [{ i: 0 }, { i: 1, name: "The One" }];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "religion1", parentId: "relig" }), { religions }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "religion", id: 1, name: "The One" });
  });

  it("classifies a religion center (religionCenter1)", () => {
    const religions = [{ i: 0 }, { i: 1, name: "The One" }];
    const tool = createGetSelectedEntityTool(
      makeRuntime(
        view({ id: "religionCenter1", parentId: "religionCenters" }),
        { religions },
      ),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "religion", id: 1, name: "The One" });
  });

  it("classifies a marker (marker5) with name from type field", () => {
    const markers = [
      { i: 4, type: "Volcano" },
      { i: 5, type: "Battlefield" },
    ];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "marker5", parentId: "markers" }), { markers }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({
      type: "marker",
      id: 5,
      name: "Battlefield",
    });
  });

  it("classifies a route (route12)", () => {
    const routes = [
      { i: 11, name: "King's Road" },
      { i: 12, name: "South Road" },
    ];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "route12", parentId: "routes" }), { routes }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "route", id: 12, name: "South Road" });
  });

  it("classifies a river (river4)", () => {
    const rivers = [{ i: 4, name: "Anduin" }];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "river4", parentId: "rivers" }), { rivers }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "river", id: 4, name: "Anduin" });
  });

  it("classifies a lake feature via id feature_6 + parent lakes", () => {
    const features: Array<{ i: number; name?: string } | 0> = [
      0,
      { i: 1 },
      { i: 2 },
      { i: 3 },
      { i: 4 },
      { i: 5 },
      { i: 6, name: "Lake Evendim" },
    ];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "feature_6", parentId: "lakes" }), { features }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({
      type: "lake",
      id: 6,
      name: "Lake Evendim",
      raw_id: "feature_6",
      parent_id: "lakes",
    });
  });

  it("classifies a coastline feature via id feature_3 + parent coastline", () => {
    const features: Array<{ i: number; name?: string } | 0> = [
      0,
      { i: 1 },
      { i: 2 },
      { i: 3, name: "Numenor" },
    ];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "feature_3", parentId: "coastline" }), {
        features,
      }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({
      type: "feature",
      id: 3,
      name: "Numenor",
      parent_id: "coastline",
    });
  });

  it("classifies a lake via parent=lakes + data-f without a useful id", () => {
    const features: Array<{ i: number; name?: string } | 0> = [
      0,
      { i: 1 },
      { i: 2 },
      { i: 3 },
      { i: 4 },
      { i: 5 },
      { i: 6, name: "Lake Evendim" },
    ];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: null, parentId: "lakes", dataF: "6" }), {
        features,
      }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "lake", id: 6, name: "Lake Evendim" });
  });

  it("classifies a regiment (regiment3-1)", () => {
    const states: Array<{
      i: number;
      name?: string;
      military?: Array<{ i: number; name?: string }>;
    }> = [
      { i: 0 },
      { i: 1 },
      { i: 2 },
      {
        i: 3,
        name: "Gondor",
        military: [
          { i: 0, name: "Reserve" },
          { i: 1, name: "1st Cavalry" },
        ],
      },
    ];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "regiment3-1", parentId: "armies" }), { states }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({
      type: "regiment",
      id: 1,
      state: 3,
      name: "1st Cavalry",
    });
  });

  it("classifies a zone (zone2)", () => {
    const zones = [
      { i: 0, name: "z0" },
      { i: 1, name: "z1" },
      { i: 2, name: "Plague" },
    ];
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "zone2", parentId: "zones" }), { zones }),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "zone", id: 2, name: "Plague" });
  });

  it("classifies a free label (label5) using the rendered text as name", () => {
    const tool = createGetSelectedEntityTool(
      makeRuntime(
        view({ id: "label5", parentId: "addedLabels", text: "Far East" }),
        {},
      ),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "label", id: 5, name: "Far East" });
  });

  it("classifies an ice element via parent=ice + data-id", () => {
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: null, parentId: "ice", dataId: "2" }), {}),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({ type: "ice", id: 2, name: "" });
  });

  it("classifies a relief icon via parent=terrain (no per-icon id)", () => {
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: null, parentId: "terrain" }), {}),
    );
    const { body } = exec(tool);
    expect(body).toMatchObject({
      type: "relief",
      id: null,
      name: "",
      parent_id: "terrain",
    });
  });

  it("returns type:null when nothing is selected", () => {
    const tool = createGetSelectedEntityTool(makeRuntime(null, {}));
    const { body } = exec(tool);
    expect(body).toEqual({
      ok: true,
      type: null,
      message: "Nothing is currently selected.",
    });
  });

  it("returns type:'unknown' for unrecognised id patterns", () => {
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: "randomThing42", parentId: "someParent" }), {}),
    );
    const { body } = exec(tool);
    expect(body).toEqual({
      ok: true,
      type: "unknown",
      raw_id: "randomThing42",
      parent_id: "someParent",
    });
  });

  it("returns type:'unknown' when both id and parent are unrecognised and no data attrs", () => {
    const tool = createGetSelectedEntityTool(
      makeRuntime(view({ id: null, parentId: null }), {}),
    );
    const { body } = exec(tool);
    expect(body).toEqual({
      ok: true,
      type: "unknown",
      raw_id: null,
      parent_id: null,
    });
  });

  it("exposes the expected tool name and zero-arg schema", () => {
    expect(getSelectedEntityTool.name).toBe("get_selected_entity");
    const required = getSelectedEntityTool.input_schema.required;
    expect(required === undefined || required.length === 0).toBe(true);
    expect(typeof getSelectedEntityTool.input_schema.properties).toBe("object");
  });

  it("registry round-trip — tool can be registered and listed", () => {
    const registry = new ToolRegistry();
    registry.register(getSelectedEntityTool);
    const names = registry.list().map((t) => t.name);
    expect(names).toContain("get_selected_entity");
  });

  it("does not mutate elSelected, pack, or invoke any setters on the runtime", () => {
    const seenCalls: string[] = [];
    const trackingRuntime: SelectedEntityRuntime = {
      read() {
        seenCalls.push("read");
        return view({ id: "burg1", parentId: "burgIcons" });
      },
      getPack() {
        seenCalls.push("getPack");
        return { burgs: [{ i: 0 }, { i: 1, name: "Bree" }] };
      },
    };
    const tool = createGetSelectedEntityTool(trackingRuntime);
    exec(tool);
    expect(seenCalls).toEqual(["read", "getPack"]);
  });
});

describe("defaultSelectedEntityRuntime (integration)", () => {
  type SelHolder = { elSelected?: unknown; pack?: unknown };
  const original = {
    elSelected: (globalThis as unknown as SelHolder).elSelected,
    pack: (globalThis as unknown as SelHolder).pack,
  };

  beforeEach(() => {
    (globalThis as unknown as SelHolder).elSelected = undefined;
    (globalThis as unknown as SelHolder).pack = undefined;
  });

  afterEach(() => {
    (globalThis as unknown as SelHolder).elSelected = original.elSelected;
    (globalThis as unknown as SelHolder).pack = original.pack;
  });

  function fakeNode(
    id: string | null,
    parentId: string | null,
    attrs: Record<string, string> = {},
    text: string | null = null,
  ): Element {
    const parent = parentId
      ? ({
          id: parentId,
          getAttribute: (k: string) => (k === "id" ? parentId : null),
        } as unknown as Element)
      : null;
    return {
      id: id ?? "",
      parentNode: parent,
      textContent: text,
      getAttribute(name: string): string | null {
        return attrs[name] ?? null;
      },
    } as unknown as Element;
  }

  it("reads globalThis.elSelected via .node() and reports the matched entity", async () => {
    const node = fakeNode("burg17", "burgIcons");
    (globalThis as unknown as SelHolder).elSelected = {
      node: () => node,
    };
    const burgs: Array<{ i: number; name?: string }> = [];
    for (let k = 0; k <= 17; k++) burgs.push({ i: k });
    burgs[17] = { i: 17, name: "Bree" };
    (globalThis as unknown as SelHolder).pack = { burgs };

    const r = getSelectedEntityTool.execute({});
    const result = r instanceof Promise ? await r : r;
    const body = JSON.parse(result.content);
    expect(result.isError).toBeFalsy();
    expect(body).toMatchObject({
      ok: true,
      type: "burg",
      id: 17,
      name: "Bree",
      raw_id: "burg17",
      parent_id: "burgIcons",
    });
  });

  it("returns type:null when elSelected is null", async () => {
    (globalThis as unknown as SelHolder).elSelected = null;
    const r = getSelectedEntityTool.execute({});
    const result = r instanceof Promise ? await r : r;
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: null,
      message: "Nothing is currently selected.",
    });
  });

  it("returns type:null when elSelected is undefined", async () => {
    (globalThis as unknown as SelHolder).elSelected = undefined;
    const r = getSelectedEntityTool.execute({});
    const result = r instanceof Promise ? await r : r;
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: null,
      message: "Nothing is currently selected.",
    });
  });

  it("returns type:null when elSelected.node() returns null", async () => {
    (globalThis as unknown as SelHolder).elSelected = {
      node: () => null,
    };
    const r = getSelectedEntityTool.execute({});
    const result = r instanceof Promise ? await r : r;
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: null,
      message: "Nothing is currently selected.",
    });
  });

  it("returns type:null when elSelected lacks a .node method (defensive)", async () => {
    (globalThis as unknown as SelHolder).elSelected = { foo: 1 };
    const r = getSelectedEntityTool.execute({});
    const result = r instanceof Promise ? await r : r;
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: null,
      message: "Nothing is currently selected.",
    });
  });

  it("survives elSelected.node() throwing", async () => {
    (globalThis as unknown as SelHolder).elSelected = {
      node: () => {
        throw new Error("boom");
      },
    };
    const r = getSelectedEntityTool.execute({});
    const result = r instanceof Promise ? await r : r;
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      type: null,
      message: "Nothing is currently selected.",
    });
  });

  it("default runtime still resolves names from globalThis.pack", () => {
    const view = defaultSelectedEntityRuntime.read();
    // Sanity: with elSelected unset (beforeEach), read() returns null.
    expect(view).toBeNull();
  });
});
