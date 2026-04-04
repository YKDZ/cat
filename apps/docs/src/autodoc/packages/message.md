# @cat/message

Unified message gateway: in-app notifications and email dispatch

## Overview

* **Modules**: 5

* **Exported functions**: 1

* **Exported types**: 5

## Function Index

### packages/message/src

### `sendMessage`

```ts
/**
 * Send a message from anywhere in the backend by publishing message:send-requested.
 */
export const sendMessage = async (options: {
  recipientId: string;
  category: MessageCategory;
  title: string;
  body: string;
  data?: JSONType;
  channels?: MessageChannel[];
}): Promise<void>
```

## Type Index

* `NotificationPushPayload` (type) — Notification push payload.

* `EmailProvider` (interface) — Email provider interface implemented by plugins.

* `MessageGatewayOptions` (type)

* `ChannelDispatcher` (interface) — Channel dispatcher interface.

* `MessageRequest` (type) — Message send request payload.
