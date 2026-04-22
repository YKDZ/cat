---
subject: infra/server-shared
---

`@cat/server-shared` 提供 Node.js 后端服务所需的生产级基础设施工具，包括基于 Redis 的任务队列、缓存层以及常用的安全与 LLM 工具函数。

## Redis 任务队列（RedisTaskQueue）

`RedisTaskQueue` 实现 `@cat/core` 的 `TaskQueue` 接口，底层使用 Redis List 存储任务。

关键实现细节：

- **入队**（`enqueue`）：`RPUSH` 将序列化后的任务追加到队列末尾，同时以 `taskId` 为键在哈希中记录任务元数据与状态。
- **出队**（`dequeue`）：使用 `LMOVE source processing LEFT RIGHT` 原子指令，将任务从主队列移入处理中队列，避免并发消费时的重复出队。
- **确认**（`acknowledge`）：`LREM processing …` 从处理中队列删除条目；若服务崩溃，超时后台任务会将处理中队列的过期条目重新推入主队列。
- **死信**：连续失败超过 `maxRetries` 次的任务移入死信队列（DLQ），并记录失败原因。

## Redis 缓存（RedisCacheStore）

`RedisCacheStore` 提供带 TTL 的键值缓存，支持：

- `get<T>(key)` / `set(key, value, ttl)`：序列化/反序列化透明处理。
- `getOrSet(key, fn, ttl)`：Cache-Aside 模式的一步封装，未命中时调用 `fn` 填充并返回。
- `del(key)` / `delByPattern(pattern)`：精确删除或按 Glob 模式批量失效。

## 安全与加密工具

- `hashPassword(plain)` / `verifyPassword(plain, hash)`：使用 Argon2id 算法，对密码进行安全哈希与校验。
- `generateSecureToken(bytes?)`：生成加密安全的随机令牌，用于 CSRF Token、邮件验证链接等。
- `encryptSymmetric(data, key)` / `decryptSymmetric(ciphertext, key)`：AES-256-GCM 对称加解密，用于存储敏感凭据。

## LLM 工具

- `countTokens(text, model)`：估算给定文本在指定模型下的 token 数量（基于 `tiktoken`）。
- `truncateToTokenLimit(text, maxTokens, model)`：安全截断文本到 token 上限，确保不超出 LLM 上下文窗口。
