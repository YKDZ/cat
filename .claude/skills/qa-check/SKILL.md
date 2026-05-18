---
name: qa-check
description: 修改代码后运行必要的 moon QA 检查。优先运行受影响的检查，检查通过时只打印简短成功报告，检查失败时打印完整日志。
user-invocable: false
---

# 修改后 QA 审查（moon）

使用 moon 内置的受影响和 CI 语义，而不是手动映射 `git diff` 输出到项目。

- `moon ci` 已经能确定变更文件、计算受影响的任务、继续执行失败的任务，并汇总运行结果。
- `moon exec` 是适用于需要显式失败行为的全工作区扫描的低级逃生出口。
- `MOON_OUTPUT_STYLE=buffer-only-failure` 是任务输出样式的全局覆盖，对于 agent 驱动的 QA 来说，这比原始流式输出要好得多。
- 如果只需检查范围，使用 `moon query projects --affected`。

## 输出策略

QA 输出必须遵守此规则：

- 如果 QA 命令成功，不要打印其任务输出。不打印简短的成功报告。
- 如果 QA 命令失败，打印**完整**捕获的日志。
- 不要使用 `script`、`sed`、`grep`、`tail` 或其他截断过滤器用于 QA 命令。
- 不要重新运行失败的命令仅为了显示完整错误输出；第一次失败的运行必须已经显示它。

始终使用捆绑的 [QA 辅助脚本](./scripts/qa-run.sh)，而不是内联定义 shell 函数。
内联函数作用域局限于当前 shell 会话，容易在终端命令之间丢失；捆绑脚本可在 agent 和运行间复用。
辅助脚本自动将 `MOON_OUTPUT_STYLE` 默认设置为 `buffer-only-failure`，因此成功的任务输出在辅助程序决定是否打印整体命令日志之前就已被原生抑制。

在仓库根目录，调用方式如下：

```bash
bash ./.claude/skills/qa-check/scripts/qa-run.sh "<label>" <command> [args...]
```

## 1. 第一阶段：受影响的 QA

以 moon 的 CI 工作流开始。这是默认的目标检查，因为它已经使用变更的文件来确定受影响的任务集。

```bash
bash ./.claude/skills/qa-check/scripts/qa-run.sh \
  "Affected QA passed (moon ci :test :lint :typecheck :fmt)" \
  moon ci :test :lint :typecheck :fmt --quiet
```

如果需要在运行 QA 前检查 moon 认为受影响的内容，可直接查询：

```bash
moon query projects --affected
```

## 2. 第二阶段：全工作区 QA

受影响的检查通过后，运行全工作区扫描以捕获更广泛的回归问题。此处使用 `moon exec` 以便失败处理是显式且非快速失败。

```bash
bash ./.claude/skills/qa-check/scripts/qa-run.sh \
  "Workspace QA passed (moon exec :test :lint :typecheck :fmt)" \
  moon exec :test :lint :typecheck :fmt --on-failure continue --upstream deep --quiet
```

## 3. 失败修复

如果任一阶段失败：

- 从打印的日志开始。它已经是完整的失败输出。
- 识别失败的项目和任务，然后修复它们。
- 首先重新运行最小相关的目标集。例如：

```bash
bash ./.claude/skills/qa-check/scripts/qa-run.sh \
  "shared/ui QA passed" \
  moon run \
    shared:test shared:lint shared:typecheck shared:fmt \
    ui:test ui:lint ui:typecheck ui:fmt \
    --quiet
```

- 一旦目标重试通过，重新运行失败的阶段。
- 重复直到两个阶段都通过。

## 4. CI 验证

本地 QA 通过后，推送分支并验证 GitHub Actions CI 工作流：

```bash
# 推送后获取最新运行
gh run list --limit 1 --json databaseId,status,conclusion,name

# 等待完成（失败时退出非零）
gh run watch <run-id> --exit-status
```

CI 工作流（`.github/workflows/ci.yml`）是**权威性验收门禁**。它运行所有本地检查，加上不能在本地复现的作业：

| 作业                  | 检查内容                                  |
| --------------------- | ----------------------------------------- |
| **Static Gateway**    | codegen-check, fmt-check, typecheck, lint |
| **Unit Tests**        | 所有单元测试套件                          |
| **Integration Tests** | 数据库集成测试                            |
| **E2E Tests**         | 针对真实应用的完整 Playwright 测试套件    |

CI 不是可选的。本地 QA 通过而不验证 CI 是不山的——E2E 测试尤其需要真实数据库、Redis 和构建好的生产服务器。

## 4. 诚信准则

- 优先使用 `moon ci`，而不是手动的 `git diff` 检查，用于受影响的 QA。
- 需要显式 `--on-failure continue` 行为时，优先使用 `moon exec` 而不是 `moon run`。
- 优先使用捆绑的 `./.claude/skills/qa-check/scripts/qa-run.sh` 辅助，而不是内联 shell 函数。
- 优先使用辅助程序的默认 `MOON_OUTPUT_STYLE=buffer-only-failure`，而不是临指过滤输出。
- 保持成功 QA 输出简短；保持失败 QA 输出完整。
