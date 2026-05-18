---
name: moon-task-runner
description: 运行单次或多目标 moon 任务，保持输出少噪就。当 agent 需要执行 `moon exec`、`moon run`、`moon ci` 或 `moon check` 进行独立验证、重点测试或多任务 QA 时使用此 skill。
user-invocable: false
---

# 低噪小的 Moon 任务执行

使用 moon 的 exec 类命令运行目标验证，而不会将装饰性的 moon 输出泻满聊天界面。
对于此 skill，不要依赖包装脚本。根据任务、期望的详细程度以及是否需要以通过/失败为重点的输出，直接构建合适的 `moon` 命令。

## 何时使用

- 运行单个已知任务，例如 `root:lint` 或 `app:typecheck`
- 将多个显式任务合并到一个命令中进行重点验证
- 以 CI 模式运行受影响的任务，而不切换到完整的 QA 工作流
- 修复失败后重新运行任务子集
- 自主执行 moon 命令，同时保持用户可见输出小

## 命令选择

- `moon exec` — 临时执行的默认选择。当需要一个或多个显式目标、`--query`、`--affected` 或 `--on-failure continue` 时最佳。
- `moon run` — 当需要已知目标列表且首选正常快速失败行为时使用。
- `moon ci` — 用于使用 CI 默认设置按变更的文件运行。
- `moon check` — 验证项目的标准构建/测试任务时使用。

## 输出指导

- 从仓库根目录运行命令，优先直接使用 `moon` 二进制而不是 `pnpm moon`，尤其是在嵌套或多仓库工作区中。
- agent 驱动运行时，优先使用 `--quiet`，在隐藏非重要的 moon UI 的同时保持任务警告和错误可见。
- 当想抑制通过的任务输出但仍要完整的失败任务日志时，优先使用 `MOON_OUTPUT_STYLE=buffer-only-failure`。
- 不要添加噪散的标志，如 `--log trace`，除非明确调试 moon 本身。
- 只有当简短的人类可读摘要真正有用时，才添加 `--summary minimal`。
- 保持目标范围狭小。当较小的命令足够时，优先使用 `root:lint` 而不是全工作区的 `:lint`。
- 如果需要成功沉默/失败完整的 QA 语义，使用 `qa-check` skill，而不要在此重新实现日志捕获。

## 直接调用经验法则

根据情况自己组装命令：

- **默认低噪小验证**：使用 `--quiet` 和 `MOON_OUTPUT_STYLE=buffer-only-failure`。
- **需要简短的运行结束摘要**：添加 `--summary minimal`。
- **需要完整流式输出用于调试或用户请求的可见性**：省略 `--quiet`，如有需要，设置 `MOON_OUTPUT_STYLE=stream`。
- **需要快速失败行为**：优先使用 `moon run`。
- **需要受影响的 CI 默认**：优先使用 `moon ci`。
- **需要广泛的编排操控，如 `--query`、`--affected` 或 `--on-failure continue`**：优先使用 `moon exec`。
- **需要项目的标准构建/测试捆**：优先使用 `moon check`。

## 工作流程

1. 选择最小适用的 moon 子命令。
2. 运行前决定输出模式：
   - 低噪小验证 → `MOON_OUTPUT_STYLE=buffer-only-failure` + `--quiet`
   - 人类可读摘要 → 可选添加 `--summary minimal`
   - 完整调试可见性 → 省略 `--quiet`，考虑使用 `MOON_OUTPUT_STYLE=stream`

3. 直接从仓库根目录运行命令。例如：

   ```bash
   cd /workspaces/cat
   MOON_OUTPUT_STYLE=buffer-only-failure moon exec root:lint --quiet
   ```

4. 对于多任务验证，传入多个显式目标：

   ```bash
   cd /workspaces/cat
   MOON_OUTPUT_STYLE=buffer-only-failure moon exec root:lint root:typecheck --quiet
   ```

5. 对于受影响的 CI 风格运行：

   ```bash
   cd /workspaces/cat
   MOON_OUTPUT_STYLE=buffer-only-failure moon ci :test :lint --quiet
   ```

6. 如果需要 moon 的正常 UI，省略 `--quiet` 直接运行：

   ```bash
   cd /workspaces/cat
   moon exec root:lint --summary minimal
   ```

7. 如果需要成功任务输出正常流式传输，显式覆盖输出样式：

   ```bash
   cd /workspaces/cat
   MOON_OUTPUT_STYLE=stream moon exec app:build --summary minimal
   ```

## 注意事项

- 此 skill 规范了 `exec`、`run`、`ci` 和 `check`，但 agent 应选择最适合情况的命令。
- 如果需要传递参数，在 `--` 后面添加，就像正常的 `moon` 命令一样。
- 重要的是决策策略，而不是包装器：选择正确的 moon 子命令，选择正确的详细程度，然后直接运行它。
