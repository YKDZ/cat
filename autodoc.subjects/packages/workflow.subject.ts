import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "services/workflow",
  title: { zh: "工作流引擎", en: "Workflow Engine" },
  section: "services",
  primaryOwner: "@cat/workflow",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/workflow" }],
  semanticFragments: [],
  dependsOn: ["domain/core"],
  public: true,
});
