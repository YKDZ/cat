import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infra/auth",
  title: { zh: "认证与授权", en: "Authentication & Authorization" },
  section: "infra",
  primaryOwner: "@cat/auth",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/auth" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
