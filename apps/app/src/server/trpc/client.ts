import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  loggerLink,
  splitLink,
} from "@trpc/client";
import { AppRouter } from "./_app";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    loggerLink(),
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
