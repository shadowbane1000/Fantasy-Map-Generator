# Tasks 366: `request_map_click` tool

Sequenced implementation tasks for plan 366.

1. **Capture lint baseline** — done in plan §Lint baseline: 837 files,
   0 errors / 0 warnings / 0 info.

2. **Extend `UiEvent` and `ChatController`** in
   `src/ai/chat-controller.ts`:

   - Define a re-exported `ClickTarget` shape compatible with the tool
     constant. Either re-export from the tool file or duplicate the
     literal union here. **Decision**: define the literal in
     `chat-controller.ts` so the controller doesn't depend on a tool
     module:
     ```ts
     export type ClickTarget =
       | "any" | "cell" | "burg" | "state" | "province"
       | "culture" | "religion" | "marker" | "route"
       | "river" | "zone" | "label";
     ```
     The tool re-uses this type via a runtime-side constant (the tool
     file defines `REQUEST_MAP_CLICK_TARGETS` as `as const` and asserts
     compatibility with `ClickTarget` via `satisfies`).

   - Extend `UiEvent`:
     ```ts
     | {
         type: "click_request";
         prompt: string;
         target: ClickTarget;
         cancelToken: object;
       }
     | { type: "click_request_end"; cancelToken: object }
     ```

   - Add private `cancelClickListeners: Map<object, Set<() => void>>`.

   - Add public methods on `ChatController`:
     ```ts
     emitClickRequest(payload: {
       prompt: string;
       target: ClickTarget;
       cancelToken: object;
     }): void {
       this.emit({ type: "click_request", ...payload });
     }
     emitClickRequestEnd(cancelToken: object): void {
       this.emit({ type: "click_request_end", cancelToken });
     }
     registerClickCancel(token: object, callback: () => void): () => void {
       let set = this.cancelClickListeners.get(token);
       if (!set) {
         set = new Set();
         this.cancelClickListeners.set(token, set);
       }
       set.add(callback);
       return () => {
         const s = this.cancelClickListeners.get(token);
         if (!s) return;
         s.delete(callback);
         if (s.size === 0) this.cancelClickListeners.delete(token);
       };
     }
     cancelClickRequest(token: object): void {
       const set = this.cancelClickListeners.get(token);
       if (!set) return;
       for (const cb of [...set]) {
         try { cb(); } catch { /* swallow */ }
       }
     }
     ```

   - In the constructor, initialize `this.cancelClickListeners = new
     Map()`.

