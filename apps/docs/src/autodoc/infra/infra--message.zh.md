# 消息队列与通知

> **Section**: 基础设施  ·  **Subject ID**: `infra/message`

`@cat/message` 封装了跨渠道消息推送能力，将应用内通知与电子邮件通知统一管理，并支持实时长连接推送。

## 网关模式（MessageGateway）

`MessageGateway` 是向用户发送通知的统一入口，屏蔽底层渠道差异。内部通过 `ChannelDispatcher` 将消息路由到对应渠道处理器：

- **InAppChannel**：将消息持久化至数据库，并通过 `NotificationConnectionManager` 实时推送给已连接的前端会话。
- **EmailChannel**：将消息格式化为 HTML/文本邮件，通过 SMTP 或第三方邮件服务发送。

渠道选择依据消息的 `channelPreference`（`in_app` / `email` / `both`）以及用户通知设置。

## 实时推送（NotificationConnectionManager）

`NotificationConnectionManager` 维护一张以 `userId` 为键的长连接映射，连接类型（SSE 或 WebSocket）由应用层选择：

- `addConnection(userId, connection)`：登记连接。
- `removeConnection(userId, connectionId)`：断连时清理。
- `push(userId, payload)`：即时向指定用户推送消息；若用户当前无活跃连接，消息仅存入数据库，用户下次打开时拉取。

## 通知类型

`NotificationType` 枚举涵盖主要业务场景：`translation_assigned`（翻译任务分配）、`pr_review_requested`（PR 审查请求）、`agent_finished`（Agent 完成）、`comment_mention`（评论提及）等，前端依据类型渲染不同的通知卡片。
