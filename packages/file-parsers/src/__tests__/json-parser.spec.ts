import { describe, expect, it } from "vitest";

import { jsonParser } from "../json-parser.ts";

describe("jsonParser", () => {
  describe("canParse", () => {
    it("returns true for .json files", () => {
      expect(jsonParser.canParse("test.json")).toBe(true);
    });
    it("returns false for non-json files", () => {
      expect(jsonParser.canParse("test.yaml")).toBe(false);
      expect(jsonParser.canParse("test.md")).toBe(false);
    });
  });

  describe("parse", () => {
    it("extracts string values with path meta", () => {
      const content = JSON.stringify(
        { greeting: "Hello", nested: { title: "World" } },
        null,
        2,
      );
      const elements = jsonParser.parse(content);
      expect(elements).toHaveLength(2);
      expect(elements[0]).toMatchObject({
        text: "Hello",
        meta: { key: ["greeting"] },
      });
      expect(elements[1]).toMatchObject({
        text: "World",
        meta: { key: ["nested", "title"] },
      });
    });

    it("includes location info", () => {
      const content = JSON.stringify({ a: "test" }, null, 2);
      const elements = jsonParser.parse(content);
      expect(elements[0].location).toBeDefined();
      expect(elements[0].location!.startLine).toBeGreaterThan(0);
    });

    it("skips empty strings", () => {
      const content = JSON.stringify({ a: "", b: "text" }, null, 2);
      const elements = jsonParser.parse(content);
      expect(elements).toHaveLength(1);
      expect(elements[0].text).toBe("text");
    });

    it("handles arrays", () => {
      const content = JSON.stringify({ items: ["one", "two"] }, null, 2);
      const elements = jsonParser.parse(content);
      expect(elements).toHaveLength(2);
      expect(elements[0].meta).toEqual({ key: ["items", "0"] });
      expect(elements[1].meta).toEqual({ key: ["items", "1"] });
    });
  });

  describe("serialize", () => {
    it("replaces values at specified paths", () => {
      const content = JSON.stringify({ greeting: "Hello" }, null, 2);
      const result = jsonParser.serialize(content, [
        { meta: { key: ["greeting"] }, text: "你好" },
      ]);
      expect(JSON.parse(result)).toEqual({ greeting: "你好" });
    });

    it("round-trips parse + serialize", () => {
      const content = JSON.stringify({ a: "one", b: { c: "two" } }, null, 2);
      const elements = jsonParser.parse(content);
      const result = jsonParser.serialize(
        content,
        elements.map((e) => ({ meta: e.meta, text: e.text.toUpperCase() })),
      );
      expect(JSON.parse(result)).toEqual({ a: "ONE", b: { c: "TWO" } });
    });
  });
});
