import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createRegenerateLakeNameTool,
  LAKE_NAME_MODES,
  type RegenerateLakeNameRef,
  type RegenerateLakeNameRuntime,
  regenerateLakeNameTool,
} from "./regenerate-lake-name";

function makeRuntime(overrides: Partial<RegenerateLakeNameRuntime> = {}): {
  runtime: RegenerateLakeNameRuntime;
  findById: ReturnType<typeof vi.fn<RegenerateLakeNameRuntime["findById"]>>;
  findByName: ReturnType<typeof vi.fn<RegenerateLakeNameRuntime["findByName"]>>;
  generateCultureName: ReturnType<
    typeof vi.fn<RegenerateLakeNameRuntime["generateCultureName"]>
  >;
  generateRandomName: ReturnType<
    typeof vi.fn<RegenerateLakeNameRuntime["generateRandomName"]>
  >;
  apply: ReturnType<typeof vi.fn<RegenerateLakeNameRuntime["apply"]>>;
} {
  const findById = vi.fn<RegenerateLakeNameRuntime["findById"]>(
    overrides.findById ?? (() => null),
  );
  const findByName = vi.fn<RegenerateLakeNameRuntime["findByName"]>(
    overrides.findByName ?? (() => ({ matches: [] })),
  );
  const generateCultureName = vi.fn<
    RegenerateLakeNameRuntime["generateCultureName"]
  >(overrides.generateCultureName ?? (() => "Culture Lake"));
  const generateRandomName = vi.fn<
    RegenerateLakeNameRuntime["generateRandomName"]
  >(overrides.generateRandomName ?? (() => "Random Lake"));
  const apply = vi.fn<RegenerateLakeNameRuntime["apply"]>(
    overrides.apply ?? (() => undefined),
  );
  return {
    runtime: {
      findById,
      findByName,
      generateCultureName,
      generateRandomName,
      apply,
    },
    findById,
    findByName,
    generateCultureName,
    generateRandomName,
    apply,
  };
}

describe("LAKE_NAME_MODES", () => {
  it("has exactly culture and random", () => {
    expect(LAKE_NAME_MODES).toEqual(["culture", "random"]);
  });
});

