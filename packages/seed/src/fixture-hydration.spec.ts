import { beforeEach, describe, expect, it, vi } from "vitest";

const pluginManager = vi.hoisted(() => ({
  get: vi.fn(),
  clear: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("@cat/plugin-core", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/plugin-core")>(
      "@cat/plugin-core",
    );
  return { ...actual, PluginManager: pluginManager };
});

import { defaultProductPluginIds } from "@cat/server-shared";
import { CoreRelationTypeDefinitions } from "@cat/shared";

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

const makeBootstrappedDb = () => {
  const results = [
    [{ id: "en" }, { id: "zh-Hans" }],
    ["superadmin", "admin", "user", "viewer"].map((name) => ({ name })),
    [{ id: 1 }],
    CoreRelationTypeDefinitions.map(({ name, namespace, version }) => ({
      name,
      namespace,
      version,
    })),
    [{ id: "root" }],
    [{ key: "server.url" }],
    defaultProductPluginIds.map((id) => ({ id })),
    defaultProductPluginIds.map((id) => ({ id })),
    [{ id: "translator" }],
  ];
  let queryIndex = 0;
  return {
    select: () => {
      const rows = results[queryIndex] ?? [];
      queryIndex += 1;
      const query = {
        from: () => query,
        limit: () => query,
        where: () => query,
        then: <T>(
          resolve: (value: unknown[]) => T | PromiseLike<T>,
        ): Promise<T> => Promise.resolve(rows).then(resolve),
      };
      return query;
    },
  };
};

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

describe("runFixtureHydration", () => {
  beforeEach(() => {
    pluginManager.clear.mockReset();
    pluginManager.get.mockReset();
    pluginManager.restore.mockReset();
  });

  it("waits for each prerequisite query before issuing the next one", async () => {
    let resolveFirstQuery: ((value: unknown[]) => void) | undefined;
    const firstQuery = new Promise<unknown[]>((resolve) => {
      resolveFirstQuery = resolve;
    });
    let queryCount = 0;
    const db = {
      select: () => {
        queryCount += 1;
        const rows = queryCount === 1 ? firstQuery : Promise.resolve([]);
        const query = {
          from: () => query,
          limit: () => query,
          where: () => query,
          then: <T>(
            resolve: (value: unknown[]) => T | PromiseLike<T>,
          ): Promise<T> => rows.then(resolve),
        };
        return query;
      },
    };

    const hydration = runFixtureHydration({ db: db as never }, loadedSeed, {
      cacheDir: "/tmp/fixture-contract/cache",
      pluginsDir: "/tmp/fixture-contract/plugins",
      pluginLoader: {} as never,
    });

    expect(queryCount).toBe(1);
    if (resolveFirstQuery === undefined) {
      throw new Error("First prerequisite query did not start");
    }
    resolveFirstQuery([]);
    await expect(hydration).rejects.toThrow(
      /Application-data bootstrap is incomplete/,
    );
  });

  it("fails before fixture writes when application bootstrap prerequisites are absent", async () => {
    const db = makePrerequisiteMissingDb();

    await expect(
      runFixtureHydration({ db: db as never }, loadedSeed, {
        cacheDir: "/tmp/fixture-contract/cache",
        pluginsDir: "/tmp/fixture-contract/plugins",
        pluginLoader: {} as never,
      }),
    ).rejects.toThrow(/Application-data bootstrap is incomplete/);
  });

  it("restores installed application plugins before fixture writes", async () => {
    const db = makeBootstrappedDb();
    const restoreBoundary = new Error("restore installed plugins");
    pluginManager.restore.mockRejectedValueOnce(restoreBoundary);
    pluginManager.get.mockReturnValue({ restore: pluginManager.restore });

    await expect(
      runFixtureHydration({ db: db as never }, loadedSeed, {
        cacheDir: "/tmp/fixture-contract/cache",
        pluginsDir: "/tmp/fixture-contract/plugins",
        pluginLoader: {} as never,
      }),
    ).rejects.toBe(restoreBoundary);
    expect(pluginManager.restore).toHaveBeenCalledWith(db);
  });
});
