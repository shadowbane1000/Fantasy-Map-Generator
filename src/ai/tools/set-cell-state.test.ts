import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg, RawState } from "./_shared";
import { ToolRegistry } from "./index";
import {
  type CellStateRuntime,
  createSetCellStateTool,
  defaultCellStateRuntime,
  setCellStateTool,
} from "./set-cell-state";

const DEFAULT_STATES: RawState[] = [
  { i: 0, name: "Neutrals" },
  { i: 1, name: "Valoria", color: "#3322dd" },
  { i: 2, name: "Aragorn", color: "#22aa44" },
  { i: 3, name: "Mistmark", color: "#ffdd33" },
  { i: 4, name: "Highvale", color: "#888888" },
  { i: 5, name: "Ironholm", color: "#aa4422" },
];

const DEFAULT_BURGS: RawBurg[] = [
  { i: 0, name: "" },
  { i: 1, name: "Bree", cell: 3, state: 2 },
  { i: 2, name: "Eastport", cell: 5, state: 5 },
  { i: 3, name: "Stonewall", cell: 1, state: 2 },
];

type CellArr = ArrayLike<number> & { [i: number]: number; length: number };

interface MakeRuntimeOpts {
  cellStates?: CellArr;
  cellBurgs?: CellArr;
  states?: RawState[] | null;
  burgs?: RawBurg[] | null;
  drawStates?: () => void;
  setCellStateImpl?: (cell: number, state: number) => void;
  setBurgStateImpl?: (burgId: number, state: number) => void;
  getCellStatesOverride?: () => CellArr | null;
  getStatesOverride?: () => RawState[] | null;
  getCellBurgsOverride?: () => CellArr | null;
  getBurgsOverride?: () => RawBurg[] | null;
}

function makeRuntime(opts: MakeRuntimeOpts = {}) {
  const cellStates =
    opts.cellStates ?? new Uint16Array([0, 2, 2, 3, 4, 5, 0, 2]);
  // burg 1 sits in cell 3
  const cellBurgs = opts.cellBurgs ?? new Uint8Array([0, 0, 0, 1, 0, 0, 0, 0]);
  const states =
    opts.states === undefined
      ? DEFAULT_STATES.map((s) => ({ ...s }))
      : opts.states;
  const burgs =
    opts.burgs === undefined
      ? DEFAULT_BURGS.map((b) => ({ ...b }))
      : opts.burgs;

  const setCellState = vi.fn<CellStateRuntime["setCellState"]>(
    opts.setCellStateImpl ??
      ((cell: number, state: number) => {
        cellStates[cell] = state;
      }),
  );
  const setBurgState = vi.fn<CellStateRuntime["setBurgState"]>(
    opts.setBurgStateImpl ??
      ((burgId: number, state: number) => {
        const b = burgs?.[burgId];
        if (b) b.state = state;
      }),
  );
  const drawStates = vi.fn<CellStateRuntime["drawStates"]>(
    opts.drawStates ?? (() => undefined),
  );
  const getCellStates = vi.fn<CellStateRuntime["getCellStates"]>(
    opts.getCellStatesOverride ?? (() => cellStates),
  );
  const getStates = vi.fn<CellStateRuntime["getStates"]>(
    opts.getStatesOverride ?? (() => states),
  );
  const getCellBurgs = vi.fn<CellStateRuntime["getCellBurgs"]>(
    opts.getCellBurgsOverride ?? (() => cellBurgs),
  );
  const getBurgs = vi.fn<CellStateRuntime["getBurgs"]>(
    opts.getBurgsOverride ?? (() => burgs),
  );

  const runtime: CellStateRuntime = {
    getCellStates,
    setCellState,
    getStates,
    getCellBurgs,
    getBurgs,
    setBurgState,
    drawStates,
  };
  return {
    runtime,
    cellStates,
    cellBurgs,
    states,
    burgs,
    setCellState,
    setBurgState,
    drawStates,
    getCellStates,
    getStates,
    getCellBurgs,
    getBurgs,
  };
}

