/// <reference types="node" />
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Fence-post test: every getGlobal("<name>") call site in src/ai must have
// a public/ or src/ source that actually attaches <name> to globalThis at
// load time. The classic-script bundle declares many things with `let`/`const`
// at top level — those bindings live in a separate scope from `globalThis`,
// so module-loaded code (the AI tools) can't see them via getGlobal. There
// are TWO failure modes worth catching here:
//
// 1. UNDEFINED: `let foo = ...` at top of a classic script — `globalThis.foo`
//    is `undefined` from a module context.
// 2. DOM-SHADOWED: an HTML element with `id="foo"` causes `window.foo` to be
//    that DOM element. Any same-named JS binding is silently shadowed when
//    accessed via globalThis. Tools mutate a `<div>` instead of state.
//
// This test is static (regex over source). It cannot tell DOM-shadowing from
// a real exposure — that distinction lives in the KNOWN_BROKEN list, populated
// from a live browser probe. New `getGlobal` names MUST either be statically
// exposed or be added to KNOWN_EXPOSED / KNOWN_BROKEN with a rationale.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../../");

// Names exposed by an external mechanism the static check can't observe.
// Verified by live probe — do not add without one.
const KNOWN_EXPOSED: ReadonlySet<string> = new Set([
  "d3", // d3 library self-attaches to window
]);

// Names that are NOT correctly exposed at runtime — getGlobal returns
// `undefined` or a DOM-element shadow instead of the intended value. Each
// represents a latent or real bug in an AI tool. Fixing one means picking
// the right exposure mechanism (window.<name> = <name>, or `let` -> `var`,
// or renaming to dodge the DOM shadow) and removing the entry here.
const KNOWN_BROKEN: ReadonlyMap<string, string> = new Map([
  // -- `let` at top of public/main.js — bound only in the global lexical
  // environment, never on globalThis. Fix by adding `window.<name> = <name>`
  // after the declaration (mirroring the regenerateMap pattern at main.js
  // ~line 1284) or by changing `let` to `var`.
  ["biomesData", "main.js:165 `let biomesData` — not on globalThis"],
  ["nameBases", "main.js:166 `let nameBases` — not on globalThis"],
  ["populationRate", "main.js:240 `let populationRate` — not on globalThis"],
  ["distanceScale", "main.js:241 `let distanceScale` — not on globalThis"],
  ["urbanization", "main.js:242 `let urbanization` — not on globalThis"],
  ["rulers", "main.js:145 `let rulers = new Rulers()` — not on globalThis"],
  ["svgHeight", "main.js `let svgHeight` — not on globalThis"],
  ["svgWidth", "main.js `let svgWidth` — not on globalThis"],
  // -- DOM-shadowed: window.<name> is the HTML element with that id, NOT
  // the same-named JS binding. Tools mutate the DOM element silently. Fix
  // by exposing the JS binding under a different name (e.g. `window.appOptions
  // = options`) and updating the consumer, or by renaming the id.
  [
    "options",
    "DOM-shadowed by <div id='options'> — window.options is the dialog DIV",
  ],
  [
    "notes",
    "DOM-shadowed by <div id='notes'> — window.notes is the notes-editor DIV",
  ],
  ["ice", "DOM-shadowed by <g id='ice'> — window.ice is the SVG ice layer"],
  [
    "lakes",
    "DOM-shadowed by <g id='lakes'> — window.lakes is the SVG lakes layer",
  ],
  [
    "routes",
    "DOM-shadowed by <g id='routes'> — window.routes is the SVG routes layer",
  ],
  [
    "labels",
    "DOM-shadowed by <g id='labels'> — window.labels is the SVG labels layer",
  ],
]);

