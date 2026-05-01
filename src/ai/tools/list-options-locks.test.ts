import { describe, expect, it, vi } from "vitest";
import { createListOptionsLocksTool } from "./list-options-locks";
import {
  OPTIONS_LOCK_KEYS,
  type OptionsLockKey,
  type OptionsLockRuntime,
  REGENERATION_GATING_LOCKS,
} from "./set-options-lock";

function makeRuntime(initial: Partial<Record<OptionsLockKey, boolean>> = {}) {
  const state = new Map<OptionsLockKey, boolean>();
  for (const k of OPTIONS_LOCK_KEYS) state.set(k, initial[k] ?? false);
  const runtime: OptionsLockRuntime = {
    isLocked: vi.fn((id: OptionsLockKey) => state.get(id) ?? false),
    setLocked: vi.fn(),
  };
  return { runtime };
}

describe("list_options_locks tool", () => {
  it("returns one entry per lockable key", async () => {
    const { runtime } = makeRuntime();
    const tool = createListOptionsLocksTool(runtime);
    const result = await tool.execute({});
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content);
    expect(body.locks).toHaveLength(OPTIONS_LOCK_KEYS.length);
    for (const id of OPTIONS_LOCK_KEYS) {
      const entry = body.locks.find((l: { id: string }) => l.id === id);
      expect(entry).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.locked).toBe(false);
      expect(entry.gatesRegeneration).toBe(REGENERATION_GATING_LOCKS.has(id));
    }
  });

  it("reports current locked state and lockedCount", async () => {
    const { runtime } = makeRuntime({
      template: true,
      statesNumber: true,
      mapName: true,
    });
    const tool = createListOptionsLocksTool(runtime);
    const result = await tool.execute({});
    const body = JSON.parse(result.content);
    expect(body.lockedCount).toBe(3);
    const lockedIds = body.locks
      .filter((l: { locked: boolean }) => l.locked)
      .map((l: { id: string }) => l.id)
      .sort();
    expect(lockedIds).toEqual(["mapName", "statesNumber", "template"]);
  });

  it("flags gating vs persistence-only locks correctly", async () => {
    const { runtime } = makeRuntime();
    const tool = createListOptionsLocksTool(runtime);
    const body = JSON.parse((await tool.execute({})).content);
    const map = new Map(
      body.locks.map((l: { id: string; gatesRegeneration: boolean }) => [
        l.id,
        l.gatesRegeneration,
      ]),
    );
    // Gating examples
    expect(map.get("template")).toBe(true);
    expect(map.get("statesNumber")).toBe(true);
    expect(map.get("prec")).toBe(true);
    // Persistence-only examples
    expect(map.get("mapName")).toBe(false);
    expect(map.get("year")).toBe(false);
    expect(map.get("templateSeed")).toBe(false);
  });
});
