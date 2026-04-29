---
name: auto-dev-runner
description: 启动、管理和控制 auto-dev 协调器容器。用于需要启动 auto-dev 环境、触发 issue 认领、回应 decision round-trip、监控运行状态、或重置环境时。
user-invocable: true
---

# Auto-Dev 环境启动与控制

`tools/auto-dev` 是一个 AI 开发协调器。它监听 GitHub issue 的 `auto-dev:ready` 标签，自动认领任务、派遣 `claude-code` agent、并通过 GitHub comment 实现人机 decision round-trip 和 PR re-trigger。

---

## 架构速览

```
GitHub Issue (auto-dev:ready 标签 + body frontmatter 配置)
      ↓ coordinator 轮询认领 (30s 间隔)
Coordinator 进程 (Docker 容器 或 直接运行)
  ├── BranchManager   → 创建 auto-dev/issue-<N> 分支 + git worktree
  ├── AgentDispatcher → 启动 claude-code agent 子进程
  ├── DecisionManager → issue/PR comment 轮询，解析 @d<N> 回复
  └── PRTriggerPoller → 监听 @autodev PR comment，触发 retrigger agent
      ↓
  agent 子进程 (claude-code)
  cwd = <workspace>/tools/auto-dev/worktrees/issue-<N>
  工具：auto-dev request-decision / request-validation
      ↓
GitHub PR + comments (以 GitHub App bot 身份发布)
```

所有 coordinator 发出的 GitHub comment（认领、完成、决策请求）都以 **GitHub App bot 账号**（`ykdz-s-autodevbot[bot]`）身份发布，而非个人 PAT 用户。

---

## 认证：GitHub App（必须）vs PAT（不可用于发评论）

Coordinator 使用 **GitHub App** 凭据发布评论，以使 bot 评论与个人操作明确区分。

| 环境变量                    | 说明                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| `GITHUB_APP_ID`             | GitHub App 的数字 ID（如 `3532408`）                                |
| `GITHUB_APP_PRIVATE_KEY`    | App 的 RSA 私钥（PEM 格式，支持 `\n` 转义或多行）                   |
| `GITHUB_APP_INSTALLATION_ID`| App 在仓库上的安装 ID（如 `127819771`）                             |
| `ANTHROPIC_API_KEY`         | Claude API key（DeepSeek 兼容格式亦可）                             |
| `GITHUB_REPOSITORY`         | `owner/repo`，如 `YKDZ/cat`                                         |
| `ANTHROPIC_BASE_URL`        | 可选，覆盖 API endpoint（如 `https://api.deepseek.com/anthropic`）  |
| `SSH_PASSWORD`              | Docker 容器 SSH root 密码（可选，调试用）                           |

> ⚠️ 不能用 `GITHUB_TOKEN` (PAT) 替代 GitHub App 凭据——PAT 会以个人账号发评论，破坏 bot 身份区分。

---

## Issue 配置方式：Body Frontmatter（不是标签）

Agent 配置在 **issue body 的 YAML frontmatter** 中指定，只用 `auto-dev:ready` 标签触发认领：

```markdown
---
agent: impl-only
effort: max
model: haiku
---

任务描述…
```

**Frontmatter 字段**：

| 字段     | 可选值                                                          | 说明                               |
| -------- | --------------------------------------------------------------- | ---------------------------------- |
| `agent`  | `impl-only`, `full-pipeline`, `one-shot-fix`, `spec-only`      | 使用哪个 agent 定义（必填）        |
| `effort` | `low`, `medium`, `high`, `max`                                  | claude-code `--max-turns` 等级     |
| `model`  | `haiku`, `sonnet`, `opus`（等 claude-code 支持的模型简写）      | 覆盖 agent 默认模型                |

> 旧的 `agent:claude-code`、`effort:max` 标签方式已废弃，只用 frontmatter。

---

## 可用 Agent 定义

