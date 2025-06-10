import { initializationProcedure, router } from "../server";

export const initRouter = router({
  commit: initializationProcedure.mutation(async ({ ctx }) => {}),
});
