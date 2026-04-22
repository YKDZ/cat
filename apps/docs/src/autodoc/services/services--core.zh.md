# 核心业务服务

> **Section**: 服务  ·  **Subject ID**: `services/core`

`@cat/core` 提供两类轻量基础设施原语，被整个后端服务层复用。

## 类型安全事件总线（EventBus）

`EventBus<TEventMap>` 是一个内存内的发布-订阅总线，`TEventMap` 是将事件名映射到载荷类型的泛型字典，保证订阅回调与 publish 载荷在编译期类型对齐。

核心 API：

- `publish(event, payload)`：向所有订阅者分发事件，发布时同步遍历回调。
- `subscribe(event, handler)`：注册监听器；返回取消订阅函数。
- `waitFor(event, predicate?)`：返回 `Promise`，在下一次满足 `predicate` 的事件触发时 resolve，便于在测试或工作流中等待特定状态。

`DomainEventBus` 是绑定到 `DomainEventMap`（在 `@cat/domain` 中定义）的全局事件总线实例，各领域聚合通过它向其他服务层发布领域事件，实现松耦合。

## 任务队列（TaskQueue）

`TaskQueue` 接口抽象了后台任务的入队与消费行为：

- `enqueue(task)`：提交任务，返回 `taskId`。
- `dequeue(timeout?)`：阻塞式取出下一条任务，服务启动时在独立循环中调用。
- `acknowledge(taskId)`：确认任务已成功处理；未确认任务在超时后重新入队。

`InMemoryTaskQueue` 是供测试和单机开发环境使用的内存实现；生产环境中 `@cat/server-shared` 提供基于 Redis 的 `RedisTaskQueue` 作为替代。

## 相关主题

- [`domain/core`](../domain/domain--core.zh.md)
