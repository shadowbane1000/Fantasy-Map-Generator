import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatController, ClickTarget } from "../chat-controller";
import { ToolRegistry } from "./index";
import {
  buildMisclickTip,
  type ClickHits,
  type ClickRequestRuntime,
  createRequestMapClickTool,
  DEFAULT_REQUEST_MAP_CLICK_TIMEOUT_MS,
  defaultClickRequestRuntime,
  defaultHitTest,
  matchTarget,
  REQUEST_MAP_CLICK_TARGETS,
  REQUEST_MAP_CLICK_TIMEOUT_MAX_MS,
  REQUEST_MAP_CLICK_TIMEOUT_MIN_MS,
  requestMapClickTool,
  type ViewboxLike,
} from "./request-map-click";

interface RuntimeHandles {
  runtime: ClickRequestRuntime;
  setCursor: ReturnType<typeof vi.fn>;
  tip: ReturnType<typeof vi.fn>;
  setTimeout: ReturnType<typeof vi.fn>;
  clearTimeout: ReturnType<typeof vi.fn>;
  detachClick: ReturnType<typeof vi.fn>;
  detachEsc: ReturnType<typeof vi.fn>;
  hitTest: ReturnType<typeof vi.fn>;
  fireClick: (
    point: [number, number],
    target?: EventTarget | null,
    hits?: ClickHits,
  ) => void;
  fireEsc: () => void;
  fireTimeout: () => void;
  /** Most recent cursor value passed to setCursor. */
  lastCursor: string | null;
}

interface ControllerStub {
  controller: Pick<
    ChatController,
    | "emitClickRequest"
    | "emitClickRequestEnd"
    | "registerClickCancel"
    | "cancelClickRequest"
  >;
  emitClickRequest: ReturnType<typeof vi.fn>;
  emitClickRequestEnd: ReturnType<typeof vi.fn>;
  registerClickCancel: ReturnType<typeof vi.fn>;
  unregister: ReturnType<typeof vi.fn>;
  fireCancel: (token: object) => void;
  cancelClickRequest: ReturnType<typeof vi.fn>;
}

function makeRuntime(
  opts: {
    viewbox?: object;
    findCell?: (x: number, y: number) => number;
    hits?: ClickHits;
  } = {},
): RuntimeHandles {
  let storedClickHandler:
    | ((point: [number, number], target: EventTarget | null) => void)
    | null = null;
  let storedEsc: (() => void) | null = null;
  let storedTimeout: { fn: () => void; ms: number } | null = null;
  const detachClick = vi.fn();
  const detachEsc = vi.fn();
  const setCursor = vi.fn((value: string) => {
    handles.lastCursor = value;
    return "default";
  });
  const tip = vi.fn();
  const stHandle: object = {};
  const stMock = vi.fn((fn: () => void, ms: number) => {
    storedTimeout = { fn, ms };
    return stHandle;
  });
  const clearMock = vi.fn();
  const hitTest = vi.fn(
    (_point: [number, number], _target: EventTarget | null): ClickHits =>
      opts.hits ?? { cell: 0 },
  );
  const stubViewbox: ViewboxLike = {
    on: vi.fn(),
    style: vi.fn(),
  };
  const runtime: ClickRequestRuntime = {
    getViewbox: vi.fn(
      () => (opts.viewbox as ViewboxLike | undefined) ?? stubViewbox,
    ),
    getFindCell: vi.fn(() => opts.findCell ?? ((_x: number, _y: number) => 0)),
    hitTest,
    setCursor,
    tip,
    setTimeout: stMock,
    clearTimeout: clearMock,
    addEscListener: vi.fn((cb: () => void) => {
      storedEsc = cb;
      return detachEsc;
    }),
    attachClickHandler: vi.fn((handler) => {
      storedClickHandler = handler;
      return detachClick;
    }),
  };
  const handles: RuntimeHandles = {
    runtime,
    setCursor,
    tip,
    setTimeout: stMock,
    clearTimeout: clearMock,
    detachClick,
    detachEsc,
    hitTest,
    fireClick: (point, target = null, hits) => {
      if (hits) {
        hitTest.mockReturnValueOnce(hits);
      }
      if (storedClickHandler) storedClickHandler(point, target);
    },
    fireEsc: () => {
      if (storedEsc) storedEsc();
    },
    fireTimeout: () => {
      if (storedTimeout) storedTimeout.fn();
    },
    lastCursor: null,
  };
  return handles;
}

