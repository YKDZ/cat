import type { IPluginService } from "@/registry/plugin-registry";
import { PluginServiceTypeSchema } from "@cat/shared/schema/drizzle/enum";
import { logger } from "@cat/shared/utils";
import * as z from "zod/v4";

export const ServiceRegistryRecordSchema = z.object({
  pluginId: z.string(),
  type: PluginServiceTypeSchema,
  id: z.string(),
});

export type ServiceRegistryRecord = z.infer<typeof ServiceRegistryRecordSchema>;

export class ServiceRegistry {
  public constructor(
    private readonly services: Map<string, IPluginService> = new Map(),
  ) {}

  private static hasher({ pluginId, type, id }: ServiceRegistryRecord) {
    return `${pluginId}:${type}:${id}`;
  }

  public set(record: ServiceRegistryRecord, service: IPluginService): void {
    this.services.set(ServiceRegistry.hasher(record), service);
  }

  public get(record: ServiceRegistryRecord): IPluginService | null {
    return this.services.get(ServiceRegistry.hasher(record)) ?? null;
  }

  public has(record: ServiceRegistryRecord): boolean {
    return this.services.has(ServiceRegistry.hasher(record));
  }

  /**
   * 将一个插件的 ServiceMap 合并到 registry 中。
   * 若出现插件相同 (pluginId) 且 type/id 冲突，会抛出错误。
   */
  public combine(pluginId: string, services: IPluginService[]): void {
    for (const service of services) {
      const id = service.getId();
      const type = service.getType();

      const registryRecord: ServiceRegistryRecord = {
        pluginId,
        type,
        id,
      };

      if (this.has(registryRecord)) {
        throw new Error(
          `Service conflict when combining plugin ${pluginId}: service ${type}:${id} already registered`,
        );
      }

      this.set(registryRecord, service);
    }
  }

  public entries(): Array<{
    record: ServiceRegistryRecord;
    service: IPluginService;
  }> {
    const out: Array<{
      record: ServiceRegistryRecord;
      service: IPluginService;
    }> = [];
    for (const [key, service] of this.services.entries()) {
      const [pluginId, type, id] = key.split(":");
      const record = ServiceRegistryRecordSchema.safeParse({
        pluginId,
        type,
        id,
      });
      if (!record.success) {
        logger.warn("PLUGIN", {
          msg: `Invalid service registry record`,
          data: { pluginId, type, id },
        });
        continue;
      }
      out.push({
        record: record.data,
        service,
      });
    }
    return out;
  }

  public keys(): ServiceRegistryRecord[] {
    return this.services
      .keys()
      .map((key) => {
        const [pluginId, type, id] = key.split(":");
        const record = ServiceRegistryRecordSchema.safeParse({
          pluginId,
          type,
          id,
        });
        if (!record.success) {
          logger.warn("PLUGIN", {
            msg: `Invalid service registry record`,
            data: { pluginId, type, id },
          });
          return;
        }
        return record.data;
      })
      .filter((record): record is ServiceRegistryRecord => !!record)
      .toArray();
  }

  public clear(): void {
    this.services.clear();
  }
}
