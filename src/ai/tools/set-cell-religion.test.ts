import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawReligion } from "./_shared";
import { ToolRegistry } from "./index";
import {
  type CellReligionRuntime,
  createSetCellReligionTool,
  defaultCellReligionRuntime,
  setCellReligionTool,
} from "./set-cell-religion";

const DEFAULT_RELIGIONS: RawReligion[] = [
  { i: 0, name: "No religion" },
  { i: 1, name: "Wave Worshippers", color: "#3322dd" },
  { i: 2, name: "Forest Druids", color: "#22aa44" },
  { i: 3, name: "Sun Cult", color: "#ffdd33" },
  { i: 4, name: "Stone Path", color: "#888888" },
  { i: 5, name: "Iron Brotherhood", color: "#aa4422" },
];

interface MakeRuntimeOpts {
  cellReligions?: ArrayLike<number> & { [i: number]: number; length: number };
  religions?: RawReligion[] | null;
  drawReligions?: () => void;
  setCellReligionImpl?: (cell: number, religion: number) => void;
  getCellReligionsOverride?: () =>
    | (ArrayLike<number> & { [i: number]: number; length: number })
    | null;
  getReligionsOverride?: () => RawReligion[] | null;
}

function makeRuntime(opts: MakeRuntimeOpts = {}) {
  const cellReligions = opts.cellReligions ?? new Uint16Array([0, 1, 2, 3, 4]);
  const religions =
    opts.religions === undefined ? DEFAULT_RELIGIONS : opts.religions;

  const setCellReligion = vi.fn<CellReligionRuntime["setCellReligion"]>(
    opts.setCellReligionImpl ??
      ((cell: number, religion: number) => {
        cellReligions[cell] = religion;
      }),
  );
  const drawReligions = vi.fn<CellReligionRuntime["drawReligions"]>(
    opts.drawReligions ?? (() => undefined),
  );
  const getCellReligions = vi.fn<CellReligionRuntime["getCellReligions"]>(
    opts.getCellReligionsOverride ?? (() => cellReligions),
  );
  const getReligions = vi.fn<CellReligionRuntime["getReligions"]>(
    opts.getReligionsOverride ?? (() => religions),
  );

  const runtime: CellReligionRuntime = {
    getCellReligions,
    setCellReligion,
    getReligions,
    drawReligions,
  };
  return {
    runtime,
    cellReligions,
    religions,
    setCellReligion,
    drawReligions,
    getCellReligions,
    getReligions,
  };
}

