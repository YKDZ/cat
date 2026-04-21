import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infrastructure/auth",
  title: { zh: "认证与授权", en: "Authentication & Authorization" },
  section: "infrastructure",
  primaryOwner: "@cat/auth",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/auth" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