3. **Create `src/ai/tools/request-map-click.ts`**:

   - Imports:
     ```ts
     import {
       errorResult,
       getGlobal,
       getPack,
       okResult,
     } from "./_shared";
     import type { Tool, ToolResult } from "./index";
     import type { ChatController, ClickTarget } from "../chat-controller";
     ```

   - Constant:
     ```ts
     export const REQUEST_MAP_CLICK_TARGETS = [
       "any", "cell", "burg", "state", "province",
       "culture", "religion", "marker", "route",
       "river", "zone", "label",
     ] as const satisfies readonly ClickTarget[];
     ```

   - Defaults:
     ```ts
     export const DEFAULT_REQUEST_MAP_CLICK_TIMEOUT_MS = 60_000;
     export const REQUEST_MAP_CLICK_TIMEOUT_MIN_MS = 1_000;
     export const REQUEST_MAP_CLICK_TIMEOUT_MAX_MS = 600_000;
     ```

   - Hit-test result types:
     ```ts
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
     ```

   - Runtime interface (the seam used by tests):
     ```ts
     export interface ViewboxLike {
       on(eventName: string, handler?: ((...args: unknown[]) => void) | null):
         | ViewboxLike
         | ((...args: unknown[]) => void)
         | null;
       style(name: string, value?: string): ViewboxLike | string;
     }

     export interface ClickRequestRuntime {
       getViewbox(): ViewboxLike | undefined;
       getFindCell(): ((x: number, y: number) => number) | undefined;
       /** Read raw entity hits at a click point + event target. */
       hitTest(point: [number, number], target: EventTarget | null): RawHits & {
         cell: number;
       };
       /** Set cursor on viewbox; returns the previous cursor for restore. */
       setCursor(value: string): string;
       /** Show a transient on-map tip ("Click a burg, …"). */
       tip(message: string): void;
       /** Schedule a function via setTimeout/clearTimeout. */
       setTimeout(fn: () => void, ms: number): unknown;
       clearTimeout(handle: unknown): void;
       /** Install a document-level keydown listener for ESC. Returns detach. */
       addEscListener(callback: () => void): () => void;
       /** Attach a click handler to viewbox; returns detach. The detach
        *  must restore any previous viewbox click handler. */
       attachClickHandler(
         handler: (point: [number, number], target: EventTarget | null) => void,
       ): () => void;
     }
     ```

   - Default runtime implementation (`defaultClickRequestRuntime`):
     - `getViewbox()`: return `getGlobal<ViewboxLike>("viewbox")`.
     - `getFindCell()`: return `getGlobal<(x: number, y: number) =>
       number>("findCell")`.
     - `hitTest(point, target)`: implement using `pack` (read via
       `getPack`). Walk through each entity type. For SVG-target
       entities (route, marker, label), inspect `target` and its
       ancestors for `data-id` + a known parent layer id. Walk up at
       most 8 ancestors to handle `<use>` / `<g>` wrapping.
     - `setCursor(value)`: read `viewbox.style("cursor")` (D3 getter
       form), then `viewbox.style("cursor", value)`. Return the
       previous value (string, or `"default"` if undefined).
     - `tip(msg)`: invoke `globalThis.tip(msg, false, "warn")` if
       defined; no-op otherwise.
     - `setTimeout/clearTimeout`: thin wrappers around the globals
       (typed as `unknown` to dodge Node-vs-browser timer types).
     - `addEscListener(cb)`: install a `keydown` listener on
       `document`; check `event.key === "Escape"`; return a remove
       function. No-op (returns no-op detach) if `document` is missing.
     - `attachClickHandler(handler)`:
       - Capture `prev = viewbox.on("click")` (D3 getter form).
       - Define a local listener that pulls `[x, y]` from the event
         (default impl: use `d3.mouse` if present else `event.offsetX
         / offsetY`). Reads `(this as any)` if necessary — but to
         keep the seam testable we'll read directly off `event` since
         tests can synthesize the same shape.
         - Actual form: install `viewbox.on("click", function (this:
           unknown) { const evt = (globalThis as any).d3?.event ??
           {}; const point = (globalThis as any).d3?.mouse?.(this) ??
           [evt.offsetX ?? 0, evt.offsetY ?? 0]; handler(point as
           [number, number], evt.target ?? null); });`
       - Detach function: `viewbox.on("click", prev as ((...args:
         unknown[]) => void) | null);`

   - Helper `parseInput(rawInput)` that performs the validation and
     returns `{ prompt, target, timeout_ms }` or throws `Error`s with
     the verbatim error strings.

   - Helper `roundCoord(n)`:
     `Math.round(n * 100) / 100` — 2-decimal place rounding.

   - The factory `createRequestMapClickTool(runtime?, getController?)`
     where `getController` is a `() => ChatController | undefined`
     callback. The default-runtime tool uses
     `() => (globalThis as { __aiChatController?: ChatController })
     .__aiChatController` — set during `bootstrapAiChat`. Tests inject
     a custom `getController` callback returning a stub controller.

   - The `execute` body:
     ```ts
     async execute(rawInput: unknown): Promise<ToolResult> {
       let parsed: { prompt: string; target: ClickTarget; timeout_ms: number };
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

       const cancelToken = {};
       const controller = getController?.();

       return new Promise<ToolResult>((resolve) => {
         let done = false;
         let detachClick: (() => void) | null = null;
         let detachEsc: (() => void) | null = null;
         let unregisterCancel: (() => void) | null = null;
         let timer: unknown = null;
         let prevCursor: string | null = null;

         const cleanup = () => {
           if (done) return;
           done = true;
           if (timer !== null) {
             runtime.clearTimeout(timer);
             timer = null;
           }
           if (detachClick) { detachClick(); detachClick = null; }
           if (detachEsc) { detachEsc(); detachEsc = null; }
           if (unregisterCancel) { unregisterCancel(); unregisterCancel = null; }
           if (prevCursor !== null) {
             runtime.setCursor(prevCursor);
             prevCursor = null;
           }
           controller?.emitClickRequestEnd(cancelToken);
         };

         const finishOk = (body: Record<string, unknown>) => {
           cleanup();
           resolve(okResult(body));
         };
         const finishErr = (msg: string) => {
           cleanup();
           resolve(errorResult(msg));
         };

         // 1. Set cursor.
         const cursor = target === "any" || target === "cell"
           ? "crosshair"
           : "pointer";
         prevCursor = runtime.setCursor(cursor);

         // 2. Emit UI start event.
         controller?.emitClickRequest({ prompt, target, cancelToken });

         // 3. Wire cancel pathways.
         unregisterCancel = controller?.registerClickCancel(cancelToken, () => {
           finishErr("User cancelled the click request.");
         }) ?? null;
         detachEsc = runtime.addEscListener(() => {
           finishErr("User cancelled the click request.");
         });

         // 4. Wire timeout.
         timer = runtime.setTimeout(() => {
           finishErr(`Click request timed out after ${timeout_ms}ms.`);
         }, timeout_ms);

         // 5. Wire click handler. Stays attached on mis-match.
         detachClick = runtime.attachClickHandler((point, evtTarget) => {
           if (done) return;
           const hits = runtime.hitTest(point, evtTarget);
           const matched = matchTarget(target, hits);
           if (!matched) {
             runtime.tip(buildMisclickTip(target, hits));
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
     }
     ```

   - `matchTarget(target, hits)`:
     - if `target === "any"` → `"any"`.
     - if `target === "cell"` → `"cell"`.
     - else if `hits[target]` is populated → `target`.
     - else → `null` (mis-click).

   - `buildMisclickTip(target, hits)`: returns a short instruction
     like `"Click a burg to continue, or use Cancel."` — fixed copy
     per target. Mention the user can press Cancel.

   - Default runtime `requestMapClickTool` exported at module bottom:
     ```ts
     export const requestMapClickTool = createRequestMapClickTool();
     ```

