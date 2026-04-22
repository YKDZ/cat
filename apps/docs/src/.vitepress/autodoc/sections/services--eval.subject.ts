import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "services/eval",
  title: { zh: "评测框架", en: "Eval Framework" },
  section: "services",
  primaryOwner: "@cat/eval",
  secondaryAssociations: ["@cat/agent", "@cat/workflow"],
  members: [{ type: "package", ref: "@cat/eval" }],
  semanticFragments: [],
  dependsOn: ["ai/agent", "services/workflow", "domain/core"],
  public: true,
});
