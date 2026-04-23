import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg } from "./_shared";
import {
  BURG_NAME_MODES,
  createRegenerateBurgNameTool,
  type RegenerateBurgNameRef,
  type RegenerateBurgNameRuntime,
  regenerateBurgNameTool,
  resolveBurgNameMode,
} from "./regenerate-burg-name";

describe("resolveBurgNameMode", () => {
  it("canonicalizes case-insensitively", () => {
    expect(resolveBurgNameMode("Culture")).toBe("culture");
    expect(resolveBurgNameMode("RANDOM")).toBe("random");
  });

  it("returns null for unknown / non-string", () => {
    expect(resolveBurgNameMode("other")).toBeNull();
    expect(resolveBurgNameMode("")).toBeNull();
    expect(resolveBurgNameMode(null)).toBeNull();
  });
});

describe("BURG_NAME_MODES", () => {
  it("has 2 modes", () => {
    expect(BURG_NAME_MODES).toEqual(["culture", "random"]);
  });
});

function makeRuntime(
  find: (ref: number | string) => RegenerateBurgNameRef | null,
  generated = "New Name",
): {
  runtime: RegenerateBurgNameRuntime;
  generate: ReturnType<typeof vi.fn<RegenerateBurgNameRuntime["generate"]>>;
  apply: ReturnType<typeof vi.fn<RegenerateBurgNameRuntime["apply"]>>;
} {
  const generate = vi.fn<RegenerateBurgNameRuntime["generate"]>(
    () => generated,
  );
  const apply = vi.fn<RegenerateBurgNameRuntime["apply"]>();
  return { runtime: { find, generate, apply }, generate, apply };
}

describe("regenerate_burg_name tool", () => {
  it("default mode is culture", async () => {
    const { runtime, generate, apply } = makeRuntime(() => ({
      i: 5,
      name: "OldName",
      culture: 3,
    }));
    const tool = createRegenerateBurgNameTool(runtime);
    const result = await tool.execute({ burg: 5 });
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledWith("culture", 3);
    expect(apply).toHaveBeenCalledWith(5, "New Name");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      previousName: "OldName",
      name: "New Name",
      mode: "culture",
    });
  });

  it("explicit random mode", async () => {
    const { runtime, generate } = makeRuntime(() => ({
      i: 5,
      name: "x",
      culture: 3,
    }));
    const tool = createRegenerateBurgNameTool(runtime);
    await tool.execute({ burg: 5, mode: "RANDOM" });
    expect(generate).toHaveBeenCalledWith("random", 3);
  });

  it("rejects unknown mode", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      culture: 3,
    }));
    const tool = createRegenerateBurgNameTool(runtime);
    const result = await tool.execute({ burg: 5, mode: "other" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid burg refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createRegenerateBurgNameTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ burg: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown burg", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createRegenerateBurgNameTool(runtime);
    const result = await tool.execute({ burg: 999 });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces generator errors", async () => {
    const runtime: RegenerateBurgNameRuntime = {
      find: () => ({ i: 5, name: "x", culture: 3 }),
      generate: vi.fn(() => {
        throw new Error("Names is not available");
      }),
      apply: vi.fn(),
    };
    const tool = createRegenerateBurgNameTool(runtime);
    const result = await tool.execute({ burg: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names/);
  });

  it("rejects empty generator output", async () => {
    const runtime: RegenerateBurgNameRuntime = {
      find: () => ({ i: 5, name: "x", culture: 3 }),
      generate: () => "  ",
      apply: vi.fn(),
    };
    const tool = createRegenerateBurgNameTool(runtime);
    const result = await tool.execute({ burg: 5 });
    expect(result.isError).toBe(true);
  });
});

describe("defaultRegenerateBurgNameRuntime (integration)", () => {
  const getCulture = vi.fn((_culture: number) => "Culture Name");
  const getBase = vi.fn((_base: number) => "Random Name");
  const labelEl = { textContent: "Old" };
  const getElementById = vi.fn((id: string) =>
    id === "burgLabel5" ? labelEl : null,
  );

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNames = (globalThis as { Names?: unknown }).Names;
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalDoc = (globalThis as { document?: unknown }).document;

  beforeEach(() => {
    getCulture.mockReset();
    getCulture.mockReturnValue("Culture Name");
    getBase.mockReset();
    getBase.mockReturnValue("Random Name");
    labelEl.textContent = "Old";
    getElementById.mockClear();
    const burgs: RawBurg[] = [];
    burgs[0] = { i: 0 };
    burgs[5] = { i: 5, name: "Rookhold", culture: 3 };
    (globalThis as { pack?: unknown }).pack = { burgs };
    (globalThis as { Names?: unknown }).Names = { getCulture, getBase };
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "English" },
      { name: "German" },
      { name: "Norse" },
    ];
    (globalThis as { document?: unknown }).document = { getElementById };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Names?: unknown }).Names = originalNames;
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("default culture mode: uses Names.getCulture", async () => {
    const result = await regenerateBurgNameTool.execute({ burg: 5 });
    expect(result.isError).toBeFalsy();
    expect(getCulture).toHaveBeenCalledWith(3);
    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[5]?.name).toBe("Culture Name");
    expect(labelEl.textContent).toBe("Culture Name");
  });

  it("random mode: picks from nameBases", async () => {
    const result = await regenerateBurgNameTool.execute({
      burg: 5,
      mode: "random",
    });
    expect(result.isError).toBeFalsy();
    expect(getBase).toHaveBeenCalled();
    const baseArg = getBase.mock.calls[0]?.[0];
    expect(typeof baseArg).toBe("number");
    expect(baseArg as number).toBeGreaterThanOrEqual(0);
    expect(baseArg as number).toBeLessThan(3);
  });

  it("errors when Names is missing", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const result = await regenerateBurgNameTool.execute({ burg: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names/);
  });

  it("errors when nameBases missing (random mode)", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await regenerateBurgNameTool.execute({
      burg: 5,
      mode: "random",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases/);
  });
});
