import type { AgentContextProvider, LLMProvider } from "@cat/plugin-core";

import { buildSystemPrompt, runFim } from "@cat/app-agent";
import { getServiceFromDBId } from "@cat/server-shared";
import {
  executeQuery,
  getElementWithChunkIds,
  listAgentDefinitions,
} from "@cat/domain";
import { assertFirstNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";

// ─── Ghost Text Suggest ───

/**
 * Stream ghost text continuation suggestions for the current editor input.
 *
 * Context data is accepted from the frontend (already cached) to avoid
 * redundant DB queries. Only source text and language are fetched from the DB,
 * as these are always required and not available on the client in serialised
 * form.
 *
 * Returns text delta chunks via an async generator (oRPC streaming).
 */
export const suggest = authed
  .input(
    z.object({
      /** DB ID of the element being translated */
      elementId: z.int(),
      /** BCP-47 language tag of the target language */
      languageId: z.string(),
      /** Text the translator has already typed */
      currentInput: z.string(),
      /** Cursor position within currentInput */
      cursorPosition: z.int(),
      /** Translation memory hints (pre-fetched by the frontend, optional) */
      memoryHints: z.string().optional(),
      /** Glossary term hints (pre-fetched by the frontend, optional) */
      termHints: z.string().optional(),
      /** Serialised neighbouring translated segments (optional) */
      neighborElements: z.string().optional(),
    }),
  )
  .handler(async function* ({ context, input }) {
    const {
      drizzleDB: { client: drizzle },
      pluginManager,
      user,
    } = context;

    // ── 1. Locate a ghost-text agent definition ──────────────────────────────
    // We look for an agent of type GHOST_TEXT; fall back to any available LLM
    // provider if no dedicated agent definition exists in the database.
    // TODO: 此处应该查找被项目或用户（反正就是触发 AGENT 的上下文内）被安装的那个 agent，而不是随便找一个
    const ghostAgentRow = assertFirstNonNullish(
      await executeQuery({ db: drizzle }, listAgentDefinitions, {
        type: "GHOST_TEXT",
      }),
      "No ghost text agent definition found. Please create an agent definition of type GHOST_TEXT in the database.",
    );

    // ── 2. Resolve the LLM provider(s) ──────────────────────────────────────
    const providerId = ghostAgentRow.definition.llm.providerId;

    // ── 3. Fetch source text from DB ─────────────────────────────────────────
    const elementRow = await executeQuery(
      { db: drizzle },
      getElementWithChunkIds,
      {
        elementId: input.elementId,
      },
    );

    if (elementRow === null) {
      throw new Error(`Element with ID ${input.elementId} not found`);
    }

    const sourceText = elementRow.value;

    // Build system prompt using the context resolution engine so that
    // AGENT_CONTEXT_PROVIDER plugins can inject variables into the ghost-text
    // agent's system prompt (e.g. glossary IDs, project context).
    const contextProviders = pluginManager
      .getServices("AGENT_CONTEXT_PROVIDER")
      // oxlint-disable-next-line no-unsafe-type-assertion -- service type guaranteed by getServices("AGENT_CONTEXT_PROVIDER")
      .map((s) => s.service as AgentContextProvider);

    // Derive prefix/suffix from cursor position
    const prefix = input.currentInput.slice(0, input.cursorPosition);
    const suffix = input.currentInput.slice(input.cursorPosition);

    const systemPrompt = await buildSystemPrompt({
      drizzle,
      definition: ghostAgentRow.definition,
      seedsVars: {
        elementId: input.elementId,
        sourceText,
        targetLanguageId: input.languageId,
        memoryHints: input.memoryHints ?? "",
        termHints: input.termHints ?? "",
        neighborElements: input.neighborElements ?? "",
        currentInput: input.currentInput,
        prefix,
        suffix,
      },
      userId: user.id,
      tools: [],
      contextProviders,
    });

    // ── 6. Stream completion ─────────────────────────────────────────────────
    const temperature = ghostAgentRow.definition.llm.temperature ?? 0.3;
    const maxTokens = ghostAgentRow.definition.llm.maxTokens ?? 256;

    // Explicit provider: resolve once and propagate errors directly.
    // A missing or failing explicitly-configured provider is a bug.
    const llmProvider = getServiceFromDBId<LLMProvider>(
      pluginManager,
      providerId,
    );

    // FIM requires the provider to support FIM
    if (!llmProvider.supportsFim()) {
      throw new Error(
        `LLM provider ${llmProvider.getId()} does not support FIM completions. Please configure a provider that supports FIM.`,
      );
    }

    for await (const chunk of runFim({
      llmProvider,
      systemPrompt,
      prefix,
      suffix,
      temperature,
      maxTokens,
      stream: true,
    })) {
      yield { text: chunk.text };
    }
    return;
  });
