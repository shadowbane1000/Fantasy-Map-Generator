import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createRenameNamesbaseTool,
  findNamesbaseByIndex,
  findNamesbasesByName,
  type RenameNamesbaseRuntime,
  renameNamesbaseTool,
} from "./rename-namesbase";

function makeRuntime(overrides: Partial<RenameNamesbaseRuntime> = {}): {
  runtime: RenameNamesbaseRuntime;
  getNameBases: ReturnType<
    typeof vi.fn<RenameNamesbaseRuntime["getNameBases"]>
  >;
  setName: ReturnType<typeof vi.fn<RenameNamesbaseRuntime["setName"]>>;
} {
  const getNameBases = vi.fn<RenameNamesbaseRuntime["getNameBases"]>(
    overrides.getNameBases ?? (() => []),
  );
  const setName = vi.fn<RenameNamesbaseRuntime["setName"]>(
    overrides.setName ?? (() => undefined),
  );
  return {
    runtime: { getNameBases, setName },
    getNameBases,
    setName,
  };
}

describe("rename_namesbase tool", () => {
  it("renames a namesbase by index", async () => {
    const bases = [
      { name: "Generic" },
      { name: "Elvish" },
      { name: "Dwarven" },
    ];
    const { runtime, setName } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({ index: 1, new_name: "High Elven" });
    expect(result.isError).toBeFalsy();
    expect(setName).toHaveBeenCalledWith(1, "High Elven");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 1,
      old_name: "Elvish",
      new_name: "High Elven",
    });
  });

  it("renames a namesbase at index 0 (boundary)", async () => {
    const bases = [{ name: "First" }, { name: "Second" }];
    const { runtime, setName } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0, new_name: "Zero" });
    expect(result.isError).toBeFalsy();
    expect(setName).toHaveBeenCalledWith(0, "Zero");
    expect(JSON.parse(result.content).index).toBe(0);
  });

  it("renames a namesbase by case-insensitive current_name (unique)", async () => {
    const bases = [{ name: "Generic" }, { name: "German" }, { name: "Elvish" }];
    const { runtime, setName } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({
      current_name: "german",
      new_name: "Germanic",
    });
    expect(result.isError).toBeFalsy();
    expect(setName).toHaveBeenCalledWith(1, "Germanic");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 1,
      old_name: "German",
      new_name: "Germanic",
    });
  });

  it("strips '/' and '|' from new_name (sanitisation)", async () => {
    const bases = [{ name: "Old" }];
    const { runtime, setName } = makeRuntime({ getNameBases: () => bases });
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0, new_name: "foo|bar/baz" });
    expect(result.isError).toBeFalsy();
    expect(setName).toHaveBeenCalledWith(0, "foobarbaz");
    expect(JSON.parse(result.content).new_name).toBe("foobarbaz");
  });

  it("trims leading/trailing whitespace before assigning", async () => {
    const bases = [{ name: "Old" }];
    const { runtime, setName } = makeRuntime({ getNameBases: () => bases });
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0, new_name: "  Foo  " });
    expect(result.isError).toBeFalsy();
    expect(setName).toHaveBeenCalledWith(0, "Foo");
    expect(JSON.parse(result.content).new_name).toBe("Foo");
  });

  it("errors when new_name is empty after sanitisation", async () => {
    const bases = [{ name: "Old" }];
    const { runtime, setName } = makeRuntime({ getNameBases: () => bases });
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0, new_name: "///" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "new_name is empty after removing '/' and '|'.",
    );
    expect(setName).not.toHaveBeenCalled();
  });

  it("errors on whitespace-only new_name", async () => {
    const bases = [{ name: "Old" }];
    const { runtime, setName } = makeRuntime({ getNameBases: () => bases });
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0, new_name: "   " });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "new_name must be a non-empty string.",
    );
    expect(setName).not.toHaveBeenCalled();
  });

  it("rejects empty/non-string new_name and never calls setName", async () => {
    const bases = [{ name: "Old" }];
    const { runtime, setName } = makeRuntime({ getNameBases: () => bases });
    const tool = createRenameNamesbaseTool(runtime);
    for (const bad of [null, undefined, "", 42, {}]) {
      const r = await tool.execute({ index: 0, new_name: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "new_name must be a non-empty string.",
      );
    }
    expect(setName).not.toHaveBeenCalled();
  });

  it("returns ambiguity error with candidates when multiple bases share a name", async () => {
    const bases = [{ name: "Shared" }, { name: "Other" }, { name: "Shared" }];
    const { runtime, setName } = makeRuntime({ getNameBases: () => bases });
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({
      current_name: "Shared",
      new_name: "X",
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Multiple namesbases match name Shared/);
    expect(body.candidates).toEqual([
      { index: 0, name: "Shared" },
      { index: 2, name: "Shared" },
    ]);
    expect(setName).not.toHaveBeenCalled();
  });

  it("errors when current_name is not found", async () => {
    const bases = [{ name: "Real" }];
    const { runtime, setName } = makeRuntime({ getNameBases: () => bases });
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({
      current_name: "Ghost",
      new_name: "Y",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found with name Ghost.",
    );
    expect(setName).not.toHaveBeenCalled();
  });

  it("errors when index is out of range", async () => {
    const bases = [{ name: "A" }, { name: "B" }];
    const { runtime, setName } = makeRuntime({ getNameBases: () => bases });
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({ index: 5, new_name: "Y" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found at index 5.",
    );
    expect(setName).not.toHaveBeenCalled();
  });

  it("rejects negative / non-integer / non-finite / non-numeric index", async () => {
    const bases = [{ name: "A" }];
    const { runtime, setName } = makeRuntime({ getNameBases: () => bases });
    const tool = createRenameNamesbaseTool(runtime);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "0"]) {
      const r = await tool.execute({ index: bad, new_name: "Y" });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "index must be a non-negative integer.",
      );
    }
    expect(setName).not.toHaveBeenCalled();
  });

  it("errors when index and current_name disagree", async () => {
    const bases = [{ name: "Foo" }, { name: "Bar" }];
    const { runtime, setName } = makeRuntime({ getNameBases: () => bases });
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({
      index: 0,
      current_name: "Bar",
      new_name: "X",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "index and current_name disagree.",
    );
    expect(setName).not.toHaveBeenCalled();
  });

  it("succeeds when index and current_name agree (case-insensitive)", async () => {
    const bases = [{ name: "Foo" }, { name: "Bar" }];
    const { runtime, setName } = makeRuntime({ getNameBases: () => bases });
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({
      index: 1,
      current_name: "bar",
      new_name: "Y",
    });
    expect(result.isError).toBeFalsy();
    expect(setName).toHaveBeenCalledTimes(1);
    expect(setName).toHaveBeenCalledWith(1, "Y");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 1,
      old_name: "Bar",
      new_name: "Y",
    });
  });

  it("errors when neither index nor current_name is provided", async () => {
    const bases = [{ name: "A" }];
    const { runtime, setName } = makeRuntime({ getNameBases: () => bases });
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({ new_name: "Foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Provide either index or current_name to identify the namesbase.",
    );
    expect(setName).not.toHaveBeenCalled();
  });

  it("rejects empty/non-string current_name (when only current_name supplied)", async () => {
    const bases = [{ name: "A" }];
    const { runtime, setName } = makeRuntime({ getNameBases: () => bases });
    const tool = createRenameNamesbaseTool(runtime);
    for (const bad of ["", "   ", 42]) {
      const r = await tool.execute({ current_name: bad, new_name: "Y" });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "current_name must be a non-empty string.",
      );
    }
    expect(setName).not.toHaveBeenCalled();
  });

  it("surfaces runtime getNameBases failures", async () => {
    const runtime: RenameNamesbaseRuntime = {
      getNameBases: () => {
        throw new Error("nameBases missing");
      },
      setName: vi.fn(),
    };
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0, new_name: "Y" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases missing/);
    expect(runtime.setName).not.toHaveBeenCalled();
  });

  it("surfaces runtime setName failures", async () => {
    const bases = [{ name: "Old" }];
    const runtime: RenameNamesbaseRuntime = {
      getNameBases: () => bases,
      setName: vi.fn(() => {
        throw new Error("write failed");
      }),
    };
    const tool = createRenameNamesbaseTool(runtime);
    const result = await tool.execute({ index: 0, new_name: "Y" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/write failed/);
  });

  it("has correct tool name and required-schema fields", () => {
    expect(renameNamesbaseTool.name).toBe("rename_namesbase");
    expect(renameNamesbaseTool.input_schema.required).toEqual(["new_name"]);
  });
});

