import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infra/workflow",
  title: { zh: "工作流引擎", en: "Workflow Engine" },
  section: "infra",
  primaryOwner: "@cat/workflow",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/workflow" }],
  semanticFragments: [],
  dependsOn: ["domain/core"],
  public: true,
});
