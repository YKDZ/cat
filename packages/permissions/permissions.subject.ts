import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infra/permissions",
  title: { zh: "权限系统", en: "Permissions System" },
  section: "infra",
  primaryOwner: "@cat/permissions",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/permissions" }],
  semanticFragments: [],
  dependsOn: ["domain/core"],
  public: true,
});
