<script setup lang="ts">
import { computed, inject } from "vue";
import type { NonNullJSONType } from "@cat/shared/schema/json";
import * as z from "zod/v4";
import { schemaKey, transferDataToString } from "../utils.ts";
import type { PickerOption } from "@/app/components/picker/index.ts";
import Picker from "@/app/components/picker/Picker.vue";
import { useI18n } from "vue-i18n";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";

const { t } = useI18n();

const props = defineProps<{
  propertyKey: string | number;
  data: NonNullJSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: NonNullJSONType): void;
}>();

const schema = inject(schemaKey)!;

const value = computed(() => String(props.data ?? schema.defaults));

const enumValues = computed(() => {
  return schema.enum as unknown[];
});

const options = computed(() => {
  return enumValues.value.map((value) => {
    return {
      value: String(value),
      content: transferDataToString(value),
    } satisfies PickerOption;
  });
});

const handleChange = (to: PickerOption) => {
  const value = z.json().parse(to.value);
  if (value === null) return;
  emits("_update", value);
};
</script>

<template>
  <FormField :name="schema.title ?? String(propertyKey)">
    <FormItem>
      <FormLabel>{{ schema.title ?? propertyKey }}</FormLabel>
      <FormControl>
        <Picker
          :placeholder="schema.title ?? t('选择一项...')"
          :model-value="value"
          :options
          @update:model-value="(v) => handleChange(v as PickerOption)"
        />
      </FormControl>
      <FormDescription> {{ schema.description }} </FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
