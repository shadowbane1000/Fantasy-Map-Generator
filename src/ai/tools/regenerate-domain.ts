import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const REGENERATE_DOMAINS = [
  "rivers",
  "routes",
  "population",
  "states",
  "provinces",
  "burgs",
  "religions",
  "cultures",
  "military",
  "ice",
  "markers",
] as const;

export type RegenerateDomain = (typeof REGENERATE_DOMAINS)[number];

export const DOMAIN_TO_GLOBAL: Record<RegenerateDomain, string> = {
  rivers: "regenerateRivers",
  routes: "regenerateRoutes",
  population: "recalculatePopulation",
  states: "regenerateStates",
  provinces: "regenerateProvinces",
  burgs: "regenerateBurgs",
  religions: "regenerateReligions",
  cultures: "regenerateCultures",
  military: "regenerateMilitary",
  ice: "regenerateIce",
  markers: "regenerateMarkers",
};

const LOOKUP = new Map<string, RegenerateDomain>();
for (const d of REGENERATE_DOMAINS) LOOKUP.set(d.toLowerCase(), d);

export function resolveRegenerateDomain(
  value: unknown,
): RegenerateDomain | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

export interface RegenerateDomainRuntime {
  regenerate(domain: RegenerateDomain): void;
}

export const defaultRegenerateDomainRuntime: RegenerateDomainRuntime = {
  regenerate(domain) {
    const globalName = DOMAIN_TO_GLOBAL[domain];
    const fn = getGlobal<() => void>(globalName);
    if (typeof fn !== "function") {
      throw new Error(
        `${globalName} is not available yet; the map hasn't finished loading.`,
      );
    }
    fn();
  },
};

export function createRegenerateDomainTool(
  runtime: RegenerateDomainRuntime = defaultRegenerateDomainRuntime,
): Tool {
  return {
    name: "regenerate_domain",
    description: `Regenerate a single domain of the map — same side-effect as clicking one of the Tools panel's Regenerate buttons. Domain is one of: ${REGENERATE_DOMAINS.join(", ")} (case-insensitive). Delegates to the matching global (e.g. rivers → regenerateRivers, population → recalculatePopulation). Use regenerate_map for a full re-gen and regenerate_emblems for all coats of arms. **Locks consulted:** does NOT call \`randomizeOptions()\`, so Options-dialog locks (template, statesNumber, cultures, climate, …) are irrelevant here — settings are not re-randomized regardless. Per-entity locks ARE consulted: \`state.lock\` keeps a state's borders, name, and color across \`regenerate_domain("states")\`; \`burg.lock\` survives \`regenerate_domain("burgs")\`; \`culture.lock\`, \`religion.lock\`, \`province.lock\`, \`marker.lock\`, \`route.lock\` likewise pin their entities. Set those via \`set_entity_lock\` / \`set_marker_lock\` / \`set_route_lock\`.`,
    input_schema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          enum: [...REGENERATE_DOMAINS],
          description: `One of: ${REGENERATE_DOMAINS.join(", ")} (case-insensitive).`,
        },
      },
      required: ["domain"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { domain?: unknown };

      if (typeof input.domain !== "string" || !input.domain.trim()) {
        return errorResult("domain must be a non-empty string.", {
          supported: [...REGENERATE_DOMAINS],
        });
      }
      const canonical = resolveRegenerateDomain(input.domain);
      if (!canonical) {
        return errorResult(
          `Unknown regenerate domain: ${JSON.stringify(input.domain)}.`,
          { supported: [...REGENERATE_DOMAINS] },
        );
      }

      try {
        runtime.regenerate(canonical);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      return okResult({ domain: canonical });
    },
  };
}

export const regenerateDomainTool = createRegenerateDomainTool();
