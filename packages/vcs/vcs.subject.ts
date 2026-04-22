import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infra/vcs",
  title: { zh: "版本控制集成", en: "Version Control Integration" },
  section: "infra",
  primaryOwner: "@cat/vcs",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/vcs" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