describe("findNamesbaseByIndex", () => {
  const bases = [{ name: "Zero" }, { name: "One" }, { name: "Two" }];

  it("returns the entry at a valid index", () => {
    expect(findNamesbaseByIndex(bases, 1)).toEqual({ index: 1, name: "One" });
  });

  it("works at index 0 (boundary)", () => {
    expect(findNamesbaseByIndex(bases, 0)).toEqual({ index: 0, name: "Zero" });
  });

  it("returns null for negative indices", () => {
    expect(findNamesbaseByIndex(bases, -1)).toBeNull();
  });

  it("returns null for out-of-range indices", () => {
    expect(findNamesbaseByIndex(bases, 99)).toBeNull();
  });

  it("returns null for non-integer indices", () => {
    expect(findNamesbaseByIndex(bases, 1.5)).toBeNull();
    expect(findNamesbaseByIndex(bases, Number.NaN)).toBeNull();
  });

  it("returns null when bases is missing or not an array", () => {
    expect(findNamesbaseByIndex(undefined, 0)).toBeNull();
  });

  it("returns null for non-object entries (e.g. legacy 0 placeholder)", () => {
    expect(
      findNamesbaseByIndex(
        [0 as unknown as { name: string }, { name: "First" }],
        0,
      ),
    ).toBeNull();
  });

  it("treats missing name as empty string", () => {
    expect(findNamesbaseByIndex([{}], 0)).toEqual({ index: 0, name: "" });
  });
});

