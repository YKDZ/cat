import type { CreateRule, ESTree } from "@oxlint/plugins";

/** Flags any import/export specifier that targets a @cat/shared subpath. */
export const noSharedSubpathImport: CreateRule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        'Disallow @cat/shared subpath imports — use the root "@cat/shared" instead',
    },
    schema: [],
  },

  create(context) {
    const isSubpath = (source: string): boolean =>
      source.startsWith("@cat/shared/");

    const report = (node: ESTree.Node, source: string) => {
      context.report({
        node,
        message: `Import from subpath '${source}' is not allowed. Use "@cat/shared" instead.`,
      });
    };

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        if (isSubpath(node.source.value))
          report(node.source, node.source.value);
      },

      ImportExpression(node: ESTree.ImportExpression) {
        if (
          node.source.type === "Literal" &&
          typeof node.source.value === "string" &&
          isSubpath(node.source.value)
        ) {
          report(node.source, node.source.value);
        }
      },

      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source && isSubpath(node.source.value)) {
          report(node.source, node.source.value);
        }
      },

      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (isSubpath(node.source.value))
          report(node.source, node.source.value);
      },
    };
  },
};
