import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetStateLabelsModeTool,
  resolveStateLabelsMode,
  STATE_LABELS_MODES,
  type StateLabelsModeRuntime,
  setStateLabelsModeTool,
} from "./set-state-labels-mode";

describe("resolveStateLabelsMode", () => {
  it("canonicalizes case-insensitively", () => {
    expect(resolveStateLabelsMode("Auto")).toBe("auto");
    expect(resolveStateLabelsMode("SHORT")).toBe("short");
    expect(resolveStateLabelsMode("full")).toBe("full");
  });

  it("returns null for unknown / non-string", () => {
    expect(resolveStateLabelsMode("medium")).toBeNull();
    expect(resolveStateLabelsMode("")).toBeNull();
    expect(resolveStateLabelsMode(42)).toBeNull();
    expect(resolveStateLabelsMode(null)).toBeNull();
  });
});

describe("STATE_LABELS_MODES", () => {
  it("has 3 modes", () => {
    expect(STATE_LABELS_MODES).toEqual(["auto", "short", "full"]);
  });
});

function makeRuntime(currentRead: ReturnType<StateLabelsModeRuntime["read"]>): {
  runtime: StateLabelsModeRuntime;
  apply: ReturnType<typeof vi.fn<StateLabelsModeRuntime["apply"]>>;
} {
  const apply = vi.fn<StateLabelsModeRuntime["apply"]>();
  return {
    runtime: { read: () => currentRead, apply },
    apply,
  };
}

describe("set_state_labels_mode tool", () => {
  it("delegates with canonical mode", async () => {
    const { runtime, apply } = makeRuntime("auto");
    const tool = createSetStateLabelsModeTool(runtime);
    const result = await tool.execute({ mode: "full" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("full");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      mode: "full",
      previous: "auto",
      noop: false,
    });
  });

  it("canonicalizes case", async () => {
    const { runtime, apply } = makeRuntime(null);
    const tool = createSetStateLabelsModeTool(runtime);
    await tool.execute({ mode: "SHORT" });
    expect(apply).toHaveBeenCalledWith("short");
  });

  it("rejects unknown mode", async () => {
    const { runtime, apply } = makeRuntime(null);
    const tool = createSetStateLabelsModeTool(runtime);
    const result = await tool.execute({ mode: "medium" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects empty / non-string", async () => {
    const { runtime, apply } = makeRuntime(null);
    const tool = createSetStateLabelsModeTool(runtime);
    for (const bad of [null, undefined, 42, "", "   "]) {
      const r = await tool.execute({ mode: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("is a noop when current read matches target", async () => {
    const { runtime, apply } = makeRuntime("short");
    const tool = createSetStateLabelsModeTool(runtime);
    const result = await tool.execute({ mode: "short" });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).noop).toBe(true);
  });

  it("surfaces runtime errors", async () => {
    const runtime: StateLabelsModeRuntime = {
      read: () => null,
      apply: vi.fn(() => {
        throw new Error("options is not available");
      }),
    };
    const tool = createSetStateLabelsModeTool(runtime);
    const result = await tool.execute({ mode: "full" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/options/);
  });
});

describe("defaultStateLabelsModeRuntime (integration)", () => {
  const drawStateLabels = vi.fn();
  const selectEl = { value: "auto" };
  const getElementById = vi.fn((id: string) =>
    id === "stateLabelsModeInput" ? selectEl : null,
  );
  const storage: Record<string, string> = {};

  const originalOptions = (globalThis as { options?: unknown }).options;
  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalLocalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;
  const originalDraw = (globalThis as { drawStateLabels?: unknown })
    .drawStateLabels;

  beforeEach(() => {
    drawStateLabels.mockReset();
    selectEl.value = "auto";
    for (const k of Object.keys(storage)) delete storage[k];
    getElementById.mockClear();
    (globalThis as { options?: unknown }).options = { stateLabelsMode: "auto" };
    (globalThis as { document?: unknown }).document = { getElementById };
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem(key: string, value: string) {
        storage[key] = value;
      },
      getItem(key: string) {
        return storage[key] ?? null;
      },
    };
    (globalThis as { drawStateLabels?: unknown }).drawStateLabels =
      drawStateLabels;
  });

  afterEach(() => {
    (globalThis as { options?: unknown }).options = originalOptions;
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { localStorage?: unknown }).localStorage =
      originalLocalStorage;
    (globalThis as { drawStateLabels?: unknown }).drawStateLabels =
      originalDraw;
  });

  it("writes options + DOM + localStorage and calls drawStateLabels", async () => {
    const result = await setStateLabelsModeTool.execute({ mode: "full" });
    expect(result.isError).toBeFalsy();
    const options = (
      globalThis as unknown as { options: { stateLabelsMode?: string } }
    ).options;
    expect(options.stateLabelsMode).toBe("full");
    expect(selectEl.value).toBe("full");
    expect(storage.stateLabelsMode).toBe("full");
    expect(drawStateLabels).toHaveBeenCalledTimes(1);
  });

  it("succeeds when drawStateLabels missing", async () => {
    (globalThis as { drawStateLabels?: unknown }).drawStateLabels = undefined;
    const result = await setStateLabelsModeTool.execute({ mode: "short" });
    expect(result.isError).toBeFalsy();
    const options = (
      globalThis as unknown as { options: { stateLabelsMode?: string } }
    ).options;
    expect(options.stateLabelsMode).toBe("short");
  });

  it("is a noop when current matches", async () => {
    const options = (globalThis as { options?: { stateLabelsMode?: string } })
      .options;
    if (options) options.stateLabelsMode = "full";
    const result = await setStateLabelsModeTool.execute({ mode: "full" });
    expect(JSON.parse(result.content).noop).toBe(true);
    expect(drawStateLabels).not.toHaveBeenCalled();
  });
});
