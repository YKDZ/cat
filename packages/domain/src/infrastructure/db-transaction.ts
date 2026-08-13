import type { DbHandle } from "#/types.ts";

type TransactionCapableDb = DbHandle & {
  transaction: <T>(callback: (tx: DbHandle) => Promise<T>) => Promise<T>;
};

type TransactionDb = DbHandle & { rollback: () => never };

const isExistingTransaction = (db: DbHandle): db is TransactionDb =>
  "rollback" in db && typeof db.rollback === "function";

const isTransactionCapable = (db: DbHandle): db is TransactionCapableDb =>
  "transaction" in db && typeof db.transaction === "function";

export const inDatabaseTransaction = async <T>(
  db: DbHandle,
  callback: (tx: DbHandle) => Promise<T>,
): Promise<T> => {
  if (isExistingTransaction(db)) return await callback(db);
  if (!isTransactionCapable(db)) {
    throw new TypeError("Database handle cannot open a transaction.");
  }
  return await db.transaction(callback);
};
