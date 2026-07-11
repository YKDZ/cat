import type { CreateRule, ESTree } from "@oxlint/plugins";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((item) => typeof item === "string");

const isForbidden = (
  source: string,
  forbidden: string[],
  allowed: string[],
): boolean => {
  if (allowed.some((a) => source === a || source.startsWith(`${a}/`))) {
    return false;
  }
  return forbidden.some(
    (f) =>
      source === f ||
      source.startsWith(`${f}/`) ||
      (f.endsWith(":") && source.startsWith(f)),
  );
};

const isTypeOnlyImport = (node: ESTree.ImportDeclaration): boolean =>
  node.importKind === "type" ||
  (node.specifiers.length > 0 &&
    node.specifiers.every(
      (specifier) =>
        specifier.type === "ImportSpecifier" && specifier.importKind === "type",
    ));

const isTypeOnlyExport = (node: ESTree.ExportNamedDeclaration): boolean =>
  node.exportKind === "type" ||
  (node.specifiers.length > 0 &&
    node.specifiers.every((specifier) => specifier.exportKind === "type"));

export const noServerImport: CreateRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow importing server-only packages in client-side code",
    },
    schema: [
      {
        type: "object",
        properties: {
          forbidden: { type: "array", items: { type: "string" } },
          allowed: { type: "array", items: { type: "string" } },
          allowTypeImports: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const rawOpts = context.options[0];
    const opts = isRecord(rawOpts) ? rawOpts : {};

    const forbidden: string[] = isStringArray(opts["forbidden"])
      ? opts["forbidden"]
      : [];
    const allowed: string[] = isStringArray(opts["allowed"])
      ? opts["allowed"]
      : [];
    const rawAllowTypeImports = opts["allowTypeImports"];
    const allowTypeImports =
      typeof rawAllowTypeImports === "boolean" ? rawAllowTypeImports : true;

    if (forbidden.length === 0) return {};

    const checkSource = (
      source: ESTree.StringLiteral,
      kind: string | undefined,
      verb: string,
    ) => {
      if (allowTypeImports && kind === "type") return;
      const value = source.value;
      if (isForbidden(value, forbidden, allowed)) {
        context.report({
          node: source,
          message: `${verb} of server-only package '${value}' is forbidden in client-side code.`,
        });
      }
    };

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (allowTypeImports && isTypeOnlyImport(node)) return;
        checkSource(node.source, node.importKind, "Import");
      },

      ImportExpression(node: ESTree.ImportExpression) {
        if (
          node.source.type === "Literal" &&
          typeof node.source.value === "string"
        ) {
          const value = node.source.value;
          if (isForbidden(value, forbidden, allowed)) {
            context.report({
              node: node.source,
              message: `Dynamic import of server-only package '${value}' is forbidden in client-side code.`,
            });
          }
        }
      },

      CallExpression(node: ESTree.CallExpression) {
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "require" ||
          node.arguments.length !== 1
        ) {
          return;
        }

        const source = node.arguments[0];
        if (
          source?.type === "Literal" &&
          typeof source.value === "string" &&
          isForbidden(source.value, forbidden, allowed)
        ) {
          context.report({
            node: source,
            message: `CommonJS require of server-only package '${source.value}' is forbidden in client-side code.`,
          });
        }
      },

      TSImportEqualsDeclaration(node: ESTree.TSImportEqualsDeclaration) {
        if (node.moduleReference.type !== "TSExternalModuleReference") return;
        checkSource(
          node.moduleReference.expression,
          node.importKind,
          "Import-equals require",
        );
      },

      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (!node.source) return;
        if (allowTypeImports && isTypeOnlyExport(node)) return;
        checkSource(node.source, node.exportKind, "Re-export");
      },

      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        checkSource(node.source, node.exportKind, "Re-export");
      },
    };
  },
};
