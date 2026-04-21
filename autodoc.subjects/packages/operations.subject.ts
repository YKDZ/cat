import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "services/operations",
  title: { zh: "操作与任务系统", en: "Operations & Tasks" },
  section: "services",
  primaryOwner: "@cat/operations",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/operations" }],
  semanticFragments: [],
  dependsOn: ["domain/core"],
  public: true,
});
