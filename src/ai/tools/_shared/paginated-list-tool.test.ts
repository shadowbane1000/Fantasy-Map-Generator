import { describe, expect, it } from "vitest";
import { createPaginatedListTool } from "./paginated-list-tool";

describe("createPaginatedListTool", () => {
  it("slices with default paging and returns the collection under the configured key", async () => {
    const tool = createPaginatedListTool<{ i: number; name: string }>({
      name: "list_things",
      description: "",
      inputSchema: { type: "object", properties: {} },
      collectionKey: "things",
      notReadyError: "not ready",
      read: () => [
        { i: 1, name: "a" },
        { i: 2, name: "b" },
      ],
    });
    const r = await tool.execute({});
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(r.content)).toEqual({
      ok: true,
      total: 2,
      limit: 100,
      offset: 0,
      things: [
        { i: 1, name: "a" },
        { i: 2, name: "b" },
      ],
    });
  });

  it("returns errorResult when read() yields null", async () => {
    const tool = createPaginatedListTool<number>({
      name: "list_x",
      description: "",
      inputSchema: { type: "object", properties: {} },
      collectionKey: "x",
      notReadyError: "Map is not ready yet.",
      read: () => null,
    });
    const r = await tool.execute({});
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe("Map is not ready yet.");
  });

  it("bubbles parseFilters errors before reading", async () => {
    let reads = 0;
    const tool = createPaginatedListTool<number, { x: number }>({
      name: "list_x",
      description: "",
      inputSchema: { type: "object", properties: {} },
      collectionKey: "x",
      notReadyError: "n/a",
      read: () => {
        reads++;
        return [1];
      },
      parseFilters: () => "bad filter",
    });
    const r = await tool.execute({});
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe("bad filter");
    expect(reads).toBe(0);
  });

  it("passes parsed filters into applyFilters and echoes the returned metadata", async () => {
    const tool = createPaginatedListTool<
      { id: number; kind: string },
      { kind?: string }
    >({
      name: "list_x",
      description: "",
      inputSchema: { type: "object", properties: {} },
      collectionKey: "rows",
      notReadyError: "n/a",
      read: () => [
        { id: 1, kind: "a" },
        { id: 2, kind: "b" },
        { id: 3, kind: "a" },
      ],
      parseFilters: (input) => ({
        kind: typeof input.kind === "string" ? input.kind : undefined,
      }),
      applyFilters: (items, filters) =>
        filters.kind
          ? {
              items: items.filter((i) => i.kind === filters.kind),
              echo: { filters: { kind: filters.kind } },
            }
          : { items },
    });
    const r = await tool.execute({ kind: "a" });
    const body = JSON.parse(r.content);
    expect(body.total).toBe(2);
    expect(body.filters).toEqual({ kind: "a" });
    expect(body.rows).toEqual([
      { id: 1, kind: "a" },
      { id: 3, kind: "a" },
    ]);
  });

  it("surfaces applyFilters errors", async () => {
    const tool = createPaginatedListTool<number>({
      name: "list_x",
      description: "",
      inputSchema: { type: "object", properties: {} },
      collectionKey: "x",
      notReadyError: "n/a",
      read: () => [1, 2],
      applyFilters: () => "filter broke",
    });
    const r = await tool.execute({});
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toBe("filter broke");
  });

  it("validates paging first", async () => {
    const tool = createPaginatedListTool<number>({
      name: "list_x",
      description: "",
      inputSchema: { type: "object", properties: {} },
      collectionKey: "x",
      notReadyError: "n/a",
      read: () => [1, 2],
    });
    const r = await tool.execute({ limit: 0 });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toMatch(/limit/);
  });
});
