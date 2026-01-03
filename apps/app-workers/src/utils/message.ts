import { randomUUID } from "crypto";
import * as z from "zod";

export const getTraceId = (
  payload: unknown,
  fallback: string = randomUUID(),
): string => {
  const { traceId } = z
    .looseObject({ traceId: z.string().optional() })
    .parse(payload);

  return traceId ?? fallback;
};
