import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infra/screenshot-collector",
  title: { zh: "截图采集器", en: "Screenshot Collector" },
  section: "infra",
  primaryOwner: "@cat/screenshot-collector",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/screenshot-collector" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
