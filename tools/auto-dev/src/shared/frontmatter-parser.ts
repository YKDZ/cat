import { parse as parseYaml } from "yaml";

import type { FrontmatterConfig, AgentEffort } from "./types.js";
import z from "zod";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

const VALID_EFFORTS = new Set<string>([
  "xhigh",
  "high",
  "medium",
  "low",
  "max",
]);
const VALID_PERMISSION_MODES = new Set(["plan", "auto", "default"]);

const isValidEffort = (val: string): val is AgentEffort =>
  VALID_EFFORTS.has(val);

const validateEffort = (val: string): AgentEffort | null =>
  isValidEffort(val) ? val : null;

const validatePermissionMode = (val: string): string | null =>
  VALID_PERMISSION_MODES.has(val) ? val : null;

export const parseFrontmatter = (content: string): FrontmatterConfig | null => {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return null;

  let parsed: unknown;
  try {
    parsed = parseYaml(match[1]);
  } catch {
    console.warn("[auto-dev] Failed to parse YAML frontmatter, ignoring.");
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return null;
  const obj: Record<string, unknown> = z.record(z.string(), z.unknown()).parse(parsed);

  return {
    model: typeof obj.model === "string" ? obj.model : null,
    effort: typeof obj.effort === "string" ? validateEffort(obj.effort) : null,
    agent: typeof obj.agent === "string" ? obj.agent : null,
    maxDecisions:
      typeof obj["max-decisions"] === "number" && obj["max-decisions"] > 0
        ? obj["max-decisions"]
        : null,
    maxTurns:
      typeof obj["max-turns"] === "number" && obj["max-turns"] > 0
        ? obj["max-turns"]
        : null,
    permissionMode:
      typeof obj["permission-mode"] === "string"
        ? validatePermissionMode(obj["permission-mode"])
        : null,
  };
};

export const stripFrontmatter = (content: string): string =>
  content.replace(FRONTMATTER_RE, "");
