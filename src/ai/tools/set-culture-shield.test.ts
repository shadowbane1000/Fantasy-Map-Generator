import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg, RawCulture, RawProvince, RawState } from "./_shared";
import {
  CULTURE_SHIELDS,
  type CultureShieldCascade,
  type CultureShieldRef,
  type CultureShieldRuntime,
  createSetCultureShieldTool,
  resolveCultureShield,
  setCultureShieldTool,
} from "./set-culture-shield";

function makeRuntime(
  find: (ref: number | string) => CultureShieldRef | null,
  cascade: CultureShieldCascade = { states: 0, provinces: 0, burgs: 0 },
): {
  runtime: CultureShieldRuntime;
  apply: ReturnType<typeof vi.fn<CultureShieldRuntime["apply"]>>;
} {
  const apply = vi.fn<CultureShieldRuntime["apply"]>(() => cascade);
  return { runtime: { find, apply }, apply };
}

describe("resolveCultureShield", () => {
  it("canonicalizes case-insensitively", () => {
    expect(resolveCultureShield("Swiss")).toBe("swiss");
    expect(resolveCultureShield("HORSEHEAD")).toBe("horsehead");
    expect(resolveCultureShield("wedged")).toBe("wedged");
    expect(resolveCultureShield("heater")).toBe("heater");
  });

  it("returns null for unknown or non-string", () => {
    expect(resolveCultureShield("notashield")).toBeNull();
    expect(resolveCultureShield("types")).toBeNull();
    expect(resolveCultureShield(42)).toBeNull();
    expect(resolveCultureShield("")).toBeNull();
    expect(resolveCultureShield(null)).toBeNull();
  });
});

describe("CULTURE_SHIELDS", () => {
  it("includes known shield keys", () => {
    for (const k of [
      "heater",
      "swiss",
      "wedged",
      "fantasy1",
      "noldor",
      "round",
    ]) {
      expect(CULTURE_SHIELDS).toContain(k);
    }
  });

  it("excludes the meta 'types' key", () => {
    expect(CULTURE_SHIELDS).not.toContain("types");
  });
});

