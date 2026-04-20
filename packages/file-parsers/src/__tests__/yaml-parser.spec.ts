import { describe, expect, it } from "vitest";

import { yamlParser } from "../yaml-parser.ts";

describe("yamlParser", () => {
  describe("canParse", () => {
    it("returns true for .yaml and .yml", () => {
      expect(yamlParser.canParse("test.yaml")).toBe(true);
      expect(yamlParser.canParse("test.yml")).toBe(true);
    });
    it("returns false for non-yaml files", () => {
      expect(yamlParser.canParse("test.json")).toBe(false);
    });
  });

  describe("parse", () => {
    it("extracts scalar string values with dot-path meta", () => {
      const content = "greeting: Hello\nnested:\n  title: World\n";
      const elements = yamlParser.parse(content);
      expect(elements).toHaveLength(2);
      expect(elements[0]).toMatchObject({
        text: "Hello",
        meta: { path: "greeting" },
      });
      expect(elements[1]).toMatchObject({
        text: "World",
        meta: { path: "nested.title" },
      });
    });

    it("handles sequences with numeric indices", () => {
      const content = "items:\n  - one\n  - two\n";
      const elements = yamlParser.parse(content);
      expect(elements).toHaveLength(2);
      expect(elements[0].meta).toMatchObject({ path: "items.0" });
      expect(elements[1].meta).toMatchObject({ path: "items.1" });
    });
  });

  describe("serialize", () => {
    it("replaces values at specified paths", () => {
      const content = "greeting: Hello\n";
      const result = yamlParser.serialize(content, [
        { meta: { path: "greeting" }, text: "你好" },
      ]);
      expect(result).toContain("你好");
    });

    it("round-trips parse + serialize", () => {
      const content = "key: value\nnested:\n  deep: text\n";
      const elements = yamlParser.parse(content);
      const result = yamlParser.serialize(
        content,
        elements.map((e) => ({ meta: e.meta, text: e.text.toUpperCase() })),
      );
      expect(result).toContain("VALUE");
      expect(result).toContain("TEXT");
    });
  });
});
