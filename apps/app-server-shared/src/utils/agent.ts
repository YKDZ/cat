// ─── Builtin Agent Templates ───
//
// These templates live **only in memory**. They are never auto-seeded into the
// database. Instead, a user explicitly "enables" a template via the project
// agents page, at which point a real DB row is created with a valid
// `llm.providerId` pointing to an installed LLM_PROVIDER plugin service.

/**
 * Shape of a builtin agent template.
 * `definition` contains every field of an AgentDefinition **except**
 * `llm.providerId`, which is supplied by the user when enabling.
 */
export interface BuiltinAgentTemplate {
  /** Stable machine-readable identifier (used as matching key) */
  templateId: string;
  /** Human-readable name */
  name: string;
  description: string;
  /** Lucide icon name */
  icon: string;
  /**
   * Partial definition — everything except `llm.providerId`.
   * When instantiating, the caller merges in the chosen provider ID.
   */
  definition: Omit<BuiltinAgentDefinitionBody, "llm"> & {
    llm: Omit<BuiltinAgentDefinitionBody["llm"], "providerId"> & {
      providerId?: undefined;
    };
  };
}

/** Subset of AgentDefinition fields stored in a template */
interface BuiltinAgentDefinitionBody {
  id: string;
  name: string;
  description: string;
  version: string;
  icon: string;
  type?: "GENERAL" | "GHOST_TEXT";
  llm: { providerId: number; temperature?: number; maxTokens?: number };
  systemPrompt: string;
  systemPromptVariables?: Record<
    string,
    { type: string; source: string; name?: string; description?: string }
  >;
  tools: string[];
  constraints?: {
    maxSteps?: number;
    maxConcurrentToolCalls?: number;
    timeoutMs?: number;
  };
}

