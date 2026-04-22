---
subject: infra/operations
title: Tokenizer 系统
---

`@/workspaces/cat/packages/operations/src/tokenize.ts:L23-L56` 只做 orchestration：从 plugin manager 取出所有 `TOKENIZER` 服务，按 priority 排序后调用 `@cat/plugin-core` 的 `tokenize()`。`tokenizeOp` 是对外接口。

`@/workspaces/cat/packages/plugin-core/src/utils/tokenizer.ts:L9-L91` 解释真正的 rule engine：逐 cursor 扫描、首个匹配规则获胜、未命中时回退成普通 `text` token、children token 会递归 shift offset。

`@/workspaces/cat/packages/plugin-core/src/services/tokenizer.ts:L13-L66` 和 `@/workspaces/cat/packages/plugin-core/src/services/nlp-word-segmenter.ts:L45-L90` 需要并列说明"规则 tokenizer"与"NLP word segmenter"的职责差异：前者通过正则/字符串规则切分结构化文本（变量、标点等），后者利用 NLP 模型做语言感知的词语切分。

`@/workspaces/cat/@cat-plugin/basic-tokenizer/src/index.ts:L14-L31` 与 `@/workspaces/cat/@cat-plugin/basic-tokenizer/src/tokenizer.ts:L25-L167` 作为默认实现示例，说明 newline / term / variable / literal / punctuation 的优先级栈。
