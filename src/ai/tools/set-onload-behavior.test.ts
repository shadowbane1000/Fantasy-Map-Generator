import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSetOnloadBehaviorTool,
  ONLOAD_BEHAVIORS,
  resolveOnloadBehavior,
  type SetOnloadBehaviorRuntime,
  setOnloadBehaviorTool,
} from "./set-onload-behavior";

describe("ONLOAD_BEHAVIORS", () => {
  it("has the two UI values", () => {
    expect(ONLOAD_BEHAVIORS).toEqual(["random", "lastSaved"]);
  });
});

describe("resolveOnloadBehavior", () => {
  it("canonicalizes case-insensitively", () => {
    expect(resolveOnloadBehavior("random")).toBe("random");
    expect(resolveOnloadBehavior("RANDOM")).toBe("random");
    expect(resolveOnloadBehavior("lastSaved")).toBe("lastSaved");
    expect(resolveOnloadBehavior("LASTSAVED")).toBe("lastSaved");
  });

  it("accepts aliases for random", () => {
    expect(resolveOnloadBehavior("new")).toBe("random");
    expect(resolveOnloadBehavior("new-map")).toBe("random");
    expect(resolveOnloadBehavior("generate")).toBe("random");
    expect(resolveOnloadBehavior("Random-Map")).toBe("random");
  });

  it("accepts aliases for lastSaved", () => {
    expect(resolveOnloadBehavior("saved")).toBe("lastSaved");
    expect(resolveOnloadBehavior("last")).toBe("lastSaved");
    expect(resolveOnloadBehavior("last-saved")).toBe("lastSaved");
    expect(resolveOnloadBehavior("restore")).toBe("lastSaved");
    expect(resolveOnloadBehavior("Open-Last-Saved-Map")).toBe("lastSaved");
  });

  it("returns null for unknown / non-string / empty", () => {
    expect(resolveOnloadBehavior("medium")).toBeNull();
    expect(resolveOnloadBehavior("")).toBeNull();
    expect(resolveOnloadBehavior("   ")).toBeNull();
    expect(resolveOnloadBehavior(42)).toBeNull();
    expect(resolveOnloadBehavior(null)).toBeNull();
    expect(resolveOnloadBehavior(undefined)).toBeNull();
  });
});

function makeRuntime(currentRead: string | null): {
  runtime: SetOnloadBehaviorRuntime;
  readCurrent: ReturnType<
    typeof vi.fn<SetOnloadBehaviorRuntime["readCurrent"]>
  >;
  apply: ReturnType<typeof vi.fn<SetOnloadBehaviorRuntime["apply"]>>;
} {
  const readCurrent = vi.fn<SetOnloadBehaviorRuntime["readCurrent"]>(
    () => currentRead,
  );
  const apply = vi.fn<SetOnloadBehaviorRuntime["apply"]>();
  return { runtime: { readCurrent, apply }, readCurrent, apply };
}

describe("set_onload_behavior tool", () => {
  it("delegates with canonical behavior", async () => {
    const { runtime, apply } = makeRuntime("random");
    const tool = createSetOnloadBehaviorTool(runtime);
    const result = await tool.execute({ behavior: "lastSaved" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith("lastSaved");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      behavior: "lastSaved",
      previousBehavior: "random",
      noop: false,
    });
  });

  it("canonicalizes case and aliases", async () => {
    const { runtime, apply } = makeRuntime(null);
    const tool = createSetOnloadBehaviorTool(runtime);
    await tool.execute({ behavior: "NEW" });
    expect(apply).toHaveBeenCalledWith("random");

    apply.mockClear();
    await tool.execute({ behavior: "restore" });
    expect(apply).toHaveBeenCalledWith("lastSaved");
  });

  it("rejects unknown behavior", async () => {
    const { runtime, apply } = makeRuntime(null);
    const tool = createSetOnloadBehaviorTool(runtime);
    const result = await tool.execute({ behavior: "medium" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content).supported).toEqual([
      "random",
      "lastSaved",
    ]);
  });

  it("rejects empty / non-string / missing", async () => {
    const { runtime, apply } = makeRuntime(null);
    const tool = createSetOnloadBehaviorTool(runtime);
    for (const bad of [null, undefined, 42, "", "   ", {}]) {
      const r = await tool.execute({ behavior: bad });
      expect(r.isError).toBe(true);
    }
    const r = await tool.execute({});
    expect(r.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("is a noop when current read matches target", async () => {
    const { runtime, apply } = makeRuntime("lastSaved");
    const tool = createSetOnloadBehaviorTool(runtime);
    const result = await tool.execute({ behavior: "lastSaved" });
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      behavior: "lastSaved",
      previousBehavior: "lastSaved",
      noop: true,
    });
  });

  it("surfaces runtime errors", async () => {
    const runtime: SetOnloadBehaviorRuntime = {
      readCurrent: () => null,
      apply: vi.fn(() => {
        throw new Error("localStorage is not available.");
      }),
    };
    const tool = createSetOnloadBehaviorTool(runtime);
    const result = await tool.execute({ behavior: "random" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/localStorage/);
  });
});

describe("defaultSetOnloadBehaviorRuntime (integration)", () => {
  const selectEl: { value: string } = { value: "" };
  const getElementById = vi.fn((id: string) =>
    id === "onloadBehavior" ? selectEl : null,
  );
  const storage: Record<string, string> = {};

  const originalDoc = (globalThis as { document?: unknown }).document;
  const originalLocalStorage = (globalThis as { localStorage?: unknown })
    .localStorage;

  beforeEach(() => {
    selectEl.value = "random";
    for (const k of Object.keys(storage)) delete storage[k];
    getElementById.mockClear();
    (globalThis as unknown as { document: unknown }).document = {
      getElementById,
    };
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      setItem(key: string, value: string) {
        storage[key] = value;
      },
      getItem(key: string) {
        return storage[key] ?? null;
      },
    };
  });

  afterEach(() => {
    (globalThis as { document?: unknown }).document = originalDoc;
    (globalThis as { localStorage?: unknown }).localStorage =
      originalLocalStorage;
  });

  it("writes DOM + localStorage", async () => {
    const result = await setOnloadBehaviorTool.execute({
      behavior: "lastSaved",
    });
    expect(result.isError).toBeFalsy();
    expect(selectEl.value).toBe("lastSaved");
    expect(storage.onloadBehavior).toBe("lastSaved");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      behavior: "lastSaved",
      previousBehavior: "random",
      noop: false,
    });
  });

  it("is a noop when DOM value already matches", async () => {
    selectEl.value = "lastSaved";
    const result = await setOnloadBehaviorTool.execute({
      behavior: "lastSaved",
    });
    expect(JSON.parse(result.content).noop).toBe(true);
    expect(storage.onloadBehavior).toBeUndefined();
  });

  it("falls back to localStorage when DOM element missing", async () => {
    getElementById.mockImplementation(() => null);
    storage.onloadBehavior = "random";
    const result = await setOnloadBehaviorTool.execute({
      behavior: "random",
    });
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      behavior: "random",
      previousBehavior: "random",
      noop: true,
    });
  });

  it("still writes localStorage when DOM element missing (non-noop)", async () => {
    getElementById.mockImplementation(() => null);
    // previousBehavior will be null — apply runs.
    const result = await setOnloadBehaviorTool.execute({
      behavior: "lastSaved",
    });
    expect(result.isError).toBeFalsy();
    expect(storage.onloadBehavior).toBe("lastSaved");
  });

  it("errors when localStorage is unavailable", async () => {
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
    const result = await setOnloadBehaviorTool.execute({
      behavior: "random",
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/localStorage/);
  });
});
