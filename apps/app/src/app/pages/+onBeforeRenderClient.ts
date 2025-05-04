import { PageContext } from "vike/types";

export const onBeforeRenderClient = (ctx: PageContext) => {
  const { _piniaInitState } = ctx;
  if (_piniaInitState) {
    ctx.globalContext.pinia!.state.value = {
      ...ctx.globalContext.pinia!.state,
      ..._piniaInitState,
    };
  }
};
