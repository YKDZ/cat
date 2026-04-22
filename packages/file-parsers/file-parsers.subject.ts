import { defineSubject } from "@tools/autodoc";

export default defineSubject({
  id: "infra/file-parsers",
  title: { zh: "文件解析器", en: "File Parsers" },
  section: "infra",
  primaryOwner: "@cat/file-parsers",
  secondaryAssociations: [],
  members: [{ type: "package", ref: "@cat/file-parsers" }],
  semanticFragments: [],
  dependsOn: [],
  public: true,
});
