import { defineSubject } from "@tools/autodoc";

// oxlint-disable typescript/no-unsafe-call -- defineSubject is a typed autodoc manifest helper

export default defineSubject({
  id: "domain/core",
  title: { zh: "领域核心模型", en: "Domain Core Model" },
  section: "domain",
  primaryOwner: "@cat/domain",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/domain" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
