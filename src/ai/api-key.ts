const STORAGE_KEY = "ai-chat-anthropic-api-key";

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getApiKey(): string | null {
  const s = storage();
  if (!s) return null;
  return s.getItem(STORAGE_KEY);
}

export function setApiKey(key: string): void {
  const s = storage();
  if (!s) return;
  s.setItem(STORAGE_KEY, key);
}

export function clearApiKey(): void {
  const s = storage();
  if (!s) return;
  s.removeItem(STORAGE_KEY);
}
