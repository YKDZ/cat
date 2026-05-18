import { defineSubject } from "@tools/autodoc";

// oxlint-disable typescript/no-unsafe-call -- defineSubject is a typed autodoc manifest helper

export default defineSubject({
  id: "infra/operations",
  title: { zh: "操作与任务系统", en: "Operations & Tasks" },
  section: "infra",
  primaryOwner: "@cat/operations",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/operations" }],
  semanticFragments: [],
  dependsOn: ["domain/core"],
  public: true,
});
