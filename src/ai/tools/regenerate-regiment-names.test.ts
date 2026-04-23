import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawRegiment, RawState } from "./_shared";
import {
  createRegenerateRegimentNamesTool,
  type RegenerateRegimentNamesRuntime,
  type RegimentStateBucket,
  regenerateRegimentNamesTool,
} from "./regenerate-regiment-names";

function makeRuntime(
  buckets: RegimentStateBucket[] | null,
  generated: (stateId: number, regI: number) => string = (s, i) => `S${s}R${i}`,
): {
  runtime: RegenerateRegimentNamesRuntime;
  list: ReturnType<typeof vi.fn<RegenerateRegimentNamesRuntime["list"]>>;
  generate: ReturnType<
    typeof vi.fn<RegenerateRegimentNamesRuntime["generate"]>
  >;
  apply: ReturnType<typeof vi.fn<RegenerateRegimentNamesRuntime["apply"]>>;
  redraw: ReturnType<typeof vi.fn<RegenerateRegimentNamesRuntime["redraw"]>>;
} {
  const list = vi.fn<RegenerateRegimentNamesRuntime["list"]>(() => buckets);
  const generate = vi.fn<RegenerateRegimentNamesRuntime["generate"]>(
    (stateId, reg) => generated(stateId, reg.i),
  );
  const apply = vi.fn<RegenerateRegimentNamesRuntime["apply"]>();
  const redraw = vi.fn<RegenerateRegimentNamesRuntime["redraw"]>();
  return {
    runtime: { list, generate, apply, redraw },
    list,
    generate,
    apply,
    redraw,
  };
}

