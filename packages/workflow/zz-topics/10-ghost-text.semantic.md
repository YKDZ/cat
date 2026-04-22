---
subject: infra/workflow
title: Ghost Text 预翻译回显链路
---

这一节按顺序说明 Ghost Text 从事件触发到编辑器显示的完整链路：

1. `@/workspaces/cat/packages/operations/src/register-domain-event-handlers.ts:L188-L201` 监听 `element:created` 并异步触发 `runAutoTranslatePipeline`。
2. `@/workspaces/cat/packages/operations/src/run-auto-translate-pipeline.ts:L24-L138` 将候选写入 open AUTO_TRANSLATE PR 的 changeset，entityId 形如 `element:{id}:lang:{languageId}`。
3. `@/workspaces/cat/packages/domain/src/queries/pull-request/find-open-auto-translate-pr.query.ts:L20-L42` 保证"同项目 + 同目标语言"的 open auto-translate PR 可被定位。
4. `@/workspaces/cat/packages/vcs/src/branch-overlay.ts:L13-L60` 的 `readWithOverlay` 负责读取 branch changeset 覆盖层。
5. `@/workspaces/cat/apps/app-api/src/orpc/routers/ghost-text.ts:L11-L73` 在有 open PR 时读取 `auto_translation` overlay 并通过 async generator 向前端 streaming suggestion。
6. `@/workspaces/cat/apps/app/src/app/stores/editor/ghost-text.ts:L104-L364` 说明前端先请求预翻译 suggestion；若 API 无返回，则按 profile 配置回退到 memory / suggestion stores。
7. `@/workspaces/cat/apps/app/src/app/components/editor/extensions/ghost-text.ts:L149-L227` 说明 Tab / Ctrl-ArrowRight / Escape 的接受与清除行为。

`@/workspaces/cat/packages/operations/src/__tests__/auto-translate-merge-apply.test.ts:L118-L266` 验证 overlay 在 merge 前可见、merge 后转为正式 translation 的完整生命周期。
