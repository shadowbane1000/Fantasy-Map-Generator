import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg, RawCulture } from "./_shared";
import { ToolRegistry } from "./index";
import {
  createRegenerateCultureBurgsTool,
  type RegenerateCultureBurgsBurgRef,
  type RegenerateCultureBurgsCultureRef,
  type RegenerateCultureBurgsRuntime,
  regenerateCultureBurgsTool,
} from "./regenerate-culture-burgs";

interface Fixtures {
  culture?: (ref: number | string) => RegenerateCultureBurgsCultureRef | null;
  hasNamesbase?: (base: number) => boolean;
  burgs?: (cultureId: number) => RegenerateCultureBurgsBurgRef[];
  generate?: (cultureId: number) => string;
  apply?: (burgId: number, name: string) => void;
}

function makeRuntime(f: Fixtures = {}) {
  const findCulture = vi.fn<RegenerateCultureBurgsRuntime["findCulture"]>(
    f.culture ?? (() => null),
  );
  const hasNamesbase = vi.fn<RegenerateCultureBurgsRuntime["hasNamesbase"]>(
    f.hasNamesbase ?? (() => true),
  );
  const listBurgsForCulture = vi.fn<
    RegenerateCultureBurgsRuntime["listBurgsForCulture"]
  >(f.burgs ?? (() => []));
  const generate = vi.fn<RegenerateCultureBurgsRuntime["generate"]>(
    f.generate ?? (() => "GeneratedName"),
  );
  const apply = vi.fn<RegenerateCultureBurgsRuntime["apply"]>(
    f.apply ?? (() => {}),
  );
  const runtime: RegenerateCultureBurgsRuntime = {
    findCulture,
    hasNamesbase,
    listBurgsForCulture,
    generate,
    apply,
  };
  return {
    runtime,
    findCulture,
    hasNamesbase,
    listBurgsForCulture,
    generate,
    apply,
  };
}