export const builtinAgentTemplates: readonly BuiltinAgentTemplate[] = [
  {
    templateId: "builtin-qa-reviewer",
    name: "QA Reviewer",
    description:
      "Reviews translations for quality issues including terminology consistency, formatting, and common errors.",
    icon: "ShieldCheck",
    definition: {
      id: "builtin-qa-reviewer",
      name: "QA Reviewer",
      description:
        "Reviews translations for quality issues including terminology consistency, formatting, and common errors.",
      version: "1.0.0",
      icon: "ShieldCheck",
      type: "GENERAL",
      llm: {
        temperature: 0.2,
      },
      systemPrompt: [
        "You are a professional translation QA reviewer for a Computer-Assisted Translation (CAT) tool.",
        "Your job is to review translations and identify quality issues.",
        "",
        "{{contextVariables}}",
        "",
        "Tool usage hints:",
        "- `lookup_terms`: Best for a specific term or short keyword. Fast SQL lookup, no LLM required.",
        "- `recognize_terms`: Best for a full sentence/paragraph where you need to discover which glossary terms appear. Uses LLM extraction + vector similarity; slower but handles implicit occurrences.",
        "",
        "When reviewing a translation you MUST:",
        "1. First call `get_element_info` with the element ID to get the source text and existing translations.",
        "2. Run QA checks using the `run_qa_check` tool to detect mechanical issues.",
        "3. Use `recognize_terms` on the source text to verify terminology consistency against the project glossary.",
        "4. Use `spot_terms` to find potential term candidates not yet in the glossary.",
        "5. Report findings in a structured format with severity (error/warning/info).",
        "",
        "Always respond to the user in the same language the user used in their message, regardless of the translation target language.",
      ].join("\n"),
      systemPromptVariables: {
        sourceLanguageId: {
          type: "string",
          source: "context",
          name: "Source language",
          description: "The BCP-47 ID of the source language",
        },
        translationLanguageId: {
          type: "string",
          source: "context",
          name: "Translation language",
          description: "The BCP-47 ID of the translation language",
        },
        projectId: {
          type: "string",
          source: "context",
          name: "Project",
          description: "The project UUID",
        },
        elementId: {
          type: "number",
          source: "input",
          name: "Current element ID",
          description: "use `get_element_info` to fetch its details",
        },
        glossaryIds: {
          type: "string",
          source: "context",
          name: "Glossary IDs",
          description:
            "JSON array of glossary UUIDs linked to the project; pass as the glossaryIds array when calling recognize_terms or spot_terms",
        },
        userId: {
          type: "string",
          source: "context",
          name: "Current user ID",
          description: "The UUID of the user currently you chat with",
        },
      },
      tools: [
        "run_qa_check",
        "lookup_terms",
        "recognize_terms",
        "spot_terms",
        "tokenize_text",
        "get_element_info",
        "get_user_translation_history",
        "get_editor_context",
        "get_translation_value",
        "navigate_to_element",
        "navigate_to_next_untranslated",
        "finish_task",
      ],
      constraints: {
        maxSteps: 8,
        maxConcurrentToolCalls: 3,
        timeoutMs: 60_000,
      },
    },
  },
  {
    templateId: "builtin-translation-assistant",
    name: "Translation Assistant",
    description:
      "Helps translators by suggesting translations, searching translation memories, and recognizing terminology.",
    icon: "Languages",
    definition: {
      id: "builtin-translation-assistant",
      name: "Translation Assistant",
      description:
        "Helps translators by suggesting translations, searching translation memories, and recognizing terminology.",
      version: "1.0.0",
      icon: "Languages",
      type: "GENERAL",
      llm: {
        temperature: 0.4,
      },
      systemPrompt: [
        "You are a professional translation assistant for a Computer-Assisted Translation (CAT) tool.",
        "Your job is to help translators produce high-quality translations efficiently.",
        "",
        "{{contextVariables}}",
        "",
        "You are a versatile assistant that adapts to the translator's needs. You can:",
        "- Answer questions about translation, terminology, or language usage",
        "- Provide translation suggestions when explicitly requested",
        "- Search and explain terminology from the glossary",
        "- Find similar translations from translation memory",
        "- Help with editor operations (navigation, editing, etc.)",
        "- Review and explain translation choices",
        "",
        "Important: Do NOT automatically provide translations unless the user explicitly asks for them. Wait for clear requests like:",
        "- 'Translate this' / 'How do I translate...'",
        "- 'What's the translation for...'",
        "- 'Help me translate...'",
        "- 'Suggest a translation'",
        "",
        "For other questions (terminology, grammar, style, etc.), provide helpful explanations without translating.",
        "",
        "Tool usage hints:",
        "- `lookup_terms`: Best for a specific term name or short keyword the user explicitly named. Fast SQL lookup.",
        "- `recognize_terms`: Best for a full sentence/paragraph where you need to discover which glossary terms appear. Uses LLM extraction + vector similarity.",
        "- Editor tools marked [editor] operate on the user's browser editor. Use `get_editor_context` to read the current state and mutation tools like `replace_translation` / `insert_text` to modify the translation.",
        "",
        "When the user explicitly asks for a translation:",
        "- First call `get_element_info` to inspect the current element's content (if not already known).",
        "- Check the glossary first for consistent terminology.",
        "- Search translation memory for similar segments.",
        "- Consider machine translation as a reference.",
        "- Provide the translation with a brief explanation of your choices.",
        "- Use `replace_translation` to set the translation in the editor, then `submit_translation` to persist it when the user confirms.",
        "",
        "Always respond to the user in the same language the user used in their message, regardless of the translation target language.",
      ].join("\n"),
      systemPromptVariables: {
        sourceLanguageId: {
          type: "string",
          source: "context",
          name: "Source language",
          description: "The BCP-47 ID of the source language",
        },
        translationLanguageId: {
          type: "string",
          source: "context",
          name: "Translation language",
          description: "The BCP-47 ID of the translation language",
        },
        projectId: {
          type: "string",
          source: "context",
          name: "Project",
          description: "The project UUID",
        },
        elementId: {
          type: "number",
          source: "input",
          name: "Current element ID",
          description: "use `get_element_info` to fetch its details",
        },
        glossaryIds: {
          type: "string",
          source: "context",
          name: "Glossary IDs Of Current Project",
          description:
            "JSON array of glossary UUIDs linked to the project; pass as the glossaryIds array when calling recognize_terms",
        },
        userId: {
          type: "string",
          source: "context",
          name: "Current user ID",
          description: "The UUID of the user currently you chat with",
        },
      },
      tools: [
        "get_element_info",
        "get_user_translation_history",
        "fetch_translation_suggestion",
        "search_translation_memory",
        "lookup_terms",
        "recognize_terms",
        "tokenize_text",
        "get_editor_context",
        "get_translation_value",
        "replace_translation",
        "insert_text",
        "clear_translation",
        "submit_translation",
        "navigate_to_element",
        "navigate_to_next_untranslated",
        "undo_translation",
        "redo_translation",
        "finish_task",
      ],
      constraints: {
        maxSteps: 15,
        maxConcurrentToolCalls: 3,
        timeoutMs: 120_000,
      },
    },
  },
  {
    templateId: "builtin-ghost-text",
    name: "Ghost Text Advisor",
    description:
      "Provides inline translation continuation suggestions as ghost text in the editor.",
    icon: "Sparkles",
    definition: {
      id: "builtin-ghost-text",
      name: "Ghost Text Advisor",
      description:
        "Provides inline translation continuation suggestions as ghost text in the editor.",
      version: "1.0.0",
      icon: "Sparkles",
      type: "GHOST_TEXT",
      llm: {
        temperature: 0.3,
        maxTokens: 256,
      },
      systemPrompt: [
        "You are a translation continuation assistant for a Computer-Assisted Translation (CAT) tool.",
        "Based on the context provided, predict the most likely text the translator will type next.",
        "",
        "Rules:",
        "- Output ONLY the continuation text starting from exactly where the cursor is.",
        "- Your output is appended byte-for-byte directly after the last typed character. Include any leading whitespace (e.g. a space) if the continuation begins a new word and the current input does not already end with a space.",
        "- Do NOT repeat any text that has already been typed.",
        "- Do NOT add quotes, explanations, or any commentary.",
        "- Keep the continuation concise and natural.",
        "- If there is nothing useful to suggest, output an empty string.",
        "- IMPORTANT: If the current input already forms a complete, grammatically sound translation of the source text, you MUST output an empty string. Do not append extra words, punctuation, or filler to a finished translation.",
        "",
        "{{contextVariables}}",
      ].join("\n"),
      systemPromptVariables: {
        sourceText: {
          type: "string",
          source: "context",
          name: "Source text",
          description: "The original source text to be translated",
        },
        targetLanguageId: {
          type: "string",
          source: "context",
          name: "Target language",
          description: "The BCP-47 ID of the target translation language",
        },
        currentInput: {
          type: "string",
          source: "input",
          name: "Current input",
          description: "Text already typed by the translator up to the cursor",
        },
        memoryHints: {
          type: "string",
          source: "context",
          name: "Translation memory hints",
          description: "Relevant translation memory matches for reference",
        },
        termHints: {
          type: "string",
          source: "context",
          name: "Terminology hints",
          description: "Relevant glossary terms for reference",
        },
        neighborElements: {
          type: "string",
          source: "context",
          name: "Neighboring elements",
          description: "Nearby translated segments for style/tone consistency",
        },
      },
      tools: [],
      constraints: {
        maxSteps: 1,
        maxConcurrentToolCalls: 1,
        timeoutMs: 10_000,
      },
    },
  },
] as const;

/**
 * Look up a builtin template by its stable `templateId`.
 */
export const getBuiltinAgentTemplate = (
  templateId: string,
): BuiltinAgentTemplate | undefined =>
  builtinAgentTemplates.find((t) => t.templateId === templateId);
