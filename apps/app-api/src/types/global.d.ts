import type { MessageGateway } from "@cat/message";
import type { Hono } from "hono";

export {};

declare global {
  var app: Hono;
  var inited: boolean;
  var messageGateway: MessageGateway | undefined;
}
