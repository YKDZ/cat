import { authedProcedure, router } from "../server";

export const testRouter = router({
  testErr: authedProcedure.mutation(() => {
    throw new Error("test error");
  }),
});
