import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infrastructure/vcs",
  title: { zh: "版本控制集成", en: "Version Control Integration" },
  section: "infrastructure",
  primaryOwner: "@cat/vcs",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/vcs" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
