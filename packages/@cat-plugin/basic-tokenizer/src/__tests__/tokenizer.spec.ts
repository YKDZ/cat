import type { ParserContext } from "@cat/plugin-core";

import { describe, expect, it } from "vitest";

import {
  LinkTokenizer,
  MaskTokenizer,
  VariableTokenizer,
} from "@/tokenizer.ts";

const makeCtx = (source: string, cursor = 0): ParserContext => ({
  source,
  cursor,
});

// ─── LinkTokenizer ────────────────────────────────────────────────────────────

describe("LinkTokenizer", () => {
  const tokenizer = new LinkTokenizer();

  it("匹配 http:// 链接", () => {
    const result = tokenizer.parse(makeCtx("http://example.com"));
    expect(result).toBeDefined();
    expect(result?.token.type).toBe("link");
    expect(result?.token.value).toBe("http://example.com");
    expect(result?.token.meta?.url).toBe("http://example.com");
  });

  it("匹配 https:// 链接", () => {
    const result = tokenizer.parse(
      makeCtx("https://example.com/path?q=1#hash"),
    );
    expect(result?.token.value).toBe("https://example.com/path?q=1#hash");
    expect(result?.token.type).toBe("link");
  });

  it("匹配 ftp:// 链接", () => {
    const result = tokenizer.parse(makeCtx("ftp://files.example.com/file.zip"));
    expect(result?.token.type).toBe("link");
    expect(result?.token.value).toBe("ftp://files.example.com/file.zip");
  });

  it("匹配 mailto: 链接", () => {
    const result = tokenizer.parse(makeCtx("mailto:user@example.com"));
    expect(result?.token.type).toBe("link");
    expect(result?.token.value).toBe("mailto:user@example.com");
  });

  it("不匹配裸域名（无协议前缀）", () => {
    const result = tokenizer.parse(makeCtx("example.com"));
    expect(result).toBeUndefined();
  });

  it("不匹配 www. 开头的 URL", () => {
    const result = tokenizer.parse(makeCtx("www.example.com"));
    expect(result).toBeUndefined();
  });

  it("在偏移处匹配链接", () => {
    const source = "visit https://example.com now";
    const cursor = 6;
    const result = tokenizer.parse(makeCtx(source, cursor));
    expect(result?.token.start).toBe(6);
    expect(result?.token.value).toBe("https://example.com");
  });

  it("链接遇到空格时终止", () => {
    const result = tokenizer.parse(makeCtx("http://a.com next"));
    expect(result?.token.value).toBe("http://a.com");
  });
});

// ─── VariableTokenizer ────────────────────────────────────────────────────────

describe("VariableTokenizer（默认模式）", () => {
  const tokenizer = new VariableTokenizer();

  it("匹配双花括号变量 {{name}}", () => {
    const result = tokenizer.parse(makeCtx("{{name}}"));
    expect(result?.token.type).toBe("variable");
    expect(result?.token.value).toBe("{{name}}");
  });

  it("匹配单花括号变量 {name}", () => {
    const result = tokenizer.parse(makeCtx("{count}"));
    expect(result?.token.type).toBe("variable");
    expect(result?.token.value).toBe("{count}");
  });

  it("匹配美元花括号变量 ${name}", () => {
    const result = tokenizer.parse(makeCtx("${variable}"));
    expect(result?.token.type).toBe("variable");
    expect(result?.token.value).toBe("${variable}");
  });

  it("匹配 printf 格式 %s", () => {
    const result = tokenizer.parse(makeCtx("%s"));
    expect(result?.token.type).toBe("variable");
    expect(result?.token.value).toBe("%s");
  });

  it("匹配 printf 格式 %d", () => {
    const result = tokenizer.parse(makeCtx("%d remaining"));
    expect(result?.token.value).toBe("%d");
  });

  it("匹配带位置参数的 printf 格式 %1$s", () => {
    const result = tokenizer.parse(makeCtx("%1$s"));
    expect(result?.token.value).toBe("%1$s");
  });

  it("不匹配普通文本", () => {
    const result = tokenizer.parse(makeCtx("hello world"));
    expect(result).toBeUndefined();
  });

  it("双花括号优先于单花括号", () => {
    const result = tokenizer.parse(makeCtx("{{name}}"));
    expect(result?.token.value).toBe("{{name}}");
  });
});

describe("VariableTokenizer（自定义模式）", () => {
  const tokenizer = new VariableTokenizer([
    { regex: /^__[A-Z_]+__/, label: "dunder" },
  ]);

  it("匹配自定义模式 __VAR__", () => {
    const result = tokenizer.parse(makeCtx("__MY_VAR__"));
    expect(result?.token.type).toBe("variable");
    expect(result?.token.value).toBe("__MY_VAR__");
  });

  it("不匹配默认模式（覆盖后）", () => {
    const result = tokenizer.parse(makeCtx("{name}"));
    expect(result).toBeUndefined();
  });
});

// ─── MaskTokenizer ────────────────────────────────────────────────────────────

describe("MaskTokenizer", () => {
  const tokenizer = new MaskTokenizer();

  it("匹配开标签 <tag>", () => {
    const result = tokenizer.parse(makeCtx("<strong>"));
    expect(result?.token.type).toBe("mask");
    expect(result?.token.value).toBe("<strong>");
  });

  it("匹配闭标签 </tag>", () => {
    const result = tokenizer.parse(makeCtx("</strong>"));
    expect(result?.token.type).toBe("mask");
    expect(result?.token.value).toBe("</strong>");
  });

  it("匹配自闭合标签 <tag/>", () => {
    const result = tokenizer.parse(makeCtx("<br/>"));
    expect(result?.token.type).toBe("mask");
    expect(result?.token.value).toBe("<br/>");
  });

  it('匹配带属性的标签 <tag attr="value">', () => {
    const result = tokenizer.parse(makeCtx('<a href="http://example.com">'));
    expect(result?.token.type).toBe("mask");
    expect(result?.token.value).toBe('<a href="http://example.com">');
  });

  it('匹配带属性的自闭合标签 <img src="..." />', () => {
    const result = tokenizer.parse(makeCtx('<img src="cat.png" />'));
    expect(result?.token.type).toBe("mask");
    expect(result?.token.value).toBe('<img src="cat.png" />');
  });

  it("不匹配纯文本", () => {
    const result = tokenizer.parse(makeCtx("hello"));
    expect(result).toBeUndefined();
  });

  it("不匹配数字开头的伪标签 <1tag>，因为 tag 名必须以字母开头", () => {
    const result = tokenizer.parse(makeCtx("<1tag>"));
    expect(result).toBeUndefined();
  });

  it("正确设置 start 和 end 位置", () => {
    const source = "text <b> more";
    const cursor = 5;
    const result = tokenizer.parse(makeCtx(source, cursor));
    expect(result?.token.start).toBe(5);
    expect(result?.token.end).toBe(8);
    expect(result?.token.value).toBe("<b>");
  });
});
