import type { DbHandle } from "@cat/domain";
import type { JSONType } from "@cat/shared";

import {
  createVectorizedStrings,
  createTranslations,
  executeCommand,
  executeQuery,
  listTranslationsByElement,
} from "@cat/domain";

import type {
  ApplicationContext,
  ApplicationMethod,
  ApplicationResult,
  AsyncDependencySpec,
  ChangesetEntry,
  DependencyStatus,
} from "../application-method.ts";

// ── Payload type for auto-translate changeset entries ──
interface AutoTranslatePayload {
  text: string;
  elementId: number;
  languageId: string;
  confidence: number;
  source: "memory" | "advisor";
}

/**
 * @zh 处理 auto_translation entityType 的 apply 逻辑。
 * applyCreate 解析 entry.after payload，创建 vectorizedString 和 Translation 记录。
 * 不会覆盖已有人工翻译。
 * @en Handles apply logic for auto_translation entityType.
 * applyCreate parses entry.after, creates vectorizedString and Translation records.
 * Will not overwrite existing human translations.
 */
export class AutoTranslationApplicationMethod implements ApplicationMethod {
  readonly entityType = "auto_translation";
  readonly asyncDependencySpec: AsyncDependencySpec | null = null;

  async applyCreate(
    entry: ChangesetEntry,
    ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    if (!ctx.db) {
      return {
        status: "FAILED",
        errorMessage:
          "AutoTranslationApplicationMethod requires db in ApplicationContext",
      };
    }

    const db: DbHandle = ctx.db;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const payload = entry.after as unknown as AutoTranslatePayload | null;
    if (!payload?.text || !payload.elementId || !payload.languageId) {
      return {
        status: "FAILED",
        errorMessage: `Invalid auto-translate payload for entry ${entry.id}`,
      };
    }

    // Check if translation already exists for this element + language
    const existingTranslations = await executeQuery(
      { db },
      listTranslationsByElement,
      { elementId: payload.elementId, languageId: payload.languageId },
    );

    if (existingTranslations.length > 0) {
      // Don't overwrite human translations — skip silently
      return { status: "APPLIED" };
    }

    // Create vectorizedString for the translation text
    const stringIds = await executeCommand({ db }, createVectorizedStrings, {
      data: [{ text: payload.text, languageId: payload.languageId }],
    });

    if (stringIds.length === 0) {
      return {
        status: "FAILED",
        errorMessage: "Failed to create vectorizedString",
      };
    }

    // Create translation record
    await executeCommand({ db }, createTranslations, {
      data: [
        {
          translatableElementId: payload.elementId,
          stringId: stringIds[0],
        },
      ],
    });

    return { status: "APPLIED" };
  }

  async applyUpdate(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    // Auto-translate entries are CREATE-only; UPDATE is a no-op
    return { status: "APPLIED" };
  }

  async applyDelete(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    return { status: "APPLIED" };
  }

  async applyRollback(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<ApplicationResult> {
    return { status: "APPLIED" };
  }

  async validateDependencies(_entityId: string): Promise<DependencyStatus> {
    return { status: "READY" };
  }

  async compensate(
    _entry: ChangesetEntry,
    _ctx: ApplicationContext,
  ): Promise<void> {
    // No compensation needed for auto-translation entries
  }

  async fetchCurrentState(
    _entityId: string,
    _ctx: ApplicationContext,
  ): Promise<JSONType | null> {
    return null;
  }

  async fetchCurrentStates(
    _entityIds: string[],
    _ctx: ApplicationContext,
  ): Promise<Map<string, JSONType>> {
    return new Map();
  }
}
