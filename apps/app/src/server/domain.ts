import {
  getDrizzleDB,
  type DrizzleClient,
  type DrizzleTransaction,
} from "@cat/db";
import {
  executeCommand,
  executeQuery,
  type Command,
  type Query,
} from "@cat/domain";

export const withAppDrizzle = async <TResult>(
  handler: (db: DrizzleClient) => Promise<TResult>,
): Promise<TResult> => {
  const { client } = await getDrizzleDB();
  return handler(client);
};

export const withAppDrizzleTransaction = async <TResult>(
  handler: (tx: DrizzleTransaction) => Promise<TResult>,
): Promise<TResult> => {
  return withAppDrizzle(async (db) => db.transaction(handler));
};

export const runAppQuery = async <Q, R>(
  query: Query<Q, R>,
  input: Q,
): Promise<R> => {
  return withAppDrizzle(async (db) => executeQuery({ db }, query, input));
};

export const runAppCommand = async <C, R>(
  command: Command<C, R>,
  input: C,
): Promise<R> => {
  return withAppDrizzle(async (db) => {
    return executeCommand({ db }, command, input);
  });
};
