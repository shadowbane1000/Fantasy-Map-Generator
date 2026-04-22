import type { ToolResult } from "../index";
import { okResult } from "./results";

export interface PagingInput {
  limit?: unknown;
  offset?: unknown;
}

export interface Paging {
  limit: number;
  offset: number;
}

export interface PagingOptions {
  maxLimit?: number;
  defaultLimit?: number;
}

export function validatePaging(
  input: PagingInput,
  options: PagingOptions = {},
): Paging | string {
  const maxLimit = options.maxLimit ?? 500;
  const defaultLimit = options.defaultLimit ?? 100;
  let limit = defaultLimit;
  let offset = 0;
  if (input.limit !== undefined && input.limit !== null) {
    if (
      typeof input.limit !== "number" ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > maxLimit
    ) {
      return `limit must be an integer between 1 and ${maxLimit}.`;
    }
    limit = input.limit;
  }
  if (input.offset !== undefined && input.offset !== null) {
    if (
      typeof input.offset !== "number" ||
      !Number.isInteger(input.offset) ||
      input.offset < 0
    ) {
      return "offset must be a non-negative integer.";
    }
    offset = input.offset;
  }
  return { limit, offset };
}

export function paginatedListResponse<T>(
  items: T[],
  paging: Paging,
  collectionKey: string,
  extra: Record<string, unknown> = {},
): ToolResult {
  const slice = items.slice(paging.offset, paging.offset + paging.limit);
  return okResult({
    total: items.length,
    limit: paging.limit,
    offset: paging.offset,
    ...extra,
    [collectionKey]: slice,
  });
}