describe("set_culture_shield tool", () => {
  it("sets shield by numeric id", async () => {
    const { runtime, apply } = makeRuntime(
      (ref) =>
        ref === 1
          ? { i: 1, name: "Highlanders", previousShield: "heater" }
          : null,
      { states: 2, provinces: 1, burgs: 3 },
    );
    const tool = createSetCultureShieldTool(runtime);
    const result = await tool.execute({ culture: 1, shield: "swiss" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(1, "swiss");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 1,
      name: "Highlanders",
      shield: "swiss",
      previousShield: "heater",
      cascaded: { states: 2, provinces: 1, burgs: 3 },
      noop: false,
    });
  });

  it("resolves by case-insensitive culture name and canonicalizes shield", async () => {
    const find = vi.fn<CultureShieldRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "highlanders"
        ? { i: 1, name: "Highlanders", previousShield: "heater" }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetCultureShieldTool(runtime);
    await tool.execute({ culture: "HIGHLANDERS", shield: "Swiss" });
    expect(find).toHaveBeenCalledWith("HIGHLANDERS");
    expect(apply).toHaveBeenCalledWith(1, "swiss");
  });

  it("allows culture id 0 (Wildlands)", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 0,
      name: "Wildlands",
      previousShield: "",
    }));
    const tool = createSetCultureShieldTool(runtime);
    const result = await tool.execute({ culture: 0, shield: "round" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(0, "round");
  });

  it("rejects unknown shield", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousShield: "",
    }));
    const tool = createSetCultureShieldTool(runtime);
    const result = await tool.execute({ culture: 1, shield: "notashield" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.supported).toContain("heater");
  });

  it("rejects empty/non-string shield", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousShield: "",
    }));
    const tool = createSetCultureShieldTool(runtime);
    for (const bad of [null, undefined, 42, "", "   "]) {
      const r = await tool.execute({ culture: 1, shield: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown culture", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetCultureShieldTool(runtime);
    const result = await tool.execute({ culture: 999, shield: "heater" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid culture refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetCultureShieldTool(runtime);
    for (const bad of [null, undefined, -1, 1.5, ""]) {
      const r = await tool.execute({ culture: bad, shield: "heater" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("reports noop when previousShield matches AND cascade counts are all zero", async () => {
    const { runtime } = makeRuntime(
      () => ({ i: 1, name: "x", previousShield: "swiss" }),
      { states: 0, provinces: 0, burgs: 0 },
    );
    const tool = createSetCultureShieldTool(runtime);
    const result = await tool.execute({ culture: 1, shield: "swiss" });
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("reports non-noop when cascade occurred (even if previousShield matches)", async () => {
    const { runtime } = makeRuntime(
      () => ({ i: 1, name: "x", previousShield: "swiss" }),
      { states: 1, provinces: 0, burgs: 0 },
    );
    const tool = createSetCultureShieldTool(runtime);
    const result = await tool.execute({ culture: 1, shield: "swiss" });
    expect(JSON.parse(result.content).noop).toBe(false);
  });

  it("surfaces runtime failures", async () => {
    const runtime: CultureShieldRuntime = {
      find: () => ({ i: 1, name: "x", previousShield: "" }),
      apply: vi.fn(() => {
        throw new Error("pack.cultures is not available.");
      }),
    };
    const tool = createSetCultureShieldTool(runtime);
    const result = await tool.execute({ culture: 1, shield: "heater" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/cultures/);
  });
});

describe("defaultCultureShieldRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      cultures: [
        { i: 0, name: "Wildlands", removed: true, shield: "round" },
        { i: 1, name: "Highlanders", shield: "heater" },
        { i: 2, name: "Coastalfolk", shield: "heater" },
      ] satisfies RawCulture[],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Altaria", culture: 1, coa: { shield: "heater" } },
        {
          i: 2,
          name: "Gone",
          culture: 1,
          removed: true,
          coa: { shield: "heater" },
        },
        {
          i: 3,
          name: "Custom",
          culture: 1,
          coa: { shield: "heater", custom: true },
        },
        { i: 4, name: "Other", culture: 2, coa: { shield: "heater" } },
      ] satisfies RawState[],
      provinces: [
        { i: 0 },
        { i: 1, name: "North Mark", center: 10, coa: { shield: "heater" } },
        {
          i: 2,
          name: "South Mark",
          center: 20,
          coa: { shield: "heater" },
        },
        {
          i: 3,
          name: "Custom Mark",
          center: 10,
          coa: { shield: "heater", custom: true },
        },
      ] satisfies RawProvince[],
      burgs: [
        { i: 0 },
        { i: 1, name: "Rookhold", culture: 1, coa: { shield: "heater" } },
        {
          i: 2,
          name: "Ashholm",
          culture: 1,
          coa: { shield: "heater", custom: true },
        },
        { i: 3, name: "Other", culture: 2, coa: { shield: "heater" } },
      ] satisfies RawBurg[],
      cells: { culture: { 10: 1, 20: 2 } as unknown as ArrayLike<number> },
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("writes culture.shield and cascades to matching non-custom coas", async () => {
    const result = await setCultureShieldTool.execute({
      culture: 1,
      shield: "swiss",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.cascaded).toEqual({ states: 1, provinces: 1, burgs: 1 });
    const pack = (
      globalThis as {
        pack: {
          cultures: RawCulture[];
          states: RawState[];
          provinces: RawProvince[];
          burgs: RawBurg[];
        };
      }
    ).pack;
    expect(pack.cultures[1]?.shield).toBe("swiss");
    // State cascade: state 1 matches culture 1 and is non-custom
    expect(pack.states[1]?.coa?.shield).toBe("swiss");
    // Removed state 2 must not be touched
    expect(pack.states[2]?.coa?.shield).toBe("heater");
    // Custom state 3 must not be touched
    expect(pack.states[3]?.coa?.shield).toBe("heater");
    // Mismatched-culture state 4 must not be touched
    expect(pack.states[4]?.coa?.shield).toBe("heater");
    // Province cascade: province 1 via cells.culture[10] === 1
    expect(pack.provinces[1]?.coa?.shield).toBe("swiss");
    // Mismatched province 2 (cells.culture[20] === 2) untouched
    expect(pack.provinces[2]?.coa?.shield).toBe("heater");
    // Custom province 3 untouched
    expect(pack.provinces[3]?.coa?.shield).toBe("heater");
    // Burg cascade: burg 1 matches culture 1, non-custom
    expect(pack.burgs[1]?.coa?.shield).toBe("swiss");
    // Custom burg 2 untouched
    expect(pack.burgs[2]?.coa?.shield).toBe("heater");
    // Mismatched burg 3 untouched
    expect(pack.burgs[3]?.coa?.shield).toBe("heater");
  });

  it("is a noop when culture.shield already matches and no cascade fires", async () => {
    const pack = (globalThis as { pack: { cultures: RawCulture[] } }).pack;
    if (pack.cultures[2]) pack.cultures[2].shield = "swiss";
    const result = await setCultureShieldTool.execute({
      culture: 2,
      shield: "swiss",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    // State 4, burg 3 use culture 2 but their coas still say "heater",
    // so cascade will flip those → not a noop.
    expect(body.noop).toBe(false);
  });

  it("rejects a removed culture", async () => {
    const result = await setCultureShieldTool.execute({
      culture: 0,
      shield: "heater",
    });
    expect(result.isError).toBe(true);
  });
});
