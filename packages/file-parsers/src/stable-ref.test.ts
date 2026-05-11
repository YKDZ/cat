import { describe, expect, it } from "vitest";

import { jsonParser } from "./json-parser";
import { markdownParser } from "./markdown-parser";
import { yamlParser } from "./yaml-parser";

describe("file parser stable references", () => {
  it("uses JSON pointer refs for JSON strings", () => {
    const elements = jsonParser.parse(
      '{"hello":"Hello","nested":{"bye":"Bye"}}',
    );
    expect(elements.map((element) => element.stableSourceRef)).toEqual([
      "json:/hello",
      "json:/nested/bye",
    ]);
    expect(elements.map((element) => element.localOrder)).toEqual([0, 1]);
  });

  it("uses YAML pointer refs for YAML strings", () => {
    const elements = yamlParser.parse("hello: Hello\nnested:\n  bye: Bye\n");
    expect(elements.map((element) => element.stableSourceRef)).toEqual([
      "yaml:/hello",
      "yaml:/nested/bye",
    ]);
  });

  it("emits local order and stable refs for Markdown blocks", () => {
    const elements = markdownParser.parse("# Title\n\nBody text\n");
    expect(elements).toHaveLength(2);
    expect(elements[0]?.stableSourceRef.startsWith("markdown:/heading/")).toBe(
      true,
    );
    expect(elements.map((element) => element.localOrder)).toEqual([0, 1]);
  });
});
