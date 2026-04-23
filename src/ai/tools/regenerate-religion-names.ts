import {
  errorResult,
  getGlobal,
  getPackCollection,
  okResult,
  type RawReligion,
} from "./_shared";
import type { Tool, ToolResult } from "./index";

export interface RegenerateReligionNamesReligionRef {
  i: number;
  name: string;
  type: string | null;
  form: string | null;
  deity: string | null;
  center: number | null;
  lock?: boolean;
  removed?: boolean;
}

export interface RegenerateReligionNamesRuntime {
  list(): RegenerateReligionNamesReligionRef[];
  generate(ref: RegenerateReligionNamesReligionRef): string;
  apply(i: number, name: string): void;
  redraw(): void;
}

interface ReligionsModule {
  // `generateReligionName` is declared `private` in religions-generator.ts, but
  // private is compile-time only — at runtime the method is callable on
  // `window.Religions`. Declaring it on this narrow interface lets us invoke it
  // without reaching past TS visibility in the generator file.
  generateReligionName?: (
    variety: string,
    form: string,
    deity: string,
    center: number,
  ) => [string, string];
}

export const defaultRegenerateReligionNamesRuntime: RegenerateReligionNamesRuntime =
  {
    list() {
      const religions = getPackCollection<RawReligion>("religions");
      if (!Array.isArray(religions)) {
        throw new Error("pack.religions is not available.");
      }
      const refs: RegenerateReligionNamesReligionRef[] = [];
      for (const religion of religions) {
        if (!religion) continue;
        refs.push({
          i: religion.i,
          name: religion.name ?? "",
          type: typeof religion.type === "string" ? religion.type : null,
          form: typeof religion.form === "string" ? religion.form : null,
          deity: typeof religion.deity === "string" ? religion.deity : null,
          center: typeof religion.center === "number" ? religion.center : null,
          lock: religion.lock,
          removed: religion.removed,
        });
      }
      return refs;
    },
    generate(ref) {
      const module = getGlobal<ReligionsModule>("Religions");
      if (!module || typeof module.generateReligionName !== "function") {
        throw new Error(
          "Religions.generateReligionName is not available yet; the map hasn't finished loading.",
        );
      }
      if (typeof ref.type !== "string" || !ref.type) {
        throw new Error("religion is missing a type.");
      }
      if (typeof ref.form !== "string" || !ref.form) {
        throw new Error("religion is missing a form.");
      }
      if (typeof ref.center !== "number") {
        throw new Error("religion is missing a center cell.");
      }
      const [name] = module.generateReligionName(
        ref.type,
        ref.form,
        ref.deity ?? "",
        ref.center,
      );
      return name;
    },
    apply(i, name) {
      const religions = getPackCollection<RawReligion>("religions");
      const religion = religions?.[i];
      if (!religion) throw new Error(`Religion ${i} not found.`);
      if (religion.removed) throw new Error(`Religion ${i} has been removed.`);
      religion.name = name;
    },
    redraw() {
      getGlobal<() => void>("drawReligions")?.();
    },
  };

export function createRegenerateReligionNamesTool(
  runtime: RegenerateReligionNamesRuntime = defaultRegenerateReligionNamesRuntime,
): Tool {
  return {
    name: "regenerate_religion_names",
    description: `Bulk-regenerate names for every non-locked, non-removed religion (skips religion 0, the "No religion" placeholder). The Religions Editor has no built-in bulk rename button, so this is an AI convenience that mirrors the same algorithm the map generator uses internally when creating religions (\`Religions.generateReligionName(type, form, deity, center)\` in src/modules/religions-generator.ts) — which random-weight-picks one of ~11 naming methods (Random+type, Random+ism, Supreme+ism, Faith of +Supreme, Place+ism, Culture+ism, Place+ian+type, Culture+type, Burg+ian+type, Random+ian+type, Type of the +meaning) based on the religion's type / form / deity / center cell. Writes \`religion.name\`. Religions have no on-map labels (the renderer only fills region bodies), so no DOM text refresh is needed; \`drawReligions()\` is still called once at the end as a best-effort parity no-op. Religions with missing required fields (type / form / center) are skipped with a "missing …" reason. Lock religions first via \`set_entity_lock\` to preserve them. Reports \`renamed\` / \`skipped\` lists. Non-idempotent — each call produces fresh random names.`,
    input_schema: {
      type: "object",
      properties: {},
    },
    execute(_rawInput: unknown): ToolResult {
      let religions: RegenerateReligionNamesReligionRef[];
      try {
        religions = runtime.list();
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }

      const renamed: Array<{ i: number; previousName: string; name: string }> =
        [];
      const skipped: Array<{ i: number; name: string; reason: string }> = [];

      for (const religion of religions) {
        if (religion.i <= 0) {
          skipped.push({
            i: religion.i,
            name: religion.name,
            reason: "placeholder",
          });
          continue;
        }
        if (religion.removed) {
          skipped.push({
            i: religion.i,
            name: religion.name,
            reason: "removed",
          });
          continue;
        }
        if (religion.lock) {
          skipped.push({
            i: religion.i,
            name: religion.name,
            reason: "locked",
          });
          continue;
        }
        if (typeof religion.type !== "string" || !religion.type) {
          skipped.push({
            i: religion.i,
            name: religion.name,
            reason: "missing type",
          });
          continue;
        }
        if (typeof religion.form !== "string" || !religion.form) {
          skipped.push({
            i: religion.i,
            name: religion.name,
            reason: "missing form",
          });
          continue;
        }
        if (typeof religion.center !== "number") {
          skipped.push({
            i: religion.i,
            name: religion.name,
            reason: "missing center",
          });
          continue;
        }

        let newName: string;
        try {
          newName = runtime.generate(religion);
        } catch (err) {
          skipped.push({
            i: religion.i,
            name: religion.name,
            reason: `generate failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }
        if (typeof newName !== "string" || !newName.trim()) {
          skipped.push({
            i: religion.i,
            name: religion.name,
            reason: "empty generator output",
          });
          continue;
        }

        try {
          runtime.apply(religion.i, newName);
        } catch (err) {
          skipped.push({
            i: religion.i,
            name: religion.name,
            reason: `apply failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          continue;
        }

        renamed.push({
          i: religion.i,
          previousName: religion.name,
          name: newName,
        });
      }

      try {
        runtime.redraw();
      } catch {
        // Best-effort — partial progress is preserved either way.
      }

      return okResult({ renamed, skipped });
    },
  };
}

export const regenerateReligionNamesTool = createRegenerateReligionNamesTool();
