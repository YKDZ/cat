/**
 * @shadcn-do-not-sync
 * reason:type definition enhancements、error handling improvements
 * lastReviewed:2026-02-25
 */

export { default as FormControl } from "#/components/form/FormControl.vue";
export { default as FormDescription } from "#/components/form/FormDescription.vue";
export { default as FormItem } from "#/components/form/FormItem.vue";
export { default as FormLabel } from "#/components/form/FormLabel.vue";
export { default as FormMessage } from "#/components/form/FormMessage.vue";
export { FORM_ITEM_INJECTION_KEY } from "#/components/form/injectionKeys.ts";
export {
  Form,
  Field as FormField,
  FieldArray as FormFieldArray,
} from "vee-validate";
