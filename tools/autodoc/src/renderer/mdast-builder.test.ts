import { describe, it, expect } from "vitest";

import {
  root,
  heading,
  paragraph,
  code,
  inlineCode,
  text,
  link,
  strong,
  list,
  listItem,
  thematicBreak,
} from "./mdast-builder.js";

describe("mdast-builder", () => {
  it("heading creates correct depth and children", () => {
    const node = heading(2, text("hello"));
    expect(node.type).toBe("heading");
    expect(node.depth).toBe(2);
    expect(node.children).toHaveLength(1);
    expect(node.children[0]).toEqual({ type: "text", value: "hello" });
  });

  it("code creates correct lang and value", () => {
    const node = code("ts", "const x = 1");
    expect(node.type).toBe("code");
    expect(node.lang).toBe("ts");
    expect(node.value).toBe("const x = 1");
  });

  it("list creates ordered=false with listItems", () => {
    const item = listItem(paragraph(text("item")));
    const node = list(false, item);
    expect(node.type).toBe("list");
    expect(node.ordered).toBe(false);
    expect(node.children).toHaveLength(1);
  });

  it("list creates ordered=true", () => {
    const item = listItem(paragraph(text("item")));
    const node = list(true, item);
    expect(node.ordered).toBe(true);
  });

  it("root creates correct children", () => {
    const node = root(heading(1, text("title")), paragraph(text("body")));
    expect(node.type).toBe("root");
    expect(node.children).toHaveLength(2);
  });

  it("nested: paragraph with strong and text", () => {
    const node = paragraph(strong(text("bold")), text(" normal"));
    expect(node.type).toBe("paragraph");
    expect(node.children).toHaveLength(2);
    expect(node.children[0].type).toBe("strong");
    expect(node.children[1]).toEqual({ type: "text", value: " normal" });
  });

  it("inlineCode creates correct value", () => {
    const node = inlineCode("const x");
    expect(node.type).toBe("inlineCode");
    expect(node.value).toBe("const x");
  });

  it("link creates correct url and children", () => {
    const node = link("https://example.com", text("click"));
    expect(node.type).toBe("link");
    expect(node.url).toBe("https://example.com");
    expect(node.children[0]).toEqual({ type: "text", value: "click" });
  });

  it("thematicBreak creates correct type", () => {
    const node = thematicBreak();
    expect(node.type).toBe("thematicBreak");
  });

  it("listItem creates correct children", () => {
    const node = listItem(paragraph(text("item text")));
    expect(node.type).toBe("listItem");
    expect(node.children).toHaveLength(1);
  });
});