function makeStubController(): ControllerStub {
  let storedToken: object | null = null;
  let storedCallback: (() => void) | null = null;
  const unregister = vi.fn(() => {
    storedToken = null;
    storedCallback = null;
  });
  const emitClickRequest = vi.fn();
  const emitClickRequestEnd = vi.fn();
  const registerClickCancel = vi.fn((token: object, cb: () => void) => {
    storedToken = token;
    storedCallback = cb;
    return unregister;
  });
  const cancelClickRequest = vi.fn((token: object) => {
    if (storedToken === token && storedCallback) storedCallback();
  });
  const controller = {
    emitClickRequest,
    emitClickRequestEnd,
    registerClickCancel,
    cancelClickRequest,
  } as unknown as Pick<
    ChatController,
    | "emitClickRequest"
    | "emitClickRequestEnd"
    | "registerClickCancel"
    | "cancelClickRequest"
  >;
  return {
    controller,
    emitClickRequest,
    emitClickRequestEnd,
    registerClickCancel,
    unregister,
    cancelClickRequest,
    fireCancel: (token: object) => {
      if (storedToken === token && storedCallback) storedCallback();
    },
  };
}

function makeTool(
  runtime: ClickRequestRuntime,
  controllerStub?: ControllerStub,
) {
  return createRequestMapClickTool(
    runtime,
    () => controllerStub?.controller as unknown as ChatController | undefined,
  );
}

describe("request_map_click tool — schema/registry", () => {
  it("has the right name + schema shape", () => {
    expect(requestMapClickTool.name).toBe("request_map_click");
    const schema = requestMapClickTool.input_schema;
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["prompt"]);
    expect((schema.properties.target as { enum: string[] }).enum).toEqual([
      ...REQUEST_MAP_CLICK_TARGETS,
    ]);
    expect((schema.properties.timeout_ms as { default: number }).default).toBe(
      DEFAULT_REQUEST_MAP_CLICK_TIMEOUT_MS,
    );
    expect((schema.properties.timeout_ms as { minimum: number }).minimum).toBe(
      REQUEST_MAP_CLICK_TIMEOUT_MIN_MS,
    );
    expect((schema.properties.timeout_ms as { maximum: number }).maximum).toBe(
      REQUEST_MAP_CLICK_TIMEOUT_MAX_MS,
    );
  });

  it("registers cleanly with the ToolRegistry", () => {
    const registry = new ToolRegistry();
    registry.register(requestMapClickTool);
    expect(registry.list().map((t) => t.name)).toContain("request_map_click");
  });
});

