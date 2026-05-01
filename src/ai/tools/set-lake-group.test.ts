import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createSetLakeGroupTool,
  findLakeById,
  findLakeCandidates,
  type LakeGroupResolution,
  type RawLakeFeature,
  type SetLakeGroupRuntime,
  setLakeGroupTool,
} from "./set-lake-group";

function makeRuntime(
  find: (input: { id?: number; name?: string }) => LakeGroupResolution,
  listGroups: () => string[] | null = () => [
    "freshwater",
    "salt",
    "sinkhole",
    "frozen",
    "lava",
    "dry",
  ],
): {
  runtime: SetLakeGroupRuntime;
  apply: ReturnType<typeof vi.fn<SetLakeGroupRuntime["apply"]>>;
} {
  const apply = vi.fn<SetLakeGroupRuntime["apply"]>(() => ({
    changed: true,
    oldGroup: "freshwater",
  }));
  return { runtime: { find, listGroups, apply }, apply };
}

describe("set_lake_group tool — unit", () => {
  it("happy path by id moves the lake and reports old/new group", async () => {
    const { runtime, apply } = makeRuntime((input) =>
      input.id === 5
        ? {
            kind: "found",
            ref: { i: 5, name: "Lake One", oldGroup: "freshwater" },
          }
        : { kind: "not_found", message: "no" },
    );
    const tool = createSetLakeGroupTool(runtime);
    const result = await tool.execute({ id: 5, group: "salt" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, "salt");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Lake One",
      old_group: "freshwater",
      new_group: "salt",
      changed: true,
    });
  });

  it("happy path by name (case-insensitive)", async () => {
    const find = vi.fn<SetLakeGroupRuntime["find"]>((input) =>
      input.name?.toLowerCase() === "lake one"
        ? {
            kind: "found",
            ref: { i: 5, name: "Lake One", oldGroup: "freshwater" },
          }
        : { kind: "not_found", message: "no" },
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetLakeGroupTool(runtime);
    await tool.execute({ name: "LAKE ONE", group: "salt" });
    expect(find).toHaveBeenCalledWith({ name: "LAKE ONE" });
    expect(apply).toHaveBeenCalledWith(5, "salt");
  });

  it("both id and name provided and consistent", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      kind: "found",
      ref: { i: 5, name: "Lake One", oldGroup: "freshwater" },
    }));
    const tool = createSetLakeGroupTool(runtime);
    const r = await tool.execute({ id: 5, name: "Lake One", group: "salt" });
    expect(r.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, "salt");
  });

  it("id and name disagree → error mentioning the actual name", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      kind: "mismatch",
      i: 5,
      actualName: "Lake One",
      requestedName: "Lake Other",
    }));
    const tool = createSetLakeGroupTool(runtime);
    const r = await tool.execute({ id: 5, name: "Lake Other", group: "salt" });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content);
    expect(body.error).toMatch(/Lake One/);
    expect(body.error).toMatch(/Lake Other/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("ambiguous name → error with candidates", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      kind: "ambiguous",
      candidates: [
        { i: 5, name: "Mirror Lake", group: "freshwater" },
        { i: 9, name: "Mirror Lake", group: "salt" },
      ],
    }));
    const tool = createSetLakeGroupTool(runtime);
    const r = await tool.execute({ name: "Mirror Lake", group: "frozen" });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content);
    expect(body.error).toMatch(/Multiple lakes/);
    expect(body.candidates).toEqual([
      { i: 5, name: "Mirror Lake", group: "freshwater" },
      { i: 9, name: "Mirror Lake", group: "salt" },
    ]);
    expect(apply).not.toHaveBeenCalled();
  });

  it("unknown id → error, no apply", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      kind: "not_found",
      message: "No lake found with id 999.",
    }));
    const tool = createSetLakeGroupTool(runtime);
    const r = await tool.execute({ id: 999, group: "salt" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/999/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("neither id nor name provided → error, no apply", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      kind: "not_found",
      message: "no",
    }));
    const tool = createSetLakeGroupTool(runtime);
    const r = await tool.execute({ group: "salt" });
    expect(r.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("missing/empty group → error, no apply", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      kind: "found",
      ref: { i: 5, name: "Lake One", oldGroup: "freshwater" },
    }));
    const tool = createSetLakeGroupTool(runtime);
    for (const bad of [undefined, null, "", "   ", 42]) {
      const r = await tool.execute({ id: 5, group: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid id values", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      kind: "found",
      ref: { i: 5, name: "Lake One", oldGroup: "freshwater" },
    }));
    const tool = createSetLakeGroupTool(runtime);
    for (const bad of [0, -1, 1.5, "5", true]) {
      const r = await tool.execute({ id: bad, group: "salt" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("apply throwing surfaces as error", async () => {
    const runtime: SetLakeGroupRuntime = {
      find: () => ({
        kind: "found",
        ref: { i: 5, name: "Lake One", oldGroup: "freshwater" },
      }),
      listGroups: () => ["freshwater", "salt"],
      apply: vi.fn(() => {
        throw new Error("Lake i=5 has no SVG element under #lakes.");
      }),
    };
    const tool = createSetLakeGroupTool(runtime);
    const r = await tool.execute({ id: 5, group: "salt" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/no SVG element/);
  });

  it("target group equals current → success with changed=false", async () => {
    const runtime: SetLakeGroupRuntime = {
      find: () => ({
        kind: "found",
        ref: { i: 5, name: "Lake One", oldGroup: "freshwater" },
      }),
      listGroups: () => ["freshwater", "salt"],
      apply: vi.fn(() => ({ changed: false, oldGroup: "freshwater" })),
    };
    const tool = createSetLakeGroupTool(runtime);
    const r = await tool.execute({ id: 5, group: "freshwater" });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      i: 5,
      name: "Lake One",
      old_group: "freshwater",
      new_group: "freshwater",
      changed: false,
    });
  });

  it("unknown target group → error with available list, no apply", async () => {
    const { runtime, apply } = makeRuntime(
      () => ({
        kind: "found",
        ref: { i: 5, name: "Lake One", oldGroup: "freshwater" },
      }),
      () => ["freshwater", "salt"],
    );
    const tool = createSetLakeGroupTool(runtime);
    const r = await tool.execute({ id: 5, group: "magma" });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content);
    expect(body.error).toMatch(/magma/);
    expect(body.available).toEqual(["freshwater", "salt"]);
    expect(apply).not.toHaveBeenCalled();
  });

  it("listGroups returning null → error", async () => {
    const runtime: SetLakeGroupRuntime = {
      find: () => ({
        kind: "found",
        ref: { i: 5, name: "Lake One", oldGroup: "freshwater" },
      }),
      listGroups: () => null,
      apply: vi.fn(() => ({ changed: true, oldGroup: "freshwater" })),
    };
    const tool = createSetLakeGroupTool(runtime);
    const r = await tool.execute({ id: 5, group: "salt" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/#lakes/);
  });

  it("registers under name 'set_lake_group' and round-trips through registry", async () => {
    expect(setLakeGroupTool.name).toBe("set_lake_group");
    const reg = new ToolRegistry();
    reg.register(setLakeGroupTool);
    expect(reg.list().map((t) => t.name)).toContain("set_lake_group");
    // Calling .run with no pack (in node) should hit the apply
    // throw / not-ready path and return an error rather than crashing
    // the registry.
    const out = await reg.run("set_lake_group", { id: 1, group: "salt" });
    expect(out.isError).toBe(true);
  });
});

describe("findLakeCandidates / findLakeById", () => {
  const features: Array<RawLakeFeature | 0> = [
    0,
    { i: 1, type: "ocean", name: "" },
    { i: 2, type: "lake", name: "Mirror Lake", group: "freshwater" },
    { i: 3, type: "lake", name: "Mirror Lake", group: "salt" },
    { i: 4, type: "lake", name: "Lonely Pool", group: "freshwater" },
    { i: 5, type: "island", name: "Mainland" },
  ];

  it("findLakeCandidates returns all lakes with matching name (case-insensitive)", () => {
    expect(findLakeCandidates({ features }, "mirror lake")).toEqual([
      { i: 2, name: "Mirror Lake", group: "freshwater" },
      { i: 3, name: "Mirror Lake", group: "salt" },
    ]);
  });

  it("findLakeCandidates returns [] when no match", () => {
    expect(findLakeCandidates({ features }, "Nope")).toEqual([]);
  });

  it("findLakeCandidates ignores non-lake features", () => {
    expect(findLakeCandidates({ features }, "Mainland")).toEqual([]);
  });

  it("findLakeById returns the lake feature", () => {
    expect(findLakeById({ features }, 2)).toBe(features[2]);
  });

  it("findLakeById returns null for non-lake features", () => {
    expect(findLakeById({ features }, 1)).toBeNull();
    expect(findLakeById({ features }, 5)).toBeNull();
  });

  it("findLakeById rejects bad ids", () => {
    expect(findLakeById({ features }, 0)).toBeNull();
    expect(findLakeById({ features }, -1)).toBeNull();
    expect(findLakeById({ features }, 1.5)).toBeNull();
    expect(findLakeById({ features }, 999)).toBeNull();
  });
});

interface FakeElement {
  tagName: string;
  id: string;
  parentElement: FakeElement | null;
  children: FakeElement[];
  appendChild: (child: FakeElement) => void;
  querySelector: (sel: string) => FakeElement | null;
  getAttribute: (name: string) => string | null;
}

function fakeEl(
  tag: string,
  id: string,
  attrs: Record<string, string> = {},
): FakeElement {
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    id,
    parentElement: null,
    children: [],
    appendChild(child) {
      if (child.parentElement) {
        const p = child.parentElement;
        p.children = p.children.filter((c) => c !== child);
      }
      child.parentElement = el;
      el.children.push(child);
    },
    querySelector(sel) {
      // Support `#<id>` and `[data-f="<n>"]` only, scoped to descendants.
      const stack: FakeElement[] = [...el.children];
      while (stack.length) {
        const e = stack.shift() as FakeElement;
        if (sel.startsWith("#") && e.id === sel.slice(1)) return e;
        const m = sel.match(/^\[data-f="([^"]+)"\]$/);
        if (m && e.getAttribute("data-f") === m[1]) return e;
        stack.push(...e.children);
      }
      return null;
    },
    getAttribute(name) {
      return attrs[name] ?? null;
    },
  };
  return el;
}

