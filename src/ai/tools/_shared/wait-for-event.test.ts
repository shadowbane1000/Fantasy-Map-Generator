import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitForWindowEvent } from "./wait-for-event";

describe("waitForWindowEvent", () => {
  let prevWindow: unknown;
  beforeEach(() => {
    prevWindow = (globalThis as { window?: unknown }).window;
  });
  afterEach(() => {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  });

  it("resolves when the named event fires", async () => {
    const target = new EventTarget();
    (globalThis as { window?: EventTarget }).window = target;
    const promise = waitForWindowEvent("map:generated", 1000);
    queueMicrotask(() => target.dispatchEvent(new Event("map:generated")));
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects on timeout", async () => {
    const target = new EventTarget();
    (globalThis as { window?: EventTarget }).window = target;
    await expect(waitForWindowEvent("never-fires", 5)).rejects.toThrow(
      /Timed out after 5ms/,
    );
  });

  it("only settles once even if the event fires multiple times", async () => {
    const target = new EventTarget();
    (globalThis as { window?: EventTarget }).window = target;
    const promise = waitForWindowEvent("map:generated", 1000);
    target.dispatchEvent(new Event("map:generated"));
    target.dispatchEvent(new Event("map:generated"));
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects when no event target is available", async () => {
    // Temporarily override both window AND globalThis's addEventListener
    // by shadowing window with something that has no addEventListener.
    (globalThis as { window?: unknown }).window = {};
    await expect(waitForWindowEvent("x", 100)).rejects.toThrow(
      /No event target/,
    );
  });
});
