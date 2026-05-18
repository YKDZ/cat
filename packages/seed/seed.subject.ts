import { defineSubject } from "@tools/autodoc";

// oxlint-disable typescript/no-unsafe-call -- defineSubject is a typed autodoc manifest helper

export default defineSubject({
  id: "infra/seed",
  title: { zh: "开发数据播种", en: "Dev Data Seeding" },
  section: "infra",
  primaryOwner: "@cat/seed",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/seed" }],
  semanticFragments: [],
  dependsOn: ["domain/core"],
  public: true,
});