describe("regenerate_regiment_names tool", () => {
  it("default (no state): renames every regiment in every bucket", async () => {
    const { runtime, generate, apply, redraw } = makeRuntime([
      {
        stateId: 1,
        stateName: "Altaria",
        regiments: [
          { i: 0, name: "OldA0", cell: 10, n: 0 },
          { i: 1, name: "OldA1", cell: 11, n: 1 },
        ],
      },
      {
        stateId: 2,
        stateName: "Bardia",
        regiments: [{ i: 0, name: "OldB0", cell: 20, n: 0 }],
      },
    ]);
    const tool = createRegenerateRegimentNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(generate).toHaveBeenCalledTimes(3);
    expect(apply).toHaveBeenCalledWith(1, 0, "S1R0");
    expect(apply).toHaveBeenCalledWith(1, 1, "S1R1");
    expect(apply).toHaveBeenCalledWith(2, 0, "S2R0");
    expect(redraw).toHaveBeenCalledTimes(1);

    const body = JSON.parse(result.content);
    expect(body.ok).toBe(true);
    expect(body.state).toBeNull();
    expect(body.renamed).toEqual([
      { stateI: 1, regimentI: 0, previousName: "OldA0", name: "S1R0" },
      { stateI: 1, regimentI: 1, previousName: "OldA1", name: "S1R1" },
      { stateI: 2, regimentI: 0, previousName: "OldB0", name: "S2R0" },
    ]);
    expect(body.skipped).toEqual([]);
  });

  it("explicit state forwards to runtime.list and echoes resolvedStateId", async () => {
    const { runtime, list } = makeRuntime([
      {
        stateId: 2,
        stateName: "Bardia",
        regiments: [{ i: 0, name: "OldB0", cell: 20, n: 0 }],
      },
    ]);
    const tool = createRegenerateRegimentNamesTool(runtime);
    const result = await tool.execute({ state: "Bardia" });
    expect(list).toHaveBeenCalledWith("Bardia");
    const body = JSON.parse(result.content);
    expect(body.state).toBe(2);
    expect(body.renamed).toHaveLength(1);
  });

  it("rejects malformed state parameter before calling list", async () => {
    const { runtime, list } = makeRuntime([]);
    const tool = createRegenerateRegimentNamesTool(runtime);
    const result = await tool.execute({ state: -1 });
    expect(result.isError).toBe(true);
    expect(list).not.toHaveBeenCalled();
  });

  it("unresolved state ref returns errorResult and skips redraw", async () => {
    const { runtime, redraw, generate } = makeRuntime(null);
    const tool = createRegenerateRegimentNamesTool(runtime);
    const result = await tool.execute({ state: 999 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/999/);
    expect(generate).not.toHaveBeenCalled();
    expect(redraw).not.toHaveBeenCalled();
  });

  it("list throwing returns errorResult and skips redraw", async () => {
    const runtime: RegenerateRegimentNamesRuntime = {
      list: vi.fn(() => {
        throw new Error("pack.states is not available.");
      }),
      generate: vi.fn(),
      apply: vi.fn(),
      redraw: vi.fn(),
    };
    const tool = createRegenerateRegimentNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/states/);
    expect(runtime.redraw).not.toHaveBeenCalled();
  });

  it("generate errors go to skipped; loop continues; redraw still fires once", async () => {
    let call = 0;
    const { runtime, apply, redraw } = makeRuntime(
      [
        {
          stateId: 1,
          stateName: "A",
          regiments: [
            { i: 0, name: "R0", cell: 1, n: 0 },
            { i: 1, name: "R1", cell: 2, n: 0 },
            { i: 2, name: "R2", cell: 3, n: 1 },
          ],
        },
      ],
      (s, i) => {
        call++;
        if (call === 2) throw new Error("boom");
        return `S${s}R${i}`;
      },
    );
    const tool = createRegenerateRegimentNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledWith(1, 0, "S1R0");
    expect(apply).toHaveBeenCalledWith(1, 2, "S1R2");
    expect(redraw).toHaveBeenCalledTimes(1);

    const body = JSON.parse(result.content);
    expect(body.skipped).toEqual([
      {
        stateI: 1,
        regimentI: 1,
        name: "R1",
        reason: expect.stringMatching(/generate failed: boom/),
      },
    ]);
  });

  it("empty generator output is skipped", async () => {
    const { runtime, apply, redraw } = makeRuntime(
      [
        {
          stateId: 1,
          stateName: "A",
          regiments: [{ i: 0, name: "R0", cell: 1, n: 0 }],
        },
      ],
      () => "   ",
    );
    const tool = createRegenerateRegimentNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(redraw).toHaveBeenCalledTimes(1);
    const body = JSON.parse(result.content);
    expect(body.skipped[0].reason).toMatch(/empty/);
  });

  it("apply errors go to skipped and loop continues", async () => {
    const { runtime, apply, redraw } = makeRuntime([
      {
        stateId: 1,
        stateName: "A",
        regiments: [
          { i: 0, name: "R0", cell: 1, n: 0 },
          { i: 1, name: "R1", cell: 2, n: 0 },
        ],
      },
    ]);
    let applyCall = 0;
    apply.mockImplementation(() => {
      applyCall++;
      if (applyCall === 1) throw new Error("apply-boom");
    });
    const tool = createRegenerateRegimentNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    expect(redraw).toHaveBeenCalledTimes(1);
    const body = JSON.parse(result.content);
    expect(body.renamed).toEqual([
      { stateI: 1, regimentI: 1, previousName: "R1", name: "S1R1" },
    ]);
    expect(body.skipped).toEqual([
      {
        stateI: 1,
        regimentI: 0,
        name: "R0",
        reason: expect.stringMatching(/apply failed: apply-boom/),
      },
    ]);
  });

  it("redraw failure is swallowed (renames still returned)", async () => {
    const { runtime, redraw } = makeRuntime([
      {
        stateId: 1,
        stateName: "A",
        regiments: [{ i: 0, name: "R0", cell: 1, n: 0 }],
      },
    ]);
    redraw.mockImplementation(() => {
      throw new Error("no d3 yet");
    });
    const tool = createRegenerateRegimentNamesTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(1);
  });
});

