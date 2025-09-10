import { OverallPrismaClient, PrismaClient, ScopeType } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import type { PluginData } from "@cat/shared";
import {
  getDefaultFromSchema,
  JSONSchemaSchema,
  logger,
  PluginDataSchema,
  PluginManifestSchema,
} from "@cat/shared";
import { readFile } from "fs/promises";
import { join } from "path";
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

export const importLocalPlugins = async (prisma: PrismaClient) => {
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

    await Promise.all(
      (await PluginRegistry.get().getPluginIdInLocalPlugins())
        .filter((id) => !existPluginIds.includes(id))
        .map(async (id) => {
          await importPlugin(tx, id);
        }),
    );
  });
};

export const installDefaultPlugins = async (prisma: PrismaClient) => {
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
    logger.info("SERVER", {
      msg: `About to install default plugin ${pluginId} to global scope...`,
    });
    await installPlugin(prisma, pluginId, "GLOBAL", "");
  }
};

export const importPlugin = async (
  prisma: OverallPrismaClient,
  id: string,
  pluginsDir: string = join(process.cwd(), "plugins"),
) => {
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
      Configs: {
        connectOrCreate: data.configs
          ? data.configs.map(({ key, schema, overridable }) => ({
              where: {
                pluginId_key: {
                  pluginId,
                  key,
                },
              },
              create: {
                key,
                schema: z.json().parse(schema) ?? {},
                overridable,
              },
            }))
          : [],
      },
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

type ServiceConfig = {
  getter: (prisma: OverallPrismaClient, pluginId: string) => Promise<any[]>;
  key: Services;
};

type Services = keyof Pick<
  OverallPrismaClient,
  | "authProvider"
  | "termService"
  | "translationAdvisor"
  | "storageProvider"
  | "textVectorizer"
  | "translatableFileHandler"
>;

const createServiceConfigs = (
  pluginRegistry: PluginRegistry,
): ServiceConfig[] => [
  {
    getter: pluginRegistry.getAuthProvider.bind(pluginRegistry),
    key: "authProvider",
  },
  {
    getter: pluginRegistry.getStorageProvider.bind(pluginRegistry),
    key: "storageProvider",
  },
  {
    getter: pluginRegistry.getTranslatableFileHandler.bind(pluginRegistry),
    key: "translatableFileHandler",
  },
  {
    getter: pluginRegistry.getTextVectorizer.bind(pluginRegistry),
    key: "textVectorizer",
  },
  {
    getter: pluginRegistry.getTranslationAdvisor.bind(pluginRegistry),
    key: "translationAdvisor",
  },
  {
    getter: pluginRegistry.getTermService.bind(pluginRegistry),
    key: "termService",
  },
];

export const installPlugin = async (
  prisma: PrismaClient,
  pluginId: string,
  scopeType: ScopeType,
  scopeId: string,
) => {
  const dbPlugin = await prisma.plugin.findUnique({
    where: { id: pluginId },
  });

  if (!dbPlugin) throw new Error(`Plugin ${pluginId} not found`);

  const pluginRegistry = PluginRegistry.get();
  const serviceConfigs = createServiceConfigs(pluginRegistry);

  await prisma.$transaction(async (tx) => {
    const installation = await tx.pluginInstallation.create({
      data: { pluginId, scopeType, scopeId },
    });

    const pluginConfigs = await tx.pluginConfig.findMany({
      where: {
        pluginId,
      },
      select: { id: true, schema: true },
    });

    await Promise.all(
      pluginConfigs.map(async ({ id, schema }) => {
        const defaultValue =
          getDefaultFromSchema(JSONSchemaSchema.parse(schema)) ?? {};

        console.log(schema, defaultValue);

        return await tx.pluginConfigInstance.create({
          data: {
            configId: id,
            pluginInstallationId: installation.id,
            value: defaultValue,
          },
        });
      }),
    );

    console.log(await tx.pluginConfigInstance.findMany());

    await Promise.all(
      serviceConfigs.map(async ({ getter, key }) => {
        return await importPluginServices(
          tx,
          pluginId,
          installation.id,
          getter,
          key,
        );
      }),
    );
  });
};

export const uninstallPlugin = async (
  prisma: PrismaClient,
  pluginId: string,
  scopeType: ScopeType,
  scopeId: string,
) => {
  const dbPlugin = await prisma.plugin.findUnique({
    where: { id: pluginId },
  });

  if (!dbPlugin) throw new Error(`Plugin ${pluginId} not found`);

  const installation = await prisma.pluginInstallation.findUnique({
    where: { scopeId_scopeType_pluginId: { pluginId, scopeType, scopeId } },
  });

  if (!installation) throw new Error(`Plugin ${pluginId} not installed`);

  await prisma.pluginInstallation.delete({
    where: { scopeId_scopeType_pluginId: { pluginId, scopeType, scopeId } },
  });
};

const importPluginServices = async <
  T extends {
    getId(): string;
  },
>(
  prisma: OverallPrismaClient,
  pluginId: string,
  pluginInstallationId: number,
  getServices: (prisma: OverallPrismaClient, pluginId: string) => Promise<T[]>,
  key: Services,
) => {
  const ids = (await getServices(prisma, pluginId)).map((service) => {
    return service.getId();
  });
  await prisma[key].createMany({
    data: ids.map((id) => ({ serviceId: id, pluginInstallationId })),
  });
};