4. **Create `src/ai/tools/request-map-click.test.ts`** mirroring the
   plan §Tests structure. Use `vi.useFakeTimers()` selectively (only
   for the timeout test) — most tests resolve synchronously by firing
   the captured click handler.

   Test helpers:
   - `makeFakePack(overrides)` builds a synthetic `pack` with `cells`,
     `burgs`, `states`, `provinces`, `cultures`, `religions`,
     `rivers`, `routes`, `zones`, `markers` arrays. Uses simple plain
     objects with `i` + `name` (+ `type` for marker, + `cells` for
     zone).
   - `makeStubViewbox()`: returns an object whose `.on("click", h)`
     captures `h` into `viewbox.lastHandler`; `.on("click")` (no
     second arg) returns it; `.style("cursor", v)` records the last
     cursor.
   - `makeRuntime(opts)`: returns a `ClickRequestRuntime` with
     `vi.fn()` mocks. Default behaviors:
     - `getViewbox` returns `{}`.
     - `getFindCell` returns a function that returns 0.
     - `hitTest` returns `{ cell: 0 }` plus whatever `opts.hits`
       overrides.
     - `setCursor` returns `"default"` and records calls.
     - `tip` records calls.
     - `addEscListener` captures the callback into a `lastEsc` field.
     - `attachClickHandler` captures the handler into `lastClick`.
     - `setTimeout` captures `(fn, ms)` into `lastTimer` and returns
       a sentinel. `clearTimeout` records calls.
   - `makeStubController()`: returns an object with `emitClickRequest`,
     `emitClickRequestEnd`, `registerClickCancel(token, cb)` (records
     `(token, cb)` and returns an unregister fn), and a `fireCancel(
     token)` test helper.

   Tests cover §1-§31 from the plan. Group by:
   - `describe("request_map_click tool — schema/registry")` → §1, §13
     (registry round-trip).
   - `describe("request_map_click tool — input validation")` → §2,
     §3.
   - `describe("request_map_click tool — happy paths")` → §4, §5,
     §8, §18, §19.
   - `describe("request_map_click tool — strict mismatch")` → §6,
     §7, §9, §20.
   - `describe("request_map_click tool — cancel/timeout")` → §10,
     §11, §12.
   - `describe("request_map_click tool — cleanup")` → §13, §14, §15,
     §16, §21.
   - `describe("request_map_click tool — UI events")` → §17.
   - `describe("defaultClickRequestRuntime (integration)")` → §22,
     §23, §24.
   - `describe("ChatController click-request glue")` → §25, §26,
     §27.
   - `describe("mountChatWindow click-request banner")` → §28, §29,
     §30, §31.

   The chat-window tests need `jsdom`-style DOM. Use the same pattern
   as other chat-window tests in the repo (look for
   `chat-window.test.ts` if present). If none exists, the chat-window
   tests live at the bottom of `request-map-click.test.ts` and use a
   minimal jsdom environment via `// @vitest-environment jsdom`
   docblock at the top of the test that needs it. **Decision**:
   keep the chat-window tests in a separate file
   `src/ai/chat-window.click-request.test.ts` so the file-level
   environment can be jsdom without forcing it on the rest. Same for
   the chat-controller tests — use a separate file
   `src/ai/chat-controller.click-request.test.ts` (no DOM needed,
   default node env).

   **CORRECTION**: scan for existing chat-window / chat-controller
   test files first. If they exist, append our tests to them.
   Otherwise create the two new test files.

