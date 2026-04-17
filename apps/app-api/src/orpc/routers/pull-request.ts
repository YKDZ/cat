import {
  closePR,
  ClosePRCommandSchema,
  createPR,
  CreatePRCommandSchema,
  executeCommand,
  executeQuery,
  getPR,
  getPRByNumber,
  GetPRByNumberQuerySchema,
  getPRDiff,
  GetPRDiffQuerySchema,
  GetPRQuerySchema,
  listPRs,
  ListPRsQuerySchema,
  submitReview,
  SubmitReviewCommandSchema,
  updatePR,
  UpdatePRCommandSchema,
  updatePRStatus,
  UpdatePRStatusCommandSchema,
} from "@cat/domain";
import { mergePRFull, rebasePRFull } from "@cat/operations";
import { PullRequestSchema } from "@cat/shared/schema/drizzle/pull-request";
import * as z from "zod/v4";

import { authed, checkPermission } from "@/orpc/server";

/** Create a new pull request in a project */
export const createProjectPR = authed
  .input(CreatePRCommandSchema)
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(PullRequestSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, createPR, input);
  });

/** Get a single PR by externalId */
export const getProjectPR = authed
  .input(GetPRQuerySchema)
  .output(PullRequestSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, getPR, input);
  });

/** Get a single PR by projectId + number */
export const getProjectPRByNumber = authed
  .input(GetPRByNumberQuerySchema)
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(PullRequestSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, getPRByNumber, input);
  });

/** List PRs in a project with optional filters */
export const listProjectPRs = authed
  .input(ListPRsQuerySchema)
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(z.array(PullRequestSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, listPRs, input);
  });

/** Update a PR's title, body, or reviewers */
export const updateProjectPR = authed
  .input(UpdatePRCommandSchema)
  .use(checkPermission("project", "editor"), () => "*")
  .output(PullRequestSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, updatePR, input);
  });

/** Update a PR's status */
export const updateProjectPRStatus = authed
  .input(UpdatePRStatusCommandSchema)
  .use(checkPermission("project", "editor"), () => "*")
  .output(PullRequestSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, updatePRStatus, input);
  });

/** Merge a pull request (full merge flow with conflict detection) */
export const mergeProjectPR = authed
  .input(
    z.object({
      prExternalId: z.uuidv4(),
      mergedBy: z.string().min(1),
    }),
  )
  .use(checkPermission("project", "editor"), () => "*")
  .output(
    z.object({
      success: z.boolean(),
      hasConflicts: z.boolean(),
      conflicts: z.array(z.unknown()),
      prId: z.int(),
      mainChangesetId: z.int().optional(),
      errorMessage: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await mergePRFull({ db }, input);
  });

/** Rebase a pull request onto the latest main branch */
export const rebaseProjectPR = authed
  .input(
    z.object({
      prExternalId: z.uuidv4(),
    }),
  )
  .use(checkPermission("project", "editor"), () => "*")
  .output(
    z.object({
      success: z.boolean(),
      newBaseChangesetId: z.int().nullable(),
      hasConflicts: z.boolean(),
      conflicts: z.array(z.unknown()),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await rebasePRFull({ db }, input);
  });

/** Close a pull request */
export const closeProjectPR = authed
  .input(ClosePRCommandSchema)
  .use(checkPermission("project", "editor"), () => "*")
  .output(PullRequestSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, closePR, input);
  });

/** Submit a review decision on a PR */
export const submitProjectPRReview = authed
  .input(SubmitReviewCommandSchema)
  .use(checkPermission("project", "editor"), () => "*")
  .output(PullRequestSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, submitReview, input);
  });

/** Get the changeset diff for a PR */
export const getProjectPRDiff = authed
  .input(GetPRDiffQuerySchema)
  .output(z.array(z.unknown()))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, getPRDiff, input);
  });
