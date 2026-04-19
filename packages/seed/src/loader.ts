import * as yaml from "js-yaml";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as z from "zod";

import { interpolateEnvVars } from "@/env-interpolation";
import {
  type DevSeedConfig,
  DevSeedConfigSchema,
  type ElementsSeed,
  ElementsSeedSchema,
  type GlossarySeed,
  GlossarySeedSchema,
  type MemorySeed,
  MemorySeedSchema,
  type ProjectSeed,
  ProjectSeedSchema,
  type UserSeed,
  UserSeedSchema,
} from "@/schemas";

export type LoadedDevSeed = {
  config: DevSeedConfig;
  seedDir: string;
  projectSeed: ProjectSeed;
  userSeed: UserSeed | undefined;
  glossarySeed: GlossarySeed | undefined;
  memorySeed: MemorySeed | undefined;
  elementsSeed: ElementsSeed | undefined;
};

export const readYamlWithEnv = <T>(
  filePath: string,
  schema: z.ZodType<T>,
): T => {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw);
  const interpolated = interpolateEnvVars(parsed);
  return schema.parse(interpolated);
};

export const readJson = <T>(filePath: string, schema: z.ZodType<T>): T => {
  const raw = readFileSync(filePath, "utf-8");
  return schema.parse(JSON.parse(raw));
};

export const loadDevSeed = (seedDir: string): LoadedDevSeed => {
  const abs = (rel: string) => resolve(seedDir, rel);

  const config = readYamlWithEnv(abs("seed.yaml"), DevSeedConfigSchema);

  const projectSeed = readJson(abs(config.seed.project), ProjectSeedSchema);
  const userSeed = config.seed.users
    ? readJson(abs(config.seed.users), UserSeedSchema)
    : undefined;
  const glossarySeed = config.seed.glossary
    ? readJson(abs(config.seed.glossary), GlossarySeedSchema)
    : undefined;
  const memorySeed = config.seed.memory
    ? readJson(abs(config.seed.memory), MemorySeedSchema)
    : undefined;
  const elementsSeed = config.seed.elements
    ? readJson(abs(config.seed.elements), ElementsSeedSchema)
    : undefined;

  return {
    config,
    seedDir,
    projectSeed,
    userSeed,
    glossarySeed,
    memorySeed,
    elementsSeed,
  };
};