describe("request_map_click tool — input validation", () => {
  function runWithInput(input: unknown) {
    const handles = makeRuntime();
    const tool = makeTool(handles.runtime);
    return tool.execute(input);
  }

  it("rejects missing/empty/non-string prompt", async () => {
    for (const input of [
      {},
      { prompt: "" },
      { prompt: "   " },
      { prompt: 42 },
      null,
      undefined,
    ]) {
      const result = await runWithInput(input);
      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content);
      expect(body.error).toBe("prompt must be a non-empty string.");
    }
  });

  it("rejects unknown target", async () => {
    const result = await runWithInput({
      prompt: "click",
      target: "nope",
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content);
    expect(body.error).toMatch(/^target must be one of: /);
    expect(body.error).toContain("any, cell, burg");
    expect(body.error).toContain("label.");
  });

  it("rejects out-of-range / non-integer timeout_ms", async () => {
    for (const bad of [500, 9_000_000, 1.5, "60s", true]) {
      const result = await runWithInput({ prompt: "click", timeout_ms: bad });
      expect(result.isError).toBe(true);
      const body = JSON.parse(result.content);
      expect(body.error).toBe(
        `timeout_ms must be an integer in [${REQUEST_MAP_CLICK_TIMEOUT_MIN_MS}, ${REQUEST_MAP_CLICK_TIMEOUT_MAX_MS}].`,
      );
    }
  });

  it("errors when viewbox is missing", async () => {
    const handles = makeRuntime();
    handles.runtime.getViewbox = vi.fn(() => undefined);
    const tool = makeTool(handles.runtime);
    const result = await tool.execute({ prompt: "click anywhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.viewbox is not available; the map hasn't finished loading.",
    );
    expect(handles.setCursor).not.toHaveBeenCalled();
  });

  it("errors when findCell is missing", async () => {
    const handles = makeRuntime();
    handles.runtime.getFindCell = vi.fn(() => undefined);
    const tool = makeTool(handles.runtime);
    const result = await tool.execute({ prompt: "click anywhere" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "window.findCell is not available; the map hasn't finished loading.",
    );
    expect(handles.setCursor).not.toHaveBeenCalled();
  });
});

describe("request_map_click tool — happy paths", () => {
  it("resolves on `target: any` with everything at the click point", async () => {
    const handles = makeRuntime({
      hits: {
        cell: 17,
        burg: { i: 17, name: "Bree" },
        state: { i: 3, name: "Valoria" },
      },
    });
    const tool = makeTool(handles.runtime);
    const promise = tool.execute({ prompt: "click somewhere", target: "any" });
    handles.fireClick([10, 20]);
    const result = await promise;
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body).toEqual({
      ok: true,
      x: 10,
      y: 20,
      cell: 17,
      target_matched: "any",
      burg: { i: 17, name: "Bree" },
      state: { i: 3, name: "Valoria" },
    });
  });

  it("resolves on `target: burg` when a burg is present", async () => {
    const handles = makeRuntime({
      hits: {
        cell: 1,
        burg: { i: 9, name: "Brookford" },
      },
    });
    const tool = makeTool(handles.runtime);
    const promise = tool.execute({ prompt: "pick a burg", target: "burg" });
    handles.fireClick([1.234, 2.567]);
    const result = await promise;
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.target_matched).toBe("burg");
    expect(body.burg).toEqual({ i: 9, name: "Brookford" });
    expect(body.cell).toBe(1);
  });

  it("rounds x/y to 2 decimal places", async () => {
    const handles = makeRuntime({ hits: { cell: 0 } });
    const tool = makeTool(handles.runtime);
    const promise = tool.execute({ prompt: "click", target: "any" });
    handles.fireClick([123.456789, 456.123]);
    const body = JSON.parse((await promise).content);
    expect(body.x).toBe(123.46);
    expect(body.y).toBe(456.12);
  });

  it.each([
    ["cell", { cell: 12 }, "cell"],
    ["burg", { cell: 1, burg: { i: 1, name: "B" } }, "burg"],
    ["state", { cell: 1, state: { i: 1, name: "S" } }, "state"],
    ["province", { cell: 1, province: { i: 1, name: "P" } }, "province"],
    ["culture", { cell: 1, culture: { i: 1, name: "C" } }, "culture"],
    ["religion", { cell: 1, religion: { i: 1, name: "R" } }, "religion"],
    ["river", { cell: 1, river: { i: 4, name: "Riv" } }, "river"],
    ["zone", { cell: 1, zone: { i: 5, name: "Z" } }, "zone"],
    [
      "marker",
      { cell: 1, marker: { i: 7, name: "M", type: "danger" } },
      "marker",
    ],
    ["route", { cell: 1, route: { i: 3, name: "Rt" } }, "route"],
    ["label", { cell: 1, label: { i: "labelA", text: "Hi" } }, "label"],
  ] as [
    ClickTarget,
    ClickHits,
    ClickTarget,
  ][])("target=%s positive hit-test resolves", async (target, hits, matched) => {
    const handles = makeRuntime({ hits });
    const tool = makeTool(handles.runtime);
    const promise = tool.execute({ prompt: "click", target });
    handles.fireClick([1, 1]);
    const body = JSON.parse((await promise).content);
    expect(body.target_matched).toBe(matched);
  });

  it("aggregates every populated entity field on a multi-hit click", async () => {
    const fullHits: ClickHits = {
      cell: 1234,
      burg: { i: 17, name: "Bree" },
      state: { i: 3, name: "Valoria" },
      province: { i: 7, name: "Northshire" },
      culture: { i: 2, name: "Elvish" },
      religion: { i: 1, name: "Sun Worship" },
      river: { i: 12, name: "Mistwater" },
      route: { i: 5, name: "Coast Road" },
      zone: { i: 5, name: "Plague" },
      marker: { i: 4, name: "Cave", type: "monster" },
      label: { i: "labelXYZ", text: "Bree" },
    };
    const handles = makeRuntime({ hits: fullHits });
    const tool = makeTool(handles.runtime);
    const promise = tool.execute({ prompt: "click", target: "any" });
    handles.fireClick([100, 200]);
    const body = JSON.parse((await promise).content);
    expect(body).toEqual({
      ok: true,
      x: 100,
      y: 200,
      cell: 1234,
      target_matched: "any",
      ...Object.fromEntries(
        Object.entries(fullHits).filter(([k]) => k !== "cell"),
      ),
    });
  });
});

