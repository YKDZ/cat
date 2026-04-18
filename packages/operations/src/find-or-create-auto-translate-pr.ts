import type { DbHandle } from "@cat/domain";

import {
  createChangeset,
  createPR,
  executeCommand,
  executeQuery,
  findOpenAutoTranslatePR,
  getLatestBranchChangesetId,
} from "@cat/domain";

export interface FindOrCreateAutoTranslatePRInput {
  projectId: string;
  languageId: string;
}

export interface FindOrCreateAutoTranslatePRResult {
  prId: number;
  branchId: number;
  changesetId: number;
}

/**
 * @zh 查找或创建指定语言的 AutoTranslate PR。
 * 并发安全由 pullRequest 表的 partial unique index 保证：
 *   UNIQUE(projectId, targetLanguageId) WHERE type='AUTO_TRANSLATE' AND status NOT IN ('MERGED','CLOSED')
 * 如果 insert 冲突，重新查询已有 PR。
 * @en Find or create an AutoTranslate PR for the given language.
 * Concurrency safety is ensured by a partial unique index on the pullRequest table.
 * On conflict, re-query the existing PR.
 */
export const findOrCreateAutoTranslatePR = async (
  ctx: { db: DbHandle },
  input: FindOrCreateAutoTranslatePRInput,
): Promise<FindOrCreateAutoTranslatePRResult> => {
  const { db } = ctx;
  const { projectId, languageId } = input;

  const findExisting = async () =>
    executeQuery({ db }, findOpenAutoTranslatePR, { projectId, languageId });

  const existing = await findExisting();

  if (existing) {
    const csId = await ensureChangeset(
      db,
      existing.branchId,
      projectId,
      languageId,
    );
    return {
      prId: existing.id,
      branchId: existing.branchId,
      changesetId: csId,
    };
  }

  try {
    const pr = await executeCommand({ db }, createPR, {
      projectId,
      title: `[Auto-Translate] ${languageId}`,
      body: `Automated pre-translation candidates for language: ${languageId}`,
      reviewers: [],
      type: "AUTO_TRANSLATE",
      targetLanguageId: languageId,
      // UUID suffix avoids branch-name collisions under concurrent creation
      branchName: `auto-translate/${languageId}/${crypto.randomUUID()}`,
    });

    const csId = await ensureChangeset(db, pr.branchId, projectId, languageId);
    return { prId: pr.id, branchId: pr.branchId, changesetId: csId };
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      const retried = await findExisting();
      if (retried) {
        const csId = await ensureChangeset(
          db,
          retried.branchId,
          projectId,
          languageId,
        );
        return {
          prId: retried.id,
          branchId: retried.branchId,
          changesetId: csId,
        };
      }
    }
    throw error;
  }
};

async function ensureChangeset(
  db: DbHandle,
  branchId: number,
  projectId: string,
  languageId: string,
): Promise<number> {
  const csId = await executeQuery({ db }, getLatestBranchChangesetId, {
    branchId,
  });
  if (csId !== null) return csId;

  const cs = await executeCommand({ db }, createChangeset, {
    projectId,
    branchId,
    summary: `Auto-translate candidates for ${languageId}`,
  });
  return cs.id;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    (error as { code: string }).code === "23505"
  );
}
