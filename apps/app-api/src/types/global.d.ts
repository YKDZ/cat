import type { Hono } from "hono";

export {};

declare global {
  var app: Hono;
}
