# 源码元素采集器

> **Section**: 基础设施  ·  **Subject ID**: `infra/source-collector`

`@cat/source-collector` 负责从项目源码中静态扫描并提取可翻译元素，将其通过 oRPC 端点上传至 CAT 数据库，是 i18n 内容管理工作流的起点。

## 核心接口

`SourceExtractor` 是可翻译元素提取器的统一接口：

- **`supports(filePath): boolean`**：判断当前提取器是否处理指定文件（依据扩展名或文件名模式）。
- **`extract(filePath, content): ExtractedElement[]`**：从文件内容中提取所有可翻译字符串，每条返回 `key`（唯一标识）、`defaultText`（原始文本）、`context`（注释/备注）、`file` 和 `line`。

## Vue i18n 提取器

`VueI18nExtractor` 是内置的主力提取器，支持 Vue 单文件组件（SFC）：

- **模板层**：解析 `<template>` AST，识别 `$t('key')` 和 `$t('key', { count })` 调用，提取键名与复数形式。
- **脚本层**：解析 `<script setup>` 中的 `t('key')` 调用（通过 `useI18n()` 解构），支持 TypeScript 类型标注。
- **i18n 块**：解析 `<i18n>` 自定义块，提取内联的 JSON / YAML 格式翻译条目。

## CollectOptions

`CollectOptions` 控制采集行为：

- `include` / `exclude`：Glob 模式，指定扫描范围（如 `["src/**/*.vue", "src/**/*.ts"]`）。
- `projectId` / `documentId`：目标项目与文档的 ID，采集结果将与其关联。
- `locale`：源语言代码（BCP-47），默认 `"en"`。
- `dryRun`：仅提取不上传，用于本地预览。

## 与 CI 集成

提供 GitHub Action（`source-collection` 技能中描述）：在每次代码推送时自动运行采集，将新增或变更的可翻译元素同步到 CAT，确保翻译数据库与源码始终保持一致。

## 相关主题

- [`domain/core`](../domain/domain--core.zh.md)
