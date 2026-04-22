import { defineSubject } from "@tools/autodoc";

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
