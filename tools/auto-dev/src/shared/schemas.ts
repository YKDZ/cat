import { z } from "zod/v4";

// ── GitHub CLI response schemas ───────────────────────────────────────

export const GhIssueLabelSchema = z.object({
  name: z.string(),
});

export const GhIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  labels: z.array(GhIssueLabelSchema),
  body: z.string(),
});

export type GhIssue = z.infer<typeof GhIssueSchema>;

export const GhPRSchema = z.object({
  number: z.number(),
  title: z.string(),
  headRefName: z.string(),
});

export type GhPR = z.infer<typeof GhPRSchema>;

export const GhCommentSchema = z.object({
  id: z.coerce.string(),
  body: z.string(),
  // REST API returns `user`, gh issue comment list --json returns `author`
  user: z.object({ login: z.string() }).optional(),
  author: z.object({ login: z.string() }).optional(),
});

export type GhComment = z.infer<typeof GhCommentSchema>;

// ── Decision schemas ──────────────────────────────────────────────────

export const DecisionOptionSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
});

export const DecisionRequestSchema = z.object({
  id: z.string(),
  workflowRunId: z.string(),
  title: z.string(),
  options: z.array(DecisionOptionSchema),
  recommendation: z.string(),
  context: z.string().nullable(),
});