describe("regenerate_lake_name tool (stub runtime)", () => {
  it("happy path mode=culture by id", async () => {
    const { runtime, generateCultureName, generateRandomName, apply } =
      makeRuntime({
        findById: (id) =>
          id === 7 ? { i: 7, name: "Old Lake", group: "freshwater" } : null,
        generateCultureName: () => "Foo Lake",
      });
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ id: 7, mode: "culture" });
    expect(result.isError).toBeFalsy();
    expect(generateCultureName).toHaveBeenCalledWith({
      i: 7,
      name: "Old Lake",
      group: "freshwater",
    });
    expect(generateRandomName).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith(7, "Foo Lake");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 7,
      mode: "culture",
      old_name: "Old Lake",
      new_name: "Foo Lake",
    });
  });

  it("happy path mode=random by id", async () => {
    const { runtime, generateCultureName, generateRandomName, apply } =
      makeRuntime({
        findById: (id) =>
          id === 5 ? { i: 5, name: "Old Lake", group: "salt" } : null,
        generateRandomName: () => "Bar",
      });
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ id: 5, mode: "random" });
    expect(result.isError).toBeFalsy();
    expect(generateRandomName).toHaveBeenCalled();
    expect(generateCultureName).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith(5, "Bar");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 5,
      mode: "random",
      old_name: "Old Lake",
      new_name: "Bar",
    });
  });

  it("identifies by unique name (case-insensitive)", async () => {
    const { runtime, apply, findByName } = makeRuntime({
      findByName: (name) =>
        name.toLowerCase() === "great lake"
          ? {
              matches: [
                { i: 5, name: "Great Lake", group: "freshwater" },
              ] satisfies RegenerateLakeNameRef[],
            }
          : { matches: [] },
      generateCultureName: () => "Renamed",
    });
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({
      name: "GREAT lake",
      mode: "culture",
    });
    expect(result.isError).toBeFalsy();
    expect(findByName).toHaveBeenCalledWith("GREAT lake");
    expect(apply).toHaveBeenCalledWith(5, "Renamed");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 5,
      mode: "culture",
      old_name: "Great Lake",
      new_name: "Renamed",
    });
  });

  it("ambiguous name returns error with candidates; pack unchanged", async () => {
    const matches: RegenerateLakeNameRef[] = [
      { i: 3, name: "Crystal Lake", group: "freshwater" },
      { i: 8, name: "Crystal Lake", group: "salt" },
    ];
    const { runtime, apply } = makeRuntime({
      findByName: () => ({ matches }),
    });
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({
      name: "Crystal Lake",
      mode: "culture",
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Multiple lakes match name Crystal Lake/);
    expect(body.candidates).toEqual([
      { id: 3, name: "Crystal Lake", group: "freshwater" },
      { id: 8, name: "Crystal Lake", group: "salt" },
    ]);
    expect(apply).not.toHaveBeenCalled();
  });

  it("id/name disagreement returns error", async () => {
    const { runtime, apply } = makeRuntime({
      findById: (id) =>
        id === 5 ? { i: 5, name: "Foo Lake", group: "g1" } : null,
      findByName: (name) =>
        name.toLowerCase() === "bar lake"
          ? { matches: [{ i: 9, name: "Bar Lake", group: "g2" }] }
          : { matches: [] },
    });
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({
      id: 5,
      name: "Bar Lake",
      mode: "culture",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "id and name refer to different lakes.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("succeeds when id and name agree", async () => {
    const ref: RegenerateLakeNameRef = {
      i: 5,
      name: "Foo Lake",
      group: "g",
    };
    const { runtime, apply } = makeRuntime({
      findById: (id) => (id === 5 ? ref : null),
      findByName: (name) =>
        name.toLowerCase() === "foo lake"
          ? { matches: [ref] }
          : { matches: [] },
      generateCultureName: () => "Hello",
    });
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({
      id: 5,
      name: "foo lake",
      mode: "culture",
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(5, "Hello");
  });

  it("lake not found by id returns error", async () => {
    const { runtime, apply } = makeRuntime({ findById: () => null });
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ id: 99, mode: "culture" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("No lake found with id 99.");
    expect(apply).not.toHaveBeenCalled();
  });

  it("lake not found by name returns error", async () => {
    const { runtime, apply } = makeRuntime({
      findByName: () => ({ matches: [] }),
    });
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ name: "Ghost", mode: "culture" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No lake found with name Ghost.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects missing mode; pack unchanged", async () => {
    const { runtime, apply } = makeRuntime({
      findById: () => ({ i: 1, name: "L", group: "g" }),
    });
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ id: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      'mode must be "culture" or "random".',
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it('rejects invalid mode (e.g. "foo"); pack unchanged', async () => {
    const { runtime, apply } = makeRuntime({
      findById: () => ({ i: 1, name: "L", group: "g" }),
    });
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ id: 1, mode: "foo" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      'mode must be "culture" or "random".',
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it('rejects wrong-case mode ("Culture"); strict literal match', async () => {
    const { runtime, apply } = makeRuntime({
      findById: () => ({ i: 1, name: "L", group: "g" }),
    });
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ id: 1, mode: "Culture" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      'mode must be "culture" or "random".',
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when neither id nor name is provided", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ mode: "culture" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Provide either id or name to identify the lake.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid id values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createRegenerateLakeNameTool(runtime);
    for (const bad of [0, -1, 1.5, "5"]) {
      const r = await tool.execute({ id: bad, mode: "culture" });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "id must be a positive integer.",
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid name values", async () => {
    const { runtime, apply } = makeRuntime();
    const tool = createRegenerateLakeNameTool(runtime);
    for (const bad of ["", "   ", 42]) {
      const r = await tool.execute({ name: bad, mode: "culture" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces generator throws (mode=culture); pack unchanged", async () => {
    const runtime: RegenerateLakeNameRuntime = {
      findById: () => ({ i: 1, name: "L", group: "g" }),
      findByName: () => ({ matches: [] }),
      generateCultureName: vi.fn(() => {
        throw new Error("Lakes is not available");
      }),
      generateRandomName: () => "x",
      apply: vi.fn(),
    };
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ id: 1, mode: "culture" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Lakes/);
    expect(runtime.apply).not.toHaveBeenCalled();
  });

  it("surfaces generator throws (mode=random); pack unchanged", async () => {
    const runtime: RegenerateLakeNameRuntime = {
      findById: () => ({ i: 1, name: "L", group: "g" }),
      findByName: () => ({ matches: [] }),
      generateCultureName: () => "x",
      generateRandomName: vi.fn(() => {
        throw new Error("Names is not available");
      }),
      apply: vi.fn(),
    };
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ id: 1, mode: "random" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names/);
    expect(runtime.apply).not.toHaveBeenCalled();
  });

  it("rejects empty generator output; pack unchanged", async () => {
    const runtime: RegenerateLakeNameRuntime = {
      findById: () => ({ i: 1, name: "L", group: "g" }),
      findByName: () => ({ matches: [] }),
      generateCultureName: () => "   ",
      generateRandomName: () => "  ",
      apply: vi.fn(),
    };
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ id: 1, mode: "culture" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Name generator returned an empty/invalid name.",
    );
    expect(runtime.apply).not.toHaveBeenCalled();
  });

  it("rejects non-string generator output; pack unchanged", async () => {
    const runtime: RegenerateLakeNameRuntime = {
      findById: () => ({ i: 1, name: "L", group: "g" }),
      findByName: () => ({ matches: [] }),
      generateCultureName: () => 42 as unknown as string,
      generateRandomName: () => "x",
      apply: vi.fn(),
    };
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ id: 1, mode: "culture" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Name generator returned an empty/invalid name.",
    );
    expect(runtime.apply).not.toHaveBeenCalled();
  });

  it("trims the generator output before assigning", async () => {
    const { runtime, apply } = makeRuntime({
      findById: () => ({ i: 1, name: "Old", group: "g" }),
      generateCultureName: () => "  Spaced  ",
    });
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ id: 1, mode: "culture" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, "Spaced");
    expect(JSON.parse(result.content).new_name).toBe("Spaced");
  });

  it("surfaces apply errors; reports the runtime message", async () => {
    const runtime: RegenerateLakeNameRuntime = {
      findById: () => ({ i: 1, name: "Old", group: "g" }),
      findByName: () => ({ matches: [] }),
      generateCultureName: () => "Y",
      generateRandomName: () => "x",
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createRegenerateLakeNameTool(runtime);
    const result = await tool.execute({ id: 1, mode: "culture" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });

  it("has correct tool name and required-schema fields", () => {
    expect(regenerateLakeNameTool.name).toBe("regenerate_lake_name");
    expect(regenerateLakeNameTool.input_schema.required).toEqual(["mode"]);
  });
});

describe("regenerate_lake_name registry round-trip", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalLakes = (globalThis as { Lakes?: unknown }).Lakes;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      features: [
        0,
        { i: 1, type: "lake", name: "Old Lake", group: "freshwater" },
      ],
    };
    (globalThis as { Lakes?: unknown }).Lakes = {
      getName: () => "Brand New",
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Lakes?: unknown }).Lakes = originalLakes;
  });

  it("registers and runs through the registry", async () => {
    const registry = new ToolRegistry();
    registry.register(regenerateLakeNameTool);
    const result = await registry.run("regenerate_lake_name", {
      id: 1,
      mode: "culture",
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      id: 1,
      mode: "culture",
      old_name: "Old Lake",
      new_name: "Brand New",
    });
  });
});

describe("defaultRegenerateLakeNameRuntime (integration)", () => {
  const getName = vi.fn((_feature: unknown) => "Culture Lake");
  const getBase = vi.fn((idx: number) => `Base${idx}`);

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalLakes = (globalThis as { Lakes?: unknown }).Lakes;
  const originalNames = (globalThis as { Names?: unknown }).Names;
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalRand = (globalThis as { rand?: unknown }).rand;

  beforeEach(() => {
    getName.mockReset();
    getName.mockReturnValue("Culture Lake");
    getBase.mockReset();
    getBase.mockImplementation((idx: number) => `Base${idx}`);

    (globalThis as { pack?: unknown }).pack = {
      features: [
        0,
        { i: 1, type: "lake", name: "Old Lake", group: "freshwater" },
        { i: 2, type: "island", name: "Big Island", group: "continent" },
      ],
    };
    (globalThis as { Lakes?: unknown }).Lakes = { getName };
    (globalThis as { Names?: unknown }).Names = { getBase };
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "English" },
      { name: "German" },
      { name: "Norse" },
    ];
    (globalThis as { rand?: unknown }).rand = undefined;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Lakes?: unknown }).Lakes = originalLakes;
    (globalThis as { Names?: unknown }).Names = originalNames;
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { rand?: unknown }).rand = originalRand;
  });

  it("mode=culture: calls Lakes.getName with the matching feature object and mutates pack", async () => {
    const result = await regenerateLakeNameTool.execute({
      id: 1,
      mode: "culture",
    });
    expect(result.isError).toBeFalsy();
    expect(getName).toHaveBeenCalledTimes(1);
    const featureArg = getName.mock.calls[0]?.[0] as { i: number };
    expect(featureArg.i).toBe(1);
    const pack = (globalThis as { pack: { features: { name: string }[] } })
      .pack;
    expect(pack.features[1]?.name).toBe("Culture Lake");
    expect(JSON.parse(result.content).old_name).toBe("Old Lake");
    expect(JSON.parse(result.content).new_name).toBe("Culture Lake");
  });

  it("mode=random: calls Names.getBase with an index in [0, length-1] and mutates pack", async () => {
    const result = await regenerateLakeNameTool.execute({
      id: 1,
      mode: "random",
    });
    expect(result.isError).toBeFalsy();
    expect(getBase).toHaveBeenCalled();
    const idx = getBase.mock.calls[0]?.[0] as number;
    expect(typeof idx).toBe("number");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(3);
    const pack = (globalThis as { pack: { features: { name: string }[] } })
      .pack;
    expect(pack.features[1]?.name).toBe(`Base${idx}`);
  });

  it("mode=random uses window.rand when present (rand(n-1))", async () => {
    const rand = vi.fn((max: number) => max); // always return the max
    (globalThis as { rand?: unknown }).rand = rand;
    const result = await regenerateLakeNameTool.execute({
      id: 1,
      mode: "random",
    });
    expect(result.isError).toBeFalsy();
    expect(rand).toHaveBeenCalledWith(2); // nameBases.length (3) - 1
    expect(getBase).toHaveBeenCalledWith(2);
    const pack = (globalThis as { pack: { features: { name: string }[] } })
      .pack;
    expect(pack.features[1]?.name).toBe("Base2");
  });

  it('non-lake feature with matching id → error: "No lake found with id ..."; pack unchanged', async () => {
    const result = await regenerateLakeNameTool.execute({
      id: 2,
      mode: "culture",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("No lake found with id 2.");
    const pack = (globalThis as { pack: { features: { name: string }[] } })
      .pack;
    expect(pack.features[2]?.name).toBe("Big Island");
  });

  it("mode=culture with window.Lakes missing → error names Lakes", async () => {
    (globalThis as { Lakes?: unknown }).Lakes = undefined;
    const result = await regenerateLakeNameTool.execute({
      id: 1,
      mode: "culture",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Lakes/);
  });

  it("mode=random with window.Names missing → error names Names", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const result = await regenerateLakeNameTool.execute({
      id: 1,
      mode: "random",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names/);
  });

  it("mode=random with window.nameBases empty → error names nameBases", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = [];
    const result = await regenerateLakeNameTool.execute({
      id: 1,
      mode: "random",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases/);
  });

  it("mode=random with window.nameBases missing → error names nameBases", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await regenerateLakeNameTool.execute({
      id: 1,
      mode: "random",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases/);
  });

  it("pack missing → error mentioning pack.features", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await regenerateLakeNameTool.execute({
      id: 1,
      mode: "culture",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack\.features/);
  });
});
