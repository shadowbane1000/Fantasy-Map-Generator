import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawReligion } from "./_shared";
import {
  createRegenerateReligionNamesTool,
  type RegenerateReligionNamesReligionRef,
  type RegenerateReligionNamesRuntime,
  regenerateReligionNamesTool,
} from "./regenerate-religion-names";

function makeRuntime(
  religions: RegenerateReligionNamesReligionRef[],
  generated: (ref: RegenerateReligionNamesReligionRef) => string = (ref) =>
    `Name${ref.center ?? ref.i}`,
): {
  runtime: RegenerateReligionNamesRuntime;
  list: ReturnType<typeof vi.fn<RegenerateReligionNamesRuntime["list"]>>;
  generate: ReturnType<
    typeof vi.fn<RegenerateReligionNamesRuntime["generate"]>
  >;
  apply: ReturnType<typeof vi.fn<RegenerateReligionNamesRuntime["apply"]>>;
  redraw: ReturnType<typeof vi.fn<RegenerateReligionNamesRuntime["redraw"]>>;
} {
  const list = vi.fn<RegenerateReligionNamesRuntime["list"]>(() => religions);
  const generate = vi.fn<RegenerateReligionNamesRuntime["generate"]>(generated);
  const apply = vi.fn<RegenerateReligionNamesRuntime["apply"]>();
  const redraw = vi.fn<RegenerateReligionNamesRuntime["redraw"]>();
  return {
    runtime: { list, generate, apply, redraw },
    list,
    generate,
    apply,
    redraw,
  };
}

function ref(
  overrides: Partial<RegenerateReligionNamesReligionRef> & { i: number },
): RegenerateReligionNamesReligionRef {
  return {
    name: `R${overrides.i}`,
    type: "Folk",
    form: "Shamanism",
    deity: null,
    center: overrides.i * 10,
    ...overrides,
  };
}

describe("regenerate_religion_names tool", () => {
  it("skips placeholder/locked/removed, renames the rest", async () => {
    const { runtime, generate, apply, redraw } = makeRuntime([
      ref({ i: 0, name: "No religion", type: null, form: null, center: null }),
      ref({ i: 1, name: "Old Faith" }),
      ref({ i: 2, name: "Sun Cult", lock: true }),
      ref({ i: 3, name: "Gone", removed: true }),
      ref({ i: 4, name: "Starworship" }),
    ]);
    const tool = createRegenerateReligionNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledWith(1, "Name10");
    expect(apply).toHaveBeenCalledWith(4, "Name40");
    expect(redraw).toHaveBeenCalledTimes(1);

    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.renamed).toEqual([
      { i: 1, previousName: "Old Faith", name: "Name10" },
      { i: 4, previousName: "Starworship", name: "Name40" },
    ]);
    expect(body.skipped).toEqual([
      { i: 0, name: "No religion", reason: "placeholder" },
      { i: 2, name: "Sun Cult", reason: "locked" },
      { i: 3, name: "Gone", reason: "removed" },
    ]);
  });

  it("skips religions missing required generator inputs", async () => {
    const { runtime, generate, apply, redraw } = makeRuntime([
      ref({ i: 1, name: "NoType", type: null }),
      ref({ i: 2, name: "NoForm", form: null }),
      ref({ i: 3, name: "NoCenter", center: null }),
      ref({ i: 4, name: "Fine" }),
    ]);
    const tool = createRegenerateReligionNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(4, "Name40");
    expect(redraw).toHaveBeenCalledTimes(1);

    const body = JSON.parse(result.content);
    expect(body.skipped).toEqual([
      { i: 1, name: "NoType", reason: "missing type" },
      { i: 2, name: "NoForm", reason: "missing form" },
      { i: 3, name: "NoCenter", reason: "missing center" },
    ]);
    expect(body.renamed).toEqual([
      { i: 4, previousName: "Fine", name: "Name40" },
    ]);
  });

  it("generator errors go to skipped; loop continues; redraw still called once", async () => {
    let call = 0;
    const { runtime, apply, redraw } = makeRuntime(
      [
        ref({ i: 1, name: "A" }),
        ref({ i: 2, name: "B" }),
        ref({ i: 3, name: "C" }),
      ],
      (r) => {
        call++;
        if (call === 2) throw new Error("boom");
        return `Name${r.i}`;
      },
    );
    const tool = createRegenerateReligionNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledWith(1, "Name1");
    expect(apply).toHaveBeenCalledWith(3, "Name3");
    expect(redraw).toHaveBeenCalledTimes(1);

    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(2);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0]).toEqual({
      i: 2,
      name: "B",
      reason: expect.stringMatching(/generate failed: boom/),
    });
  });

  it("empty generator output is skipped", async () => {
    const { runtime, apply, redraw } = makeRuntime(
      [ref({ i: 1, name: "A" })],
      () => "   ",
    );
    const tool = createRegenerateReligionNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(redraw).toHaveBeenCalledTimes(1);
    const body = JSON.parse(result.content);
    expect(body.skipped[0].reason).toMatch(/empty/);
  });

  it("apply errors go to skipped and loop continues", async () => {
    const { runtime, apply, redraw } = makeRuntime([
      ref({ i: 1, name: "A" }),
      ref({ i: 2, name: "B" }),
    ]);
    let applyCall = 0;
    apply.mockImplementation(() => {
      applyCall++;
      if (applyCall === 1) throw new Error("apply-boom");
    });
    const tool = createRegenerateReligionNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(redraw).toHaveBeenCalledTimes(1);
    const body = JSON.parse(result.content);
    expect(body.renamed).toEqual([{ i: 2, previousName: "B", name: "Name20" }]);
    expect(body.skipped).toEqual([
      {
        i: 1,
        name: "A",
        reason: expect.stringMatching(/apply failed: apply-boom/),
      },
    ]);
  });

  it("list-throws returns errorResult and never calls redraw", async () => {
    const runtime: RegenerateReligionNamesRuntime = {
      list: vi.fn(() => {
        throw new Error("pack.religions is not available.");
      }),
      generate: vi.fn(),
      apply: vi.fn(),
      redraw: vi.fn(),
    };
    const tool = createRegenerateReligionNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/religions/);
    expect(runtime.redraw).not.toHaveBeenCalled();
  });

  it("redraw failure is swallowed (renames still returned)", async () => {
    const { runtime, redraw } = makeRuntime([ref({ i: 1, name: "A" })]);
    redraw.mockImplementation(() => {
      throw new Error("no d3 yet");
    });
    const tool = createRegenerateReligionNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(1);
  });
});

