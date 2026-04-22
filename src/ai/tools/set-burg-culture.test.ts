import { describe, expect, it, vi } from "vitest";
import {
  type BurgCultureRuntime,
  type BurgRef,
  type CultureRef,
  createSetBurgCultureTool,
} from "./set-burg-culture";

interface Fixtures {
  burg?: (ref: number | string) => BurgRef | null;
  culture?: (ref: number | string) => CultureRef | null;
}

function makeRuntime(f: Fixtures = {}) {
  const findBurg = vi.fn<BurgCultureRuntime["findBurg"]>(
    f.burg ?? (() => null),
  );
  const findCulture = vi.fn<BurgCultureRuntime["findCulture"]>(
    f.culture ?? (() => null),
  );
  const setCulture = vi.fn<BurgCultureRuntime["setCulture"]>();
  const runtime: BurgCultureRuntime = { findBurg, findCulture, setCulture };
  return { runtime, findBurg, findCulture, setCulture };
}

describe("set_burg_culture tool", () => {
  it("reassigns by numeric ids", async () => {
    const { runtime, setCulture } = makeRuntime({
      burg: (ref) =>
        ref === 5 ? { i: 5, name: "Stormport", previousCultureId: 1 } : null,
      culture: (ref) => {
        if (ref === 3) return { id: 3, name: "Coastalfolk" };
        if (ref === 1) return { id: 1, name: "Highlanders" };
        return null;
      },
    });
    const tool = createSetBurgCultureTool(runtime);
    const result = await tool.execute({ burg: 5, culture: 3 });
    expect(result.isError).toBeFalsy();
    expect(setCulture).toHaveBeenCalledWith(5, 3);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Stormport",
      previousCulture: { id: 1, name: "Highlanders" },
      culture: { id: 3, name: "Coastalfolk" },
    });
  });

  it("resolves case-insensitive names for both fields", async () => {
    const { runtime, setCulture, findBurg, findCulture } = makeRuntime({
      burg: (ref) =>
        typeof ref === "string" && ref.toLowerCase() === "stormport"
          ? { i: 5, name: "Stormport", previousCultureId: 0 }
          : null,
      culture: (ref) => {
        if (typeof ref === "string" && ref.toLowerCase() === "coastalfolk")
          return { id: 3, name: "Coastalfolk" };
        if (ref === 0) return { id: 0, name: "Wildlands" };
        return null;
      },
    });
    const tool = createSetBurgCultureTool(runtime);
    await tool.execute({ burg: "STORMPORT", culture: "coastalfolk" });
    expect(findBurg).toHaveBeenCalledWith("STORMPORT");
    expect(findCulture).toHaveBeenCalledWith("coastalfolk");
    expect(setCulture).toHaveBeenCalledWith(5, 3);
  });

  it("allows Wildlands (culture 0) as a target", async () => {
    const { runtime, setCulture } = makeRuntime({
      burg: () => ({ i: 5, name: "Stormport", previousCultureId: 1 }),
      culture: (ref) =>
        ref === 0 || ref === "wildlands"
          ? { id: 0, name: "Wildlands" }
          : { id: 1, name: "Highlanders" },
    });
    const tool = createSetBurgCultureTool(runtime);
    await tool.execute({ burg: 5, culture: 0 });
    expect(setCulture).toHaveBeenCalledWith(5, 0);
    setCulture.mockClear();
    await tool.execute({ burg: 5, culture: "wildlands" });
    expect(setCulture).toHaveBeenCalledWith(5, 0);
  });

  it("rejects burg 0 (placeholder)", async () => {
    const { runtime, setCulture } = makeRuntime({
      burg: () => ({ i: 0, name: "Placeholder", previousCultureId: 0 }),
      culture: () => ({ id: 1, name: "x" }),
    });
    const tool = createSetBurgCultureTool(runtime);
    const result = await tool.execute({ burg: 0, culture: 1 });
    expect(result.isError).toBe(true);
    expect(setCulture).not.toHaveBeenCalled();
  });

  it("errors when the burg is unknown", async () => {
    const { runtime, setCulture } = makeRuntime({
      culture: () => ({ id: 1, name: "x" }),
    });
    const tool = createSetBurgCultureTool(runtime);
    const result = await tool.execute({ burg: 999, culture: 1 });
    expect(result.isError).toBe(true);
    expect(setCulture).not.toHaveBeenCalled();
  });

  it("errors when the culture is unknown", async () => {
    const { runtime, setCulture } = makeRuntime({
      burg: () => ({ i: 5, name: "x", previousCultureId: 0 }),
    });
    const tool = createSetBurgCultureTool(runtime);
    const result = await tool.execute({ burg: 5, culture: "nowhere" });
    expect(result.isError).toBe(true);
    expect(setCulture).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime({
      burg: () => ({ i: 5, name: "x", previousCultureId: 0 }),
      culture: () => ({ id: 1, name: "y" }),
    });
    runtime.setCulture = vi.fn(() => {
      throw new Error("customization active");
    });
    const tool = createSetBurgCultureTool(runtime);
    const result = await tool.execute({ burg: 5, culture: 1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/customization/);
  });

  it("rejects invalid ref types", async () => {
    const { runtime, setCulture } = makeRuntime();
    const tool = createSetBurgCultureTool(runtime);
    const cases = [
      { burg: null, culture: 1 },
      { burg: "", culture: 1 },
      { burg: 1.5, culture: 1 },
      { burg: -1, culture: 1 },
      { burg: 1, culture: null },
      { burg: 1, culture: "" },
      { burg: 1, culture: 1.5 },
      { burg: 1, culture: -1 },
    ];
    for (const input of cases) {
      const r = await tool.execute(input);
      expect(r.isError).toBe(true);
    }
    expect(setCulture).not.toHaveBeenCalled();
  });
});
