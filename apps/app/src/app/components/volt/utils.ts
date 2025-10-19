// oxlint-disable explicit-module-boundary-types
// oxlint-disable no-explicit-any
import { twMerge } from "tailwind-merge";
import { mergeProps } from "vue";

export const ptViewMerge = (
  globalPTProps = {} as any,
  selfPTProps = {} as any,
  datasets: any,
): any => {
  const { class: globalClass, ...globalRest } = globalPTProps;
  const { class: selfClass, ...selfRest } = selfPTProps;

  return mergeProps(
    { class: twMerge(globalClass, selfClass) },
    globalRest,
    selfRest,
    datasets,
  );
};
