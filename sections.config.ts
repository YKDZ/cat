/**
 * @file sections.config.ts
 * @zh Discovery Section 共享契约。autodoc 编译链与 VitePress 站点配置共同消费此文件。
 * @en Discovery Section shared contract. Consumed by the autodoc compilation chain and VitePress site config.
 */

export interface SectionConfig {
  /** @zh 稳定的 section 唯一标识符 @en Stable unique section identifier */
  id: string;
  /** @zh 双语标题 @en Bilingual title */
  title: { zh: string; en: string };
  /** @zh 渲染排序（升序） @en Render order (ascending) */
  order: number;
  /** @zh 是否在站点导航中可见 @en Whether this section is visible in site navigation */
  public: boolean;
}

export const defineSections = (sections: SectionConfig[]): SectionConfig[] =>
  sections;

export default defineSections([
  {
    id: "domain",
    title: { zh: "领域模型", en: "Domain Model" },
    order: 1,
    public: true,
  },
  {
    id: "infrastructure",
    title: { zh: "基础设施", en: "Infrastructure" },
    order: 2,
    public: true,
  },
  {
    id: "services",
    title: { zh: "服务", en: "Services" },
    order: 3,
    public: true,
  },
  {
    id: "ai",
    title: { zh: "AI 系统", en: "AI System" },
    order: 4,
    public: true,
  },
]);
