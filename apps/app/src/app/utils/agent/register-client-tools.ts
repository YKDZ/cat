import { navigate } from "vike/client/router";

import { useEditorContextStore } from "@/app/stores/editor/context";
import { useEditorTableStore } from "@/app/stores/editor/table";

import { registerClientTool } from "./client-tool-registry";

/**
 * Register all built-in client tool handlers.
 * Must be called within a Vue component setup context so that
 * Pinia stores are accessible.
 */
export const useRegisterClientTools = (): void => {
  const editorTable = useEditorTableStore();
  const editorContext = useEditorContextStore();

  // ─── Read-only tools ───

  registerClientTool("get_translation_value", () => ({
    value: editorTable.translationValue,
  }));

  registerClientTool("get_editor_context", () => ({
    elementId: editorTable.elementId,
    sourceText: editorTable.element?.value ?? null,
    translationValue: editorTable.translationValue,
    languageToId: editorContext.languageToId ?? null,
    documentId: editorContext.documentId ?? null,
  }));

  // ─── Mutation tools ───

  registerClientTool("replace_translation", (args: Record<string, unknown>) => {
    const value = args["value"];
    if (typeof value !== "string") throw new Error("value must be a string");
    editorTable.replace(value);
    return { ok: true };
  });

  registerClientTool("insert_text", async (args: Record<string, unknown>) => {
    const value = args["value"];
    if (typeof value !== "string") throw new Error("value must be a string");
    await editorTable.insert(value);
    return { ok: true };
  });

  registerClientTool("clear_translation", () => {
    editorTable.clear();
    return { ok: true };
  });

  registerClientTool("submit_translation", async () => {
    await editorTable.translate();
    return { ok: true };
  });

  registerClientTool(
    "navigate_to_element",
    async (args: Record<string, unknown>) => {
      const elementId = args["elementId"];
      if (typeof elementId !== "number")
        throw new Error("elementId must be a number");

      const docId =
        typeof args["documentId"] === "string"
          ? args["documentId"]
          : editorContext.documentId;
      const langId =
        typeof args["languageId"] === "string"
          ? args["languageId"]
          : editorContext.languageToId;

      await editorTable.toElement(elementId);
      await navigate(`/editor/${docId}/${langId}/${elementId}`);
      return { ok: true };
    },
  );

  registerClientTool("navigate_to_next_untranslated", async () => {
    // toNextUntranslated already calls navigate() internally
    await editorTable.toNextUntranslated();
    return { ok: true };
  });

  registerClientTool("undo_translation", () => {
    editorTable.undo();
    return { ok: true };
  });

  registerClientTool("redo_translation", () => {
    editorTable.redo();
    return { ok: true };
  });
};
