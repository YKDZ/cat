import { type AnyEventOf, type EventBus, InProcessEventBus } from "@cat/core";

export type AuthEventMap = {
  "auth:flow:start": { flowId: string; flowDefId: string };
  "auth:flow:end": { flowId: string; status: string };
  "auth:node:start": { flowId: string; nodeId: string; nodeType: string };
  "auth:node:end": { flowId: string; nodeId: string; status: string };
  "auth:node:error": { flowId: string; nodeId: string; error: string };
  "auth:security:ip_change": {
    flowId: string;
    oldIpHash: string;
    newIpHash: string;
  };
};

export type AuthEvent = AnyEventOf<AuthEventMap>;
export type AuthEventType = keyof AuthEventMap;
export type AuthEventBus = EventBus<AuthEventType, AuthEvent>;

export const createAuthEventBus = (): AuthEventBus =>
  new InProcessEventBus<AuthEventType, AuthEvent>();
