import * as z from "zod";

export const RequiredVectorDimension = 1024 as const;
export const RequiredVectorDimensionSchema = z.literal(RequiredVectorDimension);
export type RequiredVectorDimension = z.infer<
  typeof RequiredVectorDimensionSchema
>;