| 名称            | 文件                                   | 适用场景                                    |
| --------------- | -------------------------------------- | ------------------------------------------- |
| `impl-only`     | `tools/auto-dev/agents/impl-only.md`   | 规格明确，直接实现，跳过设计阶段            |
| `full-pipeline` | `tools/auto-dev/agents/full-pipeline.md` | 从 brainstorm 到 iplan 到 impl 完整流程   |
| `one-shot-fix`  | `tools/auto-dev/agents/one-shot-fix.md` | 单文件或单函数级别的快速修复               |
| `spec-only`     | `tools/auto-dev/agents/spec-only.md`  | 只生成规格文档，不写代码                    |
| `retrigger`     | `tools/auto-dev/agents/retrigger.md`  | 自动用于 `@autodev` PR re-trigger（内部用） |

---

## 1. Docker 模式启动

```bash
cd /workspaces/cat/tools/auto-dev

GITHUB_REPOSITORY=YKDZ/cat \
GITHUB_APP_ID=3532408 \
GITHUB_APP_PRIVATE_KEY="$(cat /path/to/private-key.pem)" \
GITHUB_APP_INSTALLATION_ID=127819771 \
SSH_PASSWORD=yourpassword \
ANTHROPIC_API_KEY=sk-... \
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \
docker compose up -d

docker logs auto-dev-auto-dev-1 -f
```

构建流程：pnpm install → vite build → dist 拷贝到 `/opt/auto-dev/dist` → 容器启动 → git init/fetch `/opt/repo` → 启动 coordinator。

---

## 2. Docker 快速重启（跳过构建）

```bash
# 固化容器修改（如手动加了 wrapper）
docker commit auto-dev-auto-dev-1 auto-dev-auto-dev:latest

cd /workspaces/cat/tools/auto-dev
docker compose down
docker volume rm auto-dev_auto-dev-state   # 清除 runs/decisions 状态（可选）

GITHUB_REPOSITORY=YKDZ/cat \
GITHUB_APP_ID=3532408 \
GITHUB_APP_PRIVATE_KEY="$(cat /path/to/private-key.pem)" \
GITHUB_APP_INSTALLATION_ID=127819771 \
ANTHROPIC_API_KEY=sk-... \
docker compose up -d --no-build
```

---

## 3. 触发 Issue 处理

Coordinator 每 30 秒轮询一次。添加 `auto-dev:ready` 标签后最多等 30 秒即可认领：

```bash
# 如果之前已认领，先去掉旧标签
gh issue edit 900 --repo YKDZ/cat --remove-label "auto-dev:claimed"

# 触发认领
gh issue edit 900 --repo YKDZ/cat --add-label "auto-dev:ready"
```

认领后 coordinator 会：

1. 创建分支 `auto-dev/issue-<N>` + git worktree
2. 在 issue 上发布 claimed 评论（含 Run ID，作者为 bot）
3. 创建 PR（`draft` 状态）并发布 Working 评论
4. 如果 issue 含 decision 请求，先发布 decision 评论，等待回复，再派遣 agent

---

## 4. @autodev PR Re-Trigger（追加指令）

在已存在的 auto-dev PR comment 中写 `@autodev <指令>` 可触发 re-trigger agent 对 PR 追加修改：

```bash
# 在 PR #925 上触发 retrigger
gh pr comment 925 --repo YKDZ/cat \
  --body "@autodev Please append the line \`<!-- retrigger-done -->\` to the file \`tools/auto-dev/e2e-marker.md\`. Then commit and push."
```

流程：
1. Coordinator 检测到 `@autodev` 评论（每 30 秒轮询）
2. 发布 **Re-Trigger Working** 评论（bot 身份）
3. 派遣 `retrigger` agent 到 PR 分支的 worktree
4. Agent 提交并 push 修改
5. Coordinator 发布 **Re-Trigger Completion** 评论（bot 身份）

> 注意：re-trigger comment 中若包含 frontmatter（`agent:`/`model:`/`effort:`），可覆盖 agent 定义和参数。

---

## 5. Decision Round-Trip（人机交互）

Issue comment 中会出现：

