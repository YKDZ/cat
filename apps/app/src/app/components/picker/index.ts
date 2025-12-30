import type { AcceptableInputValue } from "reka-ui";

export type PickerOption<T = AcceptableInputValue> = {
  value: T;
  content: string;
};
