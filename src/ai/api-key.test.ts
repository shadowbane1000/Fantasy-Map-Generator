import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearApiKey, getApiKey, setApiKey } from "./api-key";

interface MemStorage extends Storage {
  readonly data: Map<string, string>;
}

function createMemoryStorage(): MemStorage {
  const data = new Map<string, string>();
  const storage: MemStorage = {
    data,
    get length() {
      return data.size;
    },
    key(n) {
      return [...data.keys()][n] ?? null;
    },
    getItem(k) {
      return data.get(k) ?? null;
    },
    setItem(k, v) {
      data.set(k, String(v));
    },
    removeItem(k) {
      data.delete(k);
    },
    clear() {
      data.clear();
    },
  };
  return storage;
}

describe("api-key storage", () => {
  let previousStorage: Storage | undefined;

  beforeEach(() => {
    previousStorage = (globalThis as { localStorage?: Storage }).localStorage;
    (globalThis as { localStorage: Storage }).localStorage =
      createMemoryStorage();
  });

  afterEach(() => {
    if (previousStorage === undefined) {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    } else {
      (globalThis as { localStorage: Storage }).localStorage = previousStorage;
    }
  });

  it("returns null when no key is set", () => {
    expect(getApiKey()).toBeNull();
  });

  it("round-trips a key through setApiKey and getApiKey", () => {
    setApiKey("sk-ant-test-1");
    expect(getApiKey()).toBe("sk-ant-test-1");
  });

  it("clears a stored key", () => {
    setApiKey("sk-ant-test-2");
    expect(getApiKey()).toBe("sk-ant-test-2");
    clearApiKey();
    expect(getApiKey()).toBeNull();
  });
});
