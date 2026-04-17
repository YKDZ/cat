import {
  assignIssue,
  AssignIssueCommandSchema,
  claimIssue,
  ClaimIssueCommandSchema,
  closeIssue,
  CloseIssueCommandSchema,
  createIssue,
  CreateIssueCommandSchema,
  executeCommand,
  executeQuery,
  getIssue,
  getIssueByNumber,
  GetIssueByNumberQuerySchema,
  GetIssueQuerySchema,
  listIssues,
  ListIssuesQuerySchema,
  reopenIssue,
  ReopenIssueCommandSchema,
  updateIssue,
  UpdateIssueCommandSchema,
} from "@cat/domain";
import { IssueSchema } from "@cat/shared/schema/drizzle/issue";
import * as z from "zod/v4";

import { authed, checkPermission } from "@/orpc/server";

/** Create a new issue in a project */
export const createProjectIssue = authed
  .input(CreateIssueCommandSchema)
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(IssueSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, createIssue, input);
  });

/** Get a single issue by externalId */
export const getProjectIssue = authed
  .input(GetIssueQuerySchema)
  .output(IssueSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, getIssue, input);
  });

/** Get a single issue by projectId + number */
export const getProjectIssueByNumber = authed
  .input(GetIssueByNumberQuerySchema)
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(IssueSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, getIssueByNumber, input);
  });

/** List issues in a project with optional filters */
export const listProjectIssues = authed
  .input(ListIssuesQuerySchema)
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(z.array(IssueSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeQuery({ db }, listIssues, input);
  });

/** Update an issue's title, body, or labels */
export const updateProjectIssue = authed
  .input(UpdateIssueCommandSchema)
  .use(checkPermission("project", "editor"), () => "*")
  .output(IssueSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, updateIssue, input);
  });

/** Close an issue */
export const closeProjectIssue = authed
  .input(CloseIssueCommandSchema)
  .use(checkPermission("project", "editor"), () => "*")
  .output(IssueSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, closeIssue, input);
  });

/** Reopen a closed issue */
export const reopenProjectIssue = authed
  .input(ReopenIssueCommandSchema)
  .use(checkPermission("project", "editor"), () => "*")
  .output(IssueSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, reopenIssue, input);
  });

/** Assign or unassign an issue */
export const assignProjectIssue = authed
  .input(AssignIssueCommandSchema)
  .use(checkPermission("project", "editor"), () => "*")
  .output(IssueSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, assignIssue, input);
  });

/** Atomically claim an issue using FOR UPDATE SKIP LOCKED */
export const claimProjectIssue = authed
  .input(ClaimIssueCommandSchema)
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(
    z
      .object({
        id: z.int(),
        externalId: z.uuid(),
        title: z.string(),
        number: z.int(),
      })
      .nullable(),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    return await executeCommand({ db }, claimIssue, input);
  });
