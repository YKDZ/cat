import {
  asc,
  eq,
  memoryItem,
  memoryItemDeletion,
  recallDerivationState,
  vectorizedString,
} from "@cat/db";
import {
  CanonicalInputVersionSchema,
  RecallDerivationVersionSchema,
  assertSingleNonNullish,
} from "@cat/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  claimRecallDerivationDemands,
  createMemory,
  createMemoryItems,
  createUser,
  deleteMemoryItem,
  ensureLanguages,
  publishMemoryRecallDerivation,
} from "#/commands/index.ts";
import { executeCommand } from "#/executor.ts";
import { setupTestDB, type TestDB } from "#/testing/setup-test-db.ts";

describe("Memory canonical lock order", () => {
  let db: TestDB;
  let userId: string;
  let memoryId: string;

  beforeEach(async () => {
    db = await setupTestDB();
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["en", "zh-Hans"],
    });
    userId = (
      await executeCommand({ db: db.client }, createUser, {
        email: `memory-lock-order-${crypto.randomUUID()}@example.com`,
        name: "Memory lock order user",
      })
    ).id;
    memoryId = (
      await executeCommand({ db: db.client }, createMemory, {
        creatorId: userId,
        name: "Memory lock order bank",
      })
    ).id;
  });

  afterEach(async () => {
    await db.cleanup();
  });

  const insertString = async (value: string, languageId: string) =>
    assertSingleNonNullish(
      await db.client
        .insert(vectorizedString)
        .values({ value, languageId })
        .returning({ id: vectorizedString.id }),
    ).id;

  const createItem = async (label: string) => {
    const sourceStringId = await insertString(`${label} source`, "en");
    const translationStringId = await insertString(
      `${label} translation`,
      "zh-Hans",
    );
    const created = await executeCommand({ db: db.client }, createMemoryItems, {
      memoryId,
      items: [
        {
          creatorId: userId,
          sourceStringId,
          translationId: null,
          translationStringId,
        },
      ],
    });
    return assertSingleNonNullish(created.items);
  };

  const within = async <T>(promise: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("concurrent Memory writes timed out")),
            10_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  const withConcurrentClients = async <T>(
    callback: (
      first: Awaited<ReturnType<typeof db.openConcurrentClient>>["client"],
      second: Awaited<ReturnType<typeof db.openConcurrentClient>>["client"],
    ) => Promise<T>,
  ): Promise<T> => {
    const [first, second] = await Promise.all([
      db.openConcurrentClient(),
      db.openConcurrentClient(),
    ]);
    try {
      return await callback(first.client, second.client);
    } finally {
      await Promise.all([first.cleanup(), second.cleanup()]);
    }
  };

  it("serializes update and delete without deadlock", async () => {
    const item = await createItem("delete-race");
    const nextSourceStringId = await insertString("updated source", "en");
    const nextTranslationStringId = await insertString(
      "updated translation",
      "zh-Hans",
    );

    const [updated, deleted] = await withConcurrentClients(
      (updateDb, deleteDb) =>
        within(
          Promise.all([
            executeCommand({ db: updateDb }, createMemoryItems, {
              memoryId,
              items: [
                {
                  memoryItemId: item.id,
                  creatorId: userId,
                  sourceStringId: nextSourceStringId,
                  translationId: null,
                  translationStringId: nextTranslationStringId,
                },
              ],
            }),
            executeCommand({ db: deleteDb }, deleteMemoryItem, {
              memoryItemId: item.id,
              deletedById: userId,
              scope: "PROJECT",
              projectId: null,
              reason: "lock-order-race",
            }),
          ]),
        ),
    );
    expect(updated.items).toHaveLength(1);
    expect(deleted.deleted).toBe(true);
    const canonical = await db.client
      .select({
        sourceStringId: memoryItem.sourceStringId,
        translationStringId: memoryItem.translationStringId,
      })
      .from(memoryItem)
      .where(eq(memoryItem.id, item.id));
    expect(
      canonical.length === 0 ||
        (canonical[0]?.sourceStringId === nextSourceStringId &&
          canonical[0]?.translationStringId === nextTranslationStringId),
    ).toBe(true);
    await expect(
      db.client
        .select({ id: memoryItemDeletion.id })
        .from(memoryItemDeletion)
        .where(eq(memoryItemDeletion.deletedMemoryItemId, item.id)),
    ).resolves.toHaveLength(1);
  });

  it.each([
    { order: "update-then-delete", itemRemains: false },
    { order: "delete-then-update", itemRemains: true },
  ] as const)(
    "keeps the $order outcome coherent",
    async ({ order, itemRemains }) => {
      const item = await createItem(order);
      const nextSourceStringId = await insertString(
        `${order} updated source`,
        "en",
      );
      const nextTranslationStringId = await insertString(
        `${order} updated translation`,
        "zh-Hans",
      );
      const update = async () =>
        await executeCommand({ db: db.client }, createMemoryItems, {
          memoryId,
          items: [
            {
              memoryItemId: item.id,
              creatorId: userId,
              sourceStringId: nextSourceStringId,
              translationId: null,
              translationStringId: nextTranslationStringId,
            },
          ],
        });
      const remove = async () =>
        await executeCommand({ db: db.client }, deleteMemoryItem, {
          memoryItemId: item.id,
          deletedById: userId,
          scope: "PROJECT",
          projectId: null,
          reason: order,
        });

      if (order === "update-then-delete") {
        await update();
        expect((await remove()).deleted).toBe(true);
      } else {
        expect((await remove()).deleted).toBe(true);
        await update();
      }

      const canonical = await db.client
        .select({
          sourceStringId: memoryItem.sourceStringId,
          translationStringId: memoryItem.translationStringId,
        })
        .from(memoryItem)
        .where(eq(memoryItem.id, item.id));
      expect(canonical).toEqual(
        itemRemains
          ? [
              {
                sourceStringId: nextSourceStringId,
                translationStringId: nextTranslationStringId,
              },
            ]
          : [],
      );
      await expect(
        db.client
          .select({ id: memoryItemDeletion.id })
          .from(memoryItemDeletion)
          .where(eq(memoryItemDeletion.deletedMemoryItemId, item.id)),
      ).resolves.toHaveLength(1);
    },
  );

  it("serializes update and publish and fences the old snapshot", async () => {
    const item = await createItem("publish-race");
    const claims = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      { workerId: crypto.randomUUID(), limit: 10, leaseDurationMs: 60_000 },
    );
    const claim = claims.find(
      (entry) =>
        entry.targetId === String(item.id) && entry.languageId === "en",
    )!;
    const nextSourceStringId = await insertString("published next", "en");
    const nextTranslationStringId = await insertString(
      "published next translation",
      "zh-Hans",
    );
    const derivationVersion = RecallDerivationVersionSchema.parse(
      `sha256:${"9".repeat(64)}`,
    );

    const [updated, published] = await withConcurrentClients(
      (updateDb, publishDb) =>
        within(
          Promise.all([
            executeCommand({ db: updateDb }, createMemoryItems, {
              memoryId,
              items: [
                {
                  memoryItemId: item.id,
                  creatorId: userId,
                  sourceStringId: nextSourceStringId,
                  translationId: null,
                  translationStringId: nextTranslationStringId,
                },
              ],
            }),
            executeCommand({ db: publishDb }, publishMemoryRecallDerivation, {
              targetId: String(item.id),
              memoryId,
              languageId: "en",
              demandRevision: claim.demandRevision,
              executionEpoch: claim.executionEpoch,
              leaseToken: claim.leaseToken!,
              canonicalInputVersion: CanonicalInputVersionSchema.parse(
                claim.canonicalInputVersion,
              ),
              recallDerivationVersion: derivationVersion,
              variants: [
                {
                  querySide: "SOURCE",
                  text: "publish race",
                  normalizedText: "publish race",
                  variantType: "SURFACE",
                  meta: null,
                },
              ],
            }),
          ]),
        ),
    );
    expect(updated.items).toHaveLength(1);
    expect(["PUBLISHED", "STALE"]).toContain(published.status);
    const [state] = await db.client
      .select()
      .from(recallDerivationState)
      .where(eq(recallDerivationState.id, claim.id));
    expect(state?.status).toBe("PENDING");
    expect(state?.demandRevision).toBeGreaterThan(claim.demandRevision);
  });

  it("serializes tombstone resurrection and publish without deadlock", async () => {
    const item = await createItem("resurrection-race");
    expect(
      (
        await executeCommand({ db: db.client }, deleteMemoryItem, {
          memoryItemId: item.id,
          deletedById: userId,
          scope: "PROJECT",
          projectId: null,
          reason: "resurrection-race",
        })
      ).deleted,
    ).toBe(true);
    const claims = await executeCommand(
      { db: db.client },
      claimRecallDerivationDemands,
      { workerId: crypto.randomUUID(), limit: 10, leaseDurationMs: 60_000 },
    );
    const claim = claims.find(
      (entry) =>
        entry.targetId === String(item.id) && entry.languageId === "en",
    )!;
    const nextSourceStringId = await insertString("resurrected source", "en");
    const nextTranslationStringId = await insertString(
      "resurrected translation",
      "zh-Hans",
    );
    const derivationVersion = RecallDerivationVersionSchema.parse(
      `sha256:${"8".repeat(64)}`,
    );

    const [updated, published] = await withConcurrentClients(
      (updateDb, publishDb) =>
        within(
          Promise.all([
            executeCommand({ db: updateDb }, createMemoryItems, {
              memoryId,
              items: [
                {
                  memoryItemId: item.id,
                  creatorId: userId,
                  sourceStringId: nextSourceStringId,
                  translationId: null,
                  translationStringId: nextTranslationStringId,
                },
              ],
            }),
            executeCommand({ db: publishDb }, publishMemoryRecallDerivation, {
              targetId: String(item.id),
              memoryId: null,
              languageId: "en",
              demandRevision: claim.demandRevision,
              executionEpoch: claim.executionEpoch,
              leaseToken: claim.leaseToken!,
              canonicalInputVersion: CanonicalInputVersionSchema.parse(
                claim.canonicalInputVersion,
              ),
              recallDerivationVersion: derivationVersion,
              variants: [],
            }),
          ]),
        ),
    );
    expect(updated.items).toHaveLength(1);
    expect(["PUBLISHED", "STALE"]).toContain(published.status);
    await expect(
      db.client
        .select({ id: memoryItem.id })
        .from(memoryItem)
        .where(eq(memoryItem.id, item.id)),
    ).resolves.toHaveLength(1);
    const [state] = await db.client
      .select()
      .from(recallDerivationState)
      .where(eq(recallDerivationState.id, claim.id));
    expect(state?.status).toBe("PENDING");
    expect(state?.demandRevision).toBeGreaterThan(claim.demandRevision);
  });

  it("locks reverse-order overlapping bulk updates in global target order", async () => {
    const first = await createItem("bulk-first");
    const second = await createItem("bulk-second");
    const a = {
      firstSource: await insertString("a first", "en"),
      firstTranslation: await insertString("a first translation", "zh-Hans"),
      secondSource: await insertString("a second", "en"),
      secondTranslation: await insertString("a second translation", "zh-Hans"),
    };
    const b = {
      firstSource: await insertString("b first", "en"),
      firstTranslation: await insertString("b first translation", "zh-Hans"),
      secondSource: await insertString("b second", "en"),
      secondTranslation: await insertString("b second translation", "zh-Hans"),
    };
    const item = (
      memoryItemId: number,
      sourceStringId: number,
      translationStringId: number,
    ) => ({
      memoryItemId,
      creatorId: userId,
      sourceStringId,
      translationId: null,
      translationStringId,
    });

    await withConcurrentClients((firstDb, secondDb) =>
      within(
        Promise.all([
          executeCommand({ db: firstDb }, createMemoryItems, {
            memoryId,
            items: [
              item(first.id, a.firstSource, a.firstTranslation),
              item(second.id, a.secondSource, a.secondTranslation),
            ],
          }),
          executeCommand({ db: secondDb }, createMemoryItems, {
            memoryId,
            items: [
              item(second.id, b.secondSource, b.secondTranslation),
              item(first.id, b.firstSource, b.firstTranslation),
            ],
          }),
        ]),
      ),
    );
    const rows = await db.client
      .select({
        id: memoryItem.id,
        sourceStringId: memoryItem.sourceStringId,
        translationStringId: memoryItem.translationStringId,
      })
      .from(memoryItem)
      .orderBy(asc(memoryItem.id));
    const selected = rows.filter(
      (row) => row.id === first.id || row.id === second.id,
    );
    const outcome = selected.map((row) => [
      row.sourceStringId,
      row.translationStringId,
    ]);
    expect([
      [
        [a.firstSource, a.firstTranslation],
        [a.secondSource, a.secondTranslation],
      ],
      [
        [b.firstSource, b.firstTranslation],
        [b.secondSource, b.secondTranslation],
      ],
    ]).toContainEqual(outcome);
  });
});
