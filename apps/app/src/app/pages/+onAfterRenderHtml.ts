import type { PageContextServer } from "vike/types";
import { serializePiniaState } from "@/app/utils/pinia.ts";

export const onAfterRenderHtml = (ctx: PageContextServer) => {
  ctx._piniaInitState = serializePiniaState(ctx.pinia!);
};
