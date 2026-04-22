# Messaging & Notifications

> **Section**: Infra  ·  **Subject ID**: `infra/message`

**Primary package**: `@cat/message`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `NotificationPushPayload` | type | Notification push payload. |
| `EmailProvider` | interface | Email provider interface implemented by plugins. |
| `MessageGatewayOptions` | type |  |
| `sendMessage` | function | Send a message from anywhere in the backend by publishing message:send-requested |
| `ChannelDispatcher` | interface | Channel dispatcher interface. |
| `MessageRequest` | type | Message send request payload. |
