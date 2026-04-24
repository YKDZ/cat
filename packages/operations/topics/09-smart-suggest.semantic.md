---
subject: infra/operations
title: 内置智能建议（Smart Suggestion）
---

## 定位

`smartSuggestOp`（[smart-suggest.ts](../src/smart-suggest.ts)）是 `@cat/operations` 中的首方建议源，在交互式翻译会话中提供实时 LLM 建议。

与 `TRANSLATION_ADVISOR` 外部插件并列运行，但不等同于它——Smart Suggestion 在操作层汇集多路上下文信号，不依赖于外部插件配置。

## 边界

| 组件                    | 职责                                          |
| ----------------------- | --------------------------------------------- |
| `collectMemoryRecallOp` | 纯确定性记忆匹配，不含 LLM                    |
| `termRecallOp`          | 纯确定性术语匹配，不含 LLM                    |
| `smartSuggestOp`        | 汇总所有信号，发起一次 LLM 调用，产出一条建议 |

Raw 记忆和术语结果继续作为证据面板的原始数据展示；Smart Suggestion 消费这些结果，但不替换它们。

## 输入信号

| 信号                   | 类型 | 说明                                    |
| ---------------------- | ---- | --------------------------------------- |
| `sourceText`           | 必填 | 当前源文本                              |
| `memories`             | 可选 | 预加载的记忆匹配列表（已降序排列）      |
| `terms`                | 可选 | 预加载的术语列表                        |
| `neighborTranslations` | 可选 | 邻近已审批译文（{source, translation}） |
| `elementMeta`          | 可选 | 元素元数据（用于上下文感知提示）        |

所有信号均由调用方预加载传入；`smartSuggestOp` 本身不执行 DB 查询。

## 置信度策略

置信度反映上下文质量，而非原始记忆置信度，上限为 0.85 以避免过度声称生成式输出的确定性。

| 情况                  | 置信度             |
| --------------------- | ------------------ |
| 强记忆支撑（≥ 0.9）   | 0.82               |
| 中等记忆支撑（≥ 0.7） | 0.68               |
| 弱记忆支撑（> 0）     | 0.57               |
| 无记忆                | 0.50               |
| 有术语额外加          | +0.03（上限 0.85） |
| 有邻近上下文额外加    | +0.02（上限 0.85） |

## 来源标识

建议的 `meta.source` 固定为 `"smart-suggestion"`，`meta.signalClasses` 列出本次生成用到的信号类别（`"source"` | `"memory"` | `"term"` | `"context"`）。`advisorId` 字段不设置，以区分于外部 advisor 建议。

## 降级策略

以下情况均返回 `{ suggestion: null }`，建议流不受影响：

- 无可用 `LLM_PROVIDER` 插件
- LLM 调用抛出异常
- LLM 返回空内容

## 与自动翻译的边界

`smartSuggestOp` 仅用于交互式建议场景，不修改批量自动翻译管线（`autoTranslateOp` / `runAutoTranslatePipeline`）。