describe("request_map_click tool — strict mismatch", () => {
  it("does not resolve on burg mismatch; tip fires; second matching click resolves", async () => {
    const handles = makeRuntime();
    const tool = makeTool(handles.runtime);
    const promise = tool.execute({ prompt: "pick a burg", target: "burg" });
    // First click: no burg.
    handles.fireClick([5, 5], null, { cell: 1 });
    expect(handles.tip).toHaveBeenCalledTimes(1);
    expect(handles.tip).toHaveBeenLastCalledWith(buildMisclickTip("burg"));
    expect(handles.detachClick).not.toHaveBeenCalled();
    // Second click: has a burg.
    handles.fireClick([6, 6], null, {
      cell: 2,
      burg: { i: 9, name: "B" },
    });
    const body = JSON.parse((await promise).content);
    expect(body.target_matched).toBe("burg");
    expect(body.burg).toEqual({ i: 9, name: "B" });
  });

  it("each entity target nudges with tip on negative click", async () => {
    const targets: ClickTarget[] = [
      "burg",
      "state",
      "province",
      "culture",
      "religion",
      "marker",
      "route",
      "river",
      "zone",
      "label",
    ];
    for (const target of targets) {
      const handles = makeRuntime({ hits: { cell: 0 } });
      const controllerStub = makeStubController();
      const tool = makeTool(handles.runtime, controllerStub);
      const promise = tool.execute({ prompt: "click", target });
      handles.fireClick([1, 1]);
      expect(handles.tip).toHaveBeenCalledWith(buildMisclickTip(target));
      // Free the pending promise via cancel.
      controllerStub.fireCancel(
        controllerStub.emitClickRequest.mock.calls[0][0].cancelToken,
      );
      const result = await promise;
      expect(result.isError).toBe(true);
    }
  });

  it("degrades gracefully when pack collection is empty (mis-click)", async () => {
    const handles = makeRuntime({ hits: { cell: 0 } });
    const controllerStub = makeStubController();
    const tool = makeTool(handles.runtime, controllerStub);
    const promise = tool.execute({ prompt: "pick a marker", target: "marker" });
    handles.fireClick([1, 1]);
    expect(handles.tip).toHaveBeenCalled();
    controllerStub.fireCancel(
      controllerStub.emitClickRequest.mock.calls[0][0].cancelToken,
    );
    await promise;
  });
});

