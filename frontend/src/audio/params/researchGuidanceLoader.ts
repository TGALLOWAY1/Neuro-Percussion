/**
 * Parser/loader for RESEARCH_GUIDANCE.md.
 * Produces structured ParamSpec (ResearchParamSpec) for UI, migration, mapping, and CI.
 * Single source of truth: docs/RESEARCH_GUIDANCE.md
 */

import type {
  ResearchParamSpec,
  ResearchParamRecord,
  ResearchParamUnit,
  ResearchParamRole,
  DeprecatedParamEntry,
  GatingRule,
} from "./researchGuidanceTypes";

const VALID_UNITS: ResearchParamUnit[] = [
  "ms",
  "hz",
  "st",
  "db",
  "linear_0_1",
  "ratio",
  "bool",
  "enum",
];

const VALID_ROLES: ResearchParamRole[] = [
  "transient",
  "body",
  "noise",
  "mix",
  "fx",
  "qc",
  "behavior",
  "env",
  "filter",
  "core",
];

function parseTableRow(line: string): string[] {
  const cells = line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
  return cells;
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return false;
  return /^\|[\s\-:]+\|/.test(trimmed);
}

function parseNumericOrString(val: string): number | string {
  const t = val.trim();
  const n = Number(t);
  if (t === "" || t.toLowerCase() === "true") return true as unknown as string;
  if (t.toLowerCase() === "false") return false as unknown as string;
  if (!Number.isNaN(n)) return n;
  return t;
}

/**
 * Parse markdown content of RESEARCH_GUIDANCE.md and return structured spec.
 */
export function parseResearchGuidance(markdown: string): ResearchParamSpec {
  const lines = markdown.split(/\r?\n/);
  const params: ResearchParamRecord[] = [];
  const deprecated: DeprecatedParamEntry[] = [];
  const gatingRules: GatingRule[] = [];
  let schemaVersion = 1;
  let lastUpdated: string | undefined;

  // Extract schema_version and last_updated from frontmatter-like lines
  for (const line of lines) {
    const m = line.match(/^schema_version:\s*\*\*(\d+)\*\*/);
    if (m) schemaVersion = parseInt(m[1], 10);
    const mu = line.match(/^last_updated:\s*\*\*([^*]+)\*\*/);
    if (mu) lastUpdated = mu[1].trim();
  }

  // Parse parameter tables: look for header row then data rows
  let headerIndices: Record<string, number> | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith("|")) {
      headerIndices = null;
      continue;
    }
    const cells = parseTableRow(line);
    if (cells.length < 2) continue;
    if (isTableSeparator(line)) continue; // keep headerIndices for next data rows
    const firstCell = (cells[0] ?? "").toLowerCase();
    if (firstCell === "id" && cells.includes("unit") && cells.includes("min")) {
      headerIndices = {};
      cells.forEach((c, idx) => {
        headerIndices![c.trim().toLowerCase()] = idx;
      });
      continue;
    }
    if (headerIndices && firstCell !== "" && !firstCell.startsWith("-")) {
      const get = (key: string): string =>
        (cells[headerIndices![key]] ?? "").trim();
      const id = get("id");
      if (!id) continue;
      const unit = get("unit") as ResearchParamUnit;
      const role = get("role") as ResearchParamRole;
      const minRaw = get("min");
      const maxRaw = get("max");
      const defaultRaw = get("default");
      params.push({
        id,
        label: get("label") || id,
        unit: unit || "linear_0_1",
        min: parseNumericOrString(minRaw) ?? minRaw,
        max: parseNumericOrString(maxRaw) ?? maxRaw,
        default: parseNumericOrString(defaultRaw) ?? defaultRaw,
        role: role || "body",
        description: get("description") || undefined,
        notes: get("notes") || undefined,
      });
    }
  }

  // Parse deprecated section: lines like "- `legacy.id` -> replaced_by: ..."
  const deprecatedStart = lines.findIndex(
    (l) =>
      /^#+\s*Deprecated parameters/i.test(l) ||
      /^#+\s*Deprecated\s/i.test(l)
  );
  if (deprecatedStart >= 0) {
    for (let i = deprecatedStart + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("#")) break;
      const m = line.match(/[-*]\s*`([^`]+)`\s*(?:->|:)\s*replaced_by:\s*([^\s].*)/i);
      if (m) {
        deprecated.push({
          legacyId: m[1].trim(),
          replacedBy: m[2].trim(),
        });
      }
    }
  }

  // Parse gating rules: ## One-shot repeat suppression, ## Room compute must be skipped, etc.
  const gatingSection = lines.findIndex((l) => /^#+\s*Gating rules/i.test(l));
  if (gatingSection >= 0) {
    let currentRule: { id: string; description: string } | null = null;
    for (let i = gatingSection + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/^#\s/)) break; // only break on top-level # section
      const h3 = line.match(/^##\s+(.+)$/);
      if (h3) {
        if (currentRule)
          gatingRules.push({
            id: currentRule.id,
            description: currentRule.description,
          });
        currentRule = {
          id: h3[1].trim().toLowerCase().replace(/\s+/g, "_"),
          description: "",
        };
      } else if (currentRule && line.trim().startsWith("-")) {
        currentRule.description += (currentRule.description ? " " : "") + line.trim().slice(1).trim();
      }
    }
    if (currentRule)
      gatingRules.push({
        id: currentRule.id,
        description: currentRule.description,
      });
  }

  return {
    schemaVersion,
    lastUpdated,
    params,
    gatingRules,
    deprecated,
  };
}

export { VALID_UNITS, VALID_ROLES };