5. **Modify `src/ai/chat-window.ts`** to render a banner:

   - Build a banner element during `buildChatWindow`:
     ```ts
     const clickBanner = el("div", {
       className: "ai-chat-click-banner",
       hidden: true,
     });
     const clickBannerText = el("span", {
       className: "ai-chat-click-banner-text",
     });
     const clickBannerCancel = el("button", {
       type: "button",
       className: "ai-chat-click-banner-cancel",
       textContent: "Cancel",
     });
     clickBanner.append(clickBannerText, clickBannerCancel);
     ```
     Append to the panel between `usageBar` and `apiKeyRow` (so it
     doesn't get hidden when api-key row collapses).

   - Add `clickBanner`, `clickBannerText`, `clickBannerCancel` to
     `ChatWindowElements` so tests can assert.

   - In `mountChatWindow`, track the active token + active ESC
     listener:
     ```ts
     let activeClickToken: object | null = null;
     let escListener: ((evt: KeyboardEvent) => void) | null = null;
     ```

   - On `click_request`:
     ```ts
     activeClickToken = event.cancelToken;
     parts.clickBannerText.textContent = event.prompt;
     parts.clickBanner.hidden = false;
     parts.clickBannerCancel.onclick = () => {
       if (activeClickToken) controller.cancelClickRequest(activeClickToken);
     };
     escListener = (evt: KeyboardEvent) => {
       if (evt.key === "Escape" && activeClickToken) {
         controller.cancelClickRequest(activeClickToken);
       }
     };
     document.addEventListener("keydown", escListener);
     ```

   - On `click_request_end`:
     ```ts
     if (activeClickToken === event.cancelToken) {
       activeClickToken = null;
       parts.clickBanner.hidden = true;
       parts.clickBannerText.textContent = "";
       parts.clickBannerCancel.onclick = null;
       if (escListener) {
         document.removeEventListener("keydown", escListener);
         escListener = null;
       }
     }
     ```

   - Add a `default` branch with `_exhaustive: never` for compile-
     time exhaustiveness:
     ```ts
     default: {
       const _exhaustive: never = event;
       void _exhaustive;
       break;
     }
     ```

6. **Modify `src/ai/index.ts`**:

   - Import the new tool. The `r` section already includes
     `regenerate-zones`, `remove-all-burgs`, etc. Insert
     `import { requestMapClickTool } from "./tools/request-map-click";`
     in alphabetical order. Specifically, "request-map-click" sorts
     after "regenerate-zones" and before "remove-all-burgs".

   - Add a re-export block:
     ```ts
     export {
       buildMisclickTip,
       createRequestMapClickTool,
       DEFAULT_REQUEST_MAP_CLICK_TIMEOUT_MS,
       defaultClickRequestRuntime,
       type EntityHit,
       type LabelHit,
       type MarkerHit,
       type RawHits,
       REQUEST_MAP_CLICK_TARGETS,
       type ClickRequestRuntime,
       type ViewboxLike,
       requestMapClickTool,
     } from "./tools/request-map-click";
     ```

   - Add `registry.register(requestMapClickTool);` in
     `buildDefaultRegistry()`. Place near the other regenerate /
     async tools (e.g. immediately after
     `registry.register(regenerateMapTool);`).

   - In `bootstrapAiChat`, BEFORE `mountChatWindow`, set
     `(globalThis as { __aiChatController?: ChatController })
     .__aiChatController = controller;` so the tool's default
     `getController` callback can find it.

7. **Run `npm test`.** Fix any failures. Iterate until green.

8. **Run `npx tsc --noEmit`.** Fix any type errors.

9. **Run `npm run lint 2>&1 | tail -10`.** Confirm baseline holds — 0
   errors, 0 warnings, 0 info. Fix any new noise.

10. **Stage and commit** on the `plan-366-request-map-click` branch:

    - `git add aiplans/plan_366.md aiplans/tasks_366.md
      src/ai/tools/request-map-click.ts
      src/ai/tools/request-map-click.test.ts
      src/ai/chat-controller.ts src/ai/chat-window.ts src/ai/index.ts`
      (plus any new chat-controller / chat-window test files).
    - Commit message:
      ```
      feat(ai): add request_map_click tool

      Implements plan 366. Adds an async AI chat tool that puts the app
      into click-await mode and resolves with what the user clicked.
      Strict targeting filters by feature type (burg, route, cell, ...);
      a Cancel button in the chat panel and ESC key both cancel; a
      configurable timeout (default 60s) returns an error.

      Required new chat UI variants (click_request / click_request_end)
      and a banner with Cancel button on the chat panel.
      ```
    - Do NOT push. Do NOT touch any other branch / worktree.
