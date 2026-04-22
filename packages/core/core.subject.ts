import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "services/core",
  title: { zh: "核心业务服务", en: "Core Business Services" },
  section: "services",
  primaryOwner: "@cat/core",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/core" }],
  semanticFragments: [],
  dependsOn: ["domain/core"],
  public: true,
});
