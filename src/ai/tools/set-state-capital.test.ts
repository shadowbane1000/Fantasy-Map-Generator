import { describe, expect, it, vi } from "vitest";
import {
  createSetStateCapitalTool,
  type StateCapitalBurg,
  type StateCapitalRuntime,
  type StateCapitalState,
} from "./set-state-capital";

interface Fixtures {
  state?: (ref: number | string) => StateCapitalState | null;
  burg?: (ref: number | string) => StateCapitalBurg | null;
}

function makeRuntime(f: Fixtures = {}) {
  const findState = vi.fn<StateCapitalRuntime["findState"]>(
    f.state ?? (() => null),
  );
  const findBurg = vi.fn<StateCapitalRuntime["findBurg"]>(
    f.burg ?? (() => null),
  );
  const promote = vi.fn<StateCapitalRuntime["promote"]>();
  const runtime: StateCapitalRuntime = { findState, findBurg, promote };
  return { runtime, findState, findBurg, promote };
}

describe("set_state_capital tool", () => {
  it("promotes a burg to capital via numeric ids", async () => {
    const { runtime, promote } = makeRuntime({
      state: (ref) =>
        ref === 2
          ? {
              i: 2,
              name: "Altaria",
              previousCapitalId: 7,
              previousCapitalName: "OldHold",
            }
          : null,
      burg: (ref) =>
        ref === 12
          ? {
              i: 12,
              name: "Tidegarde",
              state: 2,
              cell: 333,
              alreadyCapital: false,
            }
          : null,
    });
    const tool = createSetStateCapitalTool(runtime);
    const result = await tool.execute({ state: 2, burg: 12 });
    expect(result.isError).toBeFalsy();
    expect(promote).toHaveBeenCalledWith({
      stateId: 2,
      oldCapitalId: 7,
      newCapitalId: 12,
      newCenterCell: 333,
    });
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      state: { i: 2, name: "Altaria" },
      previousCapital: { id: 7, name: "OldHold" },
      capital: { id: 12, name: "Tidegarde" },
      noop: false,
    });
  });

  it("accepts string refs for both state and burg", async () => {
    const { runtime, promote } = makeRuntime({
      state: (ref) =>
        typeof ref === "string" && ref.toLowerCase() === "altaria"
          ? {
              i: 2,
              name: "Altaria",
              previousCapitalId: 7,
              previousCapitalName: "OldHold",
            }
          : null,
      burg: (ref) =>
        typeof ref === "string" && ref.toLowerCase() === "tidegarde"
          ? {
              i: 12,
              name: "Tidegarde",
              state: 2,
              cell: 333,
              alreadyCapital: false,
            }
          : null,
    });
    const tool = createSetStateCapitalTool(runtime);
    await tool.execute({ state: "altaria", burg: "TIDEGARDE" });
    expect(promote).toHaveBeenCalled();
  });

  it("rejects when burg belongs to a different state", async () => {
    const { runtime, promote } = makeRuntime({
      state: () => ({
        i: 2,
        name: "Altaria",
        previousCapitalId: 7,
        previousCapitalName: "OldHold",
      }),
      burg: () => ({
        i: 20,
        name: "Foreign",
        state: 3, // wrong state
        cell: 99,
        alreadyCapital: false,
      }),
    });
    const tool = createSetStateCapitalTool(runtime);
    const result = await tool.execute({ state: 2, burg: 20 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/not in state/);
    expect(promote).not.toHaveBeenCalled();
  });

  it("is a no-op when the burg is already the capital", async () => {
    const { runtime, promote } = makeRuntime({
      state: () => ({
        i: 2,
        name: "Altaria",
        previousCapitalId: 7,
        previousCapitalName: "Stormport",
      }),
      burg: () => ({
        i: 7,
        name: "Stormport",
        state: 2,
        cell: 42,
        alreadyCapital: true,
      }),
    });
    const tool = createSetStateCapitalTool(runtime);
    const result = await tool.execute({ state: 2, burg: 7 });
    expect(result.isError).toBeFalsy();
    expect(promote).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      noop: true,
      capital: { id: 7 },
    });
  });

  it("rejects state 0 (Neutrals)", async () => {
    const { runtime, promote } = makeRuntime({
      state: () => ({
        i: 0,
        name: "Neutrals",
        previousCapitalId: 0,
        previousCapitalName: null,
      }),
      burg: () => ({
        i: 5,
        name: "Free City",
        state: 0,
        cell: 1,
        alreadyCapital: false,
      }),
    });
    const tool = createSetStateCapitalTool(runtime);
    const result = await tool.execute({ state: 0, burg: 5 });
    expect(result.isError).toBe(true);
    expect(promote).not.toHaveBeenCalled();
  });

  it("errors on unknown state or burg", async () => {
    const { runtime, promote } = makeRuntime({
      state: (ref) =>
        ref === 2
          ? {
              i: 2,
              name: "A",
              previousCapitalId: 0,
              previousCapitalName: null,
            }
          : null,
      burg: () => null,
    });
    const tool = createSetStateCapitalTool(runtime);
    const unknownState = await tool.execute({ state: 99, burg: 5 });
    const unknownBurg = await tool.execute({ state: 2, burg: 999 });
    expect(unknownState.isError).toBe(true);
    expect(unknownBurg.isError).toBe(true);
    expect(promote).not.toHaveBeenCalled();
  });

  it("rejects invalid ref types", async () => {
    const { runtime, promote } = makeRuntime();
    const tool = createSetStateCapitalTool(runtime);
    const cases = [
      { state: null, burg: 5 },
      { state: "", burg: 5 },
      { state: 1.5, burg: 5 },
      { state: -1, burg: 5 },
      { state: 2, burg: null },
      { state: 2, burg: "" },
      { state: 2, burg: 1.5 },
      { state: 2, burg: -1 },
    ];
    for (const input of cases) {
      expect((await tool.execute(input)).isError).toBe(true);
    }
    expect(promote).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const { runtime } = makeRuntime({
      state: () => ({
        i: 2,
        name: "A",
        previousCapitalId: 7,
        previousCapitalName: null,
      }),
      burg: () => ({
        i: 12,
        name: "B",
        state: 2,
        cell: 1,
        alreadyCapital: false,
      }),
    });
    runtime.promote = vi.fn(() => {
      throw new Error("customization active");
    });
    const tool = createSetStateCapitalTool(runtime);
    const result = await tool.execute({ state: 2, burg: 12 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/customization/);
  });

  it("rejects when the burg ref resolves to burg 0", async () => {
    const { runtime, promote } = makeRuntime({
      state: () => ({
        i: 2,
        name: "A",
        previousCapitalId: 7,
        previousCapitalName: null,
      }),
      burg: () => ({
        i: 0,
        name: "Placeholder",
        state: 0,
        cell: 0,
        alreadyCapital: false,
      }),
    });
    const tool = createSetStateCapitalTool(runtime);
    const result = await tool.execute({ state: 2, burg: 1 });
    expect(result.isError).toBe(true);
    expect(promote).not.toHaveBeenCalled();
  });
});
