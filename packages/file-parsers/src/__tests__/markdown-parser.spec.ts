import { describe, expect, it } from "vitest";

import { markdownParser } from "../markdown-parser.ts";

const SAMPLE_MD = `# Hello World

This is a paragraph.

- item one
- item two

\`\`\`js
const x = 1;
\`\`\`
`;

describe("markdownParser", () => {
  describe("canParse", () => {
    it("returns true for .md, .markdown, .mdown", () => {
      expect(markdownParser.canParse("README.md")).toBe(true);
      expect(markdownParser.canParse("doc.markdown")).toBe(true);
      expect(markdownParser.canParse("doc.mdown")).toBe(true);
    });
    it("returns false for other extensions", () => {
      expect(markdownParser.canParse("test.yaml")).toBe(false);
      expect(markdownParser.canParse("test.txt")).toBe(false);
    });
  });

  describe("parse", () => {
    it("extracts headings with correct type and depth", () => {
      const elements = markdownParser.parse(SAMPLE_MD);
      const heading = elements.find(
        // oxlint-disable-next-line no-unsafe-type-assertion
        (e) => (e.meta as { type: string }).type === "heading",
      );
      expect(heading).toBeDefined();
      expect(heading!.text).toBe("Hello World");
      // oxlint-disable-next-line no-unsafe-type-assertion
      expect((heading!.meta as { depth: number }).depth).toBe(1);
    });

    it("extracts paragraphs", () => {
      const elements = markdownParser.parse(SAMPLE_MD);
      const para = elements.find(
        // oxlint-disable-next-line no-unsafe-type-assertion
        (e) => (e.meta as { type: string }).type === "paragraph",
      );
      expect(para).toBeDefined();
      expect(para!.text).toBe("This is a paragraph.");
    });

    it("extracts list items", () => {
      const elements = markdownParser.parse(SAMPLE_MD);
      const items = elements.filter(
        // oxlint-disable-next-line no-unsafe-type-assertion
        (e) => (e.meta as { type: string }).type === "listItem",
      );
      expect(items).toHaveLength(2);
      expect(items[0].text).toBe("item one");
    });

    it("extracts code blocks with lang", () => {
      const elements = markdownParser.parse(SAMPLE_MD);
      const code = elements.find(
        // oxlint-disable-next-line no-unsafe-type-assertion
        (e) => (e.meta as { type: string }).type === "code",
      );
      expect(code).toBeDefined();
      // oxlint-disable-next-line no-unsafe-type-assertion
      expect((code!.meta as { lang: string | null }).lang).toBe("js");
    });

    it("assigns sequential sortIndex values", () => {
      const elements = markdownParser.parse(SAMPLE_MD);
      elements.forEach((e, i) => {
        // oxlint-disable-next-line no-unsafe-type-assertion
        expect((e.meta as { index: number }).index).toBe(i);
      });
    });
  });

  describe("serialize", () => {
    it("replaces heading text", () => {
      const elements = markdownParser.parse(SAMPLE_MD);
      const translated = elements.map((e) => ({
        meta: e.meta,
        text: e.text === "Hello World" ? "Bonjour Monde" : e.text,
      }));
      const result = markdownParser.serialize(SAMPLE_MD, translated);
      expect(result).toContain("Bonjour Monde");
    });

    it("round-trips without loss on identity transform", () => {
      const elements = markdownParser.parse(SAMPLE_MD);
      const result = markdownParser.serialize(
        SAMPLE_MD,
        elements.map((e) => ({ meta: e.meta, text: e.text })),
      );
      // All original texts should still be present
      for (const e of elements) {
        expect(result).toContain(e.text);
      }
    });
  });
});
