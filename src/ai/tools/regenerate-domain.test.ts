import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRegenerateDomainTool,
  DOMAIN_TO_GLOBAL,
  REGENERATE_DOMAINS,
  type RegenerateDomainRuntime,
  regenerateDomainTool,
  resolveRegenerateDomain,
} from "./regenerate-domain";

describe("resolveRegenerateDomain", () => {
  it("canonicalizes case-insensitively", () => {
    expect(resolveRegenerateDomain("Rivers")).toBe("rivers");
    expect(resolveRegenerateDomain("STATES")).toBe("states");
    expect(resolveRegenerateDomain("population")).toBe("population");
  });

  it("returns null for unknown / non-string / empty", () => {
    expect(resolveRegenerateDomain("zones")).toBeNull();
    expect(resolveRegenerateDomain("")).toBeNull();
    expect(resolveRegenerateDomain(null)).toBeNull();
    expect(resolveRegenerateDomain(42)).toBeNull();
  });
});

describe("REGENERATE_DOMAINS and DOMAIN_TO_GLOBAL", () => {
  it("has 11 domains", () => {
    expect(REGENERATE_DOMAINS).toHaveLength(11);
  });

  it("maps each domain to its global", () => {
    expect(DOMAIN_TO_GLOBAL.rivers).toBe("regenerateRivers");
    expect(DOMAIN_TO_GLOBAL.routes).toBe("regenerateRoutes");
    expect(DOMAIN_TO_GLOBAL.population).toBe("recalculatePopulation");
    expect(DOMAIN_TO_GLOBAL.states).toBe("regenerateStates");
    expect(DOMAIN_TO_GLOBAL.provinces).toBe("regenerateProvinces");
    expect(DOMAIN_TO_GLOBAL.burgs).toBe("regenerateBurgs");
    expect(DOMAIN_TO_GLOBAL.religions).toBe("regenerateReligions");
    expect(DOMAIN_TO_GLOBAL.cultures).toBe("regenerateCultures");
    expect(DOMAIN_TO_GLOBAL.military).toBe("regenerateMilitary");
    expect(DOMAIN_TO_GLOBAL.ice).toBe("regenerateIce");
    expect(DOMAIN_TO_GLOBAL.markers).toBe("regenerateMarkers");
  });
});

function makeRuntime(): {
  runtime: RegenerateDomainRuntime;
  regenerate: ReturnType<typeof vi.fn<RegenerateDomainRuntime["regenerate"]>>;
} {
  const regenerate = vi.fn<RegenerateDomainRuntime["regenerate"]>();
  return { runtime: { regenerate }, regenerate };
}

describe("regenerate_domain tool", () => {
  it("dispatches the canonical domain to runtime.regenerate", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateDomainTool(runtime);
    const result = await tool.execute({ domain: "rivers" });
    expect(result.isError).toBeFalsy();
    expect(regenerate).toHaveBeenCalledWith("rivers");
    expect(JSON.parse(result.content)).toEqual({ ok: true, domain: "rivers" });
  });

  it("canonicalizes case of input", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateDomainTool(runtime);
    await tool.execute({ domain: "STATES" });
    expect(regenerate).toHaveBeenCalledWith("states");
  });

  it("rejects unknown domain", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateDomainTool(runtime);
    const result = await tool.execute({ domain: "zones" });
    expect(result.isError).toBe(true);
    expect(regenerate).not.toHaveBeenCalled();
    const body = JSON.parse(result.content);
    expect(body.supported).toContain("rivers");
  });

  it("rejects empty / non-string domain", async () => {
    const { runtime, regenerate } = makeRuntime();
    const tool = createRegenerateDomainTool(runtime);
    for (const bad of [null, undefined, 42, "", "   "]) {
      const r = await tool.execute({ domain: bad });
      expect(r.isError).toBe(true);
    }
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("surfaces runtime errors", async () => {
    const runtime: RegenerateDomainRuntime = {
      regenerate: vi.fn(() => {
        throw new Error("regenerateRivers is not available yet");
      }),
    };
    const tool = createRegenerateDomainTool(runtime);
    const result = await tool.execute({ domain: "rivers" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/regenerateRivers/);
  });
});

describe("defaultRegenerateDomainRuntime (integration)", () => {
  const originals: Record<string, unknown> = {};
  const mocks = Object.fromEntries(
    REGENERATE_DOMAINS.map((d) => [DOMAIN_TO_GLOBAL[d], vi.fn()]),
  );

  beforeEach(() => {
    for (const [name, fn] of Object.entries(mocks)) {
      originals[name] = (globalThis as Record<string, unknown>)[name];
      (fn as ReturnType<typeof vi.fn>).mockReset();
      (globalThis as Record<string, unknown>)[name] = fn;
    }
  });

  afterEach(() => {
    for (const [name, orig] of Object.entries(originals)) {
      (globalThis as Record<string, unknown>)[name] = orig;
    }
  });

  it("dispatches each domain to its global exactly once", async () => {
    for (const domain of REGENERATE_DOMAINS) {
      const globalName = DOMAIN_TO_GLOBAL[domain];
      const mock = mocks[globalName] as ReturnType<typeof vi.fn>;
      mock.mockClear();
      const result = await regenerateDomainTool.execute({ domain });
      expect(result.isError, `domain ${domain}`).toBeFalsy();
      expect(mock).toHaveBeenCalledTimes(1);
      // Other domain mocks should not have been called this round.
      for (const other of REGENERATE_DOMAINS) {
        if (other === domain) continue;
        const otherName = DOMAIN_TO_GLOBAL[other];
        expect(
          (mocks[otherName] as ReturnType<typeof vi.fn>).mock.calls.length,
          `${domain} should not call ${otherName}`,
        ).toBe(0);
      }
      // Clear all for next iteration
      for (const name of Object.values(DOMAIN_TO_GLOBAL)) {
        (mocks[name] as ReturnType<typeof vi.fn>).mockClear();
      }
    }
  });

  it("errors when the target global is missing", async () => {
    (globalThis as Record<string, unknown>).regenerateRivers = undefined;
    const result = await regenerateDomainTool.execute({ domain: "rivers" });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content).error).toMatch(/regenerateRivers/);
  });
});
