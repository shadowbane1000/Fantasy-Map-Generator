import type { ToolResult } from "../index";

export function okResult(body: Record<string, unknown> = {}): ToolResult {
  return { content: JSON.stringify({ ok: true, ...body }) };
}

export function errorResult(
  error: string,
  extra: Record<string, unknown> = {},
): ToolResult {
  return {
    isError: true,
    content: JSON.stringify({ ok: false, error, ...extra }),
  };
}