describe("regenerate_culture_burgs tool", () => {
  it("happy path: 3 active, 1 locked, 1 removed → 3 renamed; locked/removed counted; previous_name captured", async () => {
    const sequence = ["New1", "New2", "New3"];
    let callIdx = 0;
    const { runtime, generate, apply } = makeRuntime({
      culture: (ref) => (ref === 3 ? { i: 3, name: "Elvish", base: 5 } : null),
      hasNamesbase: (b) => b === 5,
      burgs: (id) =>
        id === 3
          ? [
              { i: 11, name: "Old1" },
              { i: 12, name: "Locked1", lock: true },
              { i: 13, name: "Old2" },
              { i: 14, name: "Removed1", removed: true },
              { i: 15, name: "Old3" },
            ]
          : [],
      generate: () => sequence[callIdx++] ?? "FallbackName",
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledTimes(3);
    for (const call of generate.mock.calls) expect(call[0]).toBe(3);
    expect(apply.mock.calls).toEqual([
      [11, "New1"],
      [13, "New2"],
      [15, "New3"],
    ]);
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      culture: { i: 3, name: "Elvish" },
      namesbase: 5,
      renamed_count: 3,
      skipped_locked: 1,
      skipped_removed: 1,
      renamed: [
        { i: 11, previous_name: "Old1", name: "New1" },
        { i: 13, previous_name: "Old2", name: "New2" },
        { i: 15, previous_name: "Old3", name: "New3" },
      ],
    });
    expect("renamed_truncated" in body).toBe(false);
  });

  it("resolves culture by case-insensitive name", async () => {
    const { runtime, findCulture, apply } = makeRuntime({
      culture: (ref) =>
        ref === 3 || (typeof ref === "string" && ref.toLowerCase() === "elvish")
          ? { i: 3, name: "Elvish", base: 5 }
          : null,
      burgs: () => [{ i: 11, name: "Old" }],
      generate: () => "New",
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: "ELVISH" });
    expect(result.isError).toBeFalsy();
    expect(findCulture).toHaveBeenCalledWith("ELVISH");
    expect(apply).toHaveBeenCalledWith(11, "New");
  });

  it("resolves culture by id", async () => {
    const { runtime, findCulture } = makeRuntime({
      culture: (ref) => (ref === 3 ? { i: 3, name: "Elvish", base: 5 } : null),
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    await tool.execute({ culture: 3 });
    expect(findCulture).toHaveBeenCalledWith(3);
  });

  it("culture 0 (Wildlands) accepted when namesbase exists", async () => {
    const { runtime } = makeRuntime({
      culture: (ref) =>
        ref === 0 ? { i: 0, name: "Wildlands", base: 0 } : null,
      hasNamesbase: (b) => b === 0,
      burgs: () => [],
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      culture: { i: 0, name: "Wildlands" },
      namesbase: 0,
      renamed_count: 0,
      skipped_locked: 0,
      skipped_removed: 0,
      renamed: [],
    });
  });

  it("culture not found → error, no apply", async () => {
    const { runtime, apply } = makeRuntime({ culture: () => null });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 99 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/Culture 99 not found/);
    expect(apply).not.toHaveBeenCalled();
  });

  it("removed culture rejected", async () => {
    const { runtime, apply } = makeRuntime({
      culture: (ref) =>
        ref === 3 ? { i: 3, name: "X", base: 5, removed: true } : null,
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Cannot regenerate burgs for removed culture 3/,
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("namesbase missing → error, no apply or generate", async () => {
    const { runtime, apply, generate } = makeRuntime({
      culture: (ref) => (ref === 3 ? { i: 3, name: "X", base: 7 } : null),
      hasNamesbase: () => false,
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Namesbase 7 is not defined/,
    );
    expect(apply).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("culture has no base (base: null) → error; hasNamesbase / generate / apply never called", async () => {
    const { runtime, apply, generate, hasNamesbase } = makeRuntime({
      culture: (ref) => (ref === 3 ? { i: 3, name: "X", base: null } : null),
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Namesbase \(unset\) is not defined/,
    );
    expect(hasNamesbase).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("missing pack.burgs → error, no apply", async () => {
    const { runtime, apply } = makeRuntime({
      culture: (ref) => (ref === 3 ? { i: 3, name: "X", base: 5 } : null),
      burgs: () => {
        throw new Error(
          "window.pack.burgs is not available; the map hasn't finished loading.",
        );
      },
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.pack.burgs is not available; the map hasn't finished loading.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("missing Names.getCulture → error from generate, no apply", async () => {
    const { runtime, apply } = makeRuntime({
      culture: (ref) => (ref === 3 ? { i: 3, name: "X", base: 5 } : null),
      burgs: () => [{ i: 11, name: "Old" }],
      generate: () => {
        throw new Error(
          "Names.getCulture is not available; the map hasn't finished loading.",
        );
      },
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Names.getCulture is not available; the map hasn't finished loading.",
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("culture with no burgs → ok with zero counts", async () => {
    const { runtime, generate, apply } = makeRuntime({
      culture: (ref) => (ref === 3 ? { i: 3, name: "Empty", base: 5 } : null),
      burgs: () => [],
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      culture: { i: 3, name: "Empty" },
      namesbase: 5,
      renamed_count: 0,
      skipped_locked: 0,
      skipped_removed: 0,
      renamed: [],
    });
    expect(generate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("locked burgs are NOT touched (verify .name unchanged after the call)", async () => {
    const burgsList: Array<{
      i: number;
      name: string;
      lock?: boolean;
      removed?: boolean;
    }> = [
      { i: 1, name: "Free" },
      { i: 2, name: "Stuck", lock: true },
    ];
    const { runtime, apply } = makeRuntime({
      culture: (ref) => (ref === 3 ? { i: 3, name: "X", base: 5 } : null),
      burgs: () =>
        burgsList.map((b) => ({ i: b.i, name: b.name, lock: b.lock })),
      generate: () => "Generated",
      apply: (i, name) => {
        const b = burgsList.find((x) => x.i === i);
        if (b) b.name = name;
      },
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed_count).toBe(1);
    expect(body.skipped_locked).toBe(1);
    // Read AFTER the call — load-bearing locked-untouched check.
    expect(burgsList[0]?.name).toBe("Generated");
    expect(burgsList[1]?.name).toBe("Stuck");
    // apply must never have been called for the locked burg.
    const applyForLocked = apply.mock.calls.find((c) => c[0] === 2);
    expect(applyForLocked).toBeUndefined();
  });

  it("generate throws on second burg → error, first burg's mutation preserved", async () => {
    let call = 0;
    const { runtime, apply } = makeRuntime({
      culture: (ref) => (ref === 3 ? { i: 3, name: "X", base: 5 } : null),
      burgs: () => [
        { i: 11, name: "A" },
        { i: 12, name: "B" },
        { i: 13, name: "C" },
      ],
      generate: () => {
        call++;
        if (call === 2) throw new Error("boom");
        return `Name${call}`;
      },
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/boom/);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]).toEqual([11, "Name1"]);
  });

  it("generate returns empty string → error, no apply for that burg", async () => {
    const { runtime, apply } = makeRuntime({
      culture: (ref) => (ref === 3 ? { i: 3, name: "X", base: 5 } : null),
      burgs: () => [{ i: 11, name: "Only" }],
      generate: () => "   ",
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/empty/i);
    expect(apply).not.toHaveBeenCalled();
  });

  it("apply throws → error, prior iterations preserved", async () => {
    let applyCall = 0;
    const { runtime, apply } = makeRuntime({
      culture: (ref) => (ref === 3 ? { i: 3, name: "X", base: 5 } : null),
      burgs: () => [
        { i: 11, name: "A" },
        { i: 12, name: "B" },
      ],
      generate: () => "GenName",
      apply: () => {
        applyCall++;
        if (applyCall === 2) throw new Error("apply-boom");
      },
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/apply-boom/);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[0]).toEqual([11, "GenName"]);
    expect(apply.mock.calls[1]).toEqual([12, "GenName"]);
  });

  it("renamed-list cap at 50 (truncation case)", async () => {
    const allBurgs: RegenerateCultureBurgsBurgRef[] = Array.from(
      { length: 60 },
      (_, idx) => ({ i: idx + 100, name: `Old${idx}` }),
    );
    let call = 0;
    const { runtime } = makeRuntime({
      culture: (ref) => (ref === 3 ? { i: 3, name: "Big", base: 5 } : null),
      burgs: () => allBurgs,
      generate: () => `N${call++}`,
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed_count).toBe(60);
    expect(body.renamed).toHaveLength(50);
    expect(body.renamed_truncated).toBe(true);
  });

  it("no truncated flag when renamed_count <= 50", async () => {
    const allBurgs: RegenerateCultureBurgsBurgRef[] = Array.from(
      { length: 30 },
      (_, idx) => ({ i: idx + 100, name: `Old${idx}` }),
    );
    let call = 0;
    const { runtime } = makeRuntime({
      culture: (ref) => (ref === 3 ? { i: 3, name: "Mid", base: 5 } : null),
      burgs: () => allBurgs,
      generate: () => `N${call++}`,
    });
    const tool = createRegenerateCultureBurgsTool(runtime);
    const result = await tool.execute({ culture: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed_count).toBe(30);
    expect(body.renamed).toHaveLength(30);
    expect("renamed_truncated" in body).toBe(false);
  });

  it("invalid input shapes rejected; findCulture never called", async () => {
    const { runtime, findCulture } = makeRuntime();
    const tool = createRegenerateCultureBurgsTool(runtime);
    const cases: unknown[] = [
      {},
      { culture: null },
      { culture: "" },
      { culture: 1.5 },
      { culture: -1 },
      { culture: [] },
    ];
    for (const input of cases) {
      const r = await tool.execute(input);
      expect(r.isError).toBe(true);
    }
    expect(findCulture).not.toHaveBeenCalled();
  });

  it("registers under name 'regenerate_culture_burgs' and round-trips through registry", async () => {
    expect(regenerateCultureBurgsTool.name).toBe("regenerate_culture_burgs");
    const schema = regenerateCultureBurgsTool.input_schema as {
      required?: string[];
    };
    expect(schema.required).toEqual(["culture"]);
    const reg = new ToolRegistry();
    reg.register(regenerateCultureBurgsTool);
    expect(reg.list().map((t) => t.name)).toContain("regenerate_culture_burgs");
  });
});

describe("defaultRegenerateCultureBurgsRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalNames = (globalThis as { Names?: unknown }).Names;
  const originalNameBases = (globalThis as { nameBases?: unknown }).nameBases;
  const originalDoc = (globalThis as { document?: unknown }).document;

  let cultures: RawCulture[];
  let burgs: RawBurg[];
  let labelMap: Record<string, { textContent: string }>;
  let getElementById: ReturnType<typeof vi.fn>;
  let getCulture: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cultures = [];
    cultures[0] = { i: 0, name: "Wildlands", base: 0 };
    cultures[1] = { i: 1, name: "Highlanders", base: 1 };
    cultures[3] = { i: 3, name: "Elvish", base: 5 };

    burgs = [];
    burgs[0] = { i: 0 };
    burgs[10] = { i: 10, name: "OldA", culture: 3 };
    burgs[11] = { i: 11, name: "OldB", culture: 3 };
    burgs[12] = { i: 12, name: "OldC", culture: 3 };
    burgs[13] = { i: 13, name: "Locked", culture: 3, lock: true };
    burgs[14] = { i: 14, name: "Gone", culture: 3, removed: true };
    burgs[20] = { i: 20, name: "Other", culture: 1 };

    labelMap = {
      burgLabel10: { textContent: "" },
      burgLabel11: { textContent: "" },
      burgLabel12: { textContent: "" },
    };
    getElementById = vi.fn((id: string) => labelMap[id] ?? null);
    getCulture = vi.fn((c: number) => `GenName${c}`);

    (globalThis as { pack?: unknown }).pack = { cultures, burgs };
    (globalThis as { Names?: unknown }).Names = { getCulture };
    (globalThis as { nameBases?: unknown }).nameBases = [
      {},
      {},
      {},
      {},
      {},
      { name: "Elvish" },
    ];
    (globalThis as { document?: unknown }).document = { getElementById };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Names?: unknown }).Names = originalNames;
    (globalThis as { nameBases?: unknown }).nameBases = originalNameBases;
    (globalThis as { document?: unknown }).document = originalDoc;
  });

  it("end-to-end: renames active burgs of culture 3, leaves locked/removed/other-culture untouched", async () => {
    const result = await regenerateCultureBurgsTool.execute({ culture: 3 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed_count).toBe(3);
    expect(body.skipped_locked).toBe(1);
    expect(body.skipped_removed).toBe(1);

    expect(burgs[10]?.name).toBe("GenName3");
    expect(burgs[11]?.name).toBe("GenName3");
    expect(burgs[12]?.name).toBe("GenName3");
    expect(burgs[13]?.name).toBe("Locked");
    expect(burgs[14]?.name).toBe("Gone");
    expect(burgs[20]?.name).toBe("Other");

    expect(getCulture).toHaveBeenCalledTimes(3);
    for (const call of getCulture.mock.calls) expect(call[0]).toBe(3);

    expect(labelMap.burgLabel10?.textContent).toBe("GenName3");
    expect(labelMap.burgLabel11?.textContent).toBe("GenName3");
    expect(labelMap.burgLabel12?.textContent).toBe("GenName3");
  });

  it("missing nameBases → 'Namesbase X is not defined' error", async () => {
    (globalThis as { nameBases?: unknown }).nameBases = undefined;
    const result = await regenerateCultureBurgsTool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Namesbase 5 is not defined/,
    );
  });

  it("missing pack → 'Culture not found' error", async () => {
    (globalThis as { pack?: unknown }).pack = undefined;
    const result = await regenerateCultureBurgsTool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not found/);
  });

  it("pack present but pack.burgs missing → 'pack.burgs is not available' error", async () => {
    (globalThis as { pack?: unknown }).pack = { cultures };
    const result = await regenerateCultureBurgsTool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /window\.pack\.burgs is not available/,
    );
  });

  it("missing Names global → 'Names.getCulture is not available' error from generate", async () => {
    (globalThis as { Names?: unknown }).Names = undefined;
    const result = await regenerateCultureBurgsTool.execute({ culture: 3 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /Names\.getCulture is not available/,
    );
    // First burg's name unchanged because failure happens on first burg.
    expect(burgs[10]?.name).toBe("OldA");
  });

  it("Wildlands (culture 0) is resolvable when its base is valid; works with id 0 and 'wildlands'", async () => {
    burgs[7] = { i: 7, name: "OldWild", culture: 0 };
    (globalThis as { nameBases?: unknown }).nameBases = [
      { name: "Generic" },
      {},
      {},
      {},
      {},
      { name: "Elvish" },
    ];

    let result = await regenerateCultureBurgsTool.execute({ culture: 0 });
    expect(result.isError).toBeFalsy();
    let body = JSON.parse(result.content);
    expect(body.renamed_count).toBe(1);
    expect(burgs[7]?.name).toBe("GenName0");

    burgs[7].name = "OldWild";
    result = await regenerateCultureBurgsTool.execute({ culture: "wildlands" });
    expect(result.isError).toBeFalsy();
    body = JSON.parse(result.content);
    expect(body.renamed_count).toBe(1);
    expect(burgs[7]?.name).toBe("GenName0");
  });
});
