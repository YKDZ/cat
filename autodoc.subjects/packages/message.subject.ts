import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infrastructure/message",
  title: { zh: "消息队列与通知", en: "Messaging & Notifications" },
  section: "infrastructure",
  primaryOwner: "@cat/message",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/message" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
