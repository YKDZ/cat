import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infra/message",
  title: { zh: "消息队列与通知", en: "Messaging & Notifications" },
  section: "infra",
  primaryOwner: "@cat/message",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/message" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
