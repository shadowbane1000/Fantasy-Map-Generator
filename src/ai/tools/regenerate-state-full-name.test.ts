import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRegistry } from "../index";
import type { RawState } from "./_shared";
import {
  createRegenerateStateFullNameTool,
  type RegenerateStateFullNameRuntime,
  regenerateStateFullNameTool,
  resolveStateFullNamePattern,
  STATE_FULL_NAME_PATTERNS,
  type StateFullNameRef,
} from "./regenerate-state-full-name";

describe("STATE_FULL_NAME_PATTERNS", () => {
  it("has 2 patterns", () => {
    expect(STATE_FULL_NAME_PATTERNS).toEqual(["adjective", "form_of"]);
  });
});

describe("resolveStateFullNamePattern", () => {
  it("canonicalizes case-insensitively", () => {
    expect(resolveStateFullNamePattern("ADJECTIVE")).toBe("adjective");
    expect(resolveStateFullNamePattern("Form_Of")).toBe("form_of");
    expect(resolveStateFullNamePattern("  adjective  ")).toBe("adjective");
  });
  it("returns null for unknown / non-string", () => {
    expect(resolveStateFullNamePattern("random")).toBeNull();
    expect(resolveStateFullNamePattern("")).toBeNull();
    expect(resolveStateFullNamePattern(null)).toBeNull();
    expect(resolveStateFullNamePattern(1)).toBeNull();
  });
});

interface MockRuntimeOptions {
  find?: StateFullNameRef | null;
  /** When set to null, simulates window.getAdjective missing. */
  adjective?: string | null;
  applyImpl?: (i: number, fullName: string) => void;
}

function makeRuntime(opts: MockRuntimeOptions = {}): {
  runtime: RegenerateStateFullNameRuntime;
  find: ReturnType<typeof vi.fn<RegenerateStateFullNameRuntime["find"]>>;
  getAdjective: ReturnType<
    typeof vi.fn<RegenerateStateFullNameRuntime["getAdjective"]>
  >;
  apply: ReturnType<typeof vi.fn<RegenerateStateFullNameRuntime["apply"]>>;
} {
  const find = vi.fn<RegenerateStateFullNameRuntime["find"]>(
    () => opts.find ?? null,
  );
  const getAdjective = vi.fn<RegenerateStateFullNameRuntime["getAdjective"]>(
    (noun) => {
      if (opts.adjective === null) return null;
      return opts.adjective ?? `${noun}n`;
    },
  );
  const apply = vi.fn<RegenerateStateFullNameRuntime["apply"]>(
    opts.applyImpl ?? (() => undefined),
  );
  return { runtime: { find, getAdjective, apply }, find, getAdjective, apply };
}

