<script setup lang="ts">
import { inject, ref } from "vue";
import type { NonNullJSONType } from "@cat/shared/schema/json";
import { schemaKey } from "../utils.ts";
import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/app/components/ui/number-field";
import { Label } from "@/app/components/ui/label";

const props = defineProps<{
  propertyKey: string | number;
  data: NonNullJSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: NonNullJSONType): void;
}>();

const schema = inject(schemaKey)!;

const value = ref(Number(props.data ?? schema.default));

const onUpdate = (newValue: number) => {
  emits("_update", newValue);
};
</script>

<template>
  <NumberField class="w-fit" v-model="value" @update:model-value="onUpdate">
    <Label>{{ schema.title ?? propertyKey }}</Label>
    <NumberFieldContent>
      <NumberFieldDecrement />
      <NumberFieldInput />
      <NumberFieldIncrement />
    </NumberFieldContent>
  </NumberField>
</template>
