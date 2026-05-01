import type { ChatController, ClickTarget } from "../chat-controller";
import { errorResult, getGlobal, getPack, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

export const REQUEST_MAP_CLICK_TARGETS = [
  "any",
  "cell",
  "burg",
  "state",
  "province",
  "culture",
  "religion",
  "marker",
  "route",
  "river",
  "zone",
  "label",
] as const satisfies readonly ClickTarget[];

export const DEFAULT_REQUEST_MAP_CLICK_TIMEOUT_MS = 60_000;
export const REQUEST_MAP_CLICK_TIMEOUT_MIN_MS = 1_000;
export const REQUEST_MAP_CLICK_TIMEOUT_MAX_MS = 600_000;

const TARGET_ENUM_LIST = REQUEST_MAP_CLICK_TARGETS.join(", ");

export interface EntityHit {
  i: number;
  name: string;
}
export interface MarkerHit extends EntityHit {
  type?: string;
}
export interface LabelHit {
  i: string;
  text: string;
}

export interface RawHits {
  burg?: EntityHit;
  state?: EntityHit;
  province?: EntityHit;
  culture?: EntityHit;
  religion?: EntityHit;
  river?: EntityHit;
  route?: EntityHit;
  zone?: EntityHit;
  marker?: MarkerHit;
  label?: LabelHit;
}

export interface ClickHits extends RawHits {
  cell: number;
}

export interface ViewboxLike {
  on(
    eventName: string,
    handler?: ((...args: unknown[]) => void) | null,
  ): unknown;
  style(name: string, value?: string): unknown;
}

export interface ClickRequestRuntime {
  getViewbox(): ViewboxLike | undefined;
  getFindCell(): ((x: number, y: number) => number) | undefined;
  hitTest(point: [number, number], target: EventTarget | null): ClickHits;
  setCursor(value: string): string;
  tip(message: string): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  addEscListener(callback: () => void): () => void;
  attachClickHandler(
    handler: (point: [number, number], target: EventTarget | null) => void,
  ): () => void;
}

interface ParsedInput {
  prompt: string;
  target: ClickTarget;
  timeout_ms: number;
}

function parseInput(rawInput: unknown): ParsedInput {
  const input = (rawInput ?? {}) as {
    prompt?: unknown;
    target?: unknown;
    timeout_ms?: unknown;
  };

  if (typeof input.prompt !== "string" || input.prompt.trim().length === 0) {
    throw new Error("prompt must be a non-empty string.");
  }
  const prompt = input.prompt.trim();

  let target: ClickTarget = "any";
  if (input.target !== undefined && input.target !== null) {
    if (
      typeof input.target !== "string" ||
      !(REQUEST_MAP_CLICK_TARGETS as readonly string[]).includes(input.target)
    ) {
      throw new Error(`target must be one of: ${TARGET_ENUM_LIST}.`);
    }
    target = input.target as ClickTarget;
  }

  let timeout_ms = DEFAULT_REQUEST_MAP_CLICK_TIMEOUT_MS;
  if (input.timeout_ms !== undefined && input.timeout_ms !== null) {
    const n = input.timeout_ms;
    if (
      typeof n !== "number" ||
      !Number.isInteger(n) ||
      n < REQUEST_MAP_CLICK_TIMEOUT_MIN_MS ||
      n > REQUEST_MAP_CLICK_TIMEOUT_MAX_MS
    ) {
      throw new Error(
        `timeout_ms must be an integer in [${REQUEST_MAP_CLICK_TIMEOUT_MIN_MS}, ${REQUEST_MAP_CLICK_TIMEOUT_MAX_MS}].`,
      );
    }
    timeout_ms = n;
  }

  return { prompt, target, timeout_ms };
}

function roundCoord(n: number): number {
  return Math.round(n * 100) / 100;
}

export function matchTarget(
  target: ClickTarget,
  hits: ClickHits,
): ClickTarget | null {
  if (target === "any") return "any";
  if (target === "cell") return "cell";
  if (target === "burg" && hits.burg) return "burg";
  if (target === "state" && hits.state) return "state";
  if (target === "province" && hits.province) return "province";
  if (target === "culture" && hits.culture) return "culture";
  if (target === "religion" && hits.religion) return "religion";
  if (target === "marker" && hits.marker) return "marker";
  if (target === "route" && hits.route) return "route";
  if (target === "river" && hits.river) return "river";
  if (target === "zone" && hits.zone) return "zone";
  if (target === "label" && hits.label) return "label";
  return null;
}

export function buildMisclickTip(target: ClickTarget): string {
  const targetLabel: Record<ClickTarget, string> = {
    any: "anywhere on the map",
    cell: "anywhere on the map",
    burg: "a burg (city/town icon)",
    state: "inside a state (any colored land cell)",
    province: "inside a province",
    culture: "inside a culture's area",
    religion: "inside a religion's area",
    marker: "a marker",
    route: "a route (road or sea lane line)",
    river: "a river",
    zone: "inside a zone",
    label: "a label",
  };
  return `Click ${targetLabel[target]} to continue, or use Cancel to abort.`;
}

interface PackLike {
  cells?: {
    burg?: ArrayLike<number>;
    state?: ArrayLike<number>;
    province?: ArrayLike<number>;
    culture?: ArrayLike<number>;
    religion?: ArrayLike<number>;
    r?: ArrayLike<number>;
  };
  burgs?: { i?: number; name?: string }[];
  states?: { i?: number; name?: string }[];
  provinces?: { i?: number; name?: string }[];
  cultures?: { i?: number; name?: string }[];
  religions?: { i?: number; name?: string }[];
  rivers?: { i?: number; name?: string }[];
  routes?: { i?: number; name?: string }[];
  markers?: { i?: number; name?: string; type?: string }[];
  zones?: { i?: number; name?: string; cells?: number[] }[];
}

function findInArrayById(
  list: { i?: number; name?: string }[] | undefined,
  id: number,
): EntityHit | undefined {
  if (!Array.isArray(list)) return undefined;
  const found = list.find((e) => e?.i === id);
  if (!found) return undefined;
  return { i: id, name: typeof found.name === "string" ? found.name : "" };
}

function ancestorWithDataset(
  el: Element | null,
  predicate: (el: Element) => boolean,
  maxDepth = 8,
): Element | null {
  let node: Element | null = el;
  for (let i = 0; node && i < maxDepth; i++) {
    if (predicate(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function elementInLayer(el: Element | null, layerId: string): Element | null {
  return ancestorWithDataset(el, (n) => {
    let p: Element | null = n.parentElement;
    while (p) {
      if (p.id === layerId) return true;
      p = p.parentElement;
    }
    return false;
  });
}

function readDataIdNumber(el: Element | null): number | null {
  if (!el) return null;
  const raw =
    el.getAttribute?.("data-id") ?? (el as HTMLElement).dataset?.id ?? null;
  if (raw == null) return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export function defaultHitTest(
  point: [number, number],
  target: EventTarget | null,
): ClickHits {
  const findCell = getGlobal<(x: number, y: number) => number>("findCell");
  if (typeof findCell !== "function") {
    return { cell: -1 };
  }
  const cell = findCell(point[0], point[1]);
  const result: ClickHits = { cell };
  const pack = getPack<PackLike>();
  if (!pack) return result;
  const cells = pack.cells;
  if (cells) {
    const burgId = cells.burg?.[cell] ?? 0;
    if (burgId > 0) {
      const hit = findInArrayById(pack.burgs, Number(burgId));
      if (hit) result.burg = hit;
    }
    const stateId = cells.state?.[cell] ?? 0;
    if (stateId > 0) {
      const hit = findInArrayById(pack.states, Number(stateId));
      if (hit) result.state = hit;
    }
    const provId = cells.province?.[cell] ?? 0;
    if (provId > 0) {
      const hit = findInArrayById(pack.provinces, Number(provId));
      if (hit) result.province = hit;
    }
    const cultId = cells.culture?.[cell] ?? 0;
    if (cultId > 0) {
      const hit = findInArrayById(pack.cultures, Number(cultId));
      if (hit) result.culture = hit;
    }
    const relId = cells.religion?.[cell] ?? 0;
    if (relId > 0) {
      const hit = findInArrayById(pack.religions, Number(relId));
      if (hit) result.religion = hit;
    }
    const riverId = cells.r?.[cell] ?? 0;
    if (riverId > 0) {
      const hit = findInArrayById(pack.rivers, Number(riverId));
      if (hit) result.river = hit;
    }
  }
  if (Array.isArray(pack.zones)) {
    const zone = pack.zones.find(
      (z) => Array.isArray(z?.cells) && z.cells.includes(cell),
    );
    if (zone && typeof zone.i === "number") {
      result.zone = {
        i: zone.i,
        name: typeof zone.name === "string" ? zone.name : "",
      };
    }
  }
  if (target && typeof (target as Element).tagName === "string") {
    const el = target as Element;
    const routeEl = elementInLayer(el, "routes");
    const routeId = readDataIdNumber(routeEl);
    if (routeId != null) {
      const hit = findInArrayById(pack.routes, routeId);
      if (hit) result.route = hit;
    }
    const markerEl = elementInLayer(el, "markers");
    const markerId = readDataIdNumber(markerEl);
    if (markerId != null && Array.isArray(pack.markers)) {
      const found = pack.markers.find((m) => m?.i === markerId);
      if (found) {
        result.marker = {
          i: markerId,
          name: typeof found.name === "string" ? found.name : "",
          ...(typeof found.type === "string" ? { type: found.type } : {}),
        };
      }
    }
    const labelEl = elementInLayer(el, "labels");
    if (labelEl?.id) {
      result.label = {
        i: labelEl.id,
        text: labelEl.textContent ?? "",
      };
    }
  }
  return result;
}

function viewboxStyleGet(viewbox: ViewboxLike, prop: string): string {
  try {
    const value = viewbox.style(prop);
    return typeof value === "string" ? value : "default";
  } catch {
    return "default";
  }
}

export const defaultClickRequestRuntime: ClickRequestRuntime = {
  getViewbox(): ViewboxLike | undefined {
    return getGlobal<ViewboxLike>("viewbox");
  },
  getFindCell(): ((x: number, y: number) => number) | undefined {
    return getGlobal<(x: number, y: number) => number>("findCell");
  },
  hitTest(point, target) {
    return defaultHitTest(point, target);
  },
  setCursor(value: string): string {
    const viewbox = getGlobal<ViewboxLike>("viewbox");
    if (!viewbox) return "default";
    const previous = viewboxStyleGet(viewbox, "cursor");
    try {
      viewbox.style("cursor", value);
    } catch {
      // best-effort
    }
    return previous;
  },
  tip(message: string): void {
    const fn =
      getGlobal<(m: string, autoHide?: boolean, type?: string) => void>("tip");
    if (typeof fn !== "function") return;
    try {
      fn(message, false, "warn");
    } catch {
      // best-effort
    }
  },
  setTimeout(fn, ms) {
    return setTimeout(fn, ms);
  },
  clearTimeout(handle) {
    clearTimeout(handle as Parameters<typeof clearTimeout>[0]);
  },
  addEscListener(callback) {
    if (typeof document === "undefined") return () => {};
    const listener = (evt: KeyboardEvent) => {
      if (evt.key === "Escape") callback();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  },
  attachClickHandler(handler) {
    const viewbox = getGlobal<ViewboxLike>("viewbox");
    if (!viewbox) return () => {};
    const prev = viewbox.on("click");
    function listener(this: unknown): void {
      const d3 = getGlobal<{
        event?: { offsetX?: number; offsetY?: number; target?: EventTarget };
        mouse?: (node: unknown) => [number, number];
      }>("d3");
      const evt = d3?.event ?? {};
      let point: [number, number] = [0, 0];
      try {
        if (typeof d3?.mouse === "function") {
          point = d3.mouse(this);
        } else {
          point = [evt.offsetX ?? 0, evt.offsetY ?? 0];
        }
      } catch {
        point = [evt.offsetX ?? 0, evt.offsetY ?? 0];
      }
      handler(point, evt.target ?? null);
    }
    try {
      viewbox.on("click", listener);
    } catch {
      // best-effort
    }
    return () => {
      try {
        viewbox.on(
          "click",
          (prev as ((...args: unknown[]) => void) | null) ?? null,
        );
      } catch {
        // best-effort
      }
    };
  },
};

export function createRequestMapClickTool(
  runtime: ClickRequestRuntime = defaultClickRequestRuntime,
  getController: () => ChatController | undefined = () =>
    (globalThis as { __aiChatController?: ChatController }).__aiChatController,
): Tool {
  return {
    name: "request_map_click",
    description:
      "Ask the user to click somewhere on the map and wait for the click. The first AI tool that interacts with the user via the chat UI: it shows a banner with your `prompt` text plus a Cancel button while waiting. Use this when you need a coordinate or specific feature reference and the request didn't supply one (e.g. 'add a new burg' with no location). Set `target` to filter the kind of click that resolves the tool: 'any' resolves on any click and returns everything at that point; 'cell' resolves on any click and returns the cell index + everything at that point; specific entity types ('burg', 'route', 'state', 'province', 'culture', 'religion', 'marker', 'river', 'zone', 'label') only resolve on a matching hit — a non-matching click pops a tip nudging the user and keeps listening. The Cancel button and ESC key both cancel; default timeout is 60s. The result always includes `x`, `y`, `cell`, and `target_matched`, plus every entity that happens to be at the click point — useful for follow-up tools.",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: [...REQUEST_MAP_CLICK_TARGETS],
          default: "any",
          description:
            "What the user must click. 'any' resolves on any click and returns everything at that point. Specific types only resolve on a matching hit.",
        },
        prompt: {
          type: "string",
          minLength: 1,
          description:
            "Banner text shown to the user explaining what to click and why.",
        },
        timeout_ms: {
          type: "integer",
          minimum: REQUEST_MAP_CLICK_TIMEOUT_MIN_MS,
          maximum: REQUEST_MAP_CLICK_TIMEOUT_MAX_MS,
          default: DEFAULT_REQUEST_MAP_CLICK_TIMEOUT_MS,
          description: "Max time to wait before giving up.",
        },
      },
      required: ["prompt"],
    },
    async execute(rawInput: unknown): Promise<ToolResult> {
      let parsed: ParsedInput;
      try {
        parsed = parseInput(rawInput);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
      const { prompt, target, timeout_ms } = parsed;

      if (!runtime.getViewbox()) {
        return errorResult(
          "window.viewbox is not available; the map hasn't finished loading.",
        );
      }
      if (!runtime.getFindCell()) {
        return errorResult(
          "window.findCell is not available; the map hasn't finished loading.",
        );
      }

      const cancelToken: object = {};
      const controller = getController();

      return new Promise<ToolResult>((resolve) => {
        let done = false;
        let detachClick: (() => void) | null = null;
        let detachEsc: (() => void) | null = null;
        let unregisterCancel: (() => void) | null = null;
        let timer: unknown = null;
        let prevCursor: string | null = null;

        const cleanup = (): void => {
          if (done) return;
          done = true;
          if (timer !== null) {
            try {
              runtime.clearTimeout(timer);
            } catch {
              // best-effort
            }
            timer = null;
          }
          if (detachClick) {
            try {
              detachClick();
            } catch {
              // best-effort
            }
            detachClick = null;
          }
          if (detachEsc) {
            try {
              detachEsc();
            } catch {
              // best-effort
            }
            detachEsc = null;
          }
          if (unregisterCancel) {
            try {
              unregisterCancel();
            } catch {
              // best-effort
            }
            unregisterCancel = null;
          }
          if (prevCursor !== null) {
            try {
              runtime.setCursor(prevCursor);
            } catch {
              // best-effort
            }
            prevCursor = null;
          }
          try {
            controller?.emitClickRequestEnd(cancelToken);
          } catch {
            // best-effort
          }
        };

        const finishOk = (body: Record<string, unknown>): void => {
          cleanup();
          resolve(okResult(body));
        };
        const finishErr = (msg: string): void => {
          cleanup();
          resolve(errorResult(msg));
        };

        const cursor =
          target === "any" || target === "cell" ? "crosshair" : "pointer";
        prevCursor = runtime.setCursor(cursor);

        try {
          controller?.emitClickRequest({ prompt, target, cancelToken });
        } catch {
          // best-effort
        }

        if (controller) {
          unregisterCancel = controller.registerClickCancel(cancelToken, () => {
            finishErr("User cancelled the click request.");
          });
        }
        detachEsc = runtime.addEscListener(() => {
          finishErr("User cancelled the click request.");
        });

        timer = runtime.setTimeout(() => {
          finishErr(`Click request timed out after ${timeout_ms}ms.`);
        }, timeout_ms);

        detachClick = runtime.attachClickHandler((point, evtTarget) => {
          if (done) return;
          let hits: ClickHits;
          try {
            hits = runtime.hitTest(point, evtTarget);
          } catch {
            hits = { cell: -1 };
          }
          const matched = matchTarget(target, hits);
          if (!matched) {
            try {
              runtime.tip(buildMisclickTip(target));
            } catch {
              // best-effort
            }
            return;
          }
          const { cell, ...entityHits } = hits;
          finishOk({
            x: roundCoord(point[0]),
            y: roundCoord(point[1]),
            cell,
            target_matched: matched,
            ...entityHits,
          });
        });
      });
    },
  };
}

export const requestMapClickTool = createRequestMapClickTool();
