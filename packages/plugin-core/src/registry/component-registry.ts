import { CustomElementNameSchema } from "@cat/shared/schema/ce";
import { createHash } from "node:crypto";
import * as z from "zod";

export const ComponentRecordSchema = z.object({
  name: CustomElementNameSchema,
  slot: z.string(),
  url: z.string(),
  skeleton: z.string().optional(),
  pluginId: z.string(),
});
export const ComponentDataSchema = ComponentRecordSchema.omit({
  pluginId: true,
});
export type ComponentRecord = z.infer<typeof ComponentRecordSchema>;
export type ComponentData = z.infer<typeof ComponentDataSchema>;

export class ComponentRegistry {
  public constructor(
    private components: Map<string, ComponentRecord[]> = new Map(),
  ) {}

  public getSlot(slot: string): ComponentRecord[] {
    return Array.from(this.components.values())
      .flat()
      .filter((component) => component.slot === slot);
  }

  public get(pluginId: string): ComponentRecord[] {
    return this.components.get(pluginId) ?? [];
  }

  public register(component: ComponentRecord): void {
    if (!this.components.has(component.name)) {
      this.components.set(component.name, []);
    }
    this.components.get(component.name)!.push(component);
  }

  /**
   * 这个方法应该作为注册组件到注册表为唯一入口\
   * 以便统一做名称的标准化
   *
   * @param pluginId
   * @param components
   */
  public combine(pluginId: string, components: ComponentRecord[]): void {
    if (!z.array(ComponentDataSchema).safeParse(components)) {
      throw new Error("Invalid component data from plugin");
    }

    const modified = components.map((compo) => {
      compo.name =
        compo.name +
        "-" +
        createHash("sha256")
          .update(compo.name)
          .update(compo.pluginId)
          .update(compo.slot)
          .update(compo.url)
          .digest("hex")
          .slice(0, 8);
      return compo;
    });

    if (!this.components.has(pluginId)) {
      this.components.set(pluginId, []);
    }
    this.components.get(pluginId)!.push(...modified);
  }
}