async function walk(
  dir: string,
  filter: (name: string, isDir: boolean) => boolean,
): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (!filter(entry.name, entry.isDirectory())) continue;
    if (entry.isDirectory()) {
      out.push(...(await walk(full, filter)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

const TS_FILTER = (name: string, isDir: boolean) => {
  if (isDir) return name !== "node_modules" && !name.startsWith(".");
  return name.endsWith(".ts") && !name.endsWith(".d.ts");
};

const JS_FILTER = (name: string, isDir: boolean) => {
  if (isDir)
    return name !== "node_modules" && name !== "libs" && !name.startsWith(".");
  return name.endsWith(".js");
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractGetGlobalNames(src: string): string[] {
  const out: string[] = [];
  const re = /\bgetGlobal\s*(?:<[^>]+>)?\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
  let m: RegExpExecArray | null = re.exec(src);
  while (m !== null) {
    out.push(m[1]);
    m = re.exec(src);
  }
  return out;
}

// Patterns that attach <name> to globalThis at load time:
//   - window.<name> = ...
//   - globalThis.<name> = ...
//   - top-level `var <name>` (var attaches in classic scripts)
//   - top-level `function <name>(`
// `let`/`const` are intentionally NOT recognised — they don't attach.
function fileExposes(content: string, name: string): boolean {
  const escaped = escapeRegExp(name);
  const explicit = new RegExp(
    `(?:^|[^.\\w])(?:window|globalThis)\\s*\\.\\s*${escaped}\\s*=`,
  );
  if (explicit.test(content)) return true;
  const topLevel = new RegExp(`^[\\t ]*(?:var|function)\\s+${escaped}\\b`, "m");
  return topLevel.test(content);
}

async function readDomIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  // Static ids in HTML.
  const htmlPath = path.join(REPO_ROOT, "src/index.html");
  try {
    const html = await fs.readFile(htmlPath, "utf8");
    const htmlRe = /\bid\s*=\s*["']([^"']+)["']/g;
    let m: RegExpExecArray | null = htmlRe.exec(html);
    while (m !== null) {
      ids.add(m[1]);
      m = htmlRe.exec(html);
    }
  } catch {
    // index.html missing — skip
  }
  // Dynamic ids set via D3 / setAttribute. Covers the SVG layers main.js
  // creates with `viewbox.append("g").attr("id", "<name>")` etc.
  const jsFiles = await walk(path.join(REPO_ROOT, "public"), JS_FILTER);
  const dynRe =
    /\.(?:attr|setAttribute)\s*\(\s*["']id["']\s*,\s*["']([^"']+)["']\s*\)/g;
  for (const file of jsFiles) {
    const content = await fs.readFile(file, "utf8");
    let m: RegExpExecArray | null = dynRe.exec(content);
    while (m !== null) {
      ids.add(m[1]);
      m = dynRe.exec(content);
    }
    dynRe.lastIndex = 0;
  }
  return ids;
}

interface SeamReport {
  callers: Map<string, string[]>;
  exposed: Map<string, string>;
  missing: Map<string, string[]>;
  domIds: Set<string>;
}

async function buildSeamReport(): Promise<SeamReport> {
  const tsFiles = await walk(path.join(REPO_ROOT, "src/ai"), TS_FILTER);
  const callers = new Map<string, string[]>();
  for (const ts of tsFiles) {
    if (ts.endsWith(".test.ts")) continue;
    const content = await fs.readFile(ts, "utf8");
    for (const name of extractGetGlobalNames(content)) {
      const list = callers.get(name) ?? [];
      list.push(ts);
      callers.set(name, list);
    }
  }

  // Skip ambient type declarations (src/types/**) and test files.
  const candidates = [
    ...(await walk(path.join(REPO_ROOT, "public"), JS_FILTER)),
    ...(await walk(path.join(REPO_ROOT, "src"), TS_FILTER)).filter(
      (p) =>
        !p.includes(".test.") && !p.includes(`${path.sep}types${path.sep}`),
    ),
  ];
  const fileContents = await Promise.all(
    candidates.map(async (p) => ({
      path: p,
      content: await fs.readFile(p, "utf8"),
    })),
  );

  const exposed = new Map<string, string>();
  const missing = new Map<string, string[]>();
  for (const [name, callerPaths] of callers) {
    let foundIn: string | null = null;
    for (const { path: p, content } of fileContents) {
      if (fileExposes(content, name)) {
        foundIn = p;
        break;
      }
    }
    if (foundIn) {
      exposed.set(name, path.relative(REPO_ROOT, foundIn));
    } else {
      missing.set(
        name,
        callerPaths.map((p) => path.relative(REPO_ROOT, p)),
      );
    }
  }
  const domIds = await readDomIds();
  return { callers, exposed, missing, domIds };
}

describe("getGlobal seam exposures", () => {
  it("every getGlobal('<name>') has a public/ or src/ source attaching <name> to window", async () => {
    const { missing, domIds } = await buildSeamReport();
    const newlyMissing: {
      name: string;
      usedBy: string[];
      domShadowed: boolean;
    }[] = [];
    for (const [name, callerPaths] of missing) {
      if (KNOWN_EXPOSED.has(name)) continue;
      if (KNOWN_BROKEN.has(name)) continue;
      newlyMissing.push({
        name,
        usedBy: callerPaths,
        domShadowed: domIds.has(name),
      });
    }
    if (newlyMissing.length === 0) return;
    const lines: string[] = [
      `Found ${newlyMissing.length} getGlobal call(s) whose target name is never attached to window/globalThis.`,
      "",
      `Classic-script top-level let/const does NOT attach to globalThis, AND any HTML element with id="<name>"`,
      `silently shadows window.<name> with that DOM element. Fix by either:`,
      `  - adding 'window.<name> = <name>' to the public/ or src/ source AFTER initialization (this also`,
      `    overwrites any DOM-id shadow), OR`,
      `  - changing 'let'/'const' -> 'var' (only in classic scripts; does NOT defeat DOM shadowing), OR`,
      `  - renaming the getGlobal target / DOM id to disambiguate, OR`,
      `  - if the target really is unfixable here, add it to KNOWN_BROKEN with a rationale.`,
      "",
    ];
    for (const { name, usedBy, domShadowed } of newlyMissing) {
      const shadowNote = domShadowed
        ? "  ⚠️  ALSO matches an HTML id in src/index.html — getGlobal would return that DOM element."
        : "";
      lines.push(
        `  - ${JSON.stringify(name)}${shadowNote ? `\n${shadowNote}` : ""}`,
      );
      for (const c of usedBy) lines.push(`      used by: ${c}`);
    }
    throw new Error(lines.join("\n"));
  });

  it("every entry in KNOWN_BROKEN / KNOWN_EXPOSED is still referenced by some getGlobal call", async () => {
    const { callers } = await buildSeamReport();
    const stale: string[] = [];
    for (const name of KNOWN_BROKEN.keys()) {
      if (!callers.has(name))
        stale.push(`KNOWN_BROKEN: ${JSON.stringify(name)}`);
    }
    for (const name of KNOWN_EXPOSED) {
      if (!callers.has(name))
        stale.push(`KNOWN_EXPOSED: ${JSON.stringify(name)}`);
    }
    expect(
      stale,
      `Stale skip-list entries (no longer referenced by any getGlobal call):\n  ${stale.join("\n  ")}`,
    ).toEqual([]);
  });

  // Self-check: confirm the DOM-id scrape works by asserting names we already
  // know are DOM-shadowed actually appear in src/index.html as ids. If this
  // fails, the DOM-shadow note in the main failure message would be silently
  // wrong (the test would still flag missing exposures, just without the
  // shadow callout).
  it("DOM-shadow detector recognises the existing shadowed ids", async () => {
    const { domIds } = await buildSeamReport();
    for (const id of ["options", "notes", "ice", "lakes", "routes", "labels"]) {
      expect(domIds.has(id), `expected id="${id}" in src/index.html`).toBe(
        true,
      );
    }
  });
});