function setupDom(): {
  lakesRoot: FakeElement;
  freshwater: FakeElement;
  salt: FakeElement;
  sinkhole: FakeElement;
  use2: FakeElement;
  use3: FakeElement;
} {
  const lakesRoot = fakeEl("g", "lakes");
  const freshwater = fakeEl("g", "freshwater");
  const salt = fakeEl("g", "salt");
  const sinkhole = fakeEl("g", "sinkhole");
  lakesRoot.appendChild(freshwater);
  lakesRoot.appendChild(salt);
  lakesRoot.appendChild(sinkhole);
  const use2 = fakeEl("use", "", { "data-f": "2" });
  const use3 = fakeEl("use", "", { "data-f": "3" });
  freshwater.appendChild(use2);
  salt.appendChild(use3);
  return { lakesRoot, freshwater, salt, sinkhole, use2, use3 };
}

describe("defaultSetLakeGroupRuntime (integration with mocked DOM + pack)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalDoc = (globalThis as { document?: unknown }).document;
  let dom: ReturnType<typeof setupDom>;

  beforeEach(() => {
    dom = setupDom();
    (globalThis as { pack?: unknown }).pack = {
      features: [
        0,
        { i: 1, type: "ocean", name: "" },
        {
          i: 2,
          type: "lake",
          name: "Mirror Lake",
          group: "freshwater",
        },
        { i: 3, type: "lake", name: "Salt Lake", group: "salt" },
        { i: 4, type: "lake", name: "Mirror Lake", group: "freshwater" },
        { i: 5, type: "island", name: "Mainland" },
      ] satisfies Array<RawLakeFeature | 0>,
    };
    (globalThis as { document?: unknown }).document = {
      getElementById: (id: string) => {
        if (id === "lakes") return dom.lakesRoot;
        return null;
      },
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("happy path by id moves the <use> and updates feature.group", async () => {
    const r = await setLakeGroupTool.execute({ id: 3, group: "freshwater" });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      i: 3,
      name: "Salt Lake",
      old_group: "salt",
      new_group: "freshwater",
      changed: true,
    });
    const pack = (globalThis as { pack: { features: RawLakeFeature[] } }).pack;
    expect(pack.features[3]?.group).toBe("freshwater");
    expect(dom.use3.parentElement).toBe(dom.freshwater);
  });

  it("happy path by name (case-insensitive)", async () => {
    const r = await setLakeGroupTool.execute({
      name: "salt lake",
      group: "sinkhole",
    });
    expect(r.isError).toBeFalsy();
    const pack = (globalThis as { pack: { features: RawLakeFeature[] } }).pack;
    expect(pack.features[3]?.group).toBe("sinkhole");
    expect(dom.use3.parentElement).toBe(dom.sinkhole);
  });

  it("target group equals current → no-op", async () => {
    const r = await setLakeGroupTool.execute({ id: 3, group: "salt" });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      i: 3,
      name: "Salt Lake",
      old_group: "salt",
      new_group: "salt",
      changed: false,
    });
    expect(dom.use3.parentElement).toBe(dom.salt);
  });

  it("unknown target group → error; pack and DOM unchanged", async () => {
    const r = await setLakeGroupTool.execute({ id: 3, group: "magma" });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content);
    expect(body.available).toContain("freshwater");
    const pack = (globalThis as { pack: { features: RawLakeFeature[] } }).pack;
    expect(pack.features[3]?.group).toBe("salt");
    expect(dom.use3.parentElement).toBe(dom.salt);
  });

  it("lake <use> not found in DOM → error; feature.group NOT mutated", async () => {
    // Lake i=2 exists in pack but its <use> is not under #lakes.
    dom.freshwater.children = dom.freshwater.children.filter(
      (c) => c !== dom.use2,
    );
    dom.use2.parentElement = null;
    const r = await setLakeGroupTool.execute({ id: 2, group: "salt" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/no SVG element/);
    const pack = (globalThis as { pack: { features: RawLakeFeature[] } }).pack;
    expect(pack.features[2]?.group).toBe("freshwater");
  });

  it("non-lake feature with matching id → 'No lake found' error", async () => {
    const r = await setLakeGroupTool.execute({ id: 1, group: "salt" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/No lake found/);
    const pack = (globalThis as { pack: { features: RawLakeFeature[] } }).pack;
    expect(pack.features[1]?.type).toBe("ocean");
  });

  it("multiple lakes share a name → ambiguous error with candidates; pack unchanged", async () => {
    const r = await setLakeGroupTool.execute({
      name: "Mirror Lake",
      group: "salt",
    });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content);
    expect(body.candidates).toEqual([
      { i: 2, name: "Mirror Lake", group: "freshwater" },
      { i: 4, name: "Mirror Lake", group: "freshwater" },
    ]);
    const pack = (globalThis as { pack: { features: RawLakeFeature[] } }).pack;
    expect(pack.features[2]?.group).toBe("freshwater");
    expect(pack.features[4]?.group).toBe("freshwater");
  });

  it("pack missing → error", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const r = await setLakeGroupTool.execute({ id: 3, group: "salt" });
    expect(r.isError).toBe(true);
  });

  it("id and name disagree → mismatch error", async () => {
    const r = await setLakeGroupTool.execute({
      id: 3,
      name: "Mirror Lake",
      group: "freshwater",
    });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content);
    expect(body.error).toMatch(/Salt Lake/);
    expect(body.error).toMatch(/Mirror Lake/);
  });
});
