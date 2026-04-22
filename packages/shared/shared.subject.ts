import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infra/shared",
  title: { zh: "共享工具库", en: "Shared Utilities" },
  section: "infra",
  primaryOwner: "@cat/shared",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/shared" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
