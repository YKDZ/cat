import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "ai/agent-tools",
  title: { zh: "AI Agent 工具集", en: "AI Agent Tools" },
  section: "ai",
  primaryOwner: "@cat/agent-tools",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/agent-tools" }],
  semanticFragments: [],
  dependsOn: ["ai/agent"],
  public: true,
});
