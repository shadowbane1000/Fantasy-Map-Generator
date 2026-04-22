import { describe, expect, it, vi } from "vitest";
import {
  createSetYearAndEraTool,
  deriveEraShort,
  type WorldDateRuntime,
  type WorldDateState,
} from "./set-year-and-era";

function makeRuntime(initial: WorldDateState | null) {
  const state = initial ? { ...initial } : null;
  const read = vi.fn<WorldDateRuntime["read"]>(() =>
    state ? { ...state } : null,
  );
  const writeYear = vi.fn<WorldDateRuntime["writeYear"]>((y) => {
    if (state) state.year = y;
  });
  const writeEra = vi.fn<WorldDateRuntime["writeEra"]>((e, s) => {
    if (state) {
      state.era = e;
      state.eraShort = s;
    }
  });
  const runtime: WorldDateRuntime = { read, writeYear, writeEra };
  return { runtime, read, writeYear, writeEra, state };
}

const base: WorldDateState = {
  year: 100,
  era: "Bright Era",
  eraShort: "BE",
};

describe("set_year_and_era tool", () => {
  it("sets year only and leaves era untouched", async () => {
    const { runtime, writeYear, writeEra } = makeRuntime(base);
    const tool = createSetYearAndEraTool(runtime);
    const result = await tool.execute({ year: 1247 });
    expect(result.isError).toBeFalsy();
    expect(writeYear).toHaveBeenCalledWith(1247);
    expect(writeEra).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.previous).toEqual(base);
    expect(body.current).toEqual({ ...base, year: 1247 });
  });

  it("sets era only and derives eraShort correctly", async () => {
    const { runtime, writeYear, writeEra } = makeRuntime(base);
    const tool = createSetYearAndEraTool(runtime);
    const result = await tool.execute({ era: "Second Age" });
    expect(result.isError).toBeFalsy();
    expect(writeEra).toHaveBeenCalledWith("Second Age", "SA");
    expect(writeYear).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).current).toEqual({
      ...base,
      era: "Second Age",
      eraShort: "SA",
    });
  });

  it("sets both year and era in one call", async () => {
    const { runtime, writeYear, writeEra } = makeRuntime(base);
    const tool = createSetYearAndEraTool(runtime);
    await tool.execute({ year: 1247, era: "Second Age" });
    expect(writeYear).toHaveBeenCalledWith(1247);
    expect(writeEra).toHaveBeenCalledWith("Second Age", "SA");
  });

  it("errors when neither field is provided", async () => {
    const { runtime, writeYear, writeEra } = makeRuntime(base);
    const tool = createSetYearAndEraTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(writeYear).not.toHaveBeenCalled();
    expect(writeEra).not.toHaveBeenCalled();
  });

  it("accepts an integer-valued string year", async () => {
    const { runtime, writeYear } = makeRuntime(base);
    const tool = createSetYearAndEraTool(runtime);
    const result = await tool.execute({ year: "1247" });
    expect(result.isError).toBeFalsy();
    expect(writeYear).toHaveBeenCalledWith(1247);
  });

  it("rejects bad year inputs", async () => {
    const { runtime, writeYear } = makeRuntime(base);
    const tool = createSetYearAndEraTool(runtime);
    const cases = [
      { year: 12.5 },
      { year: "abc" },
      { year: Number.NaN },
      { year: true },
      { year: "" },
      { year: {} },
    ];
    for (const input of cases) {
      const result = await tool.execute(input);
      expect(result.isError).toBe(true);
    }
    expect(writeYear).not.toHaveBeenCalled();
  });

  it("rejects bad era inputs", async () => {
    const { runtime, writeEra } = makeRuntime(base);
    const tool = createSetYearAndEraTool(runtime);
    const cases = [
      { era: "" },
      { era: "   " },
      { era: 42 },
      { era: null, year: null }, // both null → still error on neither
    ];
    for (const input of cases) {
      const result = await tool.execute(input);
      expect(result.isError).toBe(true);
    }
    expect(writeEra).not.toHaveBeenCalled();
  });

  it("errors when runtime.read returns null (pre-load)", async () => {
    const { runtime, writeYear } = makeRuntime(null);
    const tool = createSetYearAndEraTool(runtime);
    const result = await tool.execute({ year: 1247 });
    expect(result.isError).toBe(true);
    expect(writeYear).not.toHaveBeenCalled();
  });

  it("surfaces runtime write failures as error results", async () => {
    const runtime: WorldDateRuntime = {
      read: () => base,
      writeYear: () => {
        throw new Error("window.options is not available yet.");
      },
      writeEra: () => {},
    };
    const tool = createSetYearAndEraTool(runtime);
    const result = await tool.execute({ year: 1247 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not available/);
  });
});

describe("deriveEraShort", () => {
  it("handles single-word eras", () => {
    expect(deriveEraShort("Modern")).toBe("M");
  });
  it("handles multi-word eras", () => {
    expect(deriveEraShort("Second Age")).toBe("SA");
    expect(deriveEraShort("Bright Era")).toBe("BE");
    expect(deriveEraShort("The Age of Gold")).toBe("TAOG");
  });
  it("collapses extra whitespace", () => {
    expect(deriveEraShort("  Bright   Era  ")).toBe("BE");
  });
  it("returns empty string for empty input", () => {
    expect(deriveEraShort("")).toBe("");
    expect(deriveEraShort("   ")).toBe("");
  });
});
