import type { Tool, ToolResult } from "../index";
import {
  type Paging,
  type PagingInput,
  paginatedListResponse,
  validatePaging,
} from "./paging";
import { errorResult } from "./results";

export interface PaginatedListToolConfig<T, F = Record<string, never>> {
  name: string;
  description: string;
  inputSchema: Tool["input_schema"];
  collectionKey: string;
  notReadyError: string;
  maxLimit?: number;
  defaultLimit?: number;
  /** Fetch the full (unfiltered) list. Return null when the map isn't ready. */
  read: () => T[] | null;
  /** Optional: validate + parse non-paging fields. Return a string error or the parsed filter object. */
  parseFilters?: (input: Record<string, unknown>) => string | F;
  /** Optional: apply entity-specific filtering. Return a string error or the filtered items + optional echo fields. */
  applyFilters?: (
    items: T[],
    filters: F,
    paging: Paging,
  ) => string | { items: T[]; echo?: Record<string, unknown> };
}

export function createPaginatedListTool<T, F = Record<string, never>>(
  config: PaginatedListToolConfig<T, F>,
): Tool {
  const {
    name,
    description,
    inputSchema,
    collectionKey,
    notReadyError,
    maxLimit,
    defaultLimit,
    read,
    parseFilters,
    applyFilters,
  } = config;
  return {
    name,
    description,
    input_schema: inputSchema,
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as Record<string, unknown>;
      const paging = validatePaging(input as PagingInput, {
        maxLimit,
        defaultLimit,
      });
      if (typeof paging === "string") return errorResult(paging);

      let filters = {} as F;
      if (parseFilters) {
        const r = parseFilters(input);
        if (typeof r === "string") return errorResult(r);
        filters = r;
      }

      const items = read();
      if (!items) return errorResult(notReadyError);

      let finalItems = items;
      let echo: Record<string, unknown> = {};
      if (applyFilters) {
        const r = applyFilters(items, filters, paging);
        if (typeof r === "string") return errorResult(r);
        finalItems = r.items;
        echo = r.echo ?? {};
      }

      return paginatedListResponse(finalItems, paging, collectionKey, echo);
    },
  };
}
