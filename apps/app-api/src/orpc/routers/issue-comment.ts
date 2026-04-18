import {
  createIssueComment,
  CreateIssueCommentCommandSchema,
  createThread,
  CreateThreadCommandSchema,
  deleteIssueComment,
  DeleteIssueCommentCommandSchema,
  executeCommand,
  executeQuery,
  listComments,
  ListCommentsQuerySchema,
  listReferencesTo,
  ListReferencesToQuerySchema,
  listThreads,
  ListThreadsQuerySchema,
  resolveThread,
  ResolveThreadCommandSchema,
  updateIssueComment,
  UpdateIssueCommentCommandSchema,
} from "@cat/domain";
import {
  IssueCommentSchema,
  IssueCommentThreadSchema,
  CrossReferenceSchema,
} from "@cat/shared/schema/drizzle/issue-comment";
import * as z from "zod";

import { authed, checkPermission } from "@/orpc/server";

/** Create a new comment thread on an issue or PR */
export const createIssueCommentThread = authed
  .input(CreateThreadCommandSchema)
  .output(IssueCommentThreadSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, createThread, input);
  });

/** Add a comment to an existing thread */
export const addIssueComment = authed
  .input(CreateIssueCommentCommandSchema)
  .use(checkPermission("project", "viewer"), () => "*")
  .output(IssueCommentSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, createIssueComment, input);
  });

/** Update (edit) an existing comment */
export const editIssueComment = authed
  .input(UpdateIssueCommentCommandSchema)
  .output(IssueCommentSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, updateIssueComment, input);
  });

/** Delete a comment */
export const removeIssueComment = authed
  .input(DeleteIssueCommentCommandSchema)
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    await executeCommand({ db }, deleteIssueComment, input);
  });

/** Resolve or unresolve a review thread */
export const resolveIssueThread = authed
  .input(ResolveThreadCommandSchema)
  .output(IssueCommentThreadSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, resolveThread, input);
  });

/** List all threads (with comments) for an issue or PR */
export const listIssueThreads = authed
  .input(ListThreadsQuerySchema)
  .output(
    z.array(
      IssueCommentThreadSchema.extend({
        comments: z.array(IssueCommentSchema),
      }),
    ),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, listThreads, input);
  });

/** List comments in a specific thread */
export const listThreadComments = authed
  .input(ListCommentsQuerySchema)
  .output(z.array(IssueCommentSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, listComments, input);
  });

/** Get cross-references pointing to a given target (used in Issue/PR detail sidebar) */
export const getCrossReferences = authed
  .input(ListReferencesToQuerySchema)
  .output(z.array(CrossReferenceSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, listReferencesTo, input);
  });