describe("request_map_click tool — cancel/timeout", () => {
  it("rejects with cancel error when controller cancel fires", async () => {
    const handles = makeRuntime();
    const stub = makeStubController();
    const tool = makeTool(handles.runtime, stub);
    const promise = tool.execute({ prompt: "click", target: "any" });
    const token = stub.emitClickRequest.mock.calls[0][0].cancelToken;
    stub.fireCancel(token);
    const result = await promise;
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "User cancelled the click request.",
    );
  });

  it("rejects with cancel error when ESC fires", async () => {
    const handles = makeRuntime();
    const stub = makeStubController();
    const tool = makeTool(handles.runtime, stub);
    const promise = tool.execute({ prompt: "click", target: "any" });
    handles.fireEsc();
    const result = await promise;
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "User cancelled the click request.",
    );
  });

  it("rejects with timeout error when timer fires", async () => {
    const handles = makeRuntime();
    const tool = makeTool(handles.runtime);
    const promise = tool.execute({ prompt: "click", timeout_ms: 1000 });
    expect(handles.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
    handles.fireTimeout();
    const result = await promise;
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "Click request timed out after 1000ms.",
    );
  });
});

describe("request_map_click tool — cleanup", () => {
  it("cleans up on resolve", async () => {
    const handles = makeRuntime({
      hits: { cell: 1 },
    });
    const stub = makeStubController();
    const tool = makeTool(handles.runtime, stub);
    const promise = tool.execute({ prompt: "click", target: "any" });
    const token = stub.emitClickRequest.mock.calls[0][0].cancelToken;
    handles.fireClick([1, 2]);
    await promise;
    expect(handles.detachClick).toHaveBeenCalledOnce();
    expect(handles.detachEsc).toHaveBeenCalledOnce();
    expect(handles.clearTimeout).toHaveBeenCalledOnce();
    expect(stub.unregister).toHaveBeenCalledOnce();
    // Cursor: set to crosshair (target=any) then restored to default.
    expect(handles.setCursor).toHaveBeenNthCalledWith(1, "crosshair");
    expect(handles.setCursor).toHaveBeenNthCalledWith(2, "default");
    expect(stub.emitClickRequestEnd).toHaveBeenCalledWith(token);
  });

  it("cleans up on cancel", async () => {
    const handles = makeRuntime();
    const stub = makeStubController();
    const tool = makeTool(handles.runtime, stub);
    const promise = tool.execute({ prompt: "click", target: "any" });
    const token = stub.emitClickRequest.mock.calls[0][0].cancelToken;
    stub.fireCancel(token);
    await promise;
    expect(handles.detachClick).toHaveBeenCalledOnce();
    expect(handles.detachEsc).toHaveBeenCalledOnce();
    expect(handles.clearTimeout).toHaveBeenCalledOnce();
    expect(stub.unregister).toHaveBeenCalledOnce();
    expect(stub.emitClickRequestEnd).toHaveBeenCalledWith(token);
  });

  it("cleans up on timeout (no leaked handlers)", async () => {
    const handles = makeRuntime();
    const stub = makeStubController();
    const tool = makeTool(handles.runtime, stub);
    const promise = tool.execute({ prompt: "click", timeout_ms: 1000 });
    handles.fireTimeout();
    await promise;
    expect(handles.detachClick).toHaveBeenCalledOnce();
    expect(handles.detachEsc).toHaveBeenCalledOnce();
    expect(handles.clearTimeout).toHaveBeenCalledOnce();
    expect(stub.unregister).toHaveBeenCalledOnce();
    expect(stub.emitClickRequestEnd).toHaveBeenCalledOnce();
  });

  it("cleanup is idempotent (cancel then timeout)", async () => {
    const handles = makeRuntime();
    const stub = makeStubController();
    const tool = makeTool(handles.runtime, stub);
    const promise = tool.execute({ prompt: "click", timeout_ms: 1000 });
    const token = stub.emitClickRequest.mock.calls[0][0].cancelToken;
    stub.fireCancel(token);
    handles.fireTimeout();
    handles.fireEsc();
    handles.fireClick([1, 2]);
    const result = await promise;
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toBe(
      "User cancelled the click request.",
    );
    expect(stub.emitClickRequestEnd).toHaveBeenCalledTimes(1);
    expect(handles.detachClick).toHaveBeenCalledTimes(1);
    expect(handles.detachEsc).toHaveBeenCalledTimes(1);
  });

  it("does not write cursor when validation fails before runtime entry", async () => {
    const handles = makeRuntime();
    handles.runtime.getViewbox = vi.fn(() => undefined);
    const tool = makeTool(handles.runtime);
    await tool.execute({ prompt: "click" });
    expect(handles.setCursor).not.toHaveBeenCalled();
  });
});

