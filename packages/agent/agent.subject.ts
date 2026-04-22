import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "ai/agent",
  title: { zh: "AI Agent 核心", en: "AI Agent Core" },
  section: "ai",
  primaryOwner: "@cat/agent",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/agent" }],
  semanticFragments: [],
  dependsOn: ["domain/core"],
  public: true,
});
