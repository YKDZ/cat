import { defineSubject } from "@tools/autodoc";

// oxlint-disable typescript/no-unsafe-call -- defineSubject is a typed autodoc manifest helper

export default defineSubject({
  id: "infra/db",
  title: { zh: "数据库访问层", en: "Database Access Layer" },
  section: "infra",
  primaryOwner: "@cat/db",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/db" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