describe("defaultRegenerateReligionNamesRuntime (integration)", () => {
  const generateReligionName = vi.fn(
    (_variety: string, _form: string, _deity: string, center: number) =>
      [`Gen${center}`, "global"] as [string, string],
  );
  const drawReligions = vi.fn();

  const originalPack = (globalThis as { pack?: unknown }).pack;
  const originalReligions = (globalThis as { Religions?: unknown }).Religions;
  const originalDraw = (globalThis as { drawReligions?: unknown })
    .drawReligions;

  beforeEach(() => {
    generateReligionName.mockReset();
    generateReligionName.mockImplementation(
      (_v: string, _f: string, _d: string, center: number) =>
        [`Gen${center}`, "global"] as [string, string],
    );
    drawReligions.mockReset();

    const religions: RawReligion[] = [];
    religions[0] = { i: 0, name: "No religion" };
    religions[1] = {
      i: 1,
      name: "Old Faith",
      type: "Folk",
      form: "Shamanism",
      deity: "Sky, The Bright One",
      center: 10,
    };
    religions[2] = {
      i: 2,
      name: "Sun Cult",
      type: "Cult",
      form: "Cult",
      deity: "Solus",
      center: 20,
      lock: true,
    };
    religions[3] = {
      i: 3,
      name: "Gone",
      type: "Folk",
      form: "Shamanism",
      center: 30,
      removed: true,
    };
    religions[4] = {
      i: 4,
      name: "Starworship",
      type: "Organized",
      form: "Polytheism",
      deity: null,
      center: 40,
    };

    (globalThis as { pack?: unknown }).pack = { religions };
    (globalThis as { Religions?: unknown }).Religions = {
      generateReligionName,
    };
    (globalThis as { drawReligions?: unknown }).drawReligions = drawReligions;
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
    (globalThis as { Religions?: unknown }).Religions = originalReligions;
    (globalThis as { drawReligions?: unknown }).drawReligions = originalDraw;
  });

  it("renames only non-placeholder, non-locked, non-removed religions", async () => {
    const result = await regenerateReligionNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toEqual([
      { i: 1, previousName: "Old Faith", name: "Gen10" },
      { i: 4, previousName: "Starworship", name: "Gen40" },
    ]);

    const pack = (globalThis as { pack: { religions: RawReligion[] } }).pack;
    expect(pack.religions[0]?.name).toBe("No religion");
    expect(pack.religions[1]?.name).toBe("Gen10");
    expect(pack.religions[2]?.name).toBe("Sun Cult"); // locked, untouched
    expect(pack.religions[3]?.name).toBe("Gone"); // removed, untouched
    expect(pack.religions[4]?.name).toBe("Gen40");

    expect(generateReligionName).toHaveBeenCalledTimes(2);
    expect(generateReligionName).toHaveBeenCalledWith(
      "Folk",
      "Shamanism",
      "Sky, The Bright One",
      10,
    );
    // deity: null should be passed as ""
    expect(generateReligionName).toHaveBeenCalledWith(
      "Organized",
      "Polytheism",
      "",
      40,
    );
    expect(drawReligions).toHaveBeenCalledTimes(1);
  });

  it("per-religion generator error when Religions is missing (no throw)", async () => {
    (globalThis as { Religions?: unknown }).Religions = undefined;
    const result = await regenerateReligionNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(0);
    expect(
      body.skipped.filter((s: { reason: string }) =>
        /Religions.generateReligionName is not available/.test(s.reason),
      ),
    ).toHaveLength(2);
  });

  it("skips religion with missing type / form / center", async () => {
    const religions = (globalThis as { pack: { religions: RawReligion[] } })
      .pack.religions;
    religions[1] = { i: 1, name: "Old Faith", center: 10, form: "Shamanism" }; // missing type
    religions[4] = {
      i: 4,
      name: "Starworship",
      type: "Organized",
      center: 40,
    }; // missing form
    const result = await regenerateReligionNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(0);
    expect(body.skipped).toEqual(
      expect.arrayContaining([
        { i: 1, name: "Old Faith", reason: "missing type" },
        { i: 4, name: "Starworship", reason: "missing form" },
      ]),
    );
  });

  it("redraw failure is swallowed", async () => {
    drawReligions.mockImplementation(() => {
      throw new Error("no svg yet");
    });
    const result = await regenerateReligionNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(2);
  });

  it("errors when pack.religions is missing", async () => {
    (globalThis as { pack?: unknown }).pack = {};
    const result = await regenerateReligionNamesTool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/religions/);
  });
});
