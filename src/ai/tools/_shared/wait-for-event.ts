/**
 * Wait for a one-shot `CustomEvent` on `window` (or `globalThis` as a
 * fallback), with a timeout. Used by async tools that kick off a
 * long-running map mutation (regenerate, load) and need to wait for
 * the app to finish before returning.
 */
export function waitForWindowEvent(
  eventName: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const target =
      (globalThis as { window?: EventTarget }).window ??
      (globalThis as unknown as EventTarget);
    if (!target || typeof target.addEventListener !== "function") {
      reject(new Error(`No event target available to wait for ${eventName}.`));
      return;
    }
    let settled = false;
    const onEvent = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      target.removeEventListener(eventName, onEvent);
      resolve();
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      target.removeEventListener(eventName, onEvent);
      reject(
        new Error(`Timed out after ${timeoutMs}ms waiting for ${eventName}.`),
      );
    }, timeoutMs);
    target.addEventListener(eventName, onEvent, { once: true });
  });
}
