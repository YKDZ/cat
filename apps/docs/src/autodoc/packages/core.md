# @cat/core

Core infrastructure: generic event bus, typed pub/sub

## Overview

* **Modules**: 2

* **Exported functions**: 2

* **Exported types**: 10

## Function Index

### packages/core/src

### `createEvent`

```ts
export const createEvent = (type: T, payload: M[T], options?: CreateEventOptions): EventOf<M, T>
```

### `isLeaseRecoverableTaskQueue`

```ts
/**
 * Check whether a task queue supports lease recovery.
 *
 * @param queue - Task queue to inspect
 *
 * @returns Whether lease recovery is supported
 */
export const isLeaseRecoverableTaskQueue = (queue: TaskQueue<T>): boolean
```

## Type Index

* `EventMap` (type)

* `EventOf` (type)

* `AnyEventOf` (type)

* `EventHandler` (type)

* `WaitForEventOptions` (type)

* `EventBus` (type)

* `CreateEventOptions` (type)

* `QueueTask` (type) — A task in the task queue.

* `TaskQueue` (type) — Task queue interface — abstracts enqueue, dequeue, ack, and nack operations.

* `LeaseRecoverableTaskQueue` (type) — Task queue interface that supports lease recovery.
