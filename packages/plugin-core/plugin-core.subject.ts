import { defineSubject } from "@tools/autodoc";

// oxlint-disable typescript/no-unsafe-call -- defineSubject is a typed autodoc manifest helper

export default defineSubject({
  id: "infra/plugin-core",
  title: { zh: "插件服务核心", en: "Plugin Core Interface" },
  section: "infra",
  primaryOwner: "@cat/plugin-core",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/plugin-core" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
