---
name: auto-dev-runner
description: 启动、管理和控制 auto-dev 协调器容器。用于需要启动 auto-dev 环境、触发 issue 认领、回应 decision round-trip、监控运行状态、或重置环境时。
user-invocable: true
---

# Auto-Dev 环境启动与控制

`tools/auto-dev` 是一个 Docker 化的 AI 开发协调器。它监听 GitHub issue 标签，自动认领任务、派遣 `claude-code` agent、并通过 GitHub comment 实现人机 decision round-trip。

---

## 架构速览

```
GitHub Issue (auto-dev:ready 标签)
      ↓ coordinator 轮询认领
Docker 容器 (auto-dev-auto-dev-1)
  ├── /opt/auto-dev/dist/cli.js   ← coordinator 进程
  ├── /opt/repo                   ← git clone (从 GitHub main 拉取)
  ├── /opt/repo/tools/auto-dev/state/   ← 状态卷 (runs, decisions)
  ├── /opt/repo/tools/auto-dev/logs/    ← 日志卷 (audit.jsonl)
  └── /var/run/auto-dev.sock      ← decision Unix socket
      ↓ agent 子进程
  claude -p <prompt> --output-format stream-json
  (cwd = /opt/repo/tools/auto-dev/worktrees/issue-<N>)
      ↓ auto-dev request-decision
GitHub Issue comment (🤖 Auto-Dev needs a decision)
      ↓ 用户回复 @d1 <key>
coordinator 轮询解析 → 通知 agent → agent 继续
```

---

## 环境变量（必填）

| 变量                 | 说明                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| `GITHUB_REPOSITORY`  | `owner/repo` 格式，如 `YKDZ/cat`                                             |
| `GITHUB_TOKEN`       | 有权限读写 issue comment 的 PAT（或 `gh auth token`）                        |
| `ANTHROPIC_API_KEY`  | Claude API key（或 DeepSeek 等兼容 key）                                     |
| `SSH_PASSWORD`       | 容器 SSH root 密码（可选，用于调试）                                         |
| `ANTHROPIC_BASE_URL` | 可选，覆盖 API endpoint（如 DeepSeek: `https://api.deepseek.com/anthropic`） |

---

## 1. 首次启动（构建镜像）

```bash
cd /workspaces/cat/tools/auto-dev

GITHUB_REPOSITORY=YKDZ/cat \
GITHUB_TOKEN="$(gh auth token)" \
SSH_PASSWORD=yourpassword \
ANTHROPIC_API_KEY=sk-... \
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \
docker compose up -d

docker logs auto-dev-auto-dev-1 -f
```

构建过程：安装 pnpm 依赖 → vite build → 拷贝 dist 到 `/opt/auto-dev/dist` → 容器启动后 git init/fetch `/opt/repo` → 启动 coordinator。

---

## 2. 快速重启（使用已提交镜像，跳过构建）

**重要**：每次修改容器内文件（如修复 PATH 问题）后，先 `docker commit` 固化，再用 `--no-build` 重启。

```bash
# 固化当前容器状态为镜像（如添加了 /usr/local/bin/auto-dev wrapper）
docker commit auto-dev-auto-dev-1 auto-dev-auto-dev:latest

# 停止 + 删除状态卷（完全重置）
cd /workspaces/cat/tools/auto-dev
docker compose down
docker volume rm auto-dev_auto-dev-state   # 删除 runs/decisions 状态

# 用提交的镜像重启，不重建
GITHUB_REPOSITORY=YKDZ/cat \
GITHUB_TOKEN="$(gh auth token)" \
SSH_PASSWORD=yourpassword \
ANTHROPIC_API_KEY=sk-... \
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \
docker compose up -d --no-build
```

---

## 3. 触发 issue 处理

Coordinator 轮询 `auto-dev:ready` 标签。添加标签后 coordinator 会在下一个轮询周期（默认 30 秒）认领：

```bash
# 移除旧的 claimed 标签（如果有）
gh issue edit 900 --repo YKDZ/cat --remove-label "auto-dev:claimed"

# 添加 ready 标签触发认领
gh issue edit 900 --repo YKDZ/cat --add-label "auto-dev:ready"
```

认领后 coordinator 会：

1. 创建本地分支 `auto-dev/issue-<N>` + worktree `/opt/repo/tools/auto-dev/worktrees/issue-<N>`
2. 在 GitHub issue 上发布 claimed 评论（含 Run ID）
3. 如果 issue 要求 decision，**先发布 decision 请求评论，等待响应，再派遣 agent**

---

## 4. Decision Round-Trip（核心交互流程）

当 coordinator 发布决策请求时，issue 上会出现：

```
🤖 Auto-Dev needs a decision to continue.

**Decision `d1`**: Document title style

**Options**:
- `formal`: Formal Report — Title: User Decision Report
- `casual`: Casual Log — Title: My Decisions

**Recommendation**: `formal`

💬 Reply to this issue with `@d1 <key>` to resolve, e.g.:
> @d1 formal
```

**回复格式**：`@d<alias> <key>`

```bash
# 通过 GitHub comment 回复（推荐，走完整 round-trip 路径）
gh issue comment 900 --repo YKDZ/cat --body "@d1 formal"

# 通过 CLI 直接解决（绕过 GitHub，用于调试）
docker exec auto-dev-auto-dev-1 bash -c \
  "MOON_WORKSPACE_ROOT=/opt/repo node /opt/auto-dev/dist/cli.js \
   resolve-decision <decision-id> --choice formal"
```

Coordinator **轮询间隔 30 秒**扫描 GitHub comment。回复后最多等 30 秒即可看到下一个 decision 或 agent 启动。

### 多轮 decision 模式

