<script setup lang="ts">
import type { NonNullJSONType } from "@cat/shared/schema/json";

import { Input } from "@cat/ui";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@cat/ui";
import { Button } from "@cat/ui";
import { Eye, EyeOff } from "@lucide/vue";
import { computed, inject, ref } from "vue";
import * as z from "zod";

import { schemaKey, transferDataToString } from "../utils.ts";

const props = defineProps<{
  propertyKey: string | number;
  data: NonNullJSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: NonNullJSONType): void;
}>();

const schema = inject(schemaKey)!;

const value = computed(() =>
  transferDataToString(props.data ?? schema.default),
);

const visible = ref(false);

const type = computed(() => {
  if (visible.value === true) return "text";
  else return "password";
});

const autocomplete = computed(() => {
  try {
    return z.string().parse(schema["x-autocomplete"]);
  } catch {
    return "off";
  }
});

const handleUpdate = (value: string | number) => {
  emits("_update", value);
};
</script>

<template>
  <FormField :name="schema.title ?? String(propertyKey)">
    <FormItem>
      <FormLabel>{{ schema.title ?? propertyKey }}</FormLabel>
      <FormControl>
        <div class="relative flex gap-1">
          <Input
            :model-value="value"
            :type
            :autocomplete
            @update:model-value="handleUpdate"
          />
          <Button
            type="button"
            @click="visible = !visible"
            variant="ghost"
            size="icon"
            class="absolute right-0"
          >
            <Eye v-if="!visible" />
            <EyeOff v-else />
          </Button>
        </div>
      </FormControl>
      <FormDescription v-if="schema.description">
        {{ schema.description }}
      </FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
