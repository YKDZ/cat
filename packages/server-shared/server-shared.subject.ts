import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infra/server-shared",
  title: { zh: "服务器共享模块", en: "Server Shared Module" },
  section: "infra",
  primaryOwner: "@cat/server-shared",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/server-shared" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
