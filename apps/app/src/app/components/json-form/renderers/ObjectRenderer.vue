<script setup lang="ts">
import { computed, inject, ref } from "vue";
import type { NonNullJSONType } from "@cat/shared/schema/json";
import { _JSONSchemaSchema, type _JSONSchema } from "@cat/shared/schema/json";
import { schemaKey } from "../utils.ts";
import IJsonForm from "../IJsonForm.vue";
import {
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@cat/app-ui";
import { ChevronDown } from "lucide-vue-next";

const props = defineProps<{
  propertyKey: string | number;
  data: NonNullJSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: NonNullJSONType): void;
}>();

const schema = inject(schemaKey)!;

const collapsed = ref(false);

const isNested = computed(() => {
  // Array indices (numeric keys) should never show nested collapse UI
  // because ArrayRenderer already provides the collapse UI
  // String keys should show nested collapse UI
  return typeof props.propertyKey === "string";
});

const objectProperties = computed(() => {
  const properties = schema.properties;
  if (!properties) return [];

  return Object.keys(properties).map((key) => ({
    key,
    schema: _JSONSchemaSchema.parse(properties[key]),
  }));
});

const dataOfPropertyKey = <T,>(key: string, fallback: T) => {
  if (!props.data || !Object.keys(props.data).includes(key)) return fallback;
  return (props.data as Record<string, NonNullJSONType>)[key] as T;
};

const handleUpdate = (
  to: NonNullJSONType,
  _schema: _JSONSchema,
  key: string | number,
) => {
  if (typeof key === "string") {
    const data = (props.data as Record<string, NonNullJSONType>) ?? {};
    data[key] = to;
    emits("_update", { ...data });
  } else if (typeof key === "number") {
    const data = (props.data as Array<NonNullJSONType>) ?? [];
    data[key] = to;
    emits("_update", [...data]);
  }
};
</script>

<template>
  <FormField v-if="isNested" :name="schema.title ?? String(propertyKey)">
    <FormItem>
      <div
        v-if="schema.title || propertyKey"
        class="flex cursor-pointer items-center gap-1"
        @click="collapsed = !collapsed"
      >
        <ChevronDown
          class="size-4 transition-transform"
          :class="{ '-rotate-90': collapsed }"
        />
        <FormLabel class="cursor-pointer">
          {{ schema.title ?? propertyKey }}
        </FormLabel>
      </div>
      <FormDescription v-if="schema.description">
        {{ schema.description }}
      </FormDescription>
      <FormMessage />

      <div v-show="!collapsed" class="space-y-3 border-l-2 border-muted pl-4">
        <IJsonForm
          v-for="property in objectProperties"
          :key="property.key"
          :data="
            dataOfPropertyKey(
              property.key,
              property.schema.default,
            ) as NonNullJSONType
          "
          :property-key="property.key"
          :schema="property.schema"
          @_update="handleUpdate"
        />
      </div>
    </FormItem>
  </FormField>

  <!-- Root-level object: render children without wrapper -->
  <div v-else class="space-y-3">
    <IJsonForm
      v-for="property in objectProperties"
      :key="property.key"
      :data="
        dataOfPropertyKey(
          property.key,
          property.schema.default,
        ) as NonNullJSONType
      "
      :property-key="property.key"
      :schema="property.schema"
      @_update="handleUpdate"
    />
  </div>
</template>
