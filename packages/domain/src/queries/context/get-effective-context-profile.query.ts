import { and, contextProfile, eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

import { DefaultContextProfilePayload } from "@/context/default-context-profile";

export const GetEffectiveContextProfileQuerySchema = z.object({
  projectId: z.uuidv4(),
  profileId: z.uuidv4().optional(),
});
export type GetEffectiveContextProfileQuery = z.infer<
  typeof GetEffectiveContextProfileQuerySchema
>;

export type EffectiveContextProfile = Omit<
  Pick<
    typeof contextProfile.$inferSelect,
    "id" | "projectId" | "name" | "payload" | "isDefault"
  >,
  "id"
> & { id: string | null };

export const getEffectiveContextProfile: Query<
  GetEffectiveContextProfileQuery,
  EffectiveContextProfile
> = async (ctx, query) => {
  const rows = await ctx.db
    .select()
    .from(contextProfile)
    .where(
      query.profileId
        ? and(
            eq(contextProfile.projectId, query.projectId),
            eq(contextProfile.id, query.profileId),
          )
        : and(
            eq(contextProfile.projectId, query.projectId),
            eq(contextProfile.isDefault, true),
          ),
    )
    .limit(1);

  return (
    rows[0] ?? {
      id: null,
      projectId: query.projectId,
      name: "default" as const,
      payload: DefaultContextProfilePayload,
      isDefault: true as const,
    }
  );
};
