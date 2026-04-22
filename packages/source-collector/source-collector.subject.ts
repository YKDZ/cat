import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infra/source-collector",
  title: { zh: "源码元素采集器", en: "Source Collector" },
  section: "infra",
  primaryOwner: "@cat/source-collector",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/source-collector" }],
  semanticFragments: [],
  dependsOn: ["domain/core"],
  public: true,
});
