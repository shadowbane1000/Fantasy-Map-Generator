import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawReligion } from "./_shared";
import {
  createSetReligionFormTool,
  type ReligionFormRef,
  type ReligionFormRuntime,
  setReligionFormTool,
} from "./set-religion-form";

function makeRuntime(find: (ref: number | string) => ReligionFormRef | null): {
  runtime: ReligionFormRuntime;
  apply: ReturnType<typeof vi.fn<ReligionFormRuntime["apply"]>>;
} {
  const apply = vi.fn<ReligionFormRuntime["apply"]>();
  return { runtime: { find, apply }, apply };
}

describe("set_religion_form tool", () => {
  it("sets form by numeric id", async () => {
    const { runtime, apply } = makeRuntime((ref) =>
      ref === 2
        ? { i: 2, name: "Brightpath", previousForm: "Monotheism" }
        : null,
    );
    const tool = createSetReligionFormTool(runtime);
    const result = await tool.execute({ religion: 2, form: "Orthodoxy" });
    expect(result.isError).toBeFalsy();
    expect(apply).toHaveBeenCalledWith(2, "Orthodoxy");
    expect(JSON.parse(result.content)).toEqual({
      ok: true,
      i: 2,
      name: "Brightpath",
      previousForm: "Monotheism",
      form: "Orthodoxy",
    });
  });

  it("sets form by case-insensitive name", async () => {
    const find = vi.fn<ReligionFormRuntime["find"]>((ref) =>
      typeof ref === "string" && ref.toLowerCase() === "old faith"
        ? { i: 1, name: "Old Faith", previousForm: "Animism" }
        : null,
    );
    const { runtime, apply } = makeRuntime(find);
    const tool = createSetReligionFormTool(runtime);
    await tool.execute({ religion: "OLD FAITH", form: "Shamanism" });
    expect(find).toHaveBeenCalledWith("OLD FAITH");
    expect(apply).toHaveBeenCalledWith(1, "Shamanism");
  });

  it("trims the form", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousForm: null,
    }));
    const tool = createSetReligionFormTool(runtime);
    await tool.execute({ religion: 1, form: "  Church of Light  " });
    expect(apply).toHaveBeenCalledWith(1, "Church of Light");
  });

  it("rejects invalid religion refs", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetReligionFormTool(runtime);
    for (const bad of [null, undefined, 0, -1, 1.5, ""]) {
      const r = await tool.execute({ religion: bad, form: "Animism" });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid form", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 1,
      name: "x",
      previousForm: null,
    }));
    const tool = createSetReligionFormTool(runtime);
    for (const bad of [null, undefined, "", "   ", 42, {}]) {
      const r = await tool.execute({ religion: 1, form: bad });
      expect(r.isError).toBe(true);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("refuses to set form on religion 0", async () => {
    const { runtime, apply } = makeRuntime(() => ({
      i: 0,
      name: "No religion",
      previousForm: null,
    }));
    const tool = createSetReligionFormTool(runtime);
    const result = await tool.execute({ religion: 0, form: "Nothing" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("errors when religion is unknown", async () => {
    const { runtime, apply } = makeRuntime(() => null);
    const tool = createSetReligionFormTool(runtime);
    const result = await tool.execute({ religion: 999, form: "Cult" });
    expect(result.isError).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("surfaces runtime failures", async () => {
    const runtime: ReligionFormRuntime = {
      find: () => ({ i: 1, name: "x", previousForm: null }),
      apply: vi.fn(() => {
        throw new Error("pack missing");
      }),
    };
    const tool = createSetReligionFormTool(runtime);
    const result = await tool.execute({ religion: 1, form: "Animism" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/pack missing/);
  });
});

describe("defaultReligionFormRuntime (integration)", () => {
  const originalPack = (globalThis as { pack?: unknown }).pack;

  beforeEach(() => {
    (globalThis as { pack?: unknown }).pack = {
      religions: [
        { i: 0, name: "No religion", removed: true },
        { i: 1, name: "Old Faith", form: "Animism" },
        { i: 2, name: "Brightpath", form: "Monotheism" },
      ] satisfies RawReligion[],
    };
  });

  afterEach(() => {
    (globalThis as { pack?: unknown }).pack = originalPack;
  });

  it("retypes the religion form in the live pack", async () => {
    const result = await setReligionFormTool.execute({
      religion: 1,
      form: "Shamanism",
    });
    expect(result.isError).toBeFalsy();
    const pack = (globalThis as { pack: { religions: RawReligion[] } }).pack;
    expect(pack.religions[1]?.form).toBe("Shamanism");
  });

  it("refuses when the religion is removed", async () => {
    const pack = (globalThis as { pack: { religions: RawReligion[] } }).pack;
    if (pack.religions[2]) pack.religions[2].removed = true;
    const result = await setReligionFormTool.execute({
      religion: 2,
      form: "Cult",
    });
    expect(result.isError).toBe(true);
  });
});