```
🤖 Auto-Dev needs a decision to continue.

**Decision `d1`**: Document title style

**Options**:
- `formal`: Formal Report
- `casual`: Casual Log

💬 Reply with `@d1 <key>` to resolve.
```

**回复**：

```bash
gh issue comment 900 --repo YKDZ/cat --body "@d1 formal"
```

Coordinator 下一轮轮询（≤30s）即会解析并通知等待中的 agent 继续。

**多轮 decision**：每个 `@d<N>` 独立等待，必须逐一回复：

```bash
gh issue comment 900 --repo YKDZ/cat --body "@d1 formal"
# 等 ~30s，出现 d2 后…
gh issue comment 900 --repo YKDZ/cat --body "@d2 both"
```

---

## 6. 监控运行状态

### 关键日志行

```bash
docker logs auto-dev-auto-dev-1 -f 2>&1
# 或直接运行时查看 stdout
```

| 日志关键词                                      | 含义                     |
| ----------------------------------------------- | ------------------------ |
| `Decision socket listening on ...`              | Coordinator 就绪         |
| `Claimed issue #<N>, run <id>`                  | Issue 认领               |
| `Branch auto-dev/issue-<N> + worktree ...`      | 分支 + worktree 已创建   |
| `PR #<N> created for issue #<N>`                | PR 已创建                |
| `Dispatching re-trigger agent "retrigger" for PR #<N>` | Re-trigger 派遣   |
| `Re-trigger agent for PR #<N> completed (exit 0)` | Re-trigger 完成        |
| `Run <id> finished with status=completed (exit 0)` | 主任务完成             |
| `retrigger-completion-pr-<N> attempt N/45 failed, retrying in 20s` | 网络重试中 |

### 状态文件（Docker 容器内）

```bash
# Coordinator 状态
docker exec auto-dev-auto-dev-1 bash -c \
  "cat /opt/repo/tools/auto-dev/state/coordinator.json | python3 -m json.tool"

# 特定 run 状态
docker exec auto-dev-auto-dev-1 bash -c \
  "cat /opt/repo/tools/auto-dev/state/runs/<run-id>.json | python3 -m json.tool"

# 列出所有 decisions
docker exec auto-dev-auto-dev-1 bash -c \
  "ls /opt/repo/tools/auto-dev/state/decisions/"
```

---

## 7. E2E 测试（验证完整流程）

E2E 测试会创建真实 GitHub issue + PR，验证端到端流程，完成后自动关闭：

```bash
AUTO_DEV_E2E_ENABLED=1 \
GITHUB_APP_ID=3532408 \
GITHUB_APP_PRIVATE_KEY="$(cat todo/ykdz-s-autodevbot.2026-04-28.private-key.pem)" \
GITHUB_APP_INSTALLATION_ID=127819771 \
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \
ANTHROPIC_API_KEY=sk-... \
pnpm vitest run --project unit-auto-dev --reporter verbose \
  tools/auto-dev/src/e2e/lifecycle.test.ts
```

测试验证 4 个关键场景：

1. Coordinator 认领 issue，创建 PR + bot Working 评论
2. Agent 至少提交一个 commit 到 PR 分支
3. Coordinator 在 PR + issue 上发布 bot 完成评论
4. `@autodev` re-trigger 触发新 commit + bot 完成评论

**典型运行时间**：2–3 分钟（无网络故障时）

**超时配置**（针对网络抖动）：

| 常量                  | 值    | 说明                                                   |
| --------------------- | ----- | ------------------------------------------------------ |
| `WAIT_PR_MS`          | 2 min | 等待 PR 创建 + 初始 commit                             |
| `WAIT_COMPLETION_MS`  | 10 min | 等待主 agent 完成（含 push+comment 45×20s 重试）      |
| `WAIT_RETRIGGER_MS`   | 15 min | 等待 re-trigger 完成（与 coordinator 900s 重试窗口对齐）|

---

## 8. 网络弹性说明

