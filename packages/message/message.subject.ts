import { defineSubject } from "@tools/autodoc";

// oxlint-disable typescript/no-unsafe-call -- defineSubject is a typed autodoc manifest helper

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