describe("request_map_click tool — UI events", () => {
  it("emits click_request on start and click_request_end on resolve with matching tokens", async () => {
    const handles = makeRuntime({ hits: { cell: 1 } });
    const stub = makeStubController();
    const tool = makeTool(handles.runtime, stub);
    const promise = tool.execute({
      prompt: "Pick a spot",
      target: "any",
    });
    expect(stub.emitClickRequest).toHaveBeenCalledOnce();
    const startPayload = stub.emitClickRequest.mock.calls[0][0];
    expect(startPayload.prompt).toBe("Pick a spot");
    expect(startPayload.target).toBe("any");
    expect(typeof startPayload.cancelToken).toBe("object");
    handles.fireClick([1, 2]);
    await promise;
    expect(stub.emitClickRequestEnd).toHaveBeenCalledOnce();
    expect(stub.emitClickRequestEnd.mock.calls[0][0]).toBe(
      startPayload.cancelToken,
    );
  });

  it("uses pointer cursor for entity targets and crosshair for any/cell", async () => {
    {
      const handles = makeRuntime({
        hits: { cell: 1, burg: { i: 1, name: "B" } },
      });
      const tool = makeTool(handles.runtime);
      const promise = tool.execute({ prompt: "click a burg", target: "burg" });
      handles.fireClick([1, 1]);
      await promise;
      expect(handles.setCursor).toHaveBeenNthCalledWith(1, "pointer");
    }
    {
      const handles = makeRuntime({ hits: { cell: 1 } });
      const tool = makeTool(handles.runtime);
      const promise = tool.execute({ prompt: "click", target: "cell" });
      handles.fireClick([1, 1]);
      await promise;
      expect(handles.setCursor).toHaveBeenNthCalledWith(1, "crosshair");
    }
  });
});

describe("matchTarget", () => {
  it("returns 'any' / 'cell' for the catch-all targets", () => {
    expect(matchTarget("any", { cell: 0 })).toBe("any");
    expect(matchTarget("cell", { cell: 0 })).toBe("cell");
  });
  it("returns the target when the entity is present", () => {
    expect(matchTarget("burg", { cell: 0, burg: { i: 1, name: "x" } })).toBe(
      "burg",
    );
  });
  it("returns null on mismatch", () => {
    expect(matchTarget("burg", { cell: 0 })).toBeNull();
    expect(matchTarget("river", { cell: 0 })).toBeNull();
  });
});

describe("buildMisclickTip", () => {
  it("returns text mentioning Cancel and the target", () => {
    expect(buildMisclickTip("burg")).toContain("burg");
    expect(buildMisclickTip("burg")).toContain("Cancel");
    expect(buildMisclickTip("any")).toContain("Cancel");
  });
});