Issue 可要求分轮收集 decisions（如 Round 1: 2 个，Round 2: 3 个）。每个 decision 独立轮询，需逐一回复后 coordinator 才会解锁下一个并最终派遣 agent：

```bash
# 依次等待并回复，不要跳过
gh issue comment 900 --repo YKDZ/cat --body "@d1 formal"
# 等 ~30s，出现 d2 后...
gh issue comment 900 --repo YKDZ/cat --body "@d2 both"
# 等 ~30s，出现 d3 后...
gh issue comment 900 --repo YKDZ/cat --body "@d3 yes"
```

---

## 5. 监控运行状态

### 容器日志（关键信息）

```bash
docker logs auto-dev-auto-dev-1 -f 2>&1

# 关键日志行含义：
# [auto-dev] Decision socket listening on /var/run/auto-dev.sock   ← coordinator 就绪
# [auto-dev] Claimed issue #900, run <run-id>                      ← 任务认领
# [auto-dev] Branch auto-dev/issue-900 + worktree ...              ← worktree 创建
# [auto-dev] Resolved <id> (d1) via issue comment by YKDZ → formal ← decision 解决
# [auto-dev] Run <id> finished with status=completed (exit 0)      ← 任务完成
```

### 状态文件

```bash
# 当前 coordinator 状态
docker exec auto-dev-auto-dev-1 bash -c \
  "cat /opt/repo/tools/auto-dev/state/coordinator.json | python3 -m json.tool"

# 特定 run 状态（status, phase, pendingDecisionIds）
docker exec auto-dev-auto-dev-1 bash -c \
  "cat /opt/repo/tools/auto-dev/state/runs/<run-id>.json | python3 -m json.tool"

# 查看所有 pending decisions
docker exec auto-dev-auto-dev-1 bash -c \
  "ls /opt/repo/tools/auto-dev/state/decisions/"

# 查看某个 decision 内容（title, options, alias, status）
docker exec auto-dev-auto-dev-1 bash -c \
  "cat /opt/repo/tools/auto-dev/state/decisions/<id>.json | python3 -m json.tool"
```

### CLI 命令

```bash
# 通过 CLI 查询（在容器外运行，走 socket）
docker exec auto-dev-auto-dev-1 bash -c \
  "MOON_WORKSPACE_ROOT=/opt/repo node /opt/auto-dev/dist/cli.js list"

docker exec auto-dev-auto-dev-1 bash -c \
  "MOON_WORKSPACE_ROOT=/opt/repo node /opt/auto-dev/dist/cli.js decisions"
```

---

## 6. 验证 auto-dev CLI 在 PATH 中

Agent 子进程（`claude-code`）需要 `auto-dev` 命令可用。**必须在镜像中预置 wrapper**，否则 agent 会得到 `exit 127`：

```bash
# 验证 wrapper 存在
docker exec auto-dev-auto-dev-1 which auto-dev

# 如果缺失，手动添加（再 commit 固化）
docker exec auto-dev-auto-dev-1 bash -c \
  'printf "#!/bin/sh\nexec node /opt/auto-dev/dist/cli.js \"\$@\"\n" \
   > /usr/local/bin/auto-dev && chmod +x /usr/local/bin/auto-dev'
docker commit auto-dev-auto-dev-1 auto-dev-auto-dev:latest
```

---

## 7. 完全重置流程

```bash
cd /workspaces/cat/tools/auto-dev

# 1. 停止容器 + 删除状态卷（runs/decisions 全清）
docker compose down
docker volume rm auto-dev_auto-dev-state 2>/dev/null || true

# 2. 如果还需要重建镜像（修改了 Dockerfile 或源码）
docker compose build --no-cache

# 3. 重置 issue 标签
gh issue edit <N> --repo YKDZ/cat --remove-label "auto-dev:claimed"
gh issue edit <N> --repo YKDZ/cat --add-label "auto-dev:ready"

# 4. 重启
GITHUB_REPOSITORY=YKDZ/cat GITHUB_TOKEN="$(gh auth token)" \
SSH_PASSWORD=... ANTHROPIC_API_KEY=sk-... \
docker compose up -d --no-build    # 或省略 --no-build 以重建
```

> **注意**：`docker compose down` 不会自动删除 named volumes。必须显式 `docker volume rm`。

---

## 8. 常见问题

| 现象                                                     | 原因                                                    | 解决                                            |
| -------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| `auto-dev: command not found` (exit 127)                 | 容器镜像缺少 `/usr/local/bin/auto-dev` wrapper          | 手动添加后 `docker commit`                      |
| Agent 跳过决策，直接宣告 "task already done"             | worktree 中已有目标文件（来自旧分支或上次运行的 state） | 删除状态卷 + 删除 remote 分支后重启             |
| Decision 回复后超过 30s 无响应                           | Coordinator 轮询间隔默认 30s                            | 正常，等待即可；检查 `docker logs`              |
| `coordinator.json` 中 `activeRunIds: []` 但 run 文件存在 | Run 已完成，coordinator 已移出活跃列表                  | 正常状态                                        |
| `docker compose up` 重建了新镜像，丢失 wrapper           | 修改了 Dockerfile 触发重建，覆盖了 committed 镜像       | 重新在 Dockerfile 中加入 `RUN` 步骤添加 wrapper |

---

## 9. Dockerfile 中永久添加 wrapper（推荐）

在 `tools/auto-dev/Dockerfile` 的 `COPY docker-entrypoint.sh` 之后添加：

```dockerfile
COPY tools/auto-dev/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && printf '#!/bin/sh\nexec node /opt/auto-dev/dist/cli.js "$@"\n' \
       > /usr/local/bin/auto-dev \
    && chmod +x /usr/local/bin/auto-dev
```

这样每次 `docker compose build` 后 wrapper 都会自动存在，无需 `docker commit`。
