import type { AgentContextProvider, LLMProvider } from "@cat/plugin-core";

import { buildSystemPrompt, runCompletion } from "@cat/app-agent";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import {
  agentDefinition,
  eq,
  translatableElement,
  translatableString,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
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
    const ghostAgentRow = assertSingleNonNullish(
      await drizzle
        .select({
          id: agentDefinition.id,
          definition: agentDefinition.definition,
        })
        .from(agentDefinition)
        .where(eq(agentDefinition.type, "GHOST_TEXT"))
        .limit(1),
      "No ghost text agent definition found. Please create an agent definition of type GHOST_TEXT in the database.",
    );

    // ── 2. Resolve the LLM provider(s) ──────────────────────────────────────
    const providerId = ghostAgentRow.definition.llm.providerId;

    // ── 3. Fetch source text from DB ─────────────────────────────────────────
    const elementRow = assertSingleNonNullish(
      await drizzle
        .select({ sourceText: translatableString.value })
        .from(translatableElement)
        .innerJoin(
          translatableString,
          eq(translatableElement.translatableStringId, translatableString.id),
        )
        .where(eq(translatableElement.id, input.elementId))
        .limit(1),
      `Element with ID ${input.elementId} not found`,
    );

    const sourceText = elementRow.sourceText;

    // ── Build user message ────────────────────────────────────────────────
    const contextLines: string[] = [
      `Source text: ${sourceText}`,
      `Target language: ${input.languageId}`,
      `Current input (up to cursor): ${input.currentInput.slice(0, input.cursorPosition)}`,
    ];

    if (input.memoryHints) {
      contextLines.push(`Translation memory hints:\n${input.memoryHints}`);
    }
    if (input.termHints) {
      contextLines.push(`Terminology hints:\n${input.termHints}`);
    }
    if (input.neighborElements) {
      contextLines.push(`Neighboring segments:\n${input.neighborElements}`);
    }

    contextLines.push(
      "\nOutput ONLY the continuation text with no explanation:",
    );

    const userMessage = contextLines.join("\n");

    // Build system prompt using the context resolution engine so that
    // AGENT_CONTEXT_PROVIDER plugins can inject variables into the ghost-text
    // agent's system prompt (e.g. glossary IDs, project context).
    const contextProviders = pluginManager
      .getServices("AGENT_CONTEXT_PROVIDER")
      // oxlint-disable-next-line no-unsafe-type-assertion -- service type guaranteed by getServices("AGENT_CONTEXT_PROVIDER")
      .map((s) => s.service as AgentContextProvider);

    const systemPrompt = await buildSystemPrompt({
      drizzle,
      definition: ghostAgentRow.definition,
      sessionMetadata: {
        elementId: input.elementId,
        languageId: input.languageId,
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
    for await (const chunk of runCompletion({
      llmProvider,
      systemPrompt,
      userMessage,
      temperature,
      maxTokens,
    })) {
      yield { text: chunk.text };
    }
    return;
  });
