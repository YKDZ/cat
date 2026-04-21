import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infrastructure/plugin-core",
  title: { zh: "插件核心接口", en: "Plugin Core Interface" },
  section: "infrastructure",
  primaryOwner: "@cat/plugin-core",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/plugin-core" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
