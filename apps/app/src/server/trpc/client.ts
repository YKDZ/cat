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
        url: new URL(`/api/trpc`, import.meta.env.PUBLIC_ENV__URL).toString(),
      }),
      false: httpBatchLink({
        url: new URL(`/api/trpc`, import.meta.env.PUBLIC_ENV__URL).toString(),
      }),
    }),
  ],
});
