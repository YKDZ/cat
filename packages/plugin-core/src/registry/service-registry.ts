import type { DbHandle } from "@cat/domain";

import { executeQuery, listInstalledServicesByType } from "@cat/domain";
import {
  PluginServiceTypeSchema,
  type PluginServiceType,
  type ScopeType,
} from "@cat/shared/schema/drizzle/enum";
import * as z from "zod/v4";

import type { IPluginService } from "@/services/service";

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

  public constructor(initialServices: RegisteredService[] = []) {
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
    // 支持 reload：先移除旧的
    this.removeByPlugin(pluginId);

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
        console.warn({
          msg: `Service ${type}:${id} has no DB record, skipping registration`,
        });
        continue;
      }

      this.services.push({
        dbId,
        pluginId,
        type,
        id,
        service,
      });
    }
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
