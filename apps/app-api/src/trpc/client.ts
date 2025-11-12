import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  loggerLink,
  splitLink,
} from "@trpc/client";
import { AppRouter } from "./_app.ts";

const isDev = process.env.NODE_ENV === "development";

export const trpc: ReturnType<typeof createTRPCClient<AppRouter>> =
  createTRPCClient<AppRouter>({
    links: [
      ...(isDev ? [loggerLink()] : []),
      splitLink({
        condition: (op) => op.type === "subscription",
        true: httpSubscriptionLink({
          url: `/api/trpc`,
        }),
        false: httpBatchLink({
          url: `/api/trpc`,
        }),
      }),
    ],
  });
