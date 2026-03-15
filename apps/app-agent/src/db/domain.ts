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

/**
 * app-agent 自己保留这层薄适配，主要是为了：
 * 1. 让 workflow / tools 不再直接接触 getDrizzleDB()
 * 2. 统一默认 command collector 策略（当前为 noopCollector）
 * 3. 在需要组合多个 c/q 或显式事务时，仍保留最小的入口层编排能力
 *
 * 它不是新的业务层，只是 agent 运行时的 DB / domain 边界适配器。
 */

export const withAgentDrizzle = async <TResult>(
  handler: (db: DrizzleClient) => Promise<TResult>,
): Promise<TResult> => {
  const { client } = await getDrizzleDB();
  return handler(client);
};

export const withAgentDrizzleTransaction = async <TResult>(
  handler: (tx: DrizzleTransaction) => Promise<TResult>,
): Promise<TResult> => {
  return withAgentDrizzle(async (db) => db.transaction(handler));
};

export const runAgentQuery = async <Q, R>(
  query: Query<Q, R>,
  input: Q,
): Promise<R> => {
  return withAgentDrizzle(async (db) => executeQuery({ db }, query, input));
};

export const runAgentCommand = async <C, R>(
  command: Command<C, R>,
  input: C,
): Promise<R> => {
  return withAgentDrizzle(async (db) => {
    return executeCommand({ db }, command, input);
  });
};
