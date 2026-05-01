import {
  getGlobal,
  getPack,
  okResult,
  type RawBurg,
  type RawCulture,
  type RawMarker,
  type RawProvince,
  type RawRegiment,
  type RawReligion,
  type RawRiver,
  type RawRoute,
  type RawState,
  type RawZone,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Snapshot of `globalThis.elSelected`'s underlying DOM node — the
 * minimum surface the tool needs to classify the selected entity.
 * Captured by the runtime so the tool body never touches the live DOM
 * (testable + read-only).
 */
export interface SelectedEntityNodeView {
  id: string | null;
  parentId: string | null;
  dataId: string | null;
  dataF: string | null;
  dataState: string | null;
  text: string | null;
}

/**
 * Read-only seam. `read()` returns a snapshot of the selected node, or
 * `null` when nothing is selected / `elSelected` is missing or empty.
 * `getPack()` returns the live pack object (or undefined).
 */
export interface SelectedEntityRuntime {
  read(): SelectedEntityNodeView | null;
  getPack(): unknown;
}

interface D3LikeSelection {
  node?: () => Element | null | undefined;
}

function readDefaultSelected(): SelectedEntityNodeView | null {
  const sel = getGlobal<D3LikeSelection | null | undefined>("elSelected");
  if (!sel) return null;
  if (typeof sel.node !== "function") return null;
  let node: Element | null | undefined;
  try {
    node = sel.node();
  } catch {
    return null;
  }
  if (!node) return null;
  const parent =
    (node as Element & { parentNode?: Element | null }).parentNode ?? null;
  const parentId =
    parent && typeof (parent as Element).getAttribute === "function"
      ? (parent as Element).id || null
      : null;
  return {
    id: node.id || null,
    parentId,
    dataId:
      typeof node.getAttribute === "function"
        ? node.getAttribute("data-id")
        : null,
    dataF:
      typeof node.getAttribute === "function"
        ? node.getAttribute("data-f")
        : null,
    dataState:
      typeof node.getAttribute === "function"
        ? node.getAttribute("data-state")
        : null,
    text:
      typeof (node as { textContent?: string }).textContent === "string"
        ? ((node as { textContent?: string }).textContent ?? null)
        : null,
  };
}

export const defaultSelectedEntityRuntime: SelectedEntityRuntime = {
  read(): SelectedEntityNodeView | null {
    return readDefaultSelected();
  },
  getPack(): unknown {
    return getPack<unknown>();
  },
};

interface ArrayLike<T> {
  length: number;
  [index: number]: T;
}

interface PackLike {
  burgs?: RawBurg[];
  states?: ArrayLike<RawState | undefined>;
  provinces?: ArrayLike<RawProvince | undefined>;
  cultures?: ArrayLike<RawCulture | undefined>;
  religions?: ArrayLike<RawReligion | undefined>;
  features?: ArrayLike<
    { i?: number; name?: string; type?: string; group?: string } | 0 | undefined
  >;
  markers?: RawMarker[];
  rivers?: RawRiver[];
  routes?: RawRoute[];
  zones?: RawZone[];
}

function nameAt<T extends { name?: string } | undefined>(
  arr: ArrayLike<T> | undefined,
  id: number,
): string {
  if (!arr || id < 0 || id >= arr.length) return "";
  const entry = arr[id];
  if (!entry) return "";
  return typeof entry.name === "string" ? entry.name : "";
}

function findByI<T extends { i: number; name?: string; type?: string }>(
  arr: T[] | undefined,
  id: number,
): T | undefined {
  if (!arr) return undefined;
  return arr.find((entry) => entry?.i === id);
}

interface Classification {
  type: string;
  id?: number | null;
  state?: number;
  name?: string;
  extra?: Record<string, unknown>;
}

const PATTERNS: Array<{
  re: RegExp;
  build: (m: RegExpExecArray) => Pick<Classification, "type" | "id" | "state">;
}> = [
  {
    re: /^burgLabel(\d+)$/,
    build: (m) => ({ type: "burg", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^burg(\d+)$/,
    build: (m) => ({ type: "burg", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^anchor(\d+)$/,
    build: (m) => ({ type: "burg", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^stateLabel(\d+)$/,
    build: (m) => ({ type: "state", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^state-(?:border|clip|gap)(\d+)$/,
    build: (m) => ({ type: "state", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^state(\d+)$/,
    build: (m) => ({ type: "state", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^provinceLabel(\d+)$/,
    build: (m) => ({ type: "province", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^province-gap(\d+)$/,
    build: (m) => ({ type: "province", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^province(\d+)$/,
    build: (m) => ({ type: "province", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^cultureCenter(\d+)$/,
    build: (m) => ({ type: "culture", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^culture(\d+)$/,
    build: (m) => ({ type: "culture", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^religionCenter(\d+)$/,
    build: (m) => ({ type: "religion", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^religion(\d+)$/,
    build: (m) => ({ type: "religion", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^marker(\d+)$/,
    build: (m) => ({ type: "marker", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^route(\d+)$/,
    build: (m) => ({ type: "route", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^river(\d+)$/,
    build: (m) => ({ type: "river", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^regiment(\d+)-(\d+)$/,
    build: (m) => ({
      type: "regiment",
      id: Number.parseInt(m[2], 10),
      state: Number.parseInt(m[1], 10),
    }),
  },
  {
    re: /^zone(\d+)$/,
    build: (m) => ({ type: "zone", id: Number.parseInt(m[1], 10) }),
  },
  {
    re: /^label(\d+)$/,
    build: (m) => ({ type: "label", id: Number.parseInt(m[1], 10) }),
  },
];

function classifyFromId(
  id: string,
): Pick<Classification, "type" | "id" | "state"> | null {
  for (const { re, build } of PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(id);
    if (m) return build(m);
  }
  // feature_{i} is shared between coastline and lakes — handled in
  // classify() with parent disambiguation.
  return null;
}

function classify(view: SelectedEntityNodeView): Classification | null {
  const { id, parentId, dataId, dataF, dataState } = view;

  if (id) {
    // feature_{i} → disambiguate by parent.
    const featureMatch = /^feature_(\d+)$/.exec(id);
    if (featureMatch) {
      const fid = Number.parseInt(featureMatch[1], 10);
      const type = parentId === "lakes" ? "lake" : "feature";
      return { type, id: fid };
    }

    const fromId = classifyFromId(id);
    if (fromId) return fromId;
  }

  // Lakes / coastline `<use>` selections may have no useful id (or an
  // id like `feature_<n>` referenced from #lakes). Use parent + data-f.
  if (parentId === "lakes" && dataF) {
    const fid = Number.parseInt(dataF, 10);
    if (Number.isFinite(fid)) return { type: "lake", id: fid };
  }
  if (parentId === "coastline" && dataF) {
    const fid = Number.parseInt(dataF, 10);
    if (Number.isFinite(fid)) return { type: "feature", id: fid };
  }

  // Ice elements use data-id.
  if (parentId === "ice" && dataId) {
    const iid = Number.parseInt(dataId, 10);
    if (Number.isFinite(iid)) return { type: "ice", id: iid };
  }

  // Relief icons live under #terrain and have no per-icon id.
  if (parentId === "terrain") {
    return { type: "relief", id: null };
  }

  // Regiment <g> may also be reachable via dataset.state + dataset.id.
  if (dataState && dataId) {
    const s = Number.parseInt(dataState, 10);
    const r = Number.parseInt(dataId, 10);
    if (Number.isFinite(s) && Number.isFinite(r)) {
      return { type: "regiment", id: r, state: s };
    }
  }

  return null;
}

function resolveName(
  pack: PackLike | undefined,
  c: Classification,
  view: SelectedEntityNodeView,
): string {
  if (!pack) return "";
  switch (c.type) {
    case "burg": {
      if (typeof c.id !== "number") return "";
      const entry = findByI(pack.burgs, c.id);
      return typeof entry?.name === "string" ? entry.name : "";
    }
    case "state": {
      if (typeof c.id !== "number") return "";
      return nameAt(pack.states, c.id);
    }
    case "province": {
      if (typeof c.id !== "number") return "";
      return nameAt(pack.provinces, c.id);
    }
    case "culture": {
      if (typeof c.id !== "number") return "";
      return nameAt(pack.cultures, c.id);
    }
    case "religion": {
      if (typeof c.id !== "number") return "";
      return nameAt(pack.religions, c.id);
    }
    case "lake":
    case "feature": {
      if (typeof c.id !== "number") return "";
      const features = pack.features;
      if (!features) return "";
      if (c.id < 0 || c.id >= features.length) return "";
      const entry = features[c.id];
      if (!entry || typeof entry !== "object") return "";
      return typeof entry.name === "string" ? entry.name : "";
    }
    case "marker": {
      if (typeof c.id !== "number") return "";
      const entry = findByI(pack.markers, c.id);
      // Markers have no `name` field — `type` is the closest user-facing label.
      return typeof entry?.type === "string" ? entry.type : "";
    }
    case "river": {
      if (typeof c.id !== "number") return "";
      const entry = findByI(pack.rivers, c.id);
      return typeof entry?.name === "string" ? entry.name : "";
    }
    case "route": {
      if (typeof c.id !== "number") return "";
      const entry = findByI(pack.routes, c.id);
      return typeof entry?.name === "string" ? entry.name : "";
    }
    case "regiment": {
      if (typeof c.id !== "number" || typeof c.state !== "number") return "";
      const states = pack.states;
      if (!states || c.state < 0 || c.state >= states.length) return "";
      const state = states[c.state];
      const military = (state as RawState | undefined)?.military as
        | RawRegiment[]
        | undefined;
      const reg = military?.find((r) => r.i === c.id);
      return typeof reg?.name === "string" ? reg.name : "";
    }
    case "zone": {
      if (typeof c.id !== "number") return "";
      const zones = pack.zones;
      if (!zones || c.id < 0 || c.id >= zones.length) return "";
      const entry = zones[c.id];
      return typeof entry?.name === "string" ? entry.name : "";
    }
    case "label": {
      // Free labels: the visible string IS the name.
      return typeof view.text === "string" ? view.text : "";
    }
    default:
      return "";
  }
}

export function createGetSelectedEntityTool(
  runtime: SelectedEntityRuntime = defaultSelectedEntityRuntime,
): Tool {
  return {
    name: "get_selected_entity",
    description:
      'Inspect the editor\'s current selection — the entity the user just opened in an editor (e.g. clicked a burg icon, opened the route editor). Reads the global `elSelected` D3 selection and classifies its underlying SVG node by id pattern + parent group. Recognises burg (burg{i} / anchor{i} / burgLabel{i}), state (state{i} / state-border{i} / state-clip{i} / state-gap{i} / stateLabel{i}), province (province{i} / provinceLabel{i}), culture (culture{i} / cultureCenter{i}), religion (religion{i} / religionCenter{i}), marker (marker{i}), route (route{i}), river (river{i}), regiment (regiment{state}-{i}), zone (zone{i}), free label (label{i}), lake / coastline feature (feature_{i} disambiguated by parent group lakes / coastline, plus data-f fallback), ice (parent ice + data-id), and relief icons (parent terrain). Returns `{ ok: true, type, id, name, raw_id, parent_id }` on match (regiment also includes `state`); `{ ok: true, type: null, message }` when nothing is selected; `{ ok: true, type: "unknown", raw_id, parent_id }` for unrecognised id patterns. Pure read — never mutates elSelected, pack, or the DOM. Useful before rename_*, set_*_*, regenerate_*, remove_* tools when the user prompt refers to the "currently selected" / "open" / "this" entity. Requires an Anthropic API key (see \'Getting an API key\' below).',
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
    execute(_rawInput: unknown): ToolResult {
      const view = runtime.read();
      if (!view) {
        return okResult({
          type: null,
          message: "Nothing is currently selected.",
        });
      }
      const pack = runtime.getPack() as PackLike | undefined;
      const classified = classify(view);
      if (!classified) {
        return okResult({
          type: "unknown",
          raw_id: view.id,
          parent_id: view.parentId,
        });
      }
      const name = resolveName(pack, classified, view);
      const body: Record<string, unknown> = {
        type: classified.type,
        id: classified.id ?? null,
        name,
        raw_id: view.id,
        parent_id: view.parentId,
      };
      if (typeof classified.state === "number") {
        body.state = classified.state;
      }
      return okResult(body);
    },
  };
}

export const getSelectedEntityTool = createGetSelectedEntityTool();
