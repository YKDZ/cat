---
subject: infra/auth
---

`@cat/auth` 使用 `@cat/graph` 的 DAG 机制编排认证流程，将多因素认证（MFA）、条件分支与插件扩展封装为可复用的认证流定义。

## 核心概念

**AuthFlowDefinition**：声明一条认证流，包含节点映射表、边列表、入口节点、成功/失败终止节点列表，以及 `maxSteps`、`flowTTLSeconds`、`requireCSRF` 等全局配置。

**AuthNodeType**：六种节点类型各司其职：

| 类型                   | 职责                                     |
| ---------------------- | ---------------------------------------- |
| `credential_collector` | 收集用户标识（邮箱/用户名等）            |
| `challenge_verifier`   | 验证挑战响应（OTP、WebAuthn、TOTP）      |
| `decision_router`      | 条件路由，无需用户交互                   |
| `identity_resolver`    | 查库解析身份（是否存在、关联账号）       |
| `session_finalizer`    | 创建会话，写入 `completedFactors` 和 AAL |
| `plugin_custom`        | 插件提供的自定义认证节点                 |

每个节点通过 `clientHint`（含 `componentType`、`formSchema`、`displayInfo`）告知前端应渲染的交互组件（如 `password_input`、`totp_input`、`webauthn_prompt`、`qrcode_display` 等）。

## 黑板状态（AuthBlackboardData）

认证执行过程中的所有状态写入黑板：

- `identity`：解析出的用户 ID、邮箱、关联认证提供商等。
- `aal`（Authentication Assurance Level）：0 = 未认证，1 = 密码，2 = MFA。
- `completedFactors`：已完成的认证因素列表，每条记录 `factorType`、`completedAt` 与 `aal`。
- `nodeOutputs`：各节点的输出，用于边条件（`EdgeCondition`）的路由判断。
- `status`：流的生命周期状态（`pending` → `in_progress` → `completed` / `failed` / `expired`）。

## 条件分支

认证流中的边可携带 `EdgeCondition`（复用 `@cat/graph` 的条件求值），例如依据 `nodeOutputs.resolve-identity.userFound` 决定跳转到"密码验证"还是"注册引导"节点，使同一流定义支持多条路径。

## 灵活性

认证流以数据驱动的方式定义，不同项目或插件可提供不同的 `AuthFlowDefinition`，无需修改认证执行引擎。`plugin_custom` 节点类型允许插件将私有认证逻辑无缝嵌入标准流中。
