import type { DbHandle } from "@cat/domain";
import type { AuthContext } from "@cat/permissions";
import type { PluginManager } from "@cat/plugin-core";
import type { OperationFailure } from "@cat/shared";
import * as z from "zod";

export type OperationActor = {
  type: "user";
  id: string;
};

export type OperationInvocationContext = {
  db: DbHandle;
  actor: OperationActor;
  auth: AuthContext;
  pluginManager: PluginManager;
  signal?: AbortSignal | undefined;
};

export type OperationContractErrorIdentifier =
  | "canceled"
  | "dependency_unavailable"
  | "invalid_input"
  | "missing_capability"
  | "not_found"
  | "operation_failed"
  | "permission_denied"
  | "execution_denied"
  | "relationship_denied"
  | "review_change_blocked";

export class OperationContractError extends Error {
  readonly identifier: OperationContractErrorIdentifier;
  readonly operationFailure?: OperationFailure;

  constructor(
    identifier: OperationContractErrorIdentifier,
    message: string,
    options: {
      operationFailure?: OperationFailure;
    } = {},
  ) {
    super(message);
    this.name = "OperationContractError";
    this.identifier = identifier;
    if (options.operationFailure !== undefined) {
      this.operationFailure = options.operationFailure;
    }
  }
}

export type OperationContract<
  TName extends string,
  TInput,
  TOutput,
  TContext,
> = {
  name: TName;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  invoke: (context: TContext, input: TInput) => Promise<TOutput>;
};

export const defineOperationContract = <
  TName extends string,
  TInput,
  TOutput,
  TContext,
>(
  contract: OperationContract<TName, TInput, TOutput, TContext>,
): OperationContract<TName, TInput, TOutput, TContext> => contract;

export const invokeOperationContract = async <
  TName extends string,
  TInput,
  TOutput,
  TContext,
>(
  contract: OperationContract<TName, TInput, TOutput, TContext>,
  context: TContext,
  input: unknown,
): Promise<TOutput> => {
  const parsedInput = await contract.inputSchema.parseAsync(input);
  const output = await contract.invoke(context, parsedInput);
  return await contract.outputSchema.parseAsync(output);
};
