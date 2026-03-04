import {
  QaTranslationInputSchema,
  qaTranslationOp,
} from "@cat/app-server-shared/operations";

import { defineTool } from "@/tools/types";

export const runQACheckTool = defineTool({
  name: "run_qa_check",
  description:
    "Run quality assurance checks on a translation against its source text. " +
    "Returns a list of QA issues found.",
  parameters: QaTranslationInputSchema,
  execute: async (args, ctx) => {
    return qaTranslationOp(args, {
      traceId: ctx.traceId,
      signal: ctx.signal,
    });
  },
});
