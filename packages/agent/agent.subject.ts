import { defineSubject } from "@tools/autodoc";

// oxlint-disable typescript/no-unsafe-call -- defineSubject is a typed autodoc manifest helper

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
