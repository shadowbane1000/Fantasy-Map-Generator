import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createRestoreDefaultNamesbasesTool,
  type RestoreDefaultNamesbasesRuntime,
  restoreDefaultNamesbasesTool,
} from "./restore-default-namesbases";

interface MakeRuntimeOptions {
  previous_count?: number;
  getNameBases?: () => unknown[];
  clearChains?: () => void;
  setNameBases?: (arr: unknown[]) => void;
}

function makeRuntime(opts: MakeRuntimeOptions = {}): {
  runtime: RestoreDefaultNamesbasesRuntime;
  countPrevious: ReturnType<typeof vi.fn<() => number>>;
  clearChains: ReturnType<typeof vi.fn<() => void>>;
  getNameBases: ReturnType<typeof vi.fn<() => unknown[]>>;
  setNameBases: ReturnType<typeof vi.fn<(arr: unknown[]) => void>>;
} {
  const previous = opts.previous_count ?? 0;
  const countPrevious = vi.fn<() => number>(() => previous);
  const clearChains = vi.fn<() => void>(opts.clearChains ?? (() => {}));
  const getNameBases = vi.fn<() => unknown[]>(opts.getNameBases ?? (() => []));
  const setNameBases = vi.fn<(arr: unknown[]) => void>(
    opts.setNameBases ?? (() => {}),
  );
  return {
    runtime: { countPrevious, clearChains, getNameBases, setNameBases },
    countPrevious,
    clearChains,
    getNameBases,
    setNameBases,
  };
}

