import { authedProcedure, router } from "@/server/trpc/server.ts";

export const testRouter = router({
  testErr: authedProcedure.mutation(() => {
    throw new Error("test error");
  }),
});
