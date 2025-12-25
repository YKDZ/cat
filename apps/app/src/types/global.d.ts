import type { Hono } from "hono";

export {};

declare global {
  var inited: boolean;
  var app: Hono;
}
