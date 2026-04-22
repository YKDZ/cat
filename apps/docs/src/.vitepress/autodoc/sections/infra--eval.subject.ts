import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infra/eval",
  title: { zh: "评测框架", en: "Eval Framework" },
  section: "infra",
  primaryOwner: "@cat/eval",
  secondaryAssociations: ["@cat/agent", "@cat/workflow"],
  members: [{ type: "package", ref: "@cat/eval" }],
  semanticFragments: [],
  dependsOn: ["ai/agent", "infra/workflow", "domain/core"],
  public: true,
});