describe("restore_default_namesbases tool", () => {
  it("replaces pre-existing nameBases and returns previous + new counts", async () => {
    const defaultBases = Array.from({ length: 26 }, (_, i) => ({
      name: `Base${i}`,
    }));
    const expectedNames = defaultBases.map((b) => b.name);
    const { runtime, countPrevious, clearChains, getNameBases, setNameBases } =
      makeRuntime({
        previous_count: 7,
        getNameBases: () => defaultBases,
      });
    const tool = createRestoreDefaultNamesbasesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 7,
      count: 26,
      names: expectedNames,
    });
    expect(countPrevious).toHaveBeenCalledTimes(1);
    expect(clearChains).toHaveBeenCalledTimes(1);
    expect(getNameBases).toHaveBeenCalledTimes(1);
    expect(setNameBases).toHaveBeenCalledTimes(1);
    expect(setNameBases).toHaveBeenCalledWith(defaultBases);
  });

  it("invokes runtime steps in order: countPrevious → clearChains → getNameBases → setNameBases", async () => {
    const defaultBases = [{ name: "A" }];
    const { runtime, countPrevious, clearChains, getNameBases, setNameBases } =
      makeRuntime({
        previous_count: 1,
        getNameBases: () => defaultBases,
      });
    const tool = createRestoreDefaultNamesbasesTool(runtime);
    await tool.execute({});
    const cpOrder = countPrevious.mock.invocationCallOrder[0];
    const ccOrder = clearChains.mock.invocationCallOrder[0];
    const gnOrder = getNameBases.mock.invocationCallOrder[0];
    const snOrder = setNameBases.mock.invocationCallOrder[0];
    expect(cpOrder).toBeDefined();
    expect(ccOrder).toBeDefined();
    expect(gnOrder).toBeDefined();
    expect(snOrder).toBeDefined();
    expect(cpOrder as number).toBeLessThan(ccOrder as number);
    expect(ccOrder as number).toBeLessThan(gnOrder as number);
    expect(gnOrder as number).toBeLessThan(snOrder as number);
  });

  it("passes the SAME array reference from getNameBases through to setNameBases (no clone / wrap)", async () => {
    const defaultBases = [{ name: "X" }, { name: "Y" }];
    const { runtime, setNameBases } = makeRuntime({
      getNameBases: () => defaultBases,
    });
    const tool = createRestoreDefaultNamesbasesTool(runtime);
    await tool.execute({});
    // Identity pin (===) — guards against the tool wrapping or
    // copying the array, which would defeat the global-reassignment
    // semantics that the integration suite relies on.
    expect(setNameBases.mock.calls[0]?.[0]).toBe(defaultBases);
  });

  it("surfaces clearChains errors and skips getNameBases / setNameBases", async () => {
    const { runtime, countPrevious, getNameBases, setNameBases } = makeRuntime({
      clearChains: () => {
        throw new Error(
          "Names.clearChains is not available; the map hasn't finished loading.",
        );
      },
    });
    const tool = createRestoreDefaultNamesbasesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names\.clearChains/);
    expect(countPrevious).toHaveBeenCalledTimes(1);
    expect(getNameBases).not.toHaveBeenCalled();
    expect(setNameBases).not.toHaveBeenCalled();
  });

  it("surfaces getNameBases errors but clearChains has already run (legacy ordering)", async () => {
    const { runtime, clearChains, setNameBases } = makeRuntime({
      getNameBases: () => {
        throw new Error(
          "Names.getNameBases is not available; the map hasn't finished loading.",
        );
      },
    });
    const tool = createRestoreDefaultNamesbasesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names\.getNameBases/);
    expect(clearChains).toHaveBeenCalledTimes(1);
    expect(setNameBases).not.toHaveBeenCalled();
  });

  it("surfaces the non-array contract error from getNameBases", async () => {
    const { runtime, setNameBases } = makeRuntime({
      getNameBases: () => {
        throw new Error("Names.getNameBases did not return an array.");
      },
    });
    const tool = createRestoreDefaultNamesbasesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Names.getNameBases did not return an array.",
    );
    expect(setNameBases).not.toHaveBeenCalled();
  });

  it("exposes the expected tool name and empty-input schema, and round-trips through ToolRegistry", () => {
    const { runtime } = makeRuntime();
    const tool = createRestoreDefaultNamesbasesTool(runtime);
    expect(tool.name).toBe("restore_default_namesbases");
    expect(tool.input_schema.type).toBe("object");
    expect(tool.input_schema.properties).toEqual({});
    expect(
      (tool.input_schema as { required?: unknown }).required,
    ).toBeUndefined();

    const registry = new ToolRegistry();
    registry.register(restoreDefaultNamesbasesTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "restore_default_namesbases",
    );
  });

  it("ignores extraneous / nullish input", async () => {
    const { runtime, clearChains } = makeRuntime();
    const tool = createRestoreDefaultNamesbasesTool(runtime);
    for (const input of [{}, null, undefined, { extra: "ignored" }]) {
      const result = await tool.execute(input);
      expect(result.isError).toBeFalsy();
    }
    expect(clearChains).toHaveBeenCalledTimes(4);
  });
});

