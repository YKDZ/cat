import type { OverallPrismaClient, PrismaClient } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import {
  PluginDataSchema,
  PluginManifestSchema,
  type PluginData,
} from "@cat/shared/schema/plugin";
import { logger } from "@cat/shared/utils";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import z from "zod";

const loadPluginData = async (dir: string): Promise<PluginData> => {
  const manifestPath = join(dir, "manifest.json");
  const packageDotJsonPath = join(dir, "package.json");
  const readmePath = join(dir, "README.md");

  const rawManifest = await readFile(manifestPath, "utf-8");
  const rawREADME = await readFile(readmePath, "utf-8").catch(() => null);

  const manifest = PluginManifestSchema.parse(JSON.parse(rawManifest));

  const { name, version } = JSON.parse(
    await readFile(packageDotJsonPath, "utf-8"),
  );

  return PluginDataSchema.parse({
    ...manifest,
    name,
    version,
    overview: rawREADME,
  });
};

export const importLocalPlugins = async (
  prisma: PrismaClient,
): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const existPluginIds: string[] = [];

    existPluginIds.push(
      ...(
        await tx.plugin.findMany({
          select: {
            id: true,
          },
        })
      ).map((plugin) => plugin.id),
    );

    for (const id of (
      await PluginRegistry.get().getPluginIdInLocalPlugins()
    ).filter((id) => !existPluginIds.includes(id))) {
      await importPlugin(tx, id);
    }
  });
};

export const installDefaultPlugins = async (
  prisma: PrismaClient,
  pluginRegistry: PluginRegistry,
): Promise<void> => {
  const localPlugins = [
    "email-password-auth-provider",
    "es-term-service",
    "json-file-handler",
    "libretranslate-advisor",
    "ollama-vectorizer",
    "yaml-file-handler",
    "s3-storage-provider",
  ];

  const installedPlugins = (
    await prisma.pluginInstallation.findMany({
      where: {
        scopeType: "GLOBAL",
        scopeId: "",
      },
      select: { pluginId: true },
    })
  ).map((i) => i.pluginId);

  const needToBeInstalled = localPlugins.filter(
    (p) => !installedPlugins.includes(p),
  );

  for (const pluginId of needToBeInstalled) {
    await pluginRegistry.installPlugin(prisma, pluginId, "GLOBAL", "");
  }
};

export const importPlugin = async (
  prisma: OverallPrismaClient,
  id: string,
  pluginsDir: string = join(process.cwd(), "plugins"),
): Promise<void> => {
  logger.info("PLUGIN", { msg: "Importing plugin...", id });

  const dir = join(pluginsDir, id);
  const data = await loadPluginData(dir);

  const originPlugin = await prisma.plugin.findUnique({
    where: {
      id: data.id,
    },
  });

  // 不存在原插件意味着即将创建
  const pluginId = originPlugin?.id ?? data.id;

  await prisma.plugin.upsert({
    where: {
      id: pluginId,
    },
    update: {
      name: data.name,
      entry: data.entry ?? null,
      overview: data.overview,
      iconURL: data.iconURL,

      Config: data.config
        ? {
            connectOrCreate: {
              where: {
                pluginId,
                schema: {
                  equals: z.json().parse(data.config) ?? {},
                },
              },
              create: {
                schema: z.json().parse(data.config) ?? {},
              },
            },
          }
        : undefined,

      Tags: {
        connectOrCreate: data.tags
          ? data.tags.map((tag) => ({
              where: {
                name: tag,
              },
              create: {
                name: tag,
              },
            }))
          : undefined,
      },

      Versions: {
        connectOrCreate: {
          where: {
            pluginId_version: {
              pluginId,
              version: data.version,
            },
          },
          create: {
            version: data.version,
          },
        },
      },
    },

    create: {
      id: pluginId,
      name: data.name,
      overview: data.overview,
      entry: data.entry ?? null,
      iconURL: data.iconURL,

      Config: data.config
        ? {
            create: {
              schema: z.json().parse(data.config) ?? {},
            },
          }
        : undefined,

      Tags: {
        connectOrCreate: data.tags
          ? data.tags.map((tag) => ({
              where: {
                name: tag,
              },
              create: {
                name: tag,
              },
            }))
          : undefined,
      },

      Versions: {
        create: {
          version: data.version,
        },
      },
    },
  });
};
