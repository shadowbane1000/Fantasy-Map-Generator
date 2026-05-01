import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createRenameLakeTool,
  findLakeById,
  findLakesByName,
  type LakeRenameRef,
  type LakeRenameRuntime,
  renameLakeTool,
} from "./rename-lake";

function makeRuntime(overrides: Partial<LakeRenameRuntime> = {}): {
  runtime: LakeRenameRuntime;
  findById: ReturnType<typeof vi.fn<LakeRenameRuntime["findById"]>>;
  findByName: ReturnType<typeof vi.fn<LakeRenameRuntime["findByName"]>>;
  rename: ReturnType<typeof vi.fn<LakeRenameRuntime["rename"]>>;
} {
  const findById = vi.fn<LakeRenameRuntime["findById"]>(
    overrides.findById ?? (() => null),
  );
  const findByName = vi.fn<LakeRenameRuntime["findByName"]>(
    overrides.findByName ?? (() => ({ matches: [] })),
  );
  const rename = vi.fn<LakeRenameRuntime["rename"]>(
    overrides.rename ?? (() => undefined),
  );
  return {
    runtime: { findById, findByName, rename },
    findById,
    findByName,
    rename,
  };
}

describe("rename_lake tool", () => {
  it("renames a lake by numeric id", async () => {
    const { runtime, rename } = makeRuntime({
      findById: (id) =>
        id === 7 ? { i: 7, name: "Old Lake", group: "freshwater" } : null,
    });
    const tool = createRenameLakeTool(runtime);
    const result = await tool.execute({ id: 7, new_name: "New Lake" });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(7, "New Lake");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 7,
      old_name: "Old Lake",
      new_name: "New Lake",
    });
  });

  it("renames a lake by case-insensitive name (unique match)", async () => {
    const { runtime, rename, findByName } = makeRuntime({
      findByName: (name) =>
        name.toLowerCase() === "great lake"
          ? {
              matches: [
                { i: 5, name: "Great Lake", group: "freshwater" },
              ] satisfies LakeRenameRef[],
            }
          : { matches: [] },
    });
    const tool = createRenameLakeTool(runtime);
    const result = await tool.execute({
      name: "Great Lake",
      new_name: "Smaller Lake",
    });
    expect(result.isError).toBeFalsy();
    expect(findByName).toHaveBeenCalledWith("Great Lake");
    expect(rename).toHaveBeenCalledWith(5, "Smaller Lake");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 5,
      old_name: "Great Lake",
      new_name: "Smaller Lake",
    });
  });

  it("returns ambiguity error with candidates when multiple lakes share a name", async () => {
    const matches: LakeRenameRef[] = [
      { i: 3, name: "Crystal Lake", group: "freshwater" },
      { i: 8, name: "Crystal Lake", group: "salt" },
    ];
    const { runtime, rename } = makeRuntime({
      findByName: () => ({ matches }),
    });
    const tool = createRenameLakeTool(runtime);
    const result = await tool.execute({
      name: "Crystal Lake",
      new_name: "X",
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Multiple lakes match name Crystal Lake/);
    expect(body.candidates).toEqual([
      { id: 3, name: "Crystal Lake", group: "freshwater" },
      { id: 8, name: "Crystal Lake", group: "salt" },
    ]);
    expect(rename).not.toHaveBeenCalled();
  });

  it("errors when id and name refer to different lakes", async () => {
    const { runtime, rename } = makeRuntime({
      findById: (id) =>
        id === 5 ? { i: 5, name: "Foo Lake", group: "g1" } : null,
      findByName: (name) =>
        name.toLowerCase() === "bar lake"
          ? { matches: [{ i: 9, name: "Bar Lake", group: "g2" }] }
          : { matches: [] },
    });
    const tool = createRenameLakeTool(runtime);
    const result = await tool.execute({
      id: 5,
      name: "Bar Lake",
      new_name: "X",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "id and name refer to different lakes.",
    );
    expect(rename).not.toHaveBeenCalled();
  });

  it("succeeds when id and name agree (case-insensitive)", async () => {
    const ref: LakeRenameRef = { i: 5, name: "Foo Lake", group: "g1" };
    const { runtime, rename } = makeRuntime({
      findById: (id) => (id === 5 ? ref : null),
      findByName: (name) =>
        name.toLowerCase() === "foo lake"
          ? { matches: [ref] }
          : { matches: [] },
    });
    const tool = createRenameLakeTool(runtime);
    const result = await tool.execute({
      id: 5,
      name: "foo lake",
      new_name: "Y",
    });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledWith(5, "Y");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 5,
      old_name: "Foo Lake",
      new_name: "Y",
    });
  });

  it("errors when lake not found by id", async () => {
    const { runtime, rename } = makeRuntime({ findById: () => null });
    const tool = createRenameLakeTool(runtime);
    const result = await tool.execute({ id: 99, new_name: "Y" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("No lake found with id 99.");
    expect(rename).not.toHaveBeenCalled();
  });

  it("errors when lake not found by name (preserves caller's casing in message)", async () => {
    const { runtime, rename } = makeRuntime({
      findByName: () => ({ matches: [] }),
    });
    const tool = createRenameLakeTool(runtime);
    const result = await tool.execute({ name: "Ghost", new_name: "Y" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No lake found with name Ghost.",
    );
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects empty/whitespace/non-string new_name and never calls rename", async () => {
    const { runtime, rename } = makeRuntime({
      findById: () => ({ i: 1, name: "L", group: "g" }),
    });
    const tool = createRenameLakeTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({ id: 1, new_name: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "new_name must be a non-empty string.",
      );
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("errors when neither id nor name is provided", async () => {
    const { runtime, rename } = makeRuntime();
    const tool = createRenameLakeTool(runtime);
    const result = await tool.execute({ new_name: "Foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Provide either id or name to identify the lake.",
    );
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects invalid id values (when only id is supplied)", async () => {
    const { runtime, rename } = makeRuntime();
    const tool = createRenameLakeTool(runtime);
    for (const bad of [0, -1, 1.5, "5"]) {
      const r = await tool.execute({ id: bad, new_name: "Y" });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "id must be a positive integer.",
      );
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("rejects invalid name values (when only name is supplied)", async () => {
    const { runtime, rename } = makeRuntime();
    const tool = createRenameLakeTool(runtime);
    for (const bad of ["", "   ", 42]) {
      const r = await tool.execute({ name: bad, new_name: "Y" });
      expect(r.isError).toBe(true);
    }
    expect(rename).not.toHaveBeenCalled();
  });

  it("trims new_name before assigning", async () => {
    const { runtime, rename } = makeRuntime({
      findById: () => ({ i: 1, name: "Old", group: "g" }),
    });
    const tool = createRenameLakeTool(runtime);
    const result = await tool.execute({ id: 1, new_name: "  Foo  " });
    expect(result.isError).toBeFalsy();
    expect(rename).toHaveBeenCalledWith(1, "Foo");
    expect(JSON.parse(result.content).new_name).toBe("Foo");
  });

  it("surfaces runtime rename failures", async () => {
    const runtime: LakeRenameRuntime = {
      findById: () => ({ i: 1, name: "Old", group: "g" }),
      findByName: () => ({ matches: [] }),
      rename: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createRenameLakeTool(runtime);
    const result = await tool.execute({ id: 1, new_name: "Y" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });

  it("has correct tool name and required-schema fields", () => {
    expect(renameLakeTool.name).toBe("rename_lake");
    expect(renameLakeTool.input_schema.required).toEqual(["new_name"]);
  });
});

describe("findLakeById", () => {
  const lake = { i: 5, type: "lake", name: "Lake One", group: "freshwater" };
  const island = { i: 7, type: "island", name: "Some Island", group: "isle" };
  const features = [0, lake, island];

  it("returns the lake feature when id and type match", () => {
    expect(findLakeById(features, 5)).toEqual({
      i: 5,
      name: "Lake One",
      group: "freshwater",
    });
  });

  it("returns null for non-lake feature with matching id", () => {
    expect(findLakeById(features, 7)).toBeNull();
  });

  it("returns null for the index-0 placeholder", () => {
    expect(findLakeById(features, 0)).toBeNull();
  });

  it("returns null when features is missing", () => {
    expect(findLakeById(undefined, 5)).toBeNull();
  });

  it("returns null for invalid ids", () => {
    expect(findLakeById(features, -1)).toBeNull();
    expect(findLakeById(features, 1.5)).toBeNull();
  });
});

describe("findLakesByName", () => {
  const lake1 = {
    i: 5,
    type: "lake",
    name: "Crystal Lake",
    group: "freshwater",
  };
  const lake2 = {
    i: 8,
    type: "lake",
    name: "Crystal Lake",
    group: "salt",
  };
  const island = {
    i: 7,
    type: "island",
    name: "Crystal Lake",
    group: "isle",
  };
  const features = [0, lake1, lake2, island];

  it("collects every lake matching name (case-insensitive, trimmed)", () => {
    const result = findLakesByName(features, "  CRYSTAL lake  ");
    expect(result).toEqual([
      { i: 5, name: "Crystal Lake", group: "freshwater" },
      { i: 8, name: "Crystal Lake", group: "salt" },
    ]);
  });

  it("ignores non-lake features with matching name", () => {
    const result = findLakesByName(features, "Crystal Lake");
    expect(result.find((m) => m.i === 7)).toBeUndefined();
  });

  it("returns empty array when no match", () => {
    expect(findLakesByName(features, "nothing")).toEqual([]);
  });

  it("returns empty array when features is missing", () => {
    expect(findLakesByName(undefined, "Crystal Lake")).toEqual([]);
  });

  it("returns empty array for empty/whitespace needle", () => {
    expect(findLakesByName(features, "")).toEqual([]);
    expect(findLakesByName(features, "   ")).toEqual([]);
  });
});

describe("defaultRenameLakeRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      features: [
        0,
        {
          i: 1,
          type: "lake",
          name: "Old Lake",
          group: "freshwater",
        },
        {
          i: 2,
          type: "island",
          name: "Big Island",
          group: "continent",
        },
      ],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("renames the matching lake feature in pack.features", async () => {
    const result = await renameLakeTool.execute({
      id: 1,
      new_name: "New Lake",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { features: { name: string }[] } })
      .pack;
    expect(pack.features[1]?.name).toBe("New Lake");
  });

  it("refuses to rename a non-lake feature with the matching id", async () => {
    const result = await renameLakeTool.execute({ id: 2, new_name: "X" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("No lake found with id 2.");
    const pack = (globalThis as { pack: { features: { name: string }[] } })
      .pack;
    expect(pack.features[2]?.name).toBe("Big Island");
  });

  it("errors cleanly when pack is missing", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await renameLakeTool.execute({ id: 1, new_name: "X" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.features/);
  });
});

describe("rename_lake registry round-trip", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      features: [
        0,
        {
          i: 1,
          type: "lake",
          name: "Old Lake",
          group: "freshwater",
        },
      ],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("registers and runs through the registry", async () => {
    const registry = new ToolRegistry();
    registry.register(renameLakeTool);
    const result = await registry.run("rename_lake", {
      id: 1,
      new_name: "Brand New",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 1,
      old_name: "Old Lake",
      new_name: "Brand New",
    });
  });
});
