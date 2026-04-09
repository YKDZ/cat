# @cat/core

Core infrastructure: generic event bus, typed pub/sub

## Overview

* **Modules**: 2

* **Exported functions**: 1

* **Exported types**: 9

## Function Index

### packages/core/src

### `createEvent`

```ts
export const createEvent = (type: T, payload: M[T], options?: CreateEventOptions): EventOf<M, T>
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
