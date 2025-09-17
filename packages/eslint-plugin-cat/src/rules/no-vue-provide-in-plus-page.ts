import { TSESTree, ESLintUtils } from "@typescript-eslint/utils";

const ruleId = "no-vue-provide-in-plus-page";

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://example.com/rule/${name}`,
);

export const noVueProvideInPlusPage = createRule({
  name: ruleId,

  meta: {
    type: "problem",
    docs: {
      description: "Disallow provide() in +Page.vue files",
    },
    schema: [],
    messages: {
      "no-vue-provide-in-plus-page":
        "Do not import or call 'provide' in +Page.vue files.",
    },
  },

  defaultOptions: [],

  create(context) {
    if (
      !context.filename.startsWith("+Page.") ||
      !context.filename.endsWith(".vue")
    ) {
      return {};
    }

    return {
      ImportSpecifier(node: TSESTree.ImportSpecifier) {
        if (
          node.imported.type === "Identifier" &&
          node.imported.name === "provide"
        ) {
          context.report({
            node,
            messageId: ruleId,
          });
        }

        if (
          node.imported.type === "Literal" &&
          node.imported.value === "provide"
        ) {
          context.report({
            node,
            messageId: ruleId,
          });
        }
      },

      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "provide"
        ) {
          context.report({
            node,
            messageId: ruleId,
          });
        }
      },
    };
  },
});
