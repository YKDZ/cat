import * as yaml from "js-yaml";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as z from "zod";

import { interpolateEnvVars } from "./env-interpolation";

import {
  type ElementsSeed,
  ElementsSeedSchema,
  type GlossarySeed,
  GlossarySeedSchema,
  type MemoryRecallTestSet,
  MemoryRecallTestSetSchema,
  type MemorySeed,
  MemorySeedSchema,
  type ProjectSeed,
  ProjectSeedSchema,
  type SuiteConfig,
  SuiteConfigSchema,
  type TermRecallTestSet,
  TermRecallTestSetSchema,
  type TranslationTestSet,
  TranslationTestSetSchema,
} from "./schemas";

export type LoadedSuite = {
  config: SuiteConfig;
  suiteDir: string;
  projectSeed: ProjectSeed;
  glossarySeed: GlossarySeed | undefined;
  memorySeed: MemorySeed | undefined;
  elementsSeed: ElementsSeed | undefined;
  testSets: Map<
    string,
    TermRecallTestSet | MemoryRecallTestSet | TranslationTestSet
  >;
};

const readYaml = <T>(filePath: string, schema: z.ZodType<T>): T => {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw);
  return schema.parse(parsed);
};

const readYamlWithEnv = <T>(filePath: string, schema: z.ZodType<T>): T => {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw);
  const interpolated = interpolateEnvVars(parsed);
  return schema.parse(interpolated);
};

const readJson = <T>(filePath: string, schema: z.ZodType<T>): T => {
  const raw = readFileSync(filePath, "utf-8");
  return schema.parse(JSON.parse(raw));
};

export const loadSuite = (suiteDir: string): LoadedSuite => {
  const abs = (rel: string) => resolve(suiteDir, rel);

  const config = readYamlWithEnv(abs("suite.yaml"), SuiteConfigSchema);

  const projectSeed = readJson(abs(config.seed.project), ProjectSeedSchema);
  const glossarySeed = config.seed.glossary
    ? readJson(abs(config.seed.glossary), GlossarySeedSchema)
    : undefined;
  const memorySeed = config.seed.memory
    ? readJson(abs(config.seed.memory), MemorySeedSchema)
    : undefined;
  const elementsSeed = config.seed.elements
    ? readJson(abs(config.seed.elements), ElementsSeedSchema)
    : undefined;

  const testSets = new Map<
    string,
    TermRecallTestSet | MemoryRecallTestSet | TranslationTestSet
  >();
  for (const scenario of config.scenarios) {
    const tsPath = scenario["test-set"];
    if (testSets.has(tsPath)) continue;

    let schema: z.ZodType<
      TermRecallTestSet | MemoryRecallTestSet | TranslationTestSet
    >;
    if (scenario.type === "term-recall") {
      schema = TermRecallTestSetSchema;
    } else if (scenario.type === "agent-translate") {
      schema = TranslationTestSetSchema;
    } else {
      schema = MemoryRecallTestSetSchema;
    }
    testSets.set(tsPath, readYaml(abs(tsPath), schema));
  }

  return {
    config,
    suiteDir,
    projectSeed,
    glossarySeed,
    memorySeed,
    elementsSeed,
    testSets,
  };
};
