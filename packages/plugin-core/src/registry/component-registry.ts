import { CustomElementNameSchema } from "@cat/shared";
import * as z from "zod";

export const ComponentRecordSchema = z.object({
  name: CustomElementNameSchema,
  slot: z.string(),
  url: z.string(),
  pluginId: z.string(),
});
export const ComponentDataSchema = ComponentRecordSchema.omit({
  pluginId: true,
});
export type ComponentRecord = z.infer<typeof ComponentRecordSchema>;
export type ComponentData = z.infer<typeof ComponentDataSchema>;

export class ComponentRegistry {
  // 一级索引：pluginId → 该插件的所有组件
  private componentsByPlugin = new Map<string, ComponentRecord[]>();
  // 二级索引：slot → 属于该 slot 的组件列表（快速查询用）
  private componentsBySlot = new Map<string, ComponentRecord[]>();

  public getSlot(slot: string): ComponentRecord[] {
    return this.componentsBySlot.get(slot) ?? [];
  }

  public get(pluginId: string): ComponentRecord[] {
    return this.componentsByPlugin.get(pluginId) ?? [];
  }

  /**
   * 合并一个插件的组件到注册表
   * 统一入口，做名称标准化并维护双索引
   */
  public combine(pluginId: string, components: ComponentRecord[]): void {
    if (!z.array(ComponentDataSchema).safeParse(components)) {
      throw new Error("Invalid component data from plugin");
    }

    this.componentsByPlugin.set(pluginId, components);
    this.rebuildSlotIndex();
  }

  /**
   * 移除某个插件的所有组件并重建索引
   */
  public removeByPlugin(pluginId: string): void {
    this.componentsByPlugin.delete(pluginId);
    this.rebuildSlotIndex();
  }

  private rebuildSlotIndex(): void {
    this.componentsBySlot.clear();
    for (const components of this.componentsByPlugin.values()) {
      for (const c of components) {
        const list = this.componentsBySlot.get(c.slot) ?? [];
        list.push(c);
        this.componentsBySlot.set(c.slot, list);
      }
    }
  }
}
