import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawBurg } from "./_shared";
import {
  createSetBurgLinkTool,
  type SetBurgLinkRef,
  type SetBurgLinkRuntime,
  setBurgLinkTool,
} from "./set-burg-link";

function makeRuntime(find: (ref: number | string) => SetBurgLinkRef | null): {
  runtime: SetBurgLinkRuntime;
  apply: ReturnType<typeof vi.fn<SetBurgLinkRuntime["apply"]>>;
} {
  const apply = vi.fn<SetBurgLinkRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_burg_link tool", () => {
  it("has the correct name", () => {
    expect(setBurgLinkTool.name).toBe("set_burg_link");
  });

  it("sets a non-empty string when previously unset", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Rookhold",
      previousLink: null,
    }));
    const tool = createSetBurgLinkTool(runtime);
    const result = await tool.execute({
      burg: 5,
      link: "https://example.com/foo",
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, "https://example.com/foo");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Rookhold",
      previousLink: null,
      link: "https://example.com/foo",
      noop: false,
    });
  });

  it("resolves by case-insensitive name", async () => {
    const find = vi.fn((_ref: number | string) => ({
      i: 3,
      name: "Ashholm",
      previousLink: null,
    }));
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetBurgLinkTool(runtime);
    const result = await tool.execute({
      burg: "ASHHOLM",
      link: "https://x",
    });
    expect(result.isError).toBeFalsy();
    expect(find).toHaveBeenCalledWith("ASHHOLM");
    expect(apply).toHaveBeenCalledWith(3, "https://x");
  });

  it("trims the input link", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Rookhold",
      previousLink: null,
    }));
    const tool = createSetBurgLinkTool(runtime);
    const result = await tool.execute({
      burg: 5,
      link: "  https://y  ",
    });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, "https://y");
    expect(JSON.parse(result.content).link).toBe("https://y");
  });

  it("clears the link when called with null", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Rookhold",
      previousLink: "old",
    }));
    const tool = createSetBurgLinkTool(runtime);
    const result = await tool.execute({ burg: 5, link: null });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(5, null);
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 5,
      name: "Rookhold",
      previousLink: "old",
      link: null,
      noop: false,
    });
  });

  it("is a noop when already cleared and called with null", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Rookhold",
      previousLink: null,
    }));
    const tool = createSetBurgLinkTool(runtime);
    const result = await tool.execute({ burg: 5, link: null });
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      previousLink: null,
      link: null,
      noop: true,
    });
  });

  it("is a noop when set to the same string", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "Rookhold",
      previousLink: "https://x",
    }));
    const tool = createSetBurgLinkTool(runtime);
    const result = await tool.execute({ burg: 5, link: "https://x" });
    expect(result.isError).toBeFalsy();
    expect(apply).not.toHaveBeenCalled();
    expect(JSON.parse(result.content)).toMatchObject({
      ok: true,
      noop: true,
      previousLink: "https://x",
      link: "https://x",
    });
  });

  it("rejects empty / whitespace-only string links", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousLink: null,
    }));
    const tool = createSetBurgLinkTool(runtime);
    for (const bad of ["", "   ", "\t\n"]) {
      const r = await tool.execute({ burg: 5, link: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /link must be a non-empty string or null/i,
      );
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects non-string non-null link types", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 5,
      name: "x",
      previousLink: null,
    }));
    const tool = createSetBurgLinkTool(runtime);
    for (const bad of [5, true, false, {}, [], undefined]) {
      const r = await tool.execute({ burg: 5, link: bad });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content).error).toMatch(
        /link must be a non-empty string or null/i,
      );
    }
    // Missing link key entirely.
    const rMissing = await tool.execute({ burg: 5 });
    expect(rMissing.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects bad burg refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBurgLinkTool(runtime);
    for (const bad of [0, -1, 1.5, "", null, undefined]) {
      const r = await tool.execute({ burg: bad, link: "https://x" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unknown burg with the standard message", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetBurgLinkTool(runtime);
    const result = await tool.execute({ burg: 999, link: "https://x" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/no burg found matching/i);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces apply errors", async () => {
    const runtime: SetBurgLinkRuntime = {
      find: () => ({ i: 5, name: "x", previousLink: null }),
      apply: vi.fn(() => {
        throw new Error("write blocked");
      }),
    };
    const tool = createSetBurgLinkTool(runtime);
    const result = await tool.execute({ burg: 5, link: "https://x" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/blocked/);
  });
});

describe("defaultSetBurgLinkRuntime (integration)", () => {
  const originalPack = (globalThis as unknown as { pack?: unknown }).pack;
  const originalUpdate = (
    globalThis as unknown as { updateBurgPreview?: unknown }
  ).updateBurgPreview;

  beforeEach(() => {
    const burgs: RawBurg[] = [];
    burgs[0] = { i: 0 };
    burgs[5] = { i: 5, name: "Rookhold" };
    burgs[6] = { i: 6, name: "Linked", link: "https://old.example/" };
    burgs[7] = { i: 7, name: "Gone", removed: true, link: "https://gone/" };
    (globalThis as unknown as { pack?: unknown }).pack = { burgs };
  });

  afterEach(() => {
    (globalThis as unknown as { pack?: unknown }).pack = originalPack;
    (
      globalThis as unknown as { updateBurgPreview?: unknown }
    ).updateBurgPreview = originalUpdate;
  });

  it("sets burg.link to a non-empty string", async () => {
    const result = await setBurgLinkTool.execute({
      burg: 5,
      link: "https://example.com",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[5]?.link).toBe("https://example.com");
  });

  it("DELETES the link field on clear (does not set to null or empty)", async () => {
    const result = await setBurgLinkTool.execute({ burg: 6, link: null });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { burgs: RawBurg[] } }).pack;
    const burg = pack.burgs[6];
    expect(burg).toBeDefined();
    // The load-bearing assertion: matches the editor's `delete burg.link`.
    expect("link" in (burg as object)).toBe(false);
    // Sanity — name preserved.
    expect(burg?.name).toBe("Linked");
  });

  it("rejects burg 0", async () => {
    const result = await setBurgLinkTool.execute({
      burg: 0,
      link: "https://x",
    });
    expect(result.isError).toBe(true);
  });

  it("rejects removed burgs", async () => {
    const result = await setBurgLinkTool.execute({
      burg: 7,
      link: "https://x",
    });
    expect(result.isError).toBe(true);
    const pack = (globalThis as unknown as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[7]?.link).toBe("https://gone/");
  });

  it("rejects when pack is missing", async () => {
    (globalThis as unknown as { pack?: unknown }).pack = undefined;
    const result = await setBurgLinkTool.execute({
      burg: 5,
      link: "https://x",
    });
    expect(result.isError).toBe(true);
  });

  it("resolves by case-insensitive name", async () => {
    const result = await setBurgLinkTool.execute({
      burg: "rookhold",
      link: "https://example.com",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[5]?.link).toBe("https://example.com");
  });

  it("calls updateBurgPreview with the burg when present on globalThis", async () => {
    const spy = vi.fn();
    (
      globalThis as unknown as { updateBurgPreview: typeof spy }
    ).updateBurgPreview = spy;
    const result = await setBurgLinkTool.execute({
      burg: 5,
      link: "https://example.com",
    });
    expect(result.isError).toBeFalsy();
    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0]?.[0] as RawBurg;
    expect(arg?.i).toBe(5);
    expect(arg?.link).toBe("https://example.com");
  });

  it("does not throw when updateBurgPreview is absent", async () => {
    (
      globalThis as unknown as { updateBurgPreview?: unknown }
    ).updateBurgPreview = undefined;
    const result = await setBurgLinkTool.execute({
      burg: 5,
      link: "https://example.com",
    });
    expect(result.isError).toBeFalsy();
  });

  it("swallows errors thrown by updateBurgPreview", async () => {
    (
      globalThis as unknown as { updateBurgPreview: () => void }
    ).updateBurgPreview = () => {
      throw new Error("popup boom");
    };
    const result = await setBurgLinkTool.execute({
      burg: 5,
      link: "https://example.com",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as unknown as { pack: { burgs: RawBurg[] } }).pack;
    expect(pack.burgs[5]?.link).toBe("https://example.com");
  });
});
