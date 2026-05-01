import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRiver } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createRegenerateRiverNameTool,
  type RegenerateRiverNameRef,
  type RegenerateRiverNameRuntime,
  regenerateRiverNameTool,
} from "./regenerate-river-name";

function makeRuntime(overrides: Partial<RegenerateRiverNameRuntime> = {}): {
  runtime: RegenerateRiverNameRuntime;
  find: ReturnType<typeof vi.fn<RegenerateRiverNameRuntime["find"]>>;
  generateCulture: ReturnType<
    typeof vi.fn<RegenerateRiverNameRuntime["generateCulture"]>
  >;
  generateRandom: ReturnType<
    typeof vi.fn<RegenerateRiverNameRuntime["generateRandom"]>
  >;
  apply: ReturnType<typeof vi.fn<RegenerateRiverNameRuntime["apply"]>>;
  redraw: ReturnType<typeof vi.fn<RegenerateRiverNameRuntime["redraw"]>>;
} {
  const find = vi.fn<RegenerateRiverNameRuntime["find"]>(
    overrides.find ?? (() => null),
  );
  const generateCulture = vi.fn<RegenerateRiverNameRuntime["generateCulture"]>(
    overrides.generateCulture ?? (() => "Foo"),
  );
  const generateRandom = vi.fn<RegenerateRiverNameRuntime["generateRandom"]>(
    overrides.generateRandom ?? (() => "Bar"),
  );
  const apply = vi.fn<RegenerateRiverNameRuntime["apply"]>(
    overrides.apply ?? (() => undefined),
  );
  const redraw = vi.fn<RegenerateRiverNameRuntime["redraw"]>(
    overrides.redraw ?? (() => undefined),
  );
  return {
    runtime: { find, generateCulture, generateRandom, apply, redraw },
    find,
    generateCulture,
    generateRandom,
    apply,
    redraw,
  };
}

