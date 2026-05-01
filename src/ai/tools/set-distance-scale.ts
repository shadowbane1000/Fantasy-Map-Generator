import { errorResult, getGlobal, okResult } from "./_shared";
import type { Tool, ToolResult } from "./index";

/**
 * Bounds for the `distanceScale` multiplier. The Units-editor slider in
 * `src/index.html` uses min=.01 / max=20 / default=3. We accept a wider
 * range (0, 1000] for callers that aren't bound by the slider, while
 * still rejecting clearly bogus values. The recommended range surfaced
 * in the tool description is 0.5 – 50.
 */
export const MIN_DISTANCE_SCALE_EXCLUSIVE = 0;
export const MAX_DISTANCE_SCALE = 1000;

const ERR_INVALID_SCALE = `scale must be a finite number > ${MIN_DISTANCE_SCALE_EXCLUSIVE} and <= ${MAX_DISTANCE_SCALE}.`;

const DISTANCE_SCALE_INPUT_ID = "distanceScaleInput";

export interface DistanceScaleRuntime {
  /** Read the current `globalThis.distanceScale` value. */
  getDistanceScale(): number | undefined;
  /** Reassign `globalThis.distanceScale` to `value`. */
  setDistanceScale(value: number): void;
  /**
   * Optional: keep the editor's `<input id="distanceScaleInput">`
   * value in sync. Best-effort — failure must not surface.
   */
  setDomInputValue?(id: string, value: number): void;
  /**
   * Optional: redraw the on-map scale bar. Mirrors the closure-local
   * `renderScaleBar` in `public/modules/ui/units-editor.js:14-17`,
   * which calls `drawScaleBar` + `fitScaleBar`. Best-effort.
   */
  renderScaleBar?(): void;
  /**
   * Optional: recompute the displayed friendly grid spacing
   * (`public/modules/ui/style.js:534`). Best-effort.
   */
  calculateFriendlyGridSize?(): void;
}

export const defaultDistanceScaleRuntime: DistanceScaleRuntime = {
  getDistanceScale(): number | undefined {
    return getGlobal<number>("distanceScale");
  },
  setDistanceScale(value: number): void {
    // Write through globalThis defensively (plan-349 convention) even
    // though `var distanceScale` in public/main.js:241 means there is
    // no DOM-shadow risk on this name today.
    (globalThis as Record<string, unknown>).distanceScale = value;
  },
  setDomInputValue(id: string, value: number): void {
    if (typeof document === "undefined") return;
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = String(value);
  },
  renderScaleBar(): void {
    const drawScaleBar =
      getGlobal<(sb: unknown, scale: unknown) => void>("drawScaleBar");
    const fitScaleBar =
      getGlobal<(sb: unknown, w: unknown, h: unknown) => void>("fitScaleBar");
    const scaleBar = getGlobal<unknown>("scaleBar");
    const scale = getGlobal<unknown>("scale");
    const svgWidth = getGlobal<unknown>("svgWidth");
    const svgHeight = getGlobal<unknown>("svgHeight");
    if (typeof drawScaleBar === "function" && scaleBar !== undefined) {
      drawScaleBar(scaleBar, scale);
    }
    if (typeof fitScaleBar === "function" && scaleBar !== undefined) {
      fitScaleBar(scaleBar, svgWidth, svgHeight);
    }
  },
  calculateFriendlyGridSize(): void {
    const fn = getGlobal<() => void>("calculateFriendlyGridSize");
    if (typeof fn === "function") fn();
  },
};

export function createSetDistanceScaleTool(
  runtime: DistanceScaleRuntime = defaultDistanceScaleRuntime,
): Tool {
  return {
    name: "set_distance_scale",
    description: `Set the global distanceScale multiplier — the kilometres/miles per internal grid unit. Mirrors the "Distance scale" slider in the Units editor (changeDistanceScale in public/modules/ui/units-editor.js). Number > 0, recommended range 0.5 – 50, hard cap 1000. Side-effects: refreshes the on-map scale bar and the displayed friendly grid spacing. Distance unit names (mi/km/etc.) are set separately via set_measurement_units.`,
    input_schema: {
      type: "object",
      properties: {
        scale: {
          type: "number",
          exclusiveMinimum: MIN_DISTANCE_SCALE_EXCLUSIVE,
          maximum: MAX_DISTANCE_SCALE,
          description:
            "Distance scale multiplier (kilometres/miles per internal grid unit). Must be > 0; recommended range 0.5 – 50.",
        },
      },
      required: ["scale"],
    },
    execute(rawInput: unknown): ToolResult {
      const input = (rawInput ?? {}) as { scale?: unknown };
      const v = input.scale;
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v <= MIN_DISTANCE_SCALE_EXCLUSIVE ||
        v > MAX_DISTANCE_SCALE
      ) {
        return errorResult(ERR_INVALID_SCALE);
      }

      // Capture previous BEFORE mutation.
      const previous = runtime.getDistanceScale();

      try {
        runtime.setDistanceScale(v);
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      // Best-effort side-effects — must not surface as tool failures.
      try {
        runtime.setDomInputValue?.(DISTANCE_SCALE_INPUT_ID, v);
      } catch {
        // swallow
      }
      try {
        runtime.renderScaleBar?.();
      } catch {
        // swallow
      }
      try {
        runtime.calculateFriendlyGridSize?.();
      } catch {
        // swallow
      }

      const body: Record<string, unknown> = { scale: v };
      if (previous !== undefined) body.previous = previous;
      return okResult(body);
    },
  };
}

export const setDistanceScaleTool = createSetDistanceScaleTool();
