import z from "zod";
import { DrizzleDateTimeSchema } from "../misc";
import { CommentReactionTypeSchema, CommentTargetTypeSchema } from "./enum";

export const CommentSchema = z.object({
  id: z.int(),
  targetType: CommentTargetTypeSchema,
  targetId: z.int(),
  userId: z.uuidv4(),
  content: z.string(),
  parentCommentId: z.int().nullable(),
  rootCommentId: z.int().nullable(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const CommentReactionSchema = z.object({
  id: z.int(),
  commentId: z.int(),
  userId: z.uuidv4(),
  type: CommentReactionTypeSchema,
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export type Comment = z.infer<typeof CommentSchema>;
export type CommentReaction = z.infer<typeof CommentReactionSchema>;
