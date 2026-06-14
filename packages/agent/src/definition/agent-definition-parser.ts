import type { Root, Yaml } from "mdast";

import {
  AgentDefinitionMetadataSchema,
  type ParsedAgentDefinition,
} from "@cat/shared";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parse as parseYaml } from "yaml";

/**
 * Parse an agent MD definition file using the remark pipeline, extracting
 *   frontmatter metadata and body content.
 *
 * @param markdown - Full Markdown text including YAML frontmatter
 * @returns - ParsedAgentDefinition with validated metadata and body content
 * @throws {Error} Thrown when frontmatter is missing
 * @throws {ZodError} Thrown when frontmatter validation fails
 */
export const parseAgentDefinition = (
  markdown: string,
): ParsedAgentDefinition => {
  const processor = unified().use(remarkParse).use(remarkFrontmatter, ["yaml"]);

  const tree: Root = processor.parse(markdown);

  // 1. Extract YAML frontmatter node
  const yamlNode = tree.children.find(
    (node): node is Yaml => node.type === "yaml",
  );
  if (!yamlNode) {
    throw new Error("Agent definition MD must contain YAML frontmatter");
  }

  // 2. Parse YAML string → raw object → Zod validation
  const rawMeta: unknown = parseYaml(yamlNode.value);
  const metadata = AgentDefinitionMetadataSchema.parse(rawMeta);

  // 3. Extract body: everything after the closing "---" of frontmatter.
  // We split on the frontmatter fence pattern rather than relying on
  // remark's byte offsets, which vary across versions.
  const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\n---\r?\n?/;
  const bodyRaw = markdown.replace(FRONTMATTER_RE, "");
  const content = bodyRaw.trim();

  return { metadata, content };
};