describe("defaultClickRequestRuntime (integration)", () => {
  const originalViewbox = (globalThis as { viewbox?: unknown }).viewbox;
  const originalFindCell = (globalThis as { findCell?: unknown }).findCell;
  const originalTip = (globalThis as { tip?: unknown }).tip;
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { viewbox?: unknown }).viewbox = undefined;
    (globalThis as { findCell?: unknown }).findCell = undefined;
    (globalThis as { tip?: unknown }).tip = undefined;
    (globalThis as { pack?: unknown }).pack = undefined;
  });

  afterEach(() => {
    (globalThis as { viewbox?: unknown }).viewbox = originalViewbox;
    (globalThis as { findCell?: unknown }).findCell = originalFindCell;
    (globalThis as { tip?: unknown }).tip = originalTip;
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("getViewbox / getFindCell read from globals", () => {
    expect(defaultClickRequestRuntime.getViewbox()).toBeUndefined();
    expect(defaultClickRequestRuntime.getFindCell()).toBeUndefined();
    const viewbox = { mark: "vb" };
    (globalThis as { viewbox?: unknown }).viewbox = viewbox;
    (globalThis as { findCell?: unknown }).findCell = (x: number, y: number) =>
      x + y;
    expect(defaultClickRequestRuntime.getViewbox()).toBe(viewbox);
    expect(defaultClickRequestRuntime.getFindCell()?.(2, 3)).toBe(5);
  });

  it("setCursor writes viewbox.style and reads previous", () => {
    const styleCalls: Array<[string, string?]> = [];
    let stored = "auto";
    const viewbox = {
      style: vi.fn((name: string, value?: string) => {
        styleCalls.push([name, value]);
        if (value === undefined) return stored;
        stored = value;
        return viewbox;
      }),
      on: vi.fn(),
    };
    (globalThis as { viewbox?: unknown }).viewbox = viewbox;
    const previous = defaultClickRequestRuntime.setCursor("crosshair");
    expect(previous).toBe("auto");
    expect(viewbox.style).toHaveBeenCalledWith("cursor");
    expect(viewbox.style).toHaveBeenCalledWith("cursor", "crosshair");
  });

  it("tip invokes globalThis.tip when present, no-op when missing", () => {
    expect(() => defaultClickRequestRuntime.tip("hi")).not.toThrow();
    const tipFn = vi.fn();
    (globalThis as { tip?: unknown }).tip = tipFn;
    defaultClickRequestRuntime.tip("hello");
    expect(tipFn).toHaveBeenCalledWith("hello", false, "warn");
  });

  it("addEscListener no-ops cleanly when document is missing", () => {
    // Node environment: document is undefined. The runtime must return a
    // detach function that is safe to call.
    const cb = vi.fn();
    const detach = defaultClickRequestRuntime.addEscListener(cb);
    expect(typeof detach).toBe("function");
    expect(() => detach()).not.toThrow();
    expect(cb).not.toHaveBeenCalled();
  });

  it("attachClickHandler captures previous viewbox handler and restores on detach", () => {
    let storedHandler: unknown = null;
    const onCalls: unknown[] = [];
    const viewbox = {
      on: vi.fn((eventName: string, handler?: unknown) => {
        if (handler === undefined) return storedHandler;
        onCalls.push([eventName, handler]);
        storedHandler = handler;
        return viewbox;
      }),
      style: vi.fn(),
    };
    const previousHandler = () => {};
    storedHandler = previousHandler;
    (globalThis as { viewbox?: unknown }).viewbox = viewbox;
    const handler = vi.fn();
    const detach = defaultClickRequestRuntime.attachClickHandler(handler);
    expect(storedHandler).not.toBe(previousHandler);
    detach();
    expect(storedHandler).toBe(previousHandler);
  });

  it("defaultHitTest reads cell and entities from globals/pack", () => {
    (globalThis as { findCell?: unknown }).findCell = (
      _x: number,
      _y: number,
    ) => 3;
    (globalThis as { pack?: unknown }).pack = {
      cells: {
        burg: [0, 0, 0, 5],
        state: [0, 0, 0, 2],
        province: [0, 0, 0, 0],
        culture: [0, 0, 0, 0],
        religion: [0, 0, 0, 0],
        r: [0, 0, 0, 0],
      },
      burgs: [{ i: 0 }, { i: 1, name: "X" }, { i: 2 }, { i: 5, name: "Bree" }],
      states: [{ i: 0 }, { i: 1 }, { i: 2, name: "Valoria" }],
      provinces: [],
      cultures: [],
      religions: [],
      rivers: [],
      routes: [],
      zones: [],
      markers: [],
    };
    const hits = defaultHitTest([0, 0], null);
    expect(hits.cell).toBe(3);
    expect(hits.burg).toEqual({ i: 5, name: "Bree" });
    expect(hits.state).toEqual({ i: 2, name: "Valoria" });
  });

  it("defaultHitTest reports a zone when the cell is inside one", () => {
    (globalThis as { findCell?: unknown }).findCell = () => 5;
    (globalThis as { pack?: unknown }).pack = {
      cells: { burg: [0, 0, 0, 0, 0, 0] },
      zones: [
        { i: 1, name: "Plague", cells: [3, 4, 5] },
        { i: 2, name: "Other", cells: [9] },
      ],
    };
    const hits = defaultHitTest([0, 0], null);
    expect(hits.zone).toEqual({ i: 1, name: "Plague" });
  });

  it("returns cell -1 when findCell is missing", () => {
    const hits = defaultHitTest([0, 0], null);
    expect(hits.cell).toBe(-1);
  });

  it("integration: tool invokes default-runtime end-to-end with a synthetic viewbox", async () => {
    const stored = { handler: null as null | ((...args: unknown[]) => void) };
    let storedCursor = "auto";
    const viewbox = {
      on: vi.fn((_eventName: string, handler?: unknown) => {
        if (handler === undefined) return stored.handler;
        stored.handler = handler as (...a: unknown[]) => void;
        return viewbox;
      }),
      style: vi.fn((_name: string, value?: string) => {
        if (value === undefined) return storedCursor;
        storedCursor = value;
        return viewbox;
      }),
    };
    (globalThis as { viewbox?: unknown }).viewbox = viewbox;
    (globalThis as { findCell?: unknown }).findCell = (
      _x: number,
      _y: number,
    ) => 42;
    (globalThis as { pack?: unknown }).pack = {
      cells: {
        burg: [],
        state: [],
        province: [],
        culture: [],
        religion: [],
        r: [],
      },
      burgs: [],
      states: [],
      provinces: [],
      cultures: [],
      religions: [],
      rivers: [],
      routes: [],
      zones: [],
      markers: [],
    };
    const tool = createRequestMapClickTool();
    const promise = tool.execute({ prompt: "click", target: "any" });
    // Synthesize the call by directly invoking the captured handler with d3-shape inputs.
    // The default runtime expects `(this) => ...` reading globalThis.d3.event /
    // globalThis.d3.mouse(this). We supply both:
    (
      globalThis as {
        d3?: { event?: unknown; mouse?: (n: unknown) => [number, number] };
      }
    ).d3 = {
      event: { offsetX: 7, offsetY: 8, target: null },
      mouse: () => [7, 8],
    };
    if (stored.handler) stored.handler.call(null);
    const body = JSON.parse((await promise).content);
    expect(body.ok).toBe(true);
    expect(body.cell).toBe(42);
    expect(body.x).toBe(7);
    expect(body.y).toBe(8);
    delete (globalThis as { d3?: unknown }).d3;
  });
});
