import { OverallPrismaClient, PrismaClient, ScopeType } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import type { PluginData } from "@cat/shared";
import {
  getDefaultFromSchema,
  JSONSchemaSchema,
  PluginDataSchema,
  PluginManifestSchema,
} from "@cat/shared";
import { readFile } from "fs/promises";
import { join } from "path";

export const loadPluginData = async (dir: string): Promise<PluginData> => {
  const manifestPath = join(dir, "manifest.json");
  const packageDotJsonPath = join(dir, "package.json");
  const readmePath = join(dir, "README.md");

  const rawManifest = await readFile(manifestPath, "utf-8");
  const rawREADME = await readFile(readmePath, "utf-8");

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

    for (const pluginConfig of pluginConfigs) {
      await tx.pluginConfigInstance.create({
        data: {
          configId: pluginConfig.id,
          pluginInstallationId: installation.id,
          value:
            getDefaultFromSchema(JSONSchemaSchema.parse(pluginConfig.schema)) ??
            {},
        },
      });
    }

    for (const { getter, key } of serviceConfigs) {
      await importPluginServices(tx, pluginId, installation.id, getter, key);
    }
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
