import { describe, expect, it, vi } from "vitest";
import {
  type CanonicalForm,
  createSetStateFormTool,
  resolveFormName,
  type StateFormRef,
  type StateFormRuntime,
} from "./set-state-form";

function makeRuntime(resolver: (ref: number | string) => StateFormRef | null) {
  const find = vi.fn(resolver);
  const apply = vi.fn<StateFormRuntime["apply"]>();
  const runtime: StateFormRuntime = { find, apply };
  return { runtime, find, apply };
}

describe("set_state_form tool", () => {
  it("applies canonical formName + derived category by state id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 1
        ? {
            i: 1,
            name: "Altaria",
            previousForm: "Monarchy",
            previousFormName: "Kingdom",
          }
        : null,
    );
    const tool = createSetStateFormTool(runtime);
    const result = await tool.execute({ state: 1, formName: "Empire" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, {
      formName: "Empire",
      category: "Monarchy",
    } satisfies CanonicalForm);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      name: "Altaria",
      previousForm: "Monarchy",
      previousFormName: "Kingdom",
      form: "Monarchy",
      formName: "Empire",
    });
  });

  it("is case-insensitive on formName and trims whitespace", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "Altaria",
      previousForm: null,
      previousFormName: null,
    }));
    const tool = createSetStateFormTool(runtime);
    for (const raw of ["empire", "EMPIRE", "  Empire  "]) {
      apply.mockClear();
      await tool.execute({ state: 1, formName: raw });
      expect(apply).toHaveBeenCalledWith(1, {
        formName: "Empire",
        category: "Monarchy",
      });
    }
  });

  it("accepts state lookup by name", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === "altaria"
        ? {
            i: 1,
            name: "Altaria",
            previousForm: null,
            previousFormName: null,
          }
        : null,
    );
    const tool = createSetStateFormTool(runtime);
    await tool.execute({ state: "altaria", formName: "Theocracy" });
    expect(apply).toHaveBeenCalledWith(1, {
      formName: "Theocracy",
      category: "Theocracy",
    });
  });

  it("rejects unknown form names with a supported list", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousForm: null,
      previousFormName: null,
    }));
    const tool = createSetStateFormTool(runtime);
    const result = await tool.execute({ state: 1, formName: "Technocracy" });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.supported).toContain("Empire");
    expect(body.supported).toContain("Republic");
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects state 0 (Neutrals)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 0,
      name: "Neutrals",
      previousForm: null,
      previousFormName: null,
    }));
    const tool = createSetStateFormTool(runtime);
    const result = await tool.execute({ state: 0, formName: "Empire" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors for unknown state refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetStateFormTool(runtime);
    const result = await tool.execute({ state: 999, formName: "Empire" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid state/formName types", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetStateFormTool(runtime);
    const cases = [
      { state: null, formName: "Empire" },
      { state: "", formName: "Empire" },
      { state: 1.5, formName: "Empire" },
      { state: -1, formName: "Empire" },
      { state: 1, formName: "" },
      { state: 1, formName: 42 },
    ];
    for (const input of cases) {
      const r = await tool.execute(input);
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousForm: null,
      previousFormName: null,
    }));
    runtime.apply = vi.fn(() => {
      throw new Error("customization active");
    });
    const tool = createSetStateFormTool(runtime);
    const result = await tool.execute({ state: 1, formName: "Empire" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/customization/);
  });
});

describe("resolveFormName", () => {
  it("resolves to canonical casing + category for every optgroup", () => {
    expect(resolveFormName("Kingdom")).toEqual({
      formName: "Kingdom",
      category: "Monarchy",
    });
    expect(resolveFormName("REPUBLIC")).toEqual({
      formName: "Republic",
      category: "Republic",
    });
    expect(resolveFormName("united kingdom")).toEqual({
      formName: "United Kingdom",
      category: "Union",
    });
    expect(resolveFormName("  Theocracy  ")).toEqual({
      formName: "Theocracy",
      category: "Theocracy",
    });
    expect(resolveFormName("Free Territory")).toEqual({
      formName: "Free Territory",
      category: "Anarchy",
    });
  });

  it("returns null for unknown or invalid input", () => {
    expect(resolveFormName("foobar")).toBeNull();
    expect(resolveFormName("")).toBeNull();
    expect(resolveFormName("   ")).toBeNull();
    expect(resolveFormName(42)).toBeNull();
    expect(resolveFormName(null)).toBeNull();
    expect(resolveFormName(undefined)).toBeNull();
  });
});
