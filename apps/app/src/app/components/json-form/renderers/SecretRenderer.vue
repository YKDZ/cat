<script setup lang="ts">
import { computed, inject, ref } from "vue";
import * as z from "zod/v4";
import type { NonNullJSONType } from "@cat/shared/schema/json";
import { schemaKey, transferDataToString } from "../utils.ts";
import { Input } from "@/app/components/ui/input";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form";
import { Button } from "@/app/components/ui/button/index.ts";
import { Eye, EyeOff } from "lucide-vue-next";

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
      <FormDescription> {{ schema.description }} </FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
