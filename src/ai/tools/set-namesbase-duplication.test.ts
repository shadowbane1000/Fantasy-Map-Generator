import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./index";
import {
  createSetNamesbaseDuplicationTool,
  type SetNamesbaseDuplicationRuntime,
  setNamesbaseDuplicationTool,
} from "./set-namesbase-duplication";

function makeRuntime(overrides: Partial<SetNamesbaseDuplicationRuntime> = {}): {
  runtime: SetNamesbaseDuplicationRuntime;
  getNameBases: ReturnType<
    typeof vi.fn<SetNamesbaseDuplicationRuntime["getNameBases"]>
  >;
  setDuplication: ReturnType<
    typeof vi.fn<SetNamesbaseDuplicationRuntime["setDuplication"]>
  >;
} {
  const getNameBases = vi.fn<SetNamesbaseDuplicationRuntime["getNameBases"]>(
    overrides.getNameBases ?? (() => []),
  );
  const setDuplication = vi.fn<
    SetNamesbaseDuplicationRuntime["setDuplication"]
  >(overrides.setDuplication ?? (() => undefined));
  return {
    runtime: { getNameBases, setDuplication },
    getNameBases,
    setDuplication,
  };
}

describe("set_namesbase_duplication tool", () => {
  it("happy path: sets duplicate_chars on the entry by index", async () => {
    const bases = [
      { name: "Generic", d: "" },
      { name: "Elvish", d: "" },
      { name: "Dwarven", d: "" },
    ];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({ index: 1, duplicate_chars: "aeiou" });
    expect(result.isError).toBeFalsy();
    expect(setDuplication).toHaveBeenCalledWith(1, "aeiou");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 1,
      name: "Elvish",
      old_duplicate_chars: "",
      new_duplicate_chars: "aeiou",
    });
  });

  it("accepts empty string and reports old value", async () => {
    const bases = [{ name: "Foo", d: "aeiou" }];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({ index: 0, duplicate_chars: "" });
    expect(result.isError).toBeFalsy();
    expect(setDuplication).toHaveBeenCalledWith(0, "");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "Foo",
      old_duplicate_chars: "aeiou",
      new_duplicate_chars: "",
    });
  });

  it("treats missing .d on the entry as empty old value", async () => {
    const bases = [{ name: "Foo" }];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({ index: 0, duplicate_chars: "xy" });
    expect(result.isError).toBeFalsy();
    expect(setDuplication).toHaveBeenCalledWith(0, "xy");
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      index: 0,
      old_duplicate_chars: "",
      new_duplicate_chars: "xy",
    });
  });

  it("preserves '/' and '|' verbatim (no sanitization)", async () => {
    const bases = [{ name: "Foo", d: "" }];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({ index: 0, duplicate_chars: "a/|" });
    expect(result.isError).toBeFalsy();
    expect(setDuplication).toHaveBeenCalledWith(0, "a/|");
    expect(JSON.parse(result.content).new_duplicate_chars).toBe("a/|");
  });

  it("preserves whitespace verbatim (no trim)", async () => {
    const bases = [{ name: "Foo", d: "" }];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({ index: 0, duplicate_chars: "   " });
    expect(result.isError).toBeFalsy();
    expect(setDuplication).toHaveBeenCalledWith(0, "   ");
    expect(JSON.parse(result.content).new_duplicate_chars).toBe("   ");
  });

  it("rejects when duplicate_chars is missing", async () => {
    const bases = [{ name: "Foo", d: "" }];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({ index: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "duplicate_chars must be a string.",
    );
    expect(setDuplication).not.toHaveBeenCalled();
  });

  it("rejects when duplicate_chars is not a string", async () => {
    const bases = [{ name: "Foo", d: "" }];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    for (const bad of [42, null, true, {}, []]) {
      const r = await tool.execute({ index: 0, duplicate_chars: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "duplicate_chars must be a string.",
      );
    }
    expect(setDuplication).not.toHaveBeenCalled();
  });

  it("errors when index is out of range", async () => {
    const bases = [{ name: "Foo", d: "" }];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({ index: 5, duplicate_chars: "a" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found at index 5.",
    );
    expect(setDuplication).not.toHaveBeenCalled();
  });

  it("rejects negative / non-integer / non-finite / non-numeric index", async () => {
    const bases = [{ name: "Foo", d: "" }];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "0"]) {
      const r = await tool.execute({ index: bad, duplicate_chars: "a" });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "index must be a non-negative integer.",
      );
    }
    expect(setDuplication).not.toHaveBeenCalled();
  });

  it("errors when current_name is not found", async () => {
    const bases = [{ name: "Real", d: "" }];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({
      current_name: "Ghost",
      duplicate_chars: "a",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "No namesbase found with name Ghost.",
    );
    expect(setDuplication).not.toHaveBeenCalled();
  });

  it("returns ambiguity error with candidates when multiple bases share a name", async () => {
    const bases = [
      { name: "Shared", d: "" },
      { name: "Other", d: "" },
      { name: "Shared", d: "x" },
    ];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({
      current_name: "Shared",
      duplicate_chars: "y",
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Multiple namesbases match name Shared/);
    expect(body.candidates).toEqual([
      { index: 0, name: "Shared" },
      { index: 2, name: "Shared" },
    ]);
    expect(setDuplication).not.toHaveBeenCalled();
  });

  it("errors when index and current_name disagree", async () => {
    const bases = [
      { name: "Foo", d: "" },
      { name: "Bar", d: "" },
    ];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({
      index: 0,
      current_name: "Bar",
      duplicate_chars: "x",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "index and current_name disagree.",
    );
    expect(setDuplication).not.toHaveBeenCalled();
  });

  it("succeeds when index and current_name agree (case-insensitive)", async () => {
    const bases = [
      { name: "Foo", d: "" },
      { name: "Bar", d: "" },
    ];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({
      index: 1,
      current_name: "bar",
      duplicate_chars: "z",
    });
    expect(result.isError).toBeFalsy();
    expect(setDuplication).toHaveBeenCalledTimes(1);
    expect(setDuplication).toHaveBeenCalledWith(1, "z");
  });

  it("errors when neither index nor current_name is provided", async () => {
    const bases = [{ name: "A", d: "" }];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({ duplicate_chars: "a" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Provide either index or current_name to identify the namesbase.",
    );
    expect(setDuplication).not.toHaveBeenCalled();
  });

  it("rejects empty/whitespace/non-string current_name", async () => {
    const bases = [{ name: "A", d: "" }];
    const { runtime, setDuplication } = makeRuntime({
      getNameBases: () => bases,
    });
    const tool = createSetNamesbaseDuplicationTool(runtime);
    for (const bad of ["", "   ", 42]) {
      const r = await tool.execute({
        current_name: bad,
        duplicate_chars: "a",
      });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "current_name must be a non-empty string.",
      );
    }
    expect(setDuplication).not.toHaveBeenCalled();
  });

  it("surfaces runtime getNameBases failures", async () => {
    const runtime: SetNamesbaseDuplicationRuntime = {
      getNameBases: () => {
        throw new Error("nameBases missing");
      },
      setDuplication: vi.fn(),
    };
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({ index: 0, duplicate_chars: "a" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases missing/);
    expect(runtime.setDuplication).not.toHaveBeenCalled();
  });

  it("surfaces runtime setDuplication failures", async () => {
    const bases = [{ name: "Foo", d: "" }];
    const runtime: SetNamesbaseDuplicationRuntime = {
      getNameBases: () => bases,
      setDuplication: vi.fn(() => {
        throw new Error("write failed");
      }),
    };
    const tool = createSetNamesbaseDuplicationTool(runtime);
    const result = await tool.execute({ index: 0, duplicate_chars: "a" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/write failed/);
  });

  it("has correct tool name and required schema field", () => {
    expect(setNamesbaseDuplicationTool.name).toBe("set_namesbase_duplication");
    expect(setNamesbaseDuplicationTool.input_schema.required).toEqual([
      "duplicate_chars",
    ]);
  });
});

describe("defaultSetNamesbaseDuplicationRuntime (integration)", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "Generic", b: "", min: 4, max: 9, d: "", m: 0 },
      { name: "Elvish", b: "", min: 5, max: 12, d: "aeiou", m: 0 },
      { name: "Dwarven", b: "", min: 4, max: 9, d: "", m: 0 },
    ];
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
  });

  it("mutates the matching namesbase entry on window.nameBases (by index)", async () => {
    const result = await setNamesbaseDuplicationTool.execute({
      index: 0,
      duplicate_chars: "aeiou",
    });
    expect(result.isError).toBeFalsy();
    const bases = (globalThis as { nameBases: { name: string; d: string }[] })
      .nameBases;
    expect(bases[0].d).toBe("aeiou");
    expect(bases[1].d).toBe("aeiou");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "Generic",
      old_duplicate_chars: "",
      new_duplicate_chars: "aeiou",
    });
  });

  it("mutates the matching namesbase entry by current_name", async () => {
    const result = await setNamesbaseDuplicationTool.execute({
      current_name: "Elvish",
      duplicate_chars: "",
    });
    expect(result.isError).toBeFalsy();
    const bases = (globalThis as { nameBases: { name: string; d: string }[] })
      .nameBases;
    expect(bases[1].d).toBe("");
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      index: 1,
      name: "Elvish",
      old_duplicate_chars: "aeiou",
      new_duplicate_chars: "",
    });
  });

  it("errors cleanly when nameBases is missing", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await setNamesbaseDuplicationTool.execute({
      index: 0,
      duplicate_chars: "a",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });

  it("errors when nameBases is not an array", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = { not: "array" };
    const result = await setNamesbaseDuplicationTool.execute({
      index: 0,
      duplicate_chars: "a",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/window\.nameBases/);
  });
});

describe("set_namesbase_duplication registry round-trip", () => {
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;

  beforeEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "First", b: "", min: 4, max: 9, d: "", m: 0 },
      { name: "Second", b: "", min: 5, max: 12, d: "", m: 0 },
    ];
  });

  afterEach(() => {
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
  });

  it("registers and runs through the registry", async () => {
    const registry = new ToolRegistry();
    registry.register(setNamesbaseDuplicationTool);
    const result = await registry.run("set_namesbase_duplication", {
      index: 0,
      duplicate_chars: "aeiou",
    });
    expect(result.isError).toBeFalsy();
    const bases = (globalThis as { nameBases: { name: string; d: string }[] })
      .nameBases;
    expect(bases[0].d).toBe("aeiou");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      index: 0,
      name: "First",
      old_duplicate_chars: "",
      new_duplicate_chars: "aeiou",
    });
  });

  it("returns 'set_namesbase_duplication' as its name in registry list", () => {
    const registry = new ToolRegistry();
    registry.register(setNamesbaseDuplicationTool);
    expect(registry.list().map((t) => t.name)).toContain(
      "set_namesbase_duplication",
    );
  });
});
