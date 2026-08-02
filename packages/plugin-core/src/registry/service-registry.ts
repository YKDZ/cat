import type { DbHandle } from "@cat/domain";
import { executeQuery, listInstalledServicesByType } from "@cat/domain";
import {
  PluginServiceTypeSchema,
  type PluginServiceType,
  type ScopeType,
} from "@cat/shared";
import { logger } from "@cat/shared";
import * as z from "zod";

import type { PluginLogger } from "#/entities/plugin.ts";
import type { IPluginService } from "#/services/service.ts";

export const ReigsteredServiceSchema = z.object({
  pluginId: z.string(),
  type: PluginServiceTypeSchema,
  id: z.string(),
  dbId: z.int(),
  service: z.custom<IPluginService>(),
});
export type RegisteredService = z.infer<typeof ReigsteredServiceSchema>;

export class ServiceRegistry {
  private services: RegisteredService[] = [];
  private readonly diagnosticLogger: PluginLogger;

  public constructor(
    initialServices: RegisteredService[] = [],
    diagnosticLogger: PluginLogger = logger,
  ) {
    this.diagnosticLogger = diagnosticLogger;
    this.services = initialServices;
  }

  public get(
    pluginId: string,
    type: PluginServiceType,
    id: string,
  ): RegisteredService | null {
    return (
      this.services.find(
        (service) =>
          service.pluginId === pluginId &&
          service.type === type &&
          service.id === id,
      ) ?? null
    );
  }

  public getAll(): RegisteredService[] {
    return this.services;
  }

  /**
   * 将一个插件的服务列表合并到 registry 中
   * 先移除该插件旧的注册（支持 reload），再重新注册
   */
  public async combine(
    drizzle: DbHandle,
    scopeType: ScopeType,
    scopeId: string,
    pluginId: string,
    services: IPluginService[],
  ): Promise<void> {
    const registered = await this.prepare(
      drizzle,
      scopeType,
      scopeId,
      pluginId,
      services,
    );
    this.replaceByPlugin(pluginId, registered);
  }

  /** Resolve runtime services to persisted identities without publishing them. */
  public async prepare(
    drizzle: DbHandle,
    scopeType: ScopeType,
    scopeId: string,
    pluginId: string,
    services: IPluginService[],
  ): Promise<RegisteredService[]> {
    const registered: RegisteredService[] = [];

    for (const service of services) {
      const id = service.getId();
      const type = service.getType();

      // DB 记录在 syncDynamicServices 中已确保存在
      // oxlint-disable-next-line no-await-in-loop
      const dbRecords = await executeQuery(
        { db: drizzle },
        listInstalledServicesByType,
        { serviceType: type, scopeType, scopeId },
      );

      const dbRecord = dbRecords.find(
        (r) => r.pluginId === pluginId && r.serviceId === id,
      );

      const dbId = dbRecord?.dbId;
      if (dbId === undefined) {
        this.diagnosticLogger
          .child({ component: "plugin" })
          .warn(
            `Service ${type}:${id} has no DB record, skipping registration`,
          );
        continue;
      }

      registered.push({
        dbId,
        pluginId,
        type,
        id,
        service,
      });
    }

    return registered;
  }

  /** Atomically replace one plugin's prepared service records. */
  public replaceByPlugin(
    pluginId: string,
    services: RegisteredService[],
  ): void {
    this.services = [
      ...this.services.filter((service) => service.pluginId !== pluginId),
      ...services,
    ];
  }

  /**
   * 移除某个插件的所有注册服务
   */
  public removeByPlugin(pluginId: string): void {
    this.services = this.services.filter((s) => s.pluginId !== pluginId);
  }

  public clear(): void {
    this.services = [];
  }
}
