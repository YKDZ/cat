import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { parseAgentDefinition } from "./agent-definition-parser.ts";

const VALID_FRONTMATTER = `---
id: translator-zh-en
name: Chinese to English Translator
version: "1.0.5"
type: GENERAL
llm:
  temperature: 0.3
tools:
  - translate_segment
  - finish
---

You are a professional Chinese to English translator.

Translate the text segment faithfully while preserving formatting.
{{source_text}}
`;

describe("parseAgentDefinition", () => {
  it("parses valid MD with frontmatter and body", () => {
    const result = parseAgentDefinition(VALID_FRONTMATTER);

    expect(result.metadata.id).toBe("translator-zh-en");
    expect(result.metadata.name).toBe("Chinese to English Translator");
    expect(result.metadata.version).toBe("1.0.5");
    expect(result.metadata.type).toBe("GENERAL");
    expect(result.metadata.llm?.providerId).toBeUndefined();
    expect(result.metadata.llm?.temperature).toBe(0.3);
    expect(result.metadata.tools).toEqual(["translate_segment", "finish"]);
    expect(result.content).toContain("professional Chinese to English");
  });

  it("parses explicit provider binding when present", () => {
    const withProvider = `---
id: translator-with-provider
name: Translator With Provider
llm:
  providerId: 7
  temperature: 0.2
---

Body text.
`;

    const result = parseAgentDefinition(withProvider);

    expect(result.metadata.llm?.providerId).toBe(7);
    expect(result.metadata.llm?.temperature).toBe(0.2);
  });

  it("applies default values for missing optional fields", () => {
    const minimal = `---
id: minimal-agent
name: Minimal
---

Body text.
`;
    const result = parseAgentDefinition(minimal);

    expect(result.metadata.version).toBe("1.0.0");
    expect(result.metadata.type).toBe("GENERAL");
    expect(result.metadata.tools).toEqual([]);
  });

  it("throws ZodError for invalid frontmatter", () => {
    const invalid = `---
id: ""
name: Valid Name
---

Body.
`;
    expect(() => parseAgentDefinition(invalid)).toThrow(ZodError);
  });

  it("extracts multi-paragraph body content completely", () => {
    const multiPara = `---
id: multi-para
name: Multi
---

First paragraph.

Second paragraph with **bold** text.

Third paragraph.
`;
    const result = parseAgentDefinition(multiPara);

    expect(result.content).toContain("First paragraph.");
    expect(result.content).toContain("Second paragraph with **bold** text.");
    expect(result.content).toContain("Third paragraph.");
  });

  it("preserves {{variable}} placeholders without modification", () => {
    const withVars = `---
id: var-agent
name: Variable Agent
---

Hello {{user_name}}, translate: {{source_text}}
`;
    const result = parseAgentDefinition(withVars);

    expect(result.content).toBe(
      "Hello {{user_name}}, translate: {{source_text}}",
    );
  });

  it("throws Error when frontmatter is missing", () => {
    const noFrontmatter = `# Just a plain markdown file

No frontmatter here.
`;
    expect(() => parseAgentDefinition(noFrontmatter)).toThrow(
      "Agent definition MD must contain YAML frontmatter",
    );
  });

  it("returns empty string for empty body", () => {
    const emptyBody = `---
id: empty-body
name: Empty Body Agent
---
`;
    const result = parseAgentDefinition(emptyBody);

    expect(result.content).toBe("");
  });
});
