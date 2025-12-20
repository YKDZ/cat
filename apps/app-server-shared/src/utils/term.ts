import type { DrizzleClient } from "@cat/db";
import type { TermCandidate } from "@cat/plugin-core";

export const searchTerm = async (
  drizzle: DrizzleClient,
  candidates: TermCandidate[],
) => {
  await drizzle.select();
};
