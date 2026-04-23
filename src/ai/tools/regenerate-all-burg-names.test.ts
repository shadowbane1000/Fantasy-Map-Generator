import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg } from "./_shared";
import {
  createRegenerateAllBurgNamesTool,
  type RegenerateAllBurgNamesCounts,
  type RegenerateAllBurgNamesRuntime,
  regenerateAllBurgNamesTool,
} from "./regenerate-all-burg-names";

function makeRuntime(
  counts: RegenerateAllBurgNamesCounts = {
    regenerated: 2,
    skippedLocked: 1,
    skippedRemoved: 1,
  },
): {
  runtime: RegenerateAllBurgNamesRuntime;
  regenerate: ReturnType<
    typeof vi.fn<RegenerateAllBurgNamesRuntime["regenerate"]>
  >;
} {
  const regenerate = vi.fn<RegenerateAllBurgNamesRuntime["regenerate"]>(
    () => counts,
  );
  return { runtime: { regenerate }, regenerate };
}

describe("regenerate_all_burg_names tool", () => {
  it("default mode is culture", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateAllBurgNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(regenerate).toHaveBeenCalledWith("culture");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      mode: "culture",
      regenerated: 2,
      skippedLocked: 1,
      skippedRemoved: 1,
    });
  });

  it("explicit random mode", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateAllBurgNamesTool(runtime);
    await tool.execute({ mode: "RANDOM" });
    expect(regenerate).toHaveBeenCalledWith("random");
  });

  it("rejects unknown mode", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateAllBurgNamesTool(runtime);
    const result = await tool.execute({ mode: "other" });
    expect(result.isError).toBe(true);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: RegenerateAllBurgNamesRuntime = {
      regenerate: vi.fn(() => {
        throw new Error("pack.burgs is not available.");
      }),
    };
    const tool = createRegenerateAllBurgNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/burgs/);
  });
});

describe("defaultRegenerateAllBurgNamesRuntime (integration)", () => {
  const getCulture = vi.fn((c: number) => `Culture${c}`);
  const getBase = vi.fn((b: number) => `Base${b}`);

  const labels: Record<string, { textContent: string }> = {};
  const getElementById = vi.fn((id: string) => {
    if (id.startsWith("burgLabel")) {
      if (!labels[id]) labels[id] = { textContent: "" };
      return labels[id];
    }
    return null;
  });

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNames = (globalThis as { Names?: unknown }).Names;
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalDoc = (globalThis as { document?: unknown }).document;

  beforeEach(() => {
    getCulture.mockClear();
    getCulture.mockImplementation((c: number) => `Culture${c}`);
    getBase.mockClear();
    getBase.mockImplementation((b: number) => `Base${b}`);
    for (const k of Object.keys(labels)) delete labels[k];
    getElementById.mockClear();

    const burgs: RawBurg[] = [];
    burgs[0] = { i: 0 };
    burgs[1] = { i: 1, name: "A", culture: 1 };
    burgs[2] = { i: 2, name: "B", culture: 2, lock: true };
    burgs[3] = { i: 3, name: "C", culture: 3, removed: true };
    burgs[4] = { i: 4, name: "D", culture: 4 };
    (globalThis as { pack?: unknown }).pack = { burgs };

    (globalThis as { Names?: unknown }).Names = { getCulture, getBase };
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "E" },
      { name: "F" },
    ];
    (globalThis as { document?: unknown }).document = { getElementById };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Names?: unknown }).Names = originalNames;
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("culture mode: updates only non-locked, non-removed burgs", async () => {
    const result = await regenerateAllBurgNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.regenerated).toBe(2);
    expect(body.skippedLocked).toBe(1);
    expect(body.skippedRemoved).toBe(1);

    const pack = (globalThis as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[1]?.name).toBe("Culture1");
    expect(pack.burgs[2]?.name).toBe("B"); // locked, untouched
    expect(pack.burgs[3]?.name).toBe("C"); // removed, untouched
    expect(pack.burgs[4]?.name).toBe("Culture4");
    expect(labels.burgLabel1?.textContent).toBe("Culture1");
    expect(labels.burgLabel4?.textContent).toBe("Culture4");
  });

  it("random mode: calls getBase, respects lock/remove", async () => {
    const result = await regenerateAllBurgNamesTool.execute({
      mode: "random",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.regenerated).toBe(2);
    expect(getBase).toHaveBeenCalledTimes(2);
    // Verify each call was with an in-range index
    for (const call of getBase.mock.calls) {
      const arg = call[0] as number;
      expect(arg).toBeGreaterThanOrEqual(0);
      expect(arg).toBeLessThan(2);
    }
  });

  it("errors when Names is missing", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const result = await regenerateAllBurgNamesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Names/);
  });

  it("errors when nameBases missing in random mode", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await regenerateAllBurgNamesTool.execute({
      mode: "random",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/nameBases/);
  });
});
