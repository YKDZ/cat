import type { MessageGateway } from "@cat/message";
import type { Hono } from "hono";

declare global {
  var app: Hono;
  var inited: boolean;
  var messageGateway: MessageGateway | undefined;
}

export {};
