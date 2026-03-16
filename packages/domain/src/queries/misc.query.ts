import { project, user } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListAllProjectsQuerySchema = z.object({});

export type ListAllProjectsQuery = z.infer<typeof ListAllProjectsQuerySchema>;

export const listAllProjects: Query<
  ListAllProjectsQuery,
  Array<typeof project.$inferSelect>
> = async (ctx, _query) => {
  return ctx.db.select().from(project);
};

export const ListAllUsersQuerySchema = z.object({});

export type ListAllUsersQuery = z.infer<typeof ListAllUsersQuerySchema>;

export const listAllUsers: Query<
  ListAllUsersQuery,
  Array<typeof user.$inferSelect>
> = async (ctx, _query) => {
  return ctx.db.select().from(user);
};
