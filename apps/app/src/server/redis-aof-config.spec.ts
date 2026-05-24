import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");

const redisComposeFiles = [
  "apps/app/docker-compose.yml",
  "apps/app-e2e/docker-compose.yml",
  "apps/eval/suites/smoke/docker-compose.yml",
  "apps/eval/suites/minecraft-term-recall/docker-compose.yml",
  "apps/eval/suites/minecraft-memory-recall/docker-compose.yml",
  "apps/eval/suites/minecraft-agent-translate/docker-compose.yml",
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
    if (/^ {4}[A-Za-z0-9_-]+:\s*$/u.test(line)) {
      break;
    }
    const match = line.match(/^\s*-\s+"?([^"]+)"?\s*$/u);
    if (match) {
      tokens.push(match[1]);
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

      expect(redisBlock).toMatch(/^\s*image:\s*redis\s*$/mu);
      expect(tokens).toEqual([
        "redis-server",
        "--appendonly",
        "yes",
        "--appendfsync",
        "everysec",
      ]);
    },
  );
});
