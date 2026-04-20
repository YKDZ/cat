import { parse as parseTemplate } from "@vue/compiler-dom";
import { describe, expect, it } from "vitest";

import { extractFromScript } from "../extractors/script-extract.ts";
import { extractFromTemplate } from "../extractors/template-extract.ts";
import { vueI18nExtractor } from "../extractors/vue-i18n.ts";

describe("template extraction", () => {
  const extract = (template: string) => {
    const ast = parseTemplate(template);
    return extractFromTemplate(ast, "test.vue", 0);
  };

  it("extracts $t() from interpolation", () => {
    const els = extract(`<div>{{ $t("你好世界") }}</div>`);
    expect(els).toHaveLength(1);
    expect(els[0].text).toBe("你好世界");
    expect(els[0].meta).toMatchObject({
      framework: "vue-i18n",
      file: "test.vue",
    });
  });

  it("extracts t() from interpolation (without $ prefix)", () => {
    const els = extract(`<div>{{ t("你好") }}</div>`);
    expect(els).toHaveLength(1);
    expect(els[0].text).toBe("你好");
  });

  it("extracts $t() from attribute binding", () => {
    const els = extract(`<input :placeholder="$t('请输入')" />`);
    expect(els).toHaveLength(1);
    expect(els[0].text).toBe("请输入");
  });

  it("extracts $t() with interpolation parameters", () => {
    const els = extract(
      `<span>{{ $t("上传 {name} 成功", { name: file.name }) }}</span>`,
    );
    expect(els).toHaveLength(1);
    expect(els[0].text).toBe("上传 {name} 成功");
  });

  it("extracts multiple $t() calls in one expression", () => {
    const els = extract(`<div>{{ condition ? $t("是") : $t("否") }}</div>`);
    expect(els).toHaveLength(2);
    expect(els[0].text).toBe("是");
    expect(els[1].text).toBe("否");
  });

  it("extracts from single-quoted strings", () => {
    const els = extract(`<div>{{ $t('单引号') }}</div>`);
    expect(els).toHaveLength(1);
    expect(els[0].text).toBe("单引号");
  });

  it("handles escaped quotes", () => {
    const els = extract(`<div>{{ $t("it\\'s ok") }}</div>`);
    expect(els).toHaveLength(1);
    expect(els[0].text).toBe("it's ok");
  });

  it("skips empty strings", () => {
    const els = extract(`<div>{{ $t("") }}</div>`);
    expect(els).toHaveLength(0);
  });

  it("extracts from v-if and v-for children", () => {
    const template = `
      <div>
        <span v-if="show">{{ $t("条件文本") }}</span>
        <span v-for="item in items" :key="item">{{ $t("列表项") }}</span>
      </div>
    `;
    const els = extract(template);
    expect(els).toHaveLength(2);
    expect(els[0].text).toBe("条件文本");
    expect(els[1].text).toBe("列表项");
  });

  it("extracts from v-t directive", () => {
    const els = extract(`<div v-t="'直接指令'" />`);
    expect(els).toHaveLength(1);
    expect(els[0].text).toBe("直接指令");
  });

  it("includes location info", () => {
    const els = extract(`<div>{{ $t("定位测试") }}</div>`);
    expect(els[0].location).toBeDefined();
    expect(els[0].location!.startLine).toBeGreaterThan(0);
  });

  it("generates stable ref for same input", () => {
    const els1 = extract(`<div>{{ $t("稳定性") }}</div>`);
    const els2 = extract(`<div>{{ $t("稳定性") }}</div>`);
    expect(els1[0].ref).toBe(els2[0].ref);
    expect(els1[0].meta).toEqual(els2[0].meta);
  });
});

