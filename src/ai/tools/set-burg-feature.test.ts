import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg } from "./_shared";
import {
  BURG_FEATURES,
  type BurgFeature,
  type BurgFeatureRef,
  type BurgFeatureRuntime,
  createSetBurgFeatureTool,
  resolveBurgFeature,
  setBurgFeatureTool,
} from "./set-burg-feature";

function makeRuntime(
  find: (ref: number | string, feature: BurgFeature) => BurgFeatureRef | null,
): {
  runtime: BurgFeatureRuntime;
  apply: ReturnType<typeof vi.fn<BurgFeatureRuntime["apply"]>>;
} {
  const apply = vi.fn<BurgFeatureRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("resolveBurgFeature", () => {
  it("canonicalizes known features case-insensitively", () => {
    expect(resolveBurgFeature("Citadel")).toBe("citadel");
    expect(resolveBurgFeature("WALLS")).toBe("walls");
    expect(resolveBurgFeature("plaza")).toBe("plaza");
    expect(resolveBurgFeature("Temple")).toBe("temple");
    expect(resolveBurgFeature("shanty")).toBe("shanty");
  });

  it("accepts common synonyms", () => {
    expect(resolveBurgFeature("castle")).toBe("citadel");
    expect(resolveBurgFeature("wall")).toBe("walls");
    expect(resolveBurgFeature("square")).toBe("plaza");
    expect(resolveBurgFeature("shrine")).toBe("temple");
    expect(resolveBurgFeature("shantytown")).toBe("shanty");
  });

  it("rejects port and capital", () => {
    expect(resolveBurgFeature("port")).toBeNull();
    expect(resolveBurgFeature("capital")).toBeNull();
  });

  it("rejects unknown / non-strings", () => {
    expect(resolveBurgFeature("moat")).toBeNull();
    expect(resolveBurgFeature(42)).toBeNull();
    expect(resolveBurgFeature("")).toBeNull();
    expect(resolveBurgFeature(null)).toBeNull();
  });
});

describe("BURG_FEATURES", () => {
  it("exposes the five supported flags in a stable order", () => {
    expect([...BURG_FEATURES]).toEqual([
      "citadel",
      "walls",
      "plaza",
      "temple",
      "shanty",
    ]);
  });
});

describe("set_burg_feature tool", () => {
  it("enables citadel on a burg by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref, feature) =>
      ref === 3 && feature === "citadel"
        ? {
            i: 3,
            name: "Rookhold",
            feature: "citadel",
            previousEnabled: false,
          }
        : null,
    );
    const tool = createSetBurgFeatureTool(runtime);
    const result = await tool.execute({
      burg: 3,
      feature: "citadel",
      enabled: true,
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(3, "citadel", true);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 3,
      name: "Rookhold",
      feature: "citadel",
      enabled: true,
      previousEnabled: false,
      noop: false,
    });
  });

  it("resolves burg by case-insensitive name and feature synonym", async () => {
    const find = vi.fn<BurgFeatureRuntime["find"]>((ref, feature) =>
      typeof ref === "string" && ref.toLowerCase() === "rookhold"
        ? { i: 3, name: "Rookhold", feature, previousEnabled: false }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetBurgFeatureTool(runtime);
    await tool.execute({ burg: "ROOKHOLD", feature: "Wall", enabled: true });
    expect(find).toHaveBeenCalledWith("ROOKHOLD", "walls");
    expect(apply).toHaveBeenCalledWith(3, "walls", true);
  });

  it("disables a feature", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      feature: "temple",
      previousEnabled: true,
    }));
    const tool = createSetBurgFeatureTool(runtime);
    await tool.execute({ burg: 1, feature: "temple", enabled: false });
    expect(apply).toHaveBeenCalledWith(1, "temple", false);
  });

  it("is a noop when already at the requested state", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      feature: "walls",
      previousEnabled: true,
    }));
    const tool = createSetBurgFeatureTool(runtime);
    const result = await tool.execute({
      burg: 1,
      feature: "walls",
      enabled: true,
    });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("rejects unknown feature", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      feature: "walls",
      previousEnabled: false,
    }));
    const tool = createSetBurgFeatureTool(runtime);
    const result = await tool.execute({
      burg: 1,
      feature: "moat",
      enabled: true,
    });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects port and capital with a helpful message", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      feature: "walls",
      previousEnabled: false,
    }));
    const tool = createSetBurgFeatureTool(runtime);
    for (const bad of ["port", "capital"]) {
      const result = await tool.execute({
        burg: 1,
        feature: bad,
        enabled: true,
      });
      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content);
      expect(body.error).toMatch(/port.*capital|capital.*port/);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown burg", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBurgFeatureTool(runtime);
    const result = await tool.execute({
      burg: 999,
      feature: "walls",
      enabled: true,
    });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid burg refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBurgFeatureTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({
        burg: bad,
        feature: "walls",
        enabled: true,
      });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-boolean enabled", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      feature: "walls",
      previousEnabled: false,
    }));
    const tool = createSetBurgFeatureTool(runtime);
    for (const bad of ["yes", 1, 0, null, undefined]) {
      const r = await tool.execute({
        burg: 1,
        feature: "walls",
        enabled: bad,
      });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: BurgFeatureRuntime = {
      find: () => ({
        i: 1,
        name: "x",
        feature: "walls",
        previousEnabled: false,
      }),
      apply: vi.fn(() => {
        throw new Error("Burg 1 has been removed.");
      }),
    };
    const tool = createSetBurgFeatureTool(runtime);
    const result = await tool.execute({
      burg: 1,
      feature: "walls",
      enabled: true,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/removed/);
  });
});

describe("defaultBurgFeatureRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      burgs: [
        { i: 0, name: "" },
        { i: 1, name: "Rookhold" },
        { i: 2, name: "Ashholm", walls: 1, temple: 1 },
        { i: 3, name: "Gone", removed: true },
      ] satisfies RawBurg[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("enables a feature (writes 1)", async () => {
    const result = await setBurgFeatureTool.execute({
      burg: 1,
      feature: "citadel",
      enabled: true,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[1]?.citadel).toBe(1);
  });

  it("disables a feature (writes 0)", async () => {
    const result = await setBurgFeatureTool.execute({
      burg: 2,
      feature: "walls",
      enabled: false,
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[2]?.walls).toBe(0);
  });

  it("is a noop when already enabled", async () => {
    const result = await setBurgFeatureTool.execute({
      burg: 2,
      feature: "temple",
      enabled: true,
    });
    expect(JSON.parse(result.content).noop).toBe(true);
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[2]?.temple).toBe(1);
  });

  it("refuses burg 0 (placeholder)", async () => {
    const result = await setBurgFeatureTool.execute({
      burg: 0,
      feature: "walls",
      enabled: true,
    });
    expect(result.isError).toBe(true);
  });

  it("refuses a removed burg", async () => {
    const result = await setBurgFeatureTool.execute({
      burg: 3,
      feature: "walls",
      enabled: true,
    });
    expect(result.isError).toBe(true);
  });

  it("resolves by case-insensitive name", async () => {
    await setBurgFeatureTool.execute({
      burg: "rookhold",
      feature: "plaza",
      enabled: true,
    });
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[1]?.plaza).toBe(1);
  });
});