describe("set_cell_religion tool (stub runtime)", () => {
  it("writes the religion on a happy path", async () => {
    const { runtime, setCellReligion, cellReligions } = makeRuntime({
      cellReligions: new Uint16Array([0, 1, 2, 3, 4, 5, 1, 2]),
    });
    const tool = createSetCellReligionTool(runtime);
    const result = await tool.execute({ cell: 7, religion: 5 });
    expect(result.isError).toBeFalsy();
    expect(setCellReligion).toHaveBeenCalledWith(7, 5);
    const body = JSON.parse(result.content);
    expect(body).toMatchObject({
      ok: true,
      cell: 7,
      previous_religion: 2,
      previous_religion_name: "Forest Druids",
      religion: 5,
      religion_name: "Iron Brotherhood",
    });
    expect(cellReligions[7]).toBe(5);
  });

  it("accepts religion=0 (No religion placeholder)", async () => {
    const { runtime, setCellReligion } = makeRuntime({
      cellReligions: new Uint16Array([0, 1, 2, 3, 4]),
    });
    const tool = createSetCellReligionTool(runtime);
    const result = await tool.execute({ cell: 3, religion: 0 });
    expect(result.isError).toBeFalsy();
    expect(setCellReligion).toHaveBeenCalledWith(3, 0);
    const body = JSON.parse(result.content);
    expect(body.previous_religion).toBe(3);
    expect(body.religion).toBe(0);
    expect(body.religion_name).toBe("No religion");
  });

  it("supports same-religion no-op (sets cell to its current value)", async () => {
    const { runtime, setCellReligion } = makeRuntime({
      cellReligions: new Uint16Array([0, 1, 2, 3, 4, 5, 1, 2]),
    });
    const tool = createSetCellReligionTool(runtime);
    const result = await tool.execute({ cell: 7, religion: 2 });
    expect(result.isError).toBeFalsy();
    expect(setCellReligion).toHaveBeenCalledWith(7, 2);
    const body = JSON.parse(result.content);
    expect(body.previous_religion).toBe(2);
    expect(body.religion).toBe(2);
    expect(body.previous_religion_name).toBe("Forest Druids");
    expect(body.religion_name).toBe("Forest Druids");
  });

  it("captures previous_religion BEFORE mutation", async () => {
    const cellReligions = new Uint16Array([0, 1, 2, 3, 4]);
    let capturedAtCallTime: number | null = null;
    const setCellReligionImpl = (cell: number, religion: number) => {
      capturedAtCallTime = cellReligions[cell];
      cellReligions[cell] = religion;
    };
    const { runtime } = makeRuntime({ cellReligions, setCellReligionImpl });
    const tool = createSetCellReligionTool(runtime);
    const result = await tool.execute({ cell: 2, religion: 5 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_religion).toBe(2);
    expect(capturedAtCallTime).toBe(2);
    expect(cellReligions[2]).toBe(5);
  });

  it("looks up religion_name and previous_religion_name from pack.religions", async () => {
    const customReligions: RawReligion[] = [
      { i: 0, name: "Z0" },
      { i: 1, name: "Z1" },
      { i: 2, name: "Z2" },
      { i: 3, name: "Z3" },
      { i: 4, name: "Z4" },
      { i: 5, name: "Z5" },
    ];
    const { runtime } = makeRuntime({
      cellReligions: new Uint16Array([0, 1, 2, 3, 4, 5]),
      religions: customReligions,
    });
    const tool = createSetCellReligionTool(runtime);
    const result = await tool.execute({ cell: 1, religion: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_religion_name).toBe("Z1");
    expect(body.religion_name).toBe("Z4");
  });

  it("returns previous_religion_name='' when previous value is out of range (defensive)", async () => {
    // Stale value: cellReligions[0] = 99 but religions length is 3.
    const cellReligions = new Uint16Array([99, 0, 1]);
    const { runtime } = makeRuntime({
      cellReligions,
      religions: [
        { i: 0, name: "A" },
        { i: 1, name: "B" },
        { i: 2, name: "C" },
      ],
    });
    const tool = createSetCellReligionTool(runtime);
    const result = await tool.execute({ cell: 0, religion: 1 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_religion).toBe(99);
    expect(body.previous_religion_name).toBe("");
    expect(body.religion).toBe(1);
    expect(body.religion_name).toBe("B");
  });

  it("calls drawReligions after a successful write", async () => {
    const { runtime, drawReligions } = makeRuntime();
    const tool = createSetCellReligionTool(runtime);
    const result = await tool.execute({ cell: 0, religion: 1 });
    expect(result.isError).toBeFalsy();
    expect(drawReligions).toHaveBeenCalledTimes(1);
  });

  it("survives drawReligions being a no-op", async () => {
    const { runtime } = makeRuntime({
      drawReligions: () => undefined,
    });
    const tool = createSetCellReligionTool(runtime);
    const result = await tool.execute({ cell: 0, religion: 1 });
    expect(result.isError).toBeFalsy();
  });

  it("survives drawReligions throwing (best-effort, write already done)", async () => {
    const cellReligions = new Uint16Array([0, 1, 2, 3, 4]);
    const { runtime } = makeRuntime({
      cellReligions,
      drawReligions: () => {
        throw new Error("boom");
      },
    });
    const tool = createSetCellReligionTool(runtime);
    const result = await tool.execute({ cell: 2, religion: 5 });
    expect(result.isError).toBeFalsy();
    expect(cellReligions[2]).toBe(5);
  });

  it("rejects missing cell", async () => {
    const { runtime, setCellReligion } = makeRuntime();
    const tool = createSetCellReligionTool(runtime);
    for (const missing of [undefined, null]) {
      const r = await tool.execute({ cell: missing, religion: 1 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /cell must be a non-negative integer/i,
      );
    }
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("rejects missing religion", async () => {
    const { runtime, setCellReligion } = makeRuntime();
    const tool = createSetCellReligionTool(runtime);
    for (const missing of [undefined, null]) {
      const r = await tool.execute({ cell: 1, religion: missing });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /religion must be a non-negative integer/i,
      );
    }
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("rejects non-numeric cell", async () => {
    const { runtime, setCellReligion } = makeRuntime();
    const tool = createSetCellReligionTool(runtime);
    for (const bad of [
      "1",
      true,
      {},
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const r = await tool.execute({ cell: bad, religion: 0 });
      expect(r.isError).toBe(true);
    }
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("rejects non-integer cell", async () => {
    const { runtime, setCellReligion } = makeRuntime();
    const tool = createSetCellReligionTool(runtime);
    for (const bad of [1.5, 2.1, 3.9999]) {
      const r = await tool.execute({ cell: bad, religion: 0 });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(/non-negative integer/);
    }
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("rejects negative cell", async () => {
    const { runtime, setCellReligion } = makeRuntime();
    const tool = createSetCellReligionTool(runtime);
    for (const bad of [-1, -100]) {
      const r = await tool.execute({ cell: bad, religion: 0 });
      expect(r.isError).toBe(true);
    }
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("rejects non-numeric religion", async () => {
    const { runtime, setCellReligion } = makeRuntime();
    const tool = createSetCellReligionTool(runtime);
    for (const bad of ["1", true, {}, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await tool.execute({ cell: 0, religion: bad });
      expect(r.isError).toBe(true);
    }
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("rejects non-integer religion", async () => {
    const { runtime, setCellReligion } = makeRuntime();
    const tool = createSetCellReligionTool(runtime);
    const r = await tool.execute({ cell: 0, religion: 1.5 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/non-negative integer/);
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("rejects negative religion", async () => {
    const { runtime, setCellReligion } = makeRuntime();
    const tool = createSetCellReligionTool(runtime);
    const r = await tool.execute({ cell: 0, religion: -1 });
    expect(r.isError).toBe(true);
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("rejects cell out of range", async () => {
    const { runtime, setCellReligion } = makeRuntime({
      cellReligions: new Uint16Array([0, 0, 0, 0, 0]),
    });
    const tool = createSetCellReligionTool(runtime);
    const r1 = await tool.execute({ cell: 5, religion: 0 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toBe(
      "cell 5 is out of range (max 4).",
    );
    const r2 = await tool.execute({ cell: 10, religion: 0 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toBe(
      "cell 10 is out of range (max 4).",
    );
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("rejects religion out of range", async () => {
    const { runtime, setCellReligion } = makeRuntime({
      religions: [
        { i: 0, name: "A" },
        { i: 1, name: "B" },
        { i: 2, name: "C" },
        { i: 3, name: "D" },
      ],
    });
    const tool = createSetCellReligionTool(runtime);
    const r1 = await tool.execute({ cell: 0, religion: 4 });
    expect(r1.isError).toBe(true);
    expect(JSON.parse(r1.content).error).toBe(
      "religion 4 is not a valid religion id (max 3).",
    );
    const r2 = await tool.execute({ cell: 0, religion: 99 });
    expect(r2.isError).toBe(true);
    expect(JSON.parse(r2.content).error).toBe(
      "religion 99 is not a valid religion id (max 3).",
    );
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("rejects removed religion", async () => {
    const { runtime, setCellReligion } = makeRuntime({
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Wave Worshippers" },
        { i: 2, name: "Forest Druids", removed: true },
        { i: 3, name: "Sun Cult" },
      ],
    });
    const tool = createSetCellReligionTool(runtime);
    const r = await tool.execute({ cell: 0, religion: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe("Religion 2 has been removed.");
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("rejects empty/null religion slot (defensive)", async () => {
    const { runtime, setCellReligion } = makeRuntime({
      religions: [
        { i: 0, name: "No religion" },
        { i: 1, name: "Wave Worshippers" },
        null as unknown as RawReligion,
        { i: 3, name: "Sun Cult" },
      ],
    });
    const tool = createSetCellReligionTool(runtime);
    const r = await tool.execute({ cell: 0, religion: 2 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe("Religion 2 has been removed.");
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("errors when pack.cells.religion is missing", async () => {
    const { runtime, setCellReligion } = makeRuntime({
      getCellReligionsOverride: () => null,
    });
    const tool = createSetCellReligionTool(runtime);
    const r = await tool.execute({ cell: 0, religion: 0 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "window.pack.cells.religion is not available; the map hasn't finished loading.",
    );
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("errors when pack.religions is missing", async () => {
    const { runtime, setCellReligion } = makeRuntime({
      getReligionsOverride: () => null,
    });
    const tool = createSetCellReligionTool(runtime);
    const r = await tool.execute({ cell: 0, religion: 0 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe(
      "window.pack.religions is not available; the map hasn't finished loading.",
    );
    expect(setCellReligion).not.toHaveBeenCalled();
  });

  it("mutates the typed array in place (no reassignment)", async () => {
    const cellReligions = new Uint16Array([0, 1, 2, 3, 4]);
    const { runtime, getCellReligions } = makeRuntime({ cellReligions });
    const tool = createSetCellReligionTool(runtime);
    const result = await tool.execute({ cell: 3, religion: 5 });
    expect(result.isError).toBeFalsy();
    expect(getCellReligions).toHaveBeenCalled();
    expect(getCellReligions.mock.results[0]?.value).toBe(cellReligions);
    expect(cellReligions[3]).toBe(5);
    expect(Array.from(cellReligions)).toEqual([0, 1, 2, 5, 4]);
  });

  it("propagates runtime errors as isError", async () => {
    const { runtime } = makeRuntime({
      setCellReligionImpl: () => {
        throw new Error("custom write failure");
      },
    });
    const tool = createSetCellReligionTool(runtime);
    const result = await tool.execute({ cell: 0, religion: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/custom write failure/);
  });

  it("works through a ToolRegistry round-trip", async () => {
    const { runtime, setCellReligion } = makeRuntime();
    const tool = createSetCellReligionTool(runtime);
    const registry = new ToolRegistry();
    registry.register(tool);
    const result = await registry.run("set_cell_religion", {
      cell: 0,
      religion: 0,
    });
    expect(result.isError).toBeFalsy();
    expect(setCellReligion).toHaveBeenCalledWith(0, 0);
  });

  it("is exported as setCellReligionTool with the expected shape", () => {
    expect(setCellReligionTool.name).toBe("set_cell_religion");
    expect(setCellReligionTool.input_schema.type).toBe("object");
    expect(setCellReligionTool.input_schema.required).toEqual([
      "cell",
      "religion",
    ]);
  });
});

describe("defaultCellReligionRuntime (integration)", () => {
  const globalsRef = globalThis as unknown as {
    pack?: unknown;
    drawReligions?: unknown;
  };
  const originalPack = globalsRef.pack;
  const originalDrawReligions = globalsRef.drawReligions;

  beforeEach(() => {
    globalsRef.pack = {
      cells: { religion: new Uint16Array([0, 1, 2, 3, 4]) },
      religions: DEFAULT_RELIGIONS.map((r) => ({ ...r })),
    };
    delete globalsRef.drawReligions;
  });

  afterEach(() => {
    globalsRef.pack = originalPack;
    globalsRef.drawReligions = originalDrawReligions;
  });

  it("mutates globalThis.pack.cells.religion in place via the default runtime", async () => {
    const pack = globalsRef.pack as {
      cells: { religion: Uint16Array };
      religions: RawReligion[];
    };
    const arrBefore = pack.cells.religion;
    const tool = createSetCellReligionTool(defaultCellReligionRuntime);
    const result = await tool.execute({ cell: 2, religion: 4 });
    expect(result.isError).toBeFalsy();
    expect(pack.cells.religion).toBe(arrBefore);
    expect(pack.cells.religion[2]).toBe(4);
    expect(Array.from(pack.cells.religion)).toEqual([0, 1, 4, 3, 4]);
  });

  it("captures previous_religion BEFORE mutation (default runtime)", async () => {
    const tool = createSetCellReligionTool(defaultCellReligionRuntime);
    const result = await tool.execute({ cell: 2, religion: 4 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_religion).toBe(2);
    expect(body.previous_religion_name).toBe("Forest Druids");
    expect(body.religion).toBe(4);
    expect(body.religion_name).toBe("Stone Path");
  });

  it("supports same-religion no-op via the default runtime", async () => {
    const pack = globalsRef.pack as {
      cells: { religion: Uint16Array };
    };
    const tool = createSetCellReligionTool(defaultCellReligionRuntime);
    const result = await tool.execute({ cell: 2, religion: 2 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_religion).toBe(2);
    expect(body.religion).toBe(2);
    expect(pack.cells.religion[2]).toBe(2);
  });

  it("accepts religion=0 (No religion) via the default runtime", async () => {
    const pack = globalsRef.pack as {
      cells: { religion: Uint16Array };
    };
    const tool = createSetCellReligionTool(defaultCellReligionRuntime);
    const result = await tool.execute({ cell: 2, religion: 0 });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.previous_religion).toBe(2);
    expect(body.religion).toBe(0);
    expect(body.religion_name).toBe("No religion");
    expect(pack.cells.religion[2]).toBe(0);
  });

  it("errors when pack.cells.religion is missing (default runtime)", async () => {
    globalsRef.pack = { religions: DEFAULT_RELIGIONS.map((r) => ({ ...r })) };
    const drawSpy = vi.fn();
    globalsRef.drawReligions = drawSpy;
    const tool = createSetCellReligionTool(defaultCellReligionRuntime);
    const result = await tool.execute({ cell: 0, religion: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /pack\.cells\.religion is not available/,
    );
    expect(drawSpy).not.toHaveBeenCalled();
  });

  it("errors when pack.religions is missing (default runtime)", async () => {
    globalsRef.pack = { cells: { religion: new Uint16Array([0, 1, 2]) } };
    const tool = createSetCellReligionTool(defaultCellReligionRuntime);
    const result = await tool.execute({ cell: 0, religion: 0 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(
      /pack\.religions is not available/,
    );
  });

  it("rejects removed religion (default runtime)", async () => {
    const pack = globalsRef.pack as {
      cells: { religion: Uint16Array };
      religions: RawReligion[];
    };
    pack.religions[2].removed = true;
    const arrBefore = Array.from(pack.cells.religion);
    const tool = createSetCellReligionTool(defaultCellReligionRuntime);
    const result = await tool.execute({ cell: 0, religion: 2 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Religion 2 has been removed.",
    );
    expect(Array.from(pack.cells.religion)).toEqual(arrBefore);
  });

  it("calls drawReligions when present (default runtime)", async () => {
    const drawSpy = vi.fn();
    globalsRef.drawReligions = drawSpy;
    const tool = createSetCellReligionTool(defaultCellReligionRuntime);
    const result = await tool.execute({ cell: 0, religion: 0 });
    expect(result.isError).toBeFalsy();
    expect(drawSpy).toHaveBeenCalledTimes(1);
  });

  it("succeeds when drawReligions is missing (default runtime)", async () => {
    delete globalsRef.drawReligions;
    const tool = createSetCellReligionTool(defaultCellReligionRuntime);
    const result = await tool.execute({ cell: 0, religion: 0 });
    expect(result.isError).toBeFalsy();
  });

  it("survives drawReligions throwing (default runtime, best-effort)", async () => {
    globalsRef.drawReligions = vi.fn(() => {
      throw new Error("render failure");
    });
    const pack = globalsRef.pack as {
      cells: { religion: Uint16Array };
    };
    const tool = createSetCellReligionTool(defaultCellReligionRuntime);
    const result = await tool.execute({ cell: 1, religion: 5 });
    expect(result.isError).toBeFalsy();
    expect(pack.cells.religion[1]).toBe(5);
  });
});
