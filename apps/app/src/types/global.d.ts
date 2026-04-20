import type { DrizzleDB, RedisConnection } from "@cat/db";
import type { MessageGateway } from "@cat/message";
import type { PluginManager } from "@cat/plugin-core";
import type { Hono } from "hono";

export {};

declare global {
  var inited: boolean;
  var app: Hono;
  var messageGateway: MessageGateway;
  // Set by server/initialize.ts at startup; consumed by +onCreateGlobalContext.server.ts
  var drizzleDB: DrizzleDB;
  var redis: RedisConnection;
  var pluginManager: PluginManager;
  var serverName: string;
  var serverBaseURL: string;
}
