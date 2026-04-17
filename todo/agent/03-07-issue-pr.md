### 3.7 Issue + PR 系统

Issue + PR 系统为翻译项目提供任务跟踪、代码审核请求和评论协作能力。

#### 3.7.1 数据模型

```
issue
  ├── id, externalId, projectId, number (自增序号)
  ├── title, body (Markdown)
  ├── status: OPEN | CLOSED
  ├── authorId (user/agent), assigneeId
  ├── labels (text[])
  └── createdAt, updatedAt, closedAt

pull_request
  ├── id, externalId, projectId, number
  ├── title, body (Markdown)
  ├── status: OPEN | MERGED | CLOSED
  ├── authorId, assigneeId
  ├── sourceBranchId, targetBranchId (EntityBranch FK)
  ├── mergedAt, closedAt
  └── createdAt, updatedAt

issue_comment_thread
  ├── id, projectId
  ├── contextType: issue | pr
  ├── contextId (issue.id / pull_request.id)
  └── createdAt

issue_comment
  ├── id, threadId, authorId
  ├── body (Markdown)
  └── createdAt, updatedAt, deletedAt

cross_reference
  ├── id, projectId
  ├── sourceType: issue | pr | issue_comment
  ├── sourceId
  ├── targetType: issue | pr
  └── targetId
```

#### 3.7.2 状态机

**Issue 状态机**:
```
OPEN → CLOSED (close_issue)
CLOSED → OPEN (reopen_issue)
```

**PR 状态机**:
```
OPEN → MERGED (merge_pr, requires sourceBranchId merge into targetBranchId)
OPEN → CLOSED (close_pr)
CLOSED → OPEN (reopen_pr)
```

#### 3.7.3 Agent 工具集

| 工具 | 描述 |
|------|------|
| `issue_create` | 创建新 Issue |
| `issue_list` | 列出项目 Issue |
| `issue_claim` | 认领（关闭）一个 Issue |
| `pr_create` | 创建 PR (关联分支) |
| `pr_update` | 更新 PR 状态 |
| `comment_add` | 在 Issue/PR 下添加评论 |
| `comment_list` | 列出 Issue/PR 评论 |
| `comment_delete` | 删除评论 |

#### 3.7.4 TrustSettings（信任管理）

项目级 TrustSettings 控制 Agent 是否被自动授予 `direct_editor` 关系：

- **Trust Mode（默认）**: Agent 自动获得 `direct_editor`，无需人工审核
- **Isolation Mode**: Agent 需显式 grant 才能写入；所有变更通过 EntityBranch + PR 流程

TrustSettings 通过 `trustSettings.*` oRPC 端点管理。

#### 3.7.5 交叉引用

`#N` 格式的文本引用（如 `#42`）自动解析为指向同项目 Issue 或 PR 的交叉引用，存储在 `cross_reference` 表中。解析在 Issue/PR/评论创建或更新时触发。
