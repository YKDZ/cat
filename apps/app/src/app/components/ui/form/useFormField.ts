import { FieldContextKey } from "vee-validate";
import {
  computed,
  inject,
  type ComputedRef,
  type MaybeRef,
  type Ref,
} from "vue";
import { FORM_ITEM_INJECTION_KEY } from "./injectionKeys";

export function useFormField(): {
  id: string | undefined;
  name: MaybeRef<string>;
  formItemId: string;
  formDescriptionId: string;
  formMessageId: string;
  valid: ComputedRef<boolean>;
  isDirty: ComputedRef<boolean>;
  isTouched: ComputedRef<boolean>;
  error: Ref<string | undefined>;
} {
  const fieldContext = inject(FieldContextKey);
  const fieldItemContext = inject(FORM_ITEM_INJECTION_KEY);

  if (!fieldContext)
    throw new Error("useFormField should be used within <FormField>");

  const { name, errorMessage: error, meta } = fieldContext;
  const id = fieldItemContext;

  const fieldState = {
    valid: computed(() => meta.valid),
    isDirty: computed(() => meta.dirty),
    isTouched: computed(() => meta.touched),
    error,
  };

  return {
    id,
    name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}