describe("set_cell_state tool (stub runtime)", () => {
  it("writes the state on a happy path with no burg in cell", async () => {
    const { runtime, setCellState, setBurgState, cellStates } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 7, state: 5 });
    expect(result.isError).toBeFalsy();
    expect(setCellState).toHaveBeenCalledWith(7, 5);
    expect(setBurgState).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      cell: 7,
      previous_state: 2,
      previous_state_name: "Aragorn",
      state: 5,
      state_name: "Ironholm",
      burg: null,
      burg_name: null,
      burg_previous_state: null,
    });
    expect(cellStates[7]).toBe(5);
  });

  it("updates burg.state when the cell holds a burg", async () => {
    const { runtime, setCellState, setBurgState, cellStates, burgs } =
      makeRuntime();
    // cell 3 holds burg 1, both at state 2
    expect(cellStates[3]).toBe(3);
    // adjust fixture so cell 3 is currently state 2 (matches burg 1)
    cellStates[3] = 2;
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 3, state: 5 });
    expect(result.isError).toBeFalsy();
    expect(setCellState).toHaveBeenCalledWith(3, 5);
    expect(setBurgState).toHaveBeenCalledWith(1, 5);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      cell: 3,
      previous_state: 2,
      state: 5,
      burg: 1,
      burg_name: "Bree",
      burg_previous_state: 2,
    });
    expect(cellStates[3]).toBe(5);
    expect(burgs?.[1]?.state).toBe(5);
  });

  it("accepts state=0 (Neutrals placeholder)", async () => {
    const { runtime, setCellState } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 3, state: 0 });
    expect(result.isError).toBeFalsy();
    expect(setCellState).toHaveBeenCalledWith(3, 0);
    const body = JSON.parse(result.content);
    expect(body.previous_state).toBe(3);
    expect(body.state).toBe(0);
    expect(body.state_name).toBe("Neutrals");
  });

  it("supports same-state no-op (sets cell to its current value)", async () => {
    const { runtime, setCellState } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 7, state: 2 });
    expect(result.isError).toBeFalsy();
    expect(setCellState).toHaveBeenCalledWith(7, 2);
    const body = JSON.parse(result.content);
    expect(body.previous_state).toBe(2);
    expect(body.state).toBe(2);
    expect(body.previous_state_name).toBe("Aragorn");
    expect(body.state_name).toBe("Aragorn");
  });

  it("captures previous_state BEFORE mutation", async () => {
    const cellStates = new Uint16Array([0, 1, 2, 3, 4]);
    let capturedAtCallTime: number | null = null;
    const setCellStateImpl = (cell: number, state: number) => {
      capturedAtCallTime = cellStates[cell];
      cellStates[cell] = state;
    };
    const { runtime } = makeRuntime({
      cellStates,
      cellBurgs: new Uint8Array([0, 0, 0, 0, 0]),
      setCellStateImpl,
    });
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 2, state: 5 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_state).toBe(2);
    expect(capturedAtCallTime).toBe(2);
    expect(cellStates[2]).toBe(5);
  });

  it("captures burg_previous_state BEFORE burg mutation", async () => {
    const cellStates = new Uint16Array([0, 0, 0, 2, 0]);
    const cellBurgs = new Uint8Array([0, 0, 0, 1, 0]);
    const burgs: RawBurg[] = [
      { i: 0, name: "" },
      { i: 1, name: "Bree", cell: 3, state: 2 },
    ];
    let capturedBurgState: number | null = null;
    const setBurgStateImpl = (burgId: number, state: number) => {
      const b = burgs[burgId];
      if (b) {
        capturedBurgState = typeof b.state === "number" ? b.state : null;
        b.state = state;
      }
    };
    const { runtime } = makeRuntime({
      cellStates,
      cellBurgs,
      burgs,
      setBurgStateImpl,
    });
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 3, state: 5 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.burg_previous_state).toBe(2);
    expect(capturedBurgState).toBe(2);
    expect(burgs[1].state).toBe(5);
  });

  it("looks up state_name and previous_state_name from pack.states", async () => {
    const customStates: RawState[] = [
      { i: 0, name: "Z0" },
      { i: 1, name: "Z1" },
      { i: 2, name: "Z2" },
      { i: 3, name: "Z3" },
      { i: 4, name: "Z4" },
      { i: 5, name: "Z5" },
    ];
    const { runtime } = makeRuntime({
      cellStates: new Uint16Array([0, 1, 2, 3, 4, 5]),
      cellBurgs: new Uint8Array([0, 0, 0, 0, 0, 0]),
      states: customStates,
    });
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 1, state: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_state_name).toBe("Z1");
    expect(body.state_name).toBe("Z4");
  });

  it("returns previous_state_name='' when previous value is out of range (defensive)", async () => {
    // Stale: cellStates[0] = 99 but states length is 3.
    const cellStates = new Uint16Array([99, 0, 1]);
    const { runtime } = makeRuntime({
      cellStates,
      cellBurgs: new Uint8Array([0, 0, 0]),
      states: [
        { i: 0, name: "A" },
        { i: 1, name: "B" },
        { i: 2, name: "C" },
      ],
    });
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 0, state: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_state).toBe(99);
    expect(body.previous_state_name).toBe("");
    expect(body.state).toBe(1);
    expect(body.state_name).toBe("B");
  });

  it("calls drawStates after a successful write", async () => {
    const { runtime, drawStates } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 0, state: 1 });
    expect(result.isError).toBeFalsy();
    expect(drawStates).toHaveBeenCalledTimes(1);
  });

  it("survives drawStates being a no-op", async () => {
    const { runtime } = makeRuntime({
      drawStates: () => undefined,
    });
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 0, state: 1 });
    expect(result.isError).toBeFalsy();
  });

  it("survives drawStates throwing (best-effort, write already done)", async () => {
    const cellStates = new Uint16Array([0, 1, 2, 3, 4]);
    const { runtime } = makeRuntime({
      cellStates,
      cellBurgs: new Uint8Array([0, 0, 0, 0, 0]),
      drawStates: () => {
        throw new Error("boom");
      },
    });
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 2, state: 5 });
    expect(result.isError).toBeFalsy();
    expect(cellStates[2]).toBe(5);
  });

  it("rejects missing cell", async () => {
    const { runtime, setCellState } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    for (const missing of [undefined, null]) {
      const r = await tool.execute({ cell: missing, state: 1 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /cell must be a non-negative integer/i,
      );
    }
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("rejects missing state", async () => {
    const { runtime, setCellState } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    for (const missing of [undefined, null]) {
      const r = await tool.execute({ cell: 1, state: missing });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /state must be a non-negative integer/i,
      );
    }
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("rejects non-numeric cell", async () => {
    const { runtime, setCellState } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    for (const bad of [
      "1",
      true,
      {},
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const r = await tool.execute({ cell: bad, state: 0 });
      expect(r.isError).toBe(true);
    }
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("rejects non-integer cell", async () => {
    const { runtime, setCellState } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    for (const bad of [1.5, 2.1, 3.9999]) {
      const r = await tool.execute({ cell: bad, state: 0 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/non-negative integer/);
    }
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("rejects negative cell", async () => {
    const { runtime, setCellState } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    for (const bad of [-1, -100]) {
      const r = await tool.execute({ cell: bad, state: 0 });
      expect(r.isError).toBe(true);
    }
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("rejects non-numeric state", async () => {
    const { runtime, setCellState } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    for (const bad of ["1", true, {}, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await tool.execute({ cell: 0, state: bad });
      expect(r.isError).toBe(true);
    }
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("rejects non-integer state", async () => {
    const { runtime, setCellState } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    const r = await tool.execute({ cell: 0, state: 1.5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/non-negative integer/);
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("rejects negative state", async () => {
    const { runtime, setCellState } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    const r = await tool.execute({ cell: 0, state: -1 });
    expect(r.isError).toBe(true);
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("rejects cell out of range", async () => {
    const { runtime, setCellState } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    const r1 = await tool.execute({ cell: 8, state: 0 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toBe(
      "cell 8 is out of range (max 7).",
    );
    const r2 = await tool.execute({ cell: 20, state: 0 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toBe(
      "cell 20 is out of range (max 7).",
    );
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("rejects state out of range", async () => {
    const { runtime, setCellState } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    const r1 = await tool.execute({ cell: 0, state: 6 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toBe(
      "state 6 is not a valid state id (max 5).",
    );
    const r2 = await tool.execute({ cell: 0, state: 99 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toBe(
      "state 99 is not a valid state id (max 5).",
    );
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("rejects removed state", async () => {
    const { runtime, setCellState } = makeRuntime({
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Valoria" },
        { i: 2, name: "Aragorn", removed: true },
        { i: 3, name: "Mistmark" },
      ],
    });
    const tool = createSetCellStateTool(runtime);
    const r = await tool.execute({ cell: 0, state: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe("State 2 has been removed.");
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("rejects empty/null state slot (defensive)", async () => {
    const { runtime, setCellState } = makeRuntime({
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Valoria" },
        null as unknown as RawState,
        { i: 3, name: "Mistmark" },
      ],
    });
    const tool = createSetCellStateTool(runtime);
    const r = await tool.execute({ cell: 0, state: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe("State 2 has been removed.");
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("errors when pack.cells.state is missing", async () => {
    const { runtime, setCellState } = makeRuntime({
      getCellStatesOverride: () => null,
    });
    const tool = createSetCellStateTool(runtime);
    const r = await tool.execute({ cell: 0, state: 0 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "window.pack.cells.state is not available; the map hasn't finished loading.",
    );
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("errors when pack.states is missing", async () => {
    const { runtime, setCellState } = makeRuntime({
      getStatesOverride: () => null,
    });
    const tool = createSetCellStateTool(runtime);
    const r = await tool.execute({ cell: 0, state: 0 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "window.pack.states is not available; the map hasn't finished loading.",
    );
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("errors when pack.cells.burg is missing", async () => {
    const { runtime, setCellState } = makeRuntime({
      getCellBurgsOverride: () => null,
    });
    const tool = createSetCellStateTool(runtime);
    const r = await tool.execute({ cell: 0, state: 0 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "window.pack.cells.burg is not available; the map hasn't finished loading.",
    );
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("errors when pack.burgs is missing", async () => {
    const { runtime, setCellState } = makeRuntime({
      getBurgsOverride: () => null,
    });
    const tool = createSetCellStateTool(runtime);
    const r = await tool.execute({ cell: 0, state: 0 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "window.pack.burgs is not available; the map hasn't finished loading.",
    );
    expect(setCellState).not.toHaveBeenCalled();
  });

  it("mutates the typed array in place (no reassignment)", async () => {
    const cellStates = new Uint16Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const cellBurgs = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
    const cellBurgsBefore = Array.from(cellBurgs);
    const { runtime, getCellStates, getCellBurgs } = makeRuntime({
      cellStates,
      cellBurgs,
    });
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 3, state: 5 });
    expect(result.isError).toBeFalsy();
    expect(getCellStates).toHaveBeenCalled();
    expect(getCellStates.mock.results[0]?.value).toBe(cellStates);
    expect(cellStates[3]).toBe(5);
    expect(Array.from(cellStates)).toEqual([0, 1, 2, 5, 4, 5, 6, 7]);
    // cellBurgs untouched
    expect(getCellBurgs).toHaveBeenCalled();
    expect(Array.from(cellBurgs)).toEqual(cellBurgsBefore);
  });

  it("burg-id 0 is treated as 'no burg' (does not call setBurgState)", async () => {
    const { runtime, setBurgState } = makeRuntime({
      cellStates: new Uint16Array([0, 1, 2, 3, 4]),
      cellBurgs: new Uint8Array([0, 0, 0, 0, 0]),
    });
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 2, state: 5 });
    expect(result.isError).toBeFalsy();
    expect(setBurgState).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.burg).toBeNull();
    expect(body.burg_name).toBeNull();
    expect(body.burg_previous_state).toBeNull();
  });

  it("defensive: missing burg slot does not throw or call setBurgState", async () => {
    const cellStates = new Uint16Array([0, 1, 2, 3, 4]);
    const cellBurgs = new Uint8Array([0, 0, 7, 0, 0]);
    const burgs: RawBurg[] = [{ i: 0, name: "" }];
    // intentionally no burg at index 7
    const { runtime, setCellState, setBurgState } = makeRuntime({
      cellStates,
      cellBurgs,
      burgs,
    });
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 2, state: 5 });
    expect(result.isError).toBeFalsy();
    expect(setCellState).toHaveBeenCalledWith(2, 5);
    expect(setBurgState).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.burg).toBe(7);
    expect(body.burg_name).toBe("");
    expect(body.burg_previous_state).toBeNull();
    expect(cellStates[2]).toBe(5);
  });

  it("propagates setCellState runtime errors as isError", async () => {
    const { runtime } = makeRuntime({
      setCellStateImpl: () => {
        throw new Error("custom write failure");
      },
    });
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 0, state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/custom write failure/);
  });

  it("propagates setBurgState runtime errors as isError", async () => {
    const cellStates = new Uint16Array([0, 0, 0, 2, 0]);
    const cellBurgs = new Uint8Array([0, 0, 0, 1, 0]);
    const burgs: RawBurg[] = [
      { i: 0, name: "" },
      { i: 1, name: "Bree", cell: 3, state: 2 },
    ];
    const { runtime, setCellState } = makeRuntime({
      cellStates,
      cellBurgs,
      burgs,
      setBurgStateImpl: () => {
        throw new Error("burg write failure");
      },
    });
    const tool = createSetCellStateTool(runtime);
    const result = await tool.execute({ cell: 3, state: 5 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/burg write failure/);
    expect(setCellState).toHaveBeenCalledWith(3, 5);
  });

  it("works through a ToolRegistry round-trip", async () => {
    const { runtime, setCellState } = makeRuntime();
    const tool = createSetCellStateTool(runtime);
    const registry = new ToolRegistry();
    registry.register(tool);
    const result = await registry.run("set_cell_state", {
      cell: 0,
      state: 0,
    });
    expect(result.isError).toBeFalsy();
    expect(setCellState).toHaveBeenCalledWith(0, 0);
  });

  it("is exported as setCellStateTool with the expected shape", () => {
    expect(setCellStateTool.name).toBe("set_cell_state");
    expect(setCellStateTool.input_schema.type).toBe("object");
    expect(setCellStateTool.input_schema.required).toEqual(["cell", "state"]);
  });
});

describe("defaultCellStateRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    drawStates?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalDrawStates = globalsRef.drawStates;

  beforeEach(() => {
    globalsRef.pack = {
      cells: {
        state: new Uint16Array([0, 2, 2, 3, 4, 5, 0, 2]),
        burg: new Uint8Array([0, 0, 0, 1, 0, 2, 0, 0]),
      },
      states: DEFAULT_STATES.map((s) => ({ ...s })),
      burgs: DEFAULT_BURGS.map((b) => ({ ...b })),
    };
    delete globalsRef.drawStates;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.drawStates = originalDrawStates;
  });

  it("mutates globalThis.pack.cells.state in place via the default runtime", async () => {
    const pack = globalsRef.pack as {
      cells: { state: Uint16Array; burg: Uint8Array };
      states: RawState[];
      burgs: RawBurg[];
    };
    const arrBefore = pack.cells.state;
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 2, state: 4 });
    expect(result.isError).toBeFalsy();
    expect(pack.cells.state).toBe(arrBefore);
    expect(pack.cells.state[2]).toBe(4);
    expect(Array.from(pack.cells.state)).toEqual([0, 2, 4, 3, 4, 5, 0, 2]);
  });

  it("captures previous_state BEFORE mutation (default runtime)", async () => {
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 2, state: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_state).toBe(2);
    expect(body.previous_state_name).toBe("Aragorn");
    expect(body.state).toBe(4);
    expect(body.state_name).toBe("Highvale");
  });

  it("updates burg.state when the cell holds a burg (default runtime)", async () => {
    const pack = globalsRef.pack as {
      cells: { state: Uint16Array; burg: Uint8Array };
      burgs: RawBurg[];
    };
    // cell 3 holds burg 1 in fixture
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 3, state: 5 });
    expect(result.isError).toBeFalsy();
    expect(pack.cells.state[3]).toBe(5);
    expect(pack.burgs[1].state).toBe(5);
    const body = JSON.parse(result.content);
    expect(body.burg).toBe(1);
    expect(body.burg_name).toBe("Bree");
    expect(body.burg_previous_state).toBe(2);
  });

  it("does not mutate any burg when cell.burg === 0 (default runtime)", async () => {
    const pack = globalsRef.pack as {
      cells: { state: Uint16Array; burg: Uint8Array };
      burgs: RawBurg[];
    };
    const burgStatesBefore = pack.burgs.map((b) => b.state);
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 7, state: 5 });
    expect(result.isError).toBeFalsy();
    expect(pack.cells.state[7]).toBe(5);
    expect(pack.burgs.map((b) => b.state)).toEqual(burgStatesBefore);
    const body = JSON.parse(result.content);
    expect(body.burg).toBeNull();
  });

  it("supports same-state no-op via the default runtime", async () => {
    const pack = globalsRef.pack as {
      cells: { state: Uint16Array };
    };
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 2, state: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_state).toBe(2);
    expect(body.state).toBe(2);
    expect(pack.cells.state[2]).toBe(2);
  });

  it("accepts state=0 (Neutrals) via the default runtime", async () => {
    const pack = globalsRef.pack as {
      cells: { state: Uint16Array };
    };
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 2, state: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_state).toBe(2);
    expect(body.state).toBe(0);
    expect(body.state_name).toBe("Neutrals");
    expect(pack.cells.state[2]).toBe(0);
  });

  it("errors when pack.cells.state is missing (default runtime)", async () => {
    globalsRef.pack = {
      cells: { burg: new Uint8Array([0, 0, 0]) },
      states: DEFAULT_STATES.map((s) => ({ ...s })),
      burgs: DEFAULT_BURGS.map((b) => ({ ...b })),
    };
    const drawSpy = vi.fn();
    globalsRef.drawStates = drawSpy;
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 0, state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /pack\.cells\.state is not available/,
    );
    expect(drawSpy).not.toHaveBeenCalled();
  });

  it("errors when pack.states is missing (default runtime)", async () => {
    globalsRef.pack = {
      cells: {
        state: new Uint16Array([0, 1, 2]),
        burg: new Uint8Array([0, 0, 0]),
      },
      burgs: DEFAULT_BURGS.map((b) => ({ ...b })),
    };
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 0, state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /pack\.states is not available/,
    );
  });

  it("errors when pack.cells.burg is missing (default runtime)", async () => {
    globalsRef.pack = {
      cells: { state: new Uint16Array([0, 1, 2]) },
      states: DEFAULT_STATES.map((s) => ({ ...s })),
      burgs: DEFAULT_BURGS.map((b) => ({ ...b })),
    };
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 0, state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /pack\.cells\.burg is not available/,
    );
  });

  it("errors when pack.burgs is missing (default runtime)", async () => {
    globalsRef.pack = {
      cells: {
        state: new Uint16Array([0, 1, 2]),
        burg: new Uint8Array([0, 0, 0]),
      },
      states: DEFAULT_STATES.map((s) => ({ ...s })),
    };
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 0, state: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /pack\.burgs is not available/,
    );
  });

  it("rejects removed state (default runtime)", async () => {
    const pack = globalsRef.pack as {
      cells: { state: Uint16Array };
      states: RawState[];
    };
    pack.states[2].removed = true;
    const arrBefore = Array.from(pack.cells.state);
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 0, state: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe("State 2 has been removed.");
    expect(Array.from(pack.cells.state)).toEqual(arrBefore);
  });

  it("calls drawStates when present (default runtime)", async () => {
    const drawSpy = vi.fn();
    globalsRef.drawStates = drawSpy;
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 0, state: 0 });
    expect(result.isError).toBeFalsy();
    expect(drawSpy).toHaveBeenCalledTimes(1);
  });

  it("succeeds when drawStates is missing (default runtime)", async () => {
    delete globalsRef.drawStates;
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 0, state: 0 });
    expect(result.isError).toBeFalsy();
  });

  it("survives drawStates throwing (default runtime, best-effort)", async () => {
    globalsRef.drawStates = vi.fn(() => {
      throw new Error("render failure");
    });
    const pack = globalsRef.pack as {
      cells: { state: Uint16Array };
    };
    const tool = createSetCellStateTool(defaultCellStateRuntime);
    const result = await tool.execute({ cell: 1, state: 5 });
    expect(result.isError).toBeFalsy();
    expect(pack.cells.state[1]).toBe(5);
  });
});