describe("regenerate_state_full_name tool", () => {
  it("happy path pattern='adjective' (Valorian Republic)", async () => {
    const { runtime, getAdjective, apply } = makeRuntime({
      find: {
        i: 3,
        name: "Valoria",
        form: "Republic",
        fullName: "Republic of Valoria",
        removed: false,
      },
      adjective: "Valorian",
    });
    const tool = createRegenerateStateFullNameTool(runtime);
    const result = await tool.execute({ state: 3, pattern: "adjective" });
    expect(result.isError).toBeFalsy();
    expect(getAdjective).toHaveBeenCalledWith("Valoria");
    expect(apply).toHaveBeenCalledWith(3, "Valorian Republic");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      state: { i: 3, name: "Valoria" },
      previous_full_name: "Republic of Valoria",
      full_name: "Valorian Republic",
      pattern_used: "adjective",
    });
  });

  it("happy path pattern='form_of' (Republic of Valoria)", async () => {
    const { runtime, getAdjective, apply } = makeRuntime({
      find: {
        i: 3,
        name: "Valoria",
        form: "Republic",
        fullName: "Old Name",
        removed: false,
      },
    });
    const tool = createRegenerateStateFullNameTool(runtime);
    const result = await tool.execute({ state: 3, pattern: "form_of" });
    expect(result.isError).toBeFalsy();
    expect(getAdjective).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith(3, "Republic of Valoria");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      state: { i: 3, name: "Valoria" },
      previous_full_name: "Old Name",
      full_name: "Republic of Valoria",
      pattern_used: "form_of",
    });
  });

  it("default pattern (omitted) is 'adjective'", async () => {
    const { runtime, getAdjective, apply } = makeRuntime({
      find: {
        i: 3,
        name: "Valoria",
        form: "Republic",
        fullName: null,
        removed: false,
      },
      adjective: "Valorian",
    });
    const tool = createRegenerateStateFullNameTool(runtime);
    const result = await tool.execute({ state: 3 });
    expect(result.isError).toBeFalsy();
    expect(getAdjective).toHaveBeenCalledWith("Valoria");
    expect(apply).toHaveBeenCalledWith(3, "Valorian Republic");
    expect(JSON.parse(result.content).pattern_used).toBe("adjective");
  });

  it("missing form -> short_only fallback", async () => {
    const { runtime, getAdjective, apply } = makeRuntime({
      find: {
        i: 3,
        name: "Valoria",
        form: "",
        fullName: "Old",
        removed: false,
      },
    });
    const tool = createRegenerateStateFullNameTool(runtime);
    const result = await tool.execute({ state: 3, pattern: "adjective" });
    expect(result.isError).toBeFalsy();
    expect(getAdjective).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith(3, "Valoria");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      state: { i: 3, name: "Valoria" },
      previous_full_name: "Old",
      full_name: "Valoria",
      pattern_used: "short_only",
    });
  });

  it("missing short, has form -> 'The {Form}' fallback", async () => {
    const { runtime, getAdjective, apply } = makeRuntime({
      find: {
        i: 4,
        name: "",
        form: "Empire",
        fullName: null,
        removed: false,
      },
    });
    const tool = createRegenerateStateFullNameTool(runtime);
    const result = await tool.execute({ state: 4, pattern: "adjective" });
    expect(result.isError).toBeFalsy();
    expect(getAdjective).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith(4, "The Empire");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      state: { i: 4, name: "" },
      previous_full_name: null,
      full_name: "The Empire",
      pattern_used: "the_form",
    });
  });

  it("both missing -> error 'State has neither short name nor form.'", async () => {
    const { runtime, apply } = makeRuntime({
      find: {
        i: 5,
        name: "",
        form: "",
        fullName: null,
        removed: false,
      },
    });
    const tool = createRegenerateStateFullNameTool(runtime);
    const result = await tool.execute({ state: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "State has neither short name nor form.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("state not found -> 'State {ref} not found.'", async () => {
    const { runtime, apply } = makeRuntime({ find: null });
    const tool = createRegenerateStateFullNameTool(runtime);
    const result = await tool.execute({ state: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("State 999 not found.");
    expect(apply).not.toHaveBeenCalled();
  });

  it("state 0 -> 'Cannot regenerate full name for state 0 (...).'", async () => {
    // parseEntityRef rejects 0 first — to exercise the explicit i<=0
    // path we have to take the string-name branch and have find return
    // i=0.
    const { runtime, apply } = makeRuntime({
      find: {
        i: 0,
        name: "Neutrals",
        form: "",
        fullName: null,
        removed: false,
      },
    });
    const tool = createRegenerateStateFullNameTool(runtime);
    const result = await tool.execute({ state: "Neutrals" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cannot regenerate full name for state 0 (the Neutrals placeholder).",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("removed state -> 'Cannot regenerate full name for removed state {i}.'", async () => {
    const { runtime, apply } = makeRuntime({
      find: {
        i: 7,
        name: "Gone",
        form: "Republic",
        fullName: null,
        removed: true,
      },
    });
    const tool = createRegenerateStateFullNameTool(runtime);
    const result = await tool.execute({ state: 7 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Cannot regenerate full name for removed state 7.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid state refs", async () => {
    const { runtime, find, apply } = makeRuntime();
    const tool = createRegenerateStateFullNameTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ state: bad });
      expect(r.isError).toBe(true);
    }
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects bad pattern", async () => {
    const { runtime, find, apply } = makeRuntime({
      find: {
        i: 3,
        name: "X",
        form: "Republic",
        fullName: null,
        removed: false,
      },
    });
    const tool = createRegenerateStateFullNameTool(runtime);
    for (const bad of ["random", 1, ""]) {
      const r = await tool.execute({ state: 3, pattern: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toBe(
        "pattern must be 'adjective' or 'form_of'.",
      );
    }
    expect(find).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("missing getAdjective when adjective branch is taken -> error", async () => {
    const { runtime, apply } = makeRuntime({
      find: {
        i: 3,
        name: "Valoria",
        form: "Republic",
        fullName: null,
        removed: false,
      },
      adjective: null,
    });
    const tool = createRegenerateStateFullNameTool(runtime);
    const result = await tool.execute({ state: 3, pattern: "adjective" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.getAdjective is not available; the map hasn't finished loading.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("getAdjective NOT required for form_of / short_only / the_form", async () => {
    // form_of
    {
      const { runtime, getAdjective, apply } = makeRuntime({
        find: {
          i: 3,
          name: "Valoria",
          form: "Republic",
          fullName: null,
          removed: false,
        },
        adjective: null,
      });
      const tool = createRegenerateStateFullNameTool(runtime);
      const r = await tool.execute({ state: 3, pattern: "form_of" });
      expect(r.isError).toBeFalsy();
      expect(getAdjective).not.toHaveBeenCalled();
      expect(apply).toHaveBeenCalledWith(3, "Republic of Valoria");
    }
    // short_only
    {
      const { runtime, getAdjective, apply } = makeRuntime({
        find: {
          i: 3,
          name: "Valoria",
          form: "",
          fullName: null,
          removed: false,
        },
        adjective: null,
      });
      const tool = createRegenerateStateFullNameTool(runtime);
      const r = await tool.execute({ state: 3, pattern: "adjective" });
      expect(r.isError).toBeFalsy();
      expect(getAdjective).not.toHaveBeenCalled();
      expect(apply).toHaveBeenCalledWith(3, "Valoria");
    }
    // the_form
    {
      const { runtime, getAdjective, apply } = makeRuntime({
        find: {
          i: 3,
          name: "",
          form: "Empire",
          fullName: null,
          removed: false,
        },
        adjective: null,
      });
      const tool = createRegenerateStateFullNameTool(runtime);
      const r = await tool.execute({ state: 3, pattern: "adjective" });
      expect(r.isError).toBeFalsy();
      expect(getAdjective).not.toHaveBeenCalled();
      expect(apply).toHaveBeenCalledWith(3, "The Empire");
    }
  });

  it("previous_full_name captured BEFORE mutation", async () => {
    // Use a snapshot whose fullName the apply spy clobbers — the
    // response body should still report the pre-call value.
    const snapshot: StateFullNameRef = {
      i: 3,
      name: "Valoria",
      form: "Republic",
      fullName: "Republic of Valoria",
      removed: false,
    };
    const { runtime } = makeRuntime({
      find: snapshot,
      adjective: "Valorian",
      applyImpl: (_i, fullName) => {
        // Simulate a runtime that mutates the snapshot — should NOT
        // affect the response since the tool already captured the
        // previous value.
        snapshot.fullName = fullName;
      },
    });
    const tool = createRegenerateStateFullNameTool(runtime);
    const result = await tool.execute({ state: 3, pattern: "adjective" });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previous_full_name).toBe(
      "Republic of Valoria",
    );
  });

  it("previous_full_name === null when state has no prior fullName", async () => {
    const { runtime } = makeRuntime({
      find: {
        i: 3,
        name: "Valoria",
        form: "Republic",
        fullName: null,
        removed: false,
      },
      adjective: "Valorian",
    });
    const tool = createRegenerateStateFullNameTool(runtime);
    const result = await tool.execute({ state: 3 });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content).previous_full_name).toBeNull();
  });

  it("runtime.apply throwing -> error propagated", async () => {
    const { runtime } = makeRuntime({
      find: {
        i: 3,
        name: "Valoria",
        form: "Republic",
        fullName: null,
        removed: false,
      },
      adjective: "Valorian",
      applyImpl: () => {
        throw new Error("boom");
      },
    });
    const tool = createRegenerateStateFullNameTool(runtime);
    const result = await tool.execute({ state: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("boom");
  });
});

describe("regenerate_state_full_name registry round-trip", () => {
  it("is registered in the default registry", () => {
    const reg = buildDefaultRegistry();
    const names = reg.list().map((t) => t.name);
    expect(names).toContain("regenerate_state_full_name");
  });
});

describe("defaultRegenerateStateFullNameRuntime (integration)", () => {
  const drawStateLabels = vi.fn();
  const adjective = vi.fn((n: string) => `${n}n`);

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalGetAdjective = (globalThis as { getAdjective?: unknown })
    .getAdjective;
  const originalDraw = (globalThis as { drawStateLabels?: unknown })
    .drawStateLabels;

  beforeEach(() => {
    drawStateLabels.mockReset();
    adjective.mockReset();
    adjective.mockImplementation((n: string) => `${n}n`);

    const states: RawState[] = [];
    states[0] = { i: 0, name: "Neutrals" };
    states[3] = {
      i: 3,
      name: "Valoria",
      form: "Republic",
      formName: "Republic",
      fullName: "Republic of Valoria",
    };
    (globalThis as { pack?: unknown }).pack = { states };
    (globalThis as { getAdjective?: unknown }).getAdjective = adjective;
    (globalThis as { drawStateLabels?: unknown }).drawStateLabels =
      drawStateLabels;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { getAdjective?: unknown }).getAdjective =
      originalGetAdjective;
    (globalThis as { drawStateLabels?: unknown }).drawStateLabels =
      originalDraw;
  });

  it("integration: adjective pattern composes 'Valorian Republic'", async () => {
    const result = await regenerateStateFullNameTool.execute({ state: 3 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[3]?.fullName).toBe("Valorian Republic");
    expect(JSON.parse(result.content).previous_full_name).toBe(
      "Republic of Valoria",
    );
    expect(adjective).toHaveBeenCalledWith("Valoria");
  });

  it("integration: form_of pattern composes 'Republic of Valoria'", async () => {
    const result = await regenerateStateFullNameTool.execute({
      state: 3,
      pattern: "form_of",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[3]?.fullName).toBe("Republic of Valoria");
    expect(adjective).not.toHaveBeenCalled();
  });

  it("integration: state.form (parent category) is NOT used; formName wins", async () => {
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    // form (category) and formName (specific) intentionally differ.
    pack.states[3] = {
      i: 3,
      name: "X",
      form: "Republic",
      formName: "Empire",
    };
    const result = await regenerateStateFullNameTool.execute({
      state: 3,
      pattern: "form_of",
    });
    expect(result.isError).toBeFalsy();
    expect(pack.states[3]?.fullName).toBe("Empire of X");
  });

  it("integration: drawStateLabels called with [i] on success", async () => {
    await regenerateStateFullNameTool.execute({ state: 3 });
    expect(drawStateLabels).toHaveBeenCalledWith([3]);
  });

  it("integration: drawStateLabels missing -> still succeeds", async () => {
    (globalThis as { drawStateLabels?: unknown }).drawStateLabels = undefined;
    const result = await regenerateStateFullNameTool.execute({ state: 3 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[3]?.fullName).toBe("Valorian Republic");
  });

  it("integration: drawStateLabels throws -> still succeeds", async () => {
    (globalThis as { drawStateLabels?: unknown }).drawStateLabels = () => {
      throw new Error("draw boom");
    };
    const result = await regenerateStateFullNameTool.execute({ state: 3 });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[3]?.fullName).toBe("Valorian Republic");
  });

  it("integration: state object identity preserved; only fullName mutated", async () => {
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    const before = pack.states[3];
    const beforeName = before?.name;
    const beforeFormName = before?.formName;
    const beforeForm = before?.form;
    const beforeI = before?.i;
    await regenerateStateFullNameTool.execute({ state: 3 });
    expect(pack.states[3]).toBe(before);
    expect(pack.states[3]?.name).toBe(beforeName);
    expect(pack.states[3]?.formName).toBe(beforeFormName);
    expect(pack.states[3]?.form).toBe(beforeForm);
    expect(pack.states[3]?.i).toBe(beforeI);
  });

  it("integration: getAdjective missing -> adjective branch errors; fullName NOT mutated", async () => {
    (globalThis as { getAdjective?: unknown }).getAdjective = undefined;
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    const before = pack.states[3]?.fullName;
    const result = await regenerateStateFullNameTool.execute({ state: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.getAdjective is not available; the map hasn't finished loading.",
    );
    expect(pack.states[3]?.fullName).toBe(before);
  });

  it("integration: case-insensitive name lookup works", async () => {
    const result = await regenerateStateFullNameTool.execute({
      state: "valoria",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { states: RawState[] } }).pack;
    expect(pack.states[3]?.fullName).toBe("Valorian Republic");
  });
});