此环境中 `api.github.com` 偶发 DNS 劫持（解析到 `198.18.0.2`，导致 i/o timeout），单次故障可持续 3–15 分钟。Coordinator 针对此设计了重试机制：

- **push + 评论合并重试**：`pushAndComment` 每 20 秒重试一次，最多 45 次（15 分钟），直到 push 成功 **且** 评论发布成功
- **re-trigger 强顺序保证**：`requirePushFirst=true` 确保只有 push 成功后才发布完成评论，避免测试在看到评论后发现 commit 还没到达 GitHub
- **状态文件容错**：`state-store` 对损坏的 JSON 文件静默跳过，不崩溃

---

## 9. 完全重置流程

```bash
cd /workspaces/cat/tools/auto-dev

# 停止容器 + 删除状态卷
docker compose down
docker volume rm auto-dev_auto-dev-state 2>/dev/null || true

# 重置 issue 标签（如果需要重新触发）
gh issue edit <N> --repo YKDZ/cat --remove-label "auto-dev:claimed"
gh issue edit <N> --repo YKDZ/cat --add-label "auto-dev:ready"

# 重启（加 --no-build 跳过重建，或不加以重建）
GITHUB_REPOSITORY=YKDZ/cat \
GITHUB_APP_ID=3532408 \
GITHUB_APP_PRIVATE_KEY="$(cat /path/to/private-key.pem)" \
GITHUB_APP_INSTALLATION_ID=127819771 \
ANTHROPIC_API_KEY=sk-... \
docker compose up -d --no-build
```

> **注意**：`docker compose down` 不自动删除 named volumes，必须显式 `docker volume rm`。

---

## 10. 验证 auto-dev CLI 在 PATH 中

Agent 子进程需要 `auto-dev` 命令可用。**必须在镜像中预置 wrapper**：

```bash
# 检查是否存在
docker exec auto-dev-auto-dev-1 which auto-dev

# 如果缺失，手动添加后 commit 固化
docker exec auto-dev-auto-dev-1 bash -c \
  'printf "#!/bin/sh\nexec node /opt/auto-dev/dist/cli.js \"\$@\"\n" \
   > /usr/local/bin/auto-dev && chmod +x /usr/local/bin/auto-dev'
docker commit auto-dev-auto-dev-1 auto-dev-auto-dev:latest
```

或在 `Dockerfile` 中永久添加（推荐）：

```dockerfile
RUN printf '#!/bin/sh\nexec node /opt/auto-dev/dist/cli.js "$@"\n' \
    > /usr/local/bin/auto-dev && chmod +x /usr/local/bin/auto-dev
```

---

## 11. 常见问题

| 现象 | 原因 | 解决 |
| ---- | ---- | ---- |
| 评论作者是个人账号（YKDZ）而非 bot | 使用了 `GITHUB_TOKEN` (PAT) 而非 GitHub App 凭据 | 改用 `GITHUB_APP_ID/PRIVATE_KEY/INSTALLATION_ID` |
| `auto-dev: command not found` (exit 127) | 容器镜像缺少 `/usr/local/bin/auto-dev` wrapper | 手动添加后 `docker commit`，或在 Dockerfile 中固化 |
| Agent 跳过决策，直接宣告"task already done" | worktree 中已有目标文件（残留自旧分支） | 删除状态卷 + 删除 remote 分支后重启 |
| Re-trigger 没有产生新 commit | Agent (haiku+low effort) 未按指令操作 | 在 re-trigger comment 中明确指定文件全路径；使用 `effort: medium` 以上 |
| Push 失败后完成评论也没发出 | 网络故障期间 push 和 comment 都失败 | 正常现象，coordinator 每 20s 重试，最长持续 15 min |
| Decision 回复 30s 内无响应 | Coordinator 轮询间隔 30s | 正常，稍等；检查日志确认 coordinator 在线 |
| `git push` 被 rejected（remote 存在旧分支） | 前一次 run 遗留了同名远端分支 | `createBranch` 已自动删除旧远端分支，若仍失败手动 `git push origin --delete auto-dev/issue-<N>` |
