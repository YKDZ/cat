import { defineSubject } from "@tools/autodoc";

// oxlint-disable typescript/no-unsafe-call -- defineSubject is a typed autodoc manifest helper

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