describe("defaultRegenerateRegimentNamesRuntime (integration)", () => {
  const getName = vi.fn(
    (_reg: RawRegiment, _siblings: RawRegiment[]) => "Generated",
  );
  const drawMilitary = vi.fn();

  const originalPack = (globalThis as unknown as { pack?: unknown }).pack;
  const originalMilitary = (globalThis as unknown as { Military?: unknown })
    .Military;
  const originalDraw = (globalThis as unknown as { drawMilitary?: unknown })
    .drawMilitary;

  beforeEach(() => {
    getName.mockReset();
    // Deterministic: "S{state}R{i}{N}" (N=0 land, 1 fleet).
    getName.mockImplementation(
      (reg: RawRegiment, _siblings: RawRegiment[]) =>
        `Gen-${reg.i}-${reg.n ?? 0}`,
    );
    drawMilitary.mockReset();

    const states: RawState[] = [];
    states[0] = { i: 0, name: "Neutrals" };
    states[1] = {
      i: 1,
      name: "Altaria",
      military: [
        { i: 0, name: "OldA0", cell: 10, n: 0 },
        { i: 1, name: "OldA1", cell: 11, n: 1 },
      ],
    };
    states[2] = {
      i: 2,
      name: "Bardia",
      fullName: "Kingdom of Bardia",
      military: [{ i: 0, name: "OldB0", cell: 20, n: 0 }],
    };
    states[3] = { i: 3, name: "Cedria", removed: true, military: [] };

    (globalThis as unknown as { pack?: unknown }).pack = { states };
    (globalThis as unknown as { Military?: unknown }).Military = { getName };
    (globalThis as unknown as { drawMilitary?: unknown }).drawMilitary =
      drawMilitary;
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
    (globalThis as unknown as { Military?: unknown }).Military =
      originalMilitary;
    (globalThis as unknown as { drawMilitary?: unknown }).drawMilitary =
      originalDraw;
  });

  it("all-states: skips Neutrals and removed states, writes regiment.name", async () => {
    const result = await regenerateRegimentNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state).toBeNull();
    expect(body.renamed).toEqual([
      { stateI: 1, regimentI: 0, previousName: "OldA0", name: "Gen-0-0" },
      { stateI: 1, regimentI: 1, previousName: "OldA1", name: "Gen-1-1" },
      { stateI: 2, regimentI: 0, previousName: "OldB0", name: "Gen-0-0" },
    ]);

    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    expect(pack.states[1]?.military?.[0]?.name).toBe("Gen-0-0");
    expect(pack.states[1]?.military?.[1]?.name).toBe("Gen-1-1");
    expect(pack.states[2]?.military?.[0]?.name).toBe("Gen-0-0");

    expect(drawMilitary).toHaveBeenCalledTimes(1);
  });

  it("state filter by numeric id limits to that state", async () => {
    const result = await regenerateRegimentNamesTool.execute({ state: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state).toBe(2);
    expect(body.renamed).toEqual([
      { stateI: 2, regimentI: 0, previousName: "OldB0", name: "Gen-0-0" },
    ]);
    // Altaria untouched.
    const pack = (globalThis as unknown as { pack: { states: RawState[] } })
      .pack;
    expect(pack.states[1]?.military?.[0]?.name).toBe("OldA0");
  });

  it("state filter by case-insensitive fullName works", async () => {
    const result = await regenerateRegimentNamesTool.execute({
      state: "kingdom of bardia",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.state).toBe(2);
    expect(body.renamed).toHaveLength(1);
  });

  it("missing Military.getName routes per-regiment into skipped (no throw)", async () => {
    (globalThis as unknown as { Military?: unknown }).Military = undefined;
    const result = await regenerateRegimentNamesTool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.renamed).toHaveLength(0);
    expect(body.skipped).toHaveLength(3);
    for (const entry of body.skipped) {
      expect(entry.reason).toMatch(/Military.getName is not available/);
    }
  });

  it("unresolved state ref errors out without calling drawMilitary", async () => {
    const result = await regenerateRegimentNamesTool.execute({ state: 999 });
    expect(result.isError).toBe(true);
    expect(drawMilitary).not.toHaveBeenCalled();
  });
});