describe("regenerate_river_name tool (stub runtime)", () => {
  it("happy path mode='culture' — calls generateCulture(river.mouth)", async () => {
    const ref: RegenerateRiverNameRef = {
      i: 5,
      name: "Old River",
      mouth: 42,
    };
    const { runtime, generateCulture, generateRandom, apply } = makeRuntime({
      find: (r) => (r === 5 ? ref : null),
      generateCulture: () => "Foo",
    });
    const tool = createRegenerateRiverNameTool(runtime);
    const result = await tool.execute({ river: 5, mode: "culture" });
    expect(result.isError).toBeFalsy();
    expect(generateCulture).toHaveBeenCalledWith(42);
    expect(generateRandom).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith(5, "Foo");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      river: {
        i: 5,
        previous_name: "Old River",
        name: "Foo",
      },
      mode: "culture",
    });
  });

  it("happy path mode='random' — calls generateRandom()", async () => {
    const ref: RegenerateRiverNameRef = {
      i: 5,
      name: "Old River",
      mouth: 42,
    };
    const { runtime, generateCulture, generateRandom, apply } = makeRuntime({
      find: () => ref,
      generateRandom: () => "Bar",
    });
    const tool = createRegenerateRiverNameTool(runtime);
    const result = await tool.execute({ river: 5, mode: "random" });
    expect(result.isError).toBeFalsy();
    expect(generateRandom).toHaveBeenCalledTimes(1);
    expect(generateCulture).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith(5, "Bar");
    expect(JSON.parse(result.content).mode).toBe("random");
    expect(JSON.parse(result.content).river.name).toBe("Bar");
  });

  it("default mode (omitted) === 'culture'", async () => {
    const ref: RegenerateRiverNameRef = { i: 5, name: "X", mouth: 42 };
    const { runtime, generateCulture, generateRandom } = makeRuntime({
      find: () => ref,
      generateCulture: () => "Cult",
    });
    const tool = createRegenerateRiverNameTool(runtime);
    const result = await tool.execute({ river: 5 });
    expect(result.isError).toBeFalsy();
    expect(generateCulture).toHaveBeenCalledTimes(1);
    expect(generateRandom).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).mode).toBe("culture");
  });

  it("case-insensitive mode 'RANDOM' resolves to random", async () => {
    const ref: RegenerateRiverNameRef = { i: 5, name: "X", mouth: 42 };
    const { runtime, generateRandom } = makeRuntime({
      find: () => ref,
      generateRandom: () => "Z",
    });
    const tool = createRegenerateRiverNameTool(runtime);
    const result = await tool.execute({ river: 5, mode: "RANDOM" });
    expect(result.isError).toBeFalsy();
    expect(generateRandom).toHaveBeenCalled();
  });

  it("happy path by river name (case-insensitive)", async () => {
    const ref: RegenerateRiverNameRef = {
      i: 7,
      name: "Mistwater",
      mouth: 99,
    };
    const find = vi.fn<RegenerateRiverNameRuntime["find"]>((r) =>
      typeof r === "string" && r.toLowerCase() === "mistwater" ? ref : null,
    );
    const { runtime, apply } = makeRuntime({
      find,
      generateCulture: () => "NewName",
    });
    const tool = createRegenerateRiverNameTool(runtime);
    const result = await tool.execute({ river: "MISTWATER" });
    expect(result.isError).toBeFalsy();
    expect(find).toHaveBeenCalledWith("MISTWATER");
    expect(apply).toHaveBeenCalledWith(7, "NewName");
    expect(JSON.parse(result.content).river.previous_name).toBe("Mistwater");
  });

  it("river not found by id", async () => {
    const { runtime, apply } = makeRuntime({ find: () => null });
    const tool = createRegenerateRiverNameTool(runtime);
    const result = await tool.execute({ river: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("River 999 not found.");
    expect(apply).not.toHaveBeenCalled();
  });

  it("river not found by name", async () => {
    const { runtime } = makeRuntime({ find: () => null });
    const tool = createRegenerateRiverNameTool(runtime);
    const result = await tool.execute({ river: "Ghost" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe('River "Ghost" not found.');
  });

  it("removed river → dedicated error", async () => {
    const ref: RegenerateRiverNameRef = {
      i: 3,
      name: "Cedria",
      mouth: 30,
      removed: true,
    };
    const { runtime, generateCulture, apply } = makeRuntime({
      find: () => ref,
    });
    const tool = createRegenerateRiverNameTool(runtime);
    const result = await tool.execute({ river: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cannot regenerate name for removed river 3.",
    );
    expect(generateCulture).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("bad mode → 'mode must be ...' error", async () => {
    const ref: RegenerateRiverNameRef = { i: 5, name: "X", mouth: 42 };
    const { runtime, apply } = makeRuntime({ find: () => ref });
    const tool = createRegenerateRiverNameTool(runtime);
    const result = await tool.execute({ river: 5, mode: "other" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "mode must be 'culture' or 'random'.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid river refs", async () => {
    const { runtime, find } = makeRuntime();
    const tool = createRegenerateRiverNameTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ river: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "river must be a positive integer id or a non-empty name string.",
      );
    }
    expect(find).not.toHaveBeenCalled();
  });

  it("captures previous_name BEFORE mutation", async () => {
    // Simulate live state — `find` looks at `current`, `apply` mutates it.
    const current = { i: 5, name: "Original", mouth: 42 };
    const find = vi.fn<RegenerateRiverNameRuntime["find"]>(() => ({
      i: current.i,
      name: current.name,
      mouth: current.mouth,
    }));
    const generateCulture = vi.fn<
      RegenerateRiverNameRuntime["generateCulture"]
    >(() => "Renamed");
    const apply = vi.fn<RegenerateRiverNameRuntime["apply"]>((_i, name) => {
      // At apply-time, the snapshot in execute() has already been taken.
      // Mutate the live object — verifies that previous_name was captured
      // BEFORE this point (otherwise it would read the new name).
      current.name = name;
    });
    const runtime: RegenerateRiverNameRuntime = {
      find,
      generateCulture,
      generateRandom: vi.fn(),
      apply,
      redraw: vi.fn(),
    };
    const tool = createRegenerateRiverNameTool(runtime);
    const result = await tool.execute({ river: 5 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.river.previous_name).toBe("Original");
    expect(body.river.name).toBe("Renamed");
    // Live state was mutated.
    expect(current.name).toBe("Renamed");
  });

  it("rejects empty generator output; pack unchanged", async () => {
    const { runtime, apply } = makeRuntime({
      find: () => ({ i: 5, name: "X", mouth: 42 }),
      generateCulture: () => "   ",
    });
    const tool = createRegenerateRiverNameTool(runtime);
    const result = await tool.execute({ river: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Name generator returned an empty/invalid name.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces generator throws; pack unchanged", async () => {
    const { runtime, apply } = makeRuntime({
      find: () => ({ i: 5, name: "X", mouth: 42 }),
      generateCulture: () => {
        throw new Error("Rivers.getName boom");
      },
    });
    const tool = createRegenerateRiverNameTool(runtime);
    const result = await tool.execute({ river: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Rivers\.getName boom/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("redraw failure swallowed (rename still returned)", async () => {
    const { runtime, redraw } = makeRuntime({
      find: () => ({ i: 5, name: "X", mouth: 42 }),
      generateCulture: () => "Y",
    });
    redraw.mockImplementation(() => {
      throw new Error("no d3 yet");
    });
    const tool = createRegenerateRiverNameTool(runtime);
    const result = await tool.execute({ river: 5 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).river.name).toBe("Y");
  });

  it("has correct tool name and required-schema fields", () => {
    expect(regenerateRiverNameTool.name).toBe("regenerate_river_name");
    expect(regenerateRiverNameTool.input_schema.required).toEqual(["river"]);
  });
});

describe("regenerate_river_name registry round-trip", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRivers = (globalThis as { Rivers?: unknown }).Rivers;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      rivers: [{ i: 5, name: "Old River", mouth: 42 }] satisfies RawRiver[],
    };
    (globalThis as { Rivers?: unknown }).Rivers = {
      getName: () => "Renamed River",
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Rivers?: unknown }).Rivers = originalRivers;
  });

  it("registers and runs through the registry", async () => {
    const registry = new ToolRegistry();
    registry.register(regenerateRiverNameTool);
    const result = await registry.run("regenerate_river_name", { river: 5 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      river: {
        i: 5,
        previous_name: "Old River",
        name: "Renamed River",
      },
      mode: "culture",
    });
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    expect(pack.rivers[0]?.name).toBe("Renamed River");
  });
});

describe("defaultRegenerateRiverNameRuntime (integration)", () => {
  const getName = vi.fn((_cell: number) => "Culture-Generated");
  const getBase = vi.fn((_idx: number) => "Random-Generated");
  const drawRivers = vi.fn();
  const rand = vi.fn((_max: number) => 1); // deterministic

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalRivers = (globalThis as { Rivers?: unknown }).Rivers;
  const originalNames = (globalThis as { Names?: unknown }).Names;
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalRand = (globalThis as { rand?: unknown }).rand;
  const originalDraw = (globalThis as { drawRivers?: unknown }).drawRivers;

  beforeEach(() => {
    getName.mockReset();
    getName.mockImplementation((cell: number) => `Culture${cell}`);
    getBase.mockReset();
    getBase.mockImplementation((idx: number) => `Base${idx}`);
    drawRivers.mockReset();
    rand.mockReset();
    rand.mockReturnValue(1);

    (globalThis as { pack?: unknown }).pack = {
      cells: { culture: [0, 1, 2, 3] },
      rivers: [
        { i: 1, name: "Altaria", mouth: 10 },
        { i: 3, name: "Cedria", mouth: 30, removed: true },
        { i: 4, name: "Drakia", mouth: 40 },
      ] satisfies RawRiver[],
    };
    (globalThis as { Rivers?: unknown }).Rivers = { getName };
    (globalThis as { Names?: unknown }).Names = { getBase };
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "A" },
      { name: "B" },
      { name: "C" },
    ];
    (globalThis as { rand?: unknown }).rand = rand;
    (globalThis as { drawRivers?: unknown }).drawRivers = drawRivers;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Rivers?: unknown }).Rivers = originalRivers;
    (globalThis as { Names?: unknown }).Names = originalNames;
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { rand?: unknown }).rand = originalRand;
    (globalThis as { drawRivers?: unknown }).drawRivers = originalDraw;
  });

  it("culture mode: dispatches through Rivers.getName(mouth)", async () => {
    const result = await regenerateRiverNameTool.execute({ river: 1 });
    expect(result.isError).toBeFalsy();
    expect(getName).toHaveBeenCalledWith(10);
    expect(getName).toHaveBeenCalledTimes(1);
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    expect(pack.rivers[0]?.name).toBe("Culture10");
    expect(drawRivers).toHaveBeenCalledTimes(1);
  });

  it("random mode: uses globalThis.rand for deterministic index", async () => {
    const result = await regenerateRiverNameTool.execute({
      river: 1,
      mode: "random",
    });
    expect(result.isError).toBeFalsy();
    // rand(nameBases.length - 1) = rand(2) → 1 (per stub)
    expect(rand).toHaveBeenCalledWith(2);
    expect(getBase).toHaveBeenCalledWith(1);
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    expect(pack.rivers[0]?.name).toBe("Base1");
  });

  it("missing Rivers.getName (culture) → error mentions Rivers.getName", async () => {
    (globalThis as { Rivers?: unknown }).Rivers = undefined;
    const result = await regenerateRiverNameTool.execute({ river: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Rivers\.getName/);
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    expect(pack.rivers[0]?.name).toBe("Altaria");
  });

  it("missing Names.getBase (random) → error mentions Names.getBase", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const result = await regenerateRiverNameTool.execute({
      river: 1,
      mode: "random",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names\.getBase/);
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    expect(pack.rivers[0]?.name).toBe("Altaria");
  });

  it("empty nameBases (random) → error mentions nameBases", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = [];
    const result = await regenerateRiverNameTool.execute({
      river: 1,
      mode: "random",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases/);
  });

  it("removed river by id → dedicated error", async () => {
    const result = await regenerateRiverNameTool.execute({ river: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cannot regenerate name for removed river 3.",
    );
    const pack = (globalThis as { pack: { rivers: RawRiver[] } }).pack;
    expect(pack.rivers[1]?.name).toBe("Cedria");
  });

  it("river not found by name → not-found error", async () => {
    const result = await regenerateRiverNameTool.execute({
      river: "NoSuchRiver",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      'River "NoSuchRiver" not found.',
    );
  });
});