describe("defaultRestoreDefaultNamesbasesRuntime (integration)", () => {
  const originalNames = (globalThis as { Names?: unknown }).Names;
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "OldA" },
      { name: "OldB" },
    ];
    (globalThis as { Names?: unknown }).Names = {
      clearChains: vi.fn(),
      getNameBases: vi.fn(() => []),
    };
  });

  afterEach(() => {
    (globalThis as { Names?: unknown }).Names = originalNames;
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
  });

  it("calls Names.clearChains then reassigns globalThis.nameBases (identity pin)", async () => {
    const defaultBases = [
      { name: "German" },
      { name: "English" },
      { name: "French" },
    ];
    const clearChains = vi.fn();
    const getNameBases = vi.fn(() => defaultBases);
    (globalThis as { Names?: unknown }).Names = { clearChains, getNameBases };
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "OldA" },
      { name: "OldB" },
    ];

    const result = await restoreDefaultNamesbasesTool.execute({});

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      previous_count: 2,
      count: 3,
      names: ["German", "English", "French"],
    });
    expect(clearChains).toHaveBeenCalledTimes(1);
    expect(clearChains).toHaveBeenCalledWith();
    expect(getNameBases).toHaveBeenCalledTimes(1);
    expect(getNameBases).toHaveBeenCalledWith();
    // Load-bearing: REASSIGNMENT, not in-place mutation.
    expect((globalThis as { nameBases?: unknown }).nameBases).toBe(
      defaultBases,
    );
  });

  it("errors when the Names global is missing and leaves nameBases unchanged", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const previous = (globalThis as { nameBases?: unknown }).nameBases;
    const result = await restoreDefaultNamesbasesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names\.clearChains/);
    expect((globalThis as { nameBases?: unknown }).nameBases).toBe(previous);
  });

  it("errors when Names.clearChains is not a function and leaves nameBases unchanged", async () => {
    (globalThis as { Names?: unknown }).Names = {
      clearChains: "nope",
      getNameBases: () => [],
    };
    const previous = (globalThis as { nameBases?: unknown }).nameBases;
    const result = await restoreDefaultNamesbasesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names\.clearChains/);
    expect((globalThis as { nameBases?: unknown }).nameBases).toBe(previous);
  });

  it("errors when Names.getNameBases is not a function (clearChains still ran; nameBases unchanged)", async () => {
    const clearChains = vi.fn();
    (globalThis as { Names?: unknown }).Names = {
      clearChains,
      getNameBases: "nope",
    };
    const previous = (globalThis as { nameBases?: unknown }).nameBases;
    const result = await restoreDefaultNamesbasesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names\.getNameBases/);
    expect(clearChains).toHaveBeenCalledTimes(1);
    expect((globalThis as { nameBases?: unknown }).nameBases).toBe(previous);
  });

  it("errors when Names.getNameBases returns a non-array and leaves nameBases unchanged", async () => {
    (globalThis as { Names?: unknown }).Names = {
      clearChains: vi.fn(),
      getNameBases: () => null,
    };
    const previous = (globalThis as { nameBases?: unknown }).nameBases;
    const result = await restoreDefaultNamesbasesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Names.getNameBases did not return an array.",
    );
    expect((globalThis as { nameBases?: unknown }).nameBases).toBe(previous);
  });

  it("reports previous_count: 0 when nameBases is missing or not an array", async () => {
    for (const bad of [undefined, 42, "nope", null]) {
      (globalThis as { nameBases?: unknown }).nameBases = bad as never;
      const defaultBases = [{ name: "X" }];
      (globalThis as { Names?: unknown }).Names = {
        clearChains: vi.fn(),
        getNameBases: vi.fn(() => defaultBases),
      };
      const result = await restoreDefaultNamesbasesTool.execute({});
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(result.content)).toEqual({
        ok: true,
        previous_count: 0,
        count: 1,
        names: ["X"],
      });
      expect((globalThis as { nameBases?: unknown }).nameBases).toBe(
        defaultBases,
      );
    }
  });

  it("surfaces a thrown runtime error from clearChains; getNameBases not invoked", async () => {
    const getNameBases = vi.fn();
    (globalThis as { Names?: unknown }).Names = {
      clearChains: () => {
        throw new Error("boom");
      },
      getNameBases,
    };
    const previous = (globalThis as { nameBases?: unknown }).nameBases;
    const result = await restoreDefaultNamesbasesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("boom");
    expect(getNameBases).not.toHaveBeenCalled();
    expect((globalThis as { nameBases?: unknown }).nameBases).toBe(previous);
  });

  it("surfaces a thrown runtime error from getNameBases; nameBases unchanged", async () => {
    (globalThis as { Names?: unknown }).Names = {
      clearChains: vi.fn(),
      getNameBases: () => {
        throw new Error("boom2");
      },
    };
    const previous = (globalThis as { nameBases?: unknown }).nameBases;
    const result = await restoreDefaultNamesbasesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("boom2");
    expect((globalThis as { nameBases?: unknown }).nameBases).toBe(previous);
  });
});