describe("findNamesbasesByName", () => {
  const bases = [
    { name: "Crystal" },
    { name: "crystal" },
    { name: "Other" },
    { name: "  Crystal  " }, // intentional padding to ensure stored names
  ];

  it("collects every base matching name (case-insensitive, trimmed needle)", () => {
    const result = findNamesbasesByName(bases, "  CRYSTAL  ");
    // Note: stored names are not trimmed — entry [3] has padding so it
    // doesn't match the case-insensitive exact compare.
    expect(result).toEqual([
      { index: 0, name: "Crystal" },
      { index: 1, name: "crystal" },
    ]);
  });

  it("returns empty array when no match", () => {
    expect(findNamesbasesByName(bases, "nothing")).toEqual([]);
  });

  it("returns empty array when bases is missing", () => {
    expect(findNamesbasesByName(undefined, "Crystal")).toEqual([]);
  });

  it("returns empty array for empty/whitespace needle", () => {
    expect(findNamesbasesByName(bases, "")).toEqual([]);
    expect(findNamesbasesByName(bases, "   ")).toEqual([]);
  });

  it("ignores non-object entries", () => {
    const result = findNamesbasesByName(
      [0 as unknown as { name: string }, { name: "Foo" }],
      "Foo",
    );
    expect(result).toEqual([{ index: 1, name: "Foo" }]);
  });
});

describe("defaultRenameNamesbaseRuntime (integration)", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "Generic", b: "", min: 4, max: 9, d: "", m: 0 },
      { name: "Elvish", b: "", min: 4, max: 9, d: "", m: 0 },
      { name: "Dwarven", b: "", min: 4, max: 9, d: "", m: 0 },
    ];
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
  });

  it("renames the matching namesbase entry on window.nameBases", async () => {
    const result = await renameNamesbaseTool.execute({
      index: 1,
      new_name: "High Elven",
    });
    expect(result.isError).toBeFalsy();
    const bases = (globalThis as { nameBases: { name: string }[] }).nameBases;
    expect(bases[1]?.name).toBe("High Elven");
    expect(bases[0]?.name).toBe("Generic");
  });

  it("renames by current_name when unique", async () => {
    const result = await renameNamesbaseTool.execute({
      current_name: "Dwarven",
      new_name: "Dwarvish",
    });
    expect(result.isError).toBeFalsy();
    const bases = (globalThis as { nameBases: { name: string }[] }).nameBases;
    expect(bases[2]?.name).toBe("Dwarvish");
  });

  it("errors cleanly when nameBases is missing", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await renameNamesbaseTool.execute({
      index: 0,
      new_name: "X",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });

  it("errors when nameBases is not an array", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = { not: "array" };
    const result = await renameNamesbaseTool.execute({
      index: 0,
      new_name: "X",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });
});

describe("rename_namesbase registry round-trip", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "First", b: "", min: 4, max: 9, d: "", m: 0 },
      { name: "Second", b: "", min: 4, max: 9, d: "", m: 0 },
    ];
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
  });

  it("registers and runs through the registry", async () => {
    const registry = new ToolRegistry();
    registry.register(renameNamesbaseTool);
    const result = await registry.run("rename_namesbase", {
      index: 0,
      new_name: "Brand New",
    });
    expect(result.isError).toBeFalsy();
    const bases = (globalThis as { nameBases: { name: string }[] }).nameBases;
    expect(bases[0]?.name).toBe("Brand New");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      old_name: "First",
      new_name: "Brand New",
    });
  });

  it("returns 'rename_namesbase' as its name in registry list", () => {
    const registry = new ToolRegistry();
    registry.register(renameNamesbaseTool);
    expect(registry.list().map((t) => t.name)).toContain("rename_namesbase");
  });
});
