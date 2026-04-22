---
subject: infra/operations
title: 术语存储与“种属差”向量化
---

`@/workspaces/cat/packages/domain/src/queries/glossary/fetch-terms-by-concept-ids.query.ts:L132-L220` 的 `buildConceptVectorizationText` 不直接向量化术语 surface form，而是把 `Terms + Subjects + Definition` 拼成结构化文本；这正是"种属差"机制——通过上位概念与定义的组合文本区分同形异义术语。

`@/workspaces/cat/packages/operations/src/create-vectorized-string.ts:L50-L100` 只负责创建 `PENDING_VECTORIZE` string 并在服务齐全时异步入队，不在调用点内阻塞等待 embedding。

`@/workspaces/cat/packages/operations/src/revectorize-concept.ts:L33-L107` 负责比较旧文本与新文本；结构化文本没变就 skip，变了才创建新 string 并回写 `termConcept.stringId`。

`@/workspaces/cat/packages/operations/src/create-term.ts:L25-L67` 与 `@/workspaces/cat/packages/operations/src/add-term-to-concept.ts:L31-L63` 分别处理两种路径：新建 concept 时立即 revectorize；给已有 concept 加 term 时依赖领域事件后续触发 revectorize。
