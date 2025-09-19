import type { ComputedRef } from "vue";

export const FORM_CONTROL_SYMBOL = Symbol("form-control");

export interface FormControlContext {
  id: string;
  labelId: string;
  descriptionId: string;
  errorId: string;
  inputId: ComputedRef<string>;
  disabled: ComputedRef<boolean>;
  required: ComputedRef<boolean>;
  invalid: ComputedRef<boolean>;
  registerInput: (customId?: string) => string;
  classes?: {
    container?: string;
    label?: string;
    description?: string;
    error?: string;
    input?: string;
  };
}