describe("script extraction", () => {
  it("extracts t() calls from script", () => {
    const content = `
import { useI18n } from "vue-i18n";
const { t } = useI18n();
const label = t("标签文本");
`;
    const els = extractFromScript(content, "test.vue", "scriptSetup", 0);
    expect(els).toHaveLength(1);
    expect(els[0].text).toBe("标签文本");
    expect(els[0].meta).toMatchObject({
      framework: "vue-i18n",
      file: "test.vue",
      callSite: expect.stringContaining("scriptSetup"),
    });
  });

  it("extracts $t() calls", () => {
    const content = `const msg = $t("全局调用");`;
    const els = extractFromScript(content, "test.ts", "file", 0);
    expect(els).toHaveLength(1);
    expect(els[0].text).toBe("全局调用");
  });

  it("extracts multiple calls", () => {
    const content = `
const a = t("第一个");
const b = t("第二个");
const c = t("第三个");
`;
    const els = extractFromScript(content, "test.ts", "file", 0);
    expect(els).toHaveLength(3);
  });

  it("skips non-string arguments", () => {
    const content = `
const key = "dynamic";
const msg = t(key);
`;
    const els = extractFromScript(content, "test.ts", "file", 0);
    expect(els).toHaveLength(0);
  });

  it("extracts t() with interpolation params", () => {
    const content = `const msg = t("你好 {name}", { name: "world" });`;
    const els = extractFromScript(content, "test.ts", "file", 0);
    expect(els).toHaveLength(1);
    expect(els[0].text).toBe("你好 {name}");
  });

  it("detects @i18n-context comments", () => {
    const content = `
// @i18n-context: 这是登录按钮的文本
const msg = t("登录");
`;
    const els = extractFromScript(content, "test.ts", "file", 0);
    expect(els).toHaveLength(1);
    expect(els[0].location?.custom?.["i18nContext"]).toBe("这是登录按钮的文本");
  });

  it("applies line offset for SFC script blocks", () => {
    const content = `const msg = t("偏移测试");`;
    const els = extractFromScript(content, "test.vue", "scriptSetup", 10);
    expect(els).toHaveLength(1);
    expect(els[0].location!.startLine).toBe(11); // 1 (local) + 10 (offset)
  });

  it("skips files without t() calls (fast path)", () => {
    const content = `
const x = 1;
const y = someFunction("not i18n");
`;
    const els = extractFromScript(content, "test.ts", "file", 0);
    expect(els).toHaveLength(0);
  });

  it("produces stable meta across multiple extractions", () => {
    const content = `const msg = t("稳定");`;
    const els1 = extractFromScript(content, "test.ts", "file", 0);
    const els2 = extractFromScript(content, "test.ts", "file", 0);
    expect(els1[0].meta).toEqual(els2[0].meta);
  });
});

describe("vueI18nExtractor (combined SFC)", () => {
  it("extracts from both template and script setup", () => {
    const sfc = `
<template>
  <div>{{ $t("模板文本") }}</div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();
const label = t("脚本文本");
</script>
`;
    const els = vueI18nExtractor.extract({
      content: sfc,
      filePath: "src/App.vue",
    });
    expect(els).toHaveLength(2);
    expect(els.map((e) => e.text).sort()).toEqual(["模板文本", "脚本文本"]);
  });

  it("handles standalone .ts files", () => {
    const content = `
import { useI18n } from "vue-i18n";
export function getLabel(t: ReturnType<typeof useI18n>["t"]) {
  return t("工具函数文本");
}
`;
    const els = vueI18nExtractor.extract({
      content,
      filePath: "src/utils.ts",
    });
    expect(els).toHaveLength(1);
    expect(els[0].text).toBe("工具函数文本");
    expect(els[0].meta).toMatchObject({
      framework: "vue-i18n",
      file: "src/utils.ts",
      callSite: expect.stringContaining("file"),
    });
  });

  it("returns empty array for files without i18n calls", () => {
    const sfc = `
<template>
  <div>No i18n here</div>
</template>

<script setup lang="ts">
const x = 1;
</script>
`;
    const els = vueI18nExtractor.extract({
      content: sfc,
      filePath: "src/NoI18n.vue",
    });
    expect(els).toHaveLength(0);
  });

  it("handles SFC parse errors gracefully", () => {
    const broken = `<template><div>{{ $t("broken")`;
    const els = vueI18nExtractor.extract({
      content: broken,
      filePath: "broken.vue",
    });
    expect(Array.isArray(els)).toBe(true);
  });

  it("handles real-world pattern: attribute binding", () => {
    const sfc = `
<template>
  <Picker :placeholder="$t('选择一个语言...')" />
</template>

<script setup lang="ts">
</script>
`;
    const els = vueI18nExtractor.extract({
      content: sfc,
      filePath: "src/Picker.vue",
    });
    expect(els).toHaveLength(1);
    expect(els[0].text).toBe("选择一个语言...");
  });

  it("handles real-world pattern: array of t() calls in script", () => {
    const sfc = `
<template>
  <div />
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n();

const statusOptions = [
  { label: t("全部"), value: undefined },
  { label: t("未读"), value: "UNREAD" },
  { label: t("已读"), value: "READ" },
];
</script>
`;
    const els = vueI18nExtractor.extract({
      content: sfc,
      filePath: "src/Status.vue",
    });
    expect(els).toHaveLength(3);
    expect(els.map((e) => e.text)).toEqual(["全部", "未读", "已读"]);
  });
});
