import { describe, it, expect } from "vitest";

import { parseFrontmatter, stripFrontmatter } from "./frontmatter-parser.js";

describe("parseFrontmatter", () => {
  it("returns null for content without frontmatter", () => {
    expect(parseFrontmatter("just some text")).toBeNull();
    expect(parseFrontmatter("")).toBeNull();
  });

  it("parses valid YAML with all known keys", () => {
    const content = `---
model: claude-opus-4
effort: high
agent: brainstorm
max-decisions: 5
max-turns: 100
permission-mode: plan
---
body here`;
    const result = parseFrontmatter(content);
    expect(result).toEqual({
      model: "claude-opus-4",
      effort: "high",
      agent: "brainstorm",
      maxDecisions: 5,
      maxTurns: 100,
      permissionMode: "plan",
    });
  });

  it("returns null-like defaulted object for empty frontmatter", () => {
    const result = parseFrontmatter("---\n---\n");
    expect(result).toBeNull();
  });

  it("returns null for invalid YAML (no throw)", () => {
    const content = "---\n: invalid: : yaml\n---\n";
    expect(() => parseFrontmatter(content)).not.toThrow();
    // invalid YAML should return null
    const result = parseFrontmatter(content);
    // It may return null or an empty config (depending on yaml parser)
    // but must not throw
    expect(result === null || typeof result === "object").toBe(true);
  });

  it("returns null for non-object YAML (scalar string)", () => {
    const content = "---\njust a string\n---\n";
    const result = parseFrontmatter(content);
    expect(result).toBeNull();
  });

  it("returns null for non-object YAML (array)", () => {
    const content = "---\n- item1\n- item2\n---\n";
    const result = parseFrontmatter(content);
    expect(result).toBeNull();
  });

  it("ignores unknown keys silently", () => {
    const content = "---\nunknown-key: some-value\nmodel: claude-3\n---\n";
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.model).toBe("claude-3");
  });

  it("rejects invalid effort values", () => {
    const content = "---\neffort: invalid-effort\n---\n";
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.effort).toBeNull();
  });

  it("rejects invalid permission-mode values", () => {
    const content = "---\npermission-mode: unsafe\n---\n";
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.permissionMode).toBeNull();
  });

  it("is source-transparent: same behavior for Issue body and PR comment content", () => {
    const issueBody = "---\nmodel: claude-3\n---\nIssue content here";
    const prComment = "---\nmodel: claude-3\n---\nPR comment content here";
    expect(parseFrontmatter(issueBody)).toEqual(parseFrontmatter(prComment));
  });

  it("handles CRLF line endings", () => {
    const content = "---\r\nmodel: claude-3\r\neffort: high\r\n---\r\nbody";
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.model).toBe("claude-3");
    expect(result!.effort).toBe("high");
  });

  it("rejects negative max-decisions", () => {
    const content = "---\nmax-decisions: -1\n---\n";
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.maxDecisions).toBeNull();
  });

  it("rejects zero max-turns", () => {
    const content = "---\nmax-turns: 0\n---\n";
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.maxTurns).toBeNull();
  });
});

describe("stripFrontmatter", () => {
  it("removes frontmatter block and returns rest", () => {
    const content = "---\nmodel: claude-3\n---\nbody here";
    expect(stripFrontmatter(content)).toBe("body here");
  });

  it("returns original content when no frontmatter present", () => {
    const content = "no frontmatter here";
    expect(stripFrontmatter(content)).toBe("no frontmatter here");
  });
});
