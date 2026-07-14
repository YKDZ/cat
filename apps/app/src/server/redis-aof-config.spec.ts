import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");

const redisComposeFiles = [
  "apps/app/compose.yaml",
  "apps/app/compose.local.yaml",
  "apps/app-e2e/compose.e2e.yaml",
  "apps/eval/suites/smoke/compose.eval.yaml",
  "apps/eval/suites/minecraft-term-recall/compose.eval.yaml",
  "apps/eval/suites/minecraft-memory-recall/compose.eval.yaml",
  "apps/eval/suites/minecraft-agent-translate/compose.eval.yaml",
] as const;

const readText = (relativePath: string): string => {
  return readFileSync(resolve(root, relativePath), "utf8");
};

const extractRedisServiceBlock = (text: string): string => {
  const lines = text.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^ {2}redis:\s*$/u.test(line));
  expect(start).toBeGreaterThanOrEqual(0);

  const block: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    if (/^ {2}[A-Za-z0-9_-]+:\s*$/u.test(line)) {
      break;
    }
    block.push(line);
  }

  return block.join("\n");
};

const extractCommandTokens = (serviceBlock: string): string[] => {
  const lines = serviceBlock.split(/\r?\n/u);
  const commandIndex = lines.findIndex((line) =>
    /^ {4}command:\s*$/u.test(line),
  );
  expect(commandIndex).toBeGreaterThanOrEqual(0);

  const tokens: string[] = [];
  for (let index = commandIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    if (/^ {4}[A-Za-z0-9_-]+:\s*$/u.test(line)) {
      break;
    }
    const match = line.match(/^\s*-\s+"?([^"]+)"?\s*$/u);
    const token = match?.[1];
    if (token !== undefined) {
      tokens.push(token);
    }
  }

  return tokens;
};

describe("Redis AOF compose config", () => {
  it.each(redisComposeFiles)(
    "%s enables appendonly yes and appendfsync everysec on services.redis.command",
    (relativePath) => {
      const text = readText(relativePath);
      const redisBlock = extractRedisServiceBlock(text);
      const tokens = extractCommandTokens(redisBlock);

      expect(tokens.slice(0, 5)).toEqual([
        "redis-server",
        "--appendonly",
        "yes",
        "--appendfsync",
        "everysec",
      ]);
    },
  );

  it("keeps the shared Redis capability on the official image", () => {
    const text = readText("apps/app/compose.services.yaml");
    const redisBlock = extractRedisServiceBlock(text);

    expect(redisBlock).toMatch(/^\s*image:\s*redis:8-alpine\s*$/mu);
  });
});
