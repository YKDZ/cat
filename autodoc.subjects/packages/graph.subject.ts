import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "services/graph",
  title: { zh: "图计算引擎", en: "Graph Computing Engine" },
  section: "services",
  primaryOwner: "@cat/graph",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/graph" }],
  semanticFragments: [],
  dependsOn: ["domain/core"],
  public: true,
});
