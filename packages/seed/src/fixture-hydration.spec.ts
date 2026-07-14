import { describe, expect, it, vi } from "vitest";

const pluginManager = vi.hoisted(() => ({
  get: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("@cat/plugin-core", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/plugin-core")>(
      "@cat/plugin-core",
    );
  return { ...actual, PluginManager: pluginManager };
});

import { runFixtureHydration, type LoadedDevSeed } from "#/index.ts";

const makePrerequisiteMissingDb = () => {
  return {
    select: () => ({
      from: () => {
        const query = {
          limit: () => Promise.resolve([]),
          where: () => query,
          then: <T>(
            resolve: (value: unknown[]) => T | PromiseLike<T>,
          ): Promise<T> => Promise.resolve([]).then(resolve),
        };
        return query;
      },
    }),
  };
};

describe("runFixtureHydration", () => {
  it("fails before fixture writes when application bootstrap prerequisites are absent", async () => {
    const db = makePrerequisiteMissingDb();
    const loadedSeed = {
      config: {
        name: "fixture-contract",
        seed: { project: "seed/project.json" },
        plugins: { loader: "real", overrides: [] },
      },
      projectSeed: {
        name: "Fixture project",
        sourceLanguage: "en",
        translationLanguages: ["zh-Hans"],
      },
      localOverrideSources: [],
      userSeed: undefined,
      glossarySeed: undefined,
      memorySeed: undefined,
      elementsSeed: undefined,
      seedDir: "/tmp/fixture-contract",
    } satisfies LoadedDevSeed;

    await expect(
      runFixtureHydration({ db: db as never }, loadedSeed, {
        cacheDir: "/tmp/fixture-contract/cache",
        pluginsDir: "/tmp/fixture-contract/plugins",
        pluginLoader: {} as never,
      }),
    ).rejects.toThrow(/Application-data bootstrap is incomplete/);
  });
});
