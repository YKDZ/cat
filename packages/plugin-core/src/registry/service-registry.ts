import type { IPluginService } from "@/services/service";
import {
  and,
  eq,
  pluginInstallation,
  pluginService,
  type DrizzleClient,
} from "@cat/db";
import {
  PluginServiceTypeSchema,
  type PluginServiceType,
  type ScopeType,
} from "@cat/shared/schema/drizzle/enum";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

export const ReigsteredServiceSchema = z.object({
  pluginId: z.string(),
  type: PluginServiceTypeSchema,
  id: z.string(),
  dbId: z.int(),
  service: z.custom<IPluginService>(),
});
export type RegisteredService = z.infer<typeof ReigsteredServiceSchema>;

export class ServiceRegistry {
  public constructor(public services: RegisteredService[] = []) {}

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

  /**
   * 将一个插件的 ServiceMap 合并到 registry 中。
   * 若出现插件相同 (pluginId) 且 type/id 冲突，会抛出错误。
   */
  public async combine(
    drizzle: DrizzleClient,
    scopeType: ScopeType,
    scopeId: string,
    pluginId: string,
    services: IPluginService[],
  ): Promise<void> {
    for (const service of services) {
      const id = service.getId();
      const type = service.getType();

      const { id: dbId } = assertSingleNonNullish(
        // oxlint-disable-next-line no-await-in-loop
        await drizzle
          .select({
            id: pluginService.id,
          })
          .from(pluginService)
          .innerJoin(
            pluginInstallation,
            and(
              eq(pluginInstallation.scopeType, scopeType),
              eq(pluginInstallation.scopeId, scopeId),
              eq(pluginInstallation.pluginId, pluginId),
            ),
          )
          .where(
            and(
              eq(pluginService.pluginInstallationId, pluginInstallation.id),
              eq(pluginService.serviceType, type),
              eq(pluginService.serviceId, id),
            ),
          ),
      );

      const registeredService: RegisteredService = {
        dbId,
        pluginId,
        type,
        id,
        service,
      };

      this.services.push(registeredService);
    }
  }

  public clear(): void {
    this.services = [];
  }
}
