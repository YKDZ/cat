<script setup lang="ts">
import type { _JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";
import IJsonForm from "./IJsonForm.vue";

defineProps<{
  schema: _JSONSchema;
  data: NonNullJSONType;
}>();

const emits = defineEmits<{
  (
    e: "update",
    to: NonNullJSONType,
    schema: _JSONSchema,
    key: string | number,
    path: (string | number)[],
  ): void;
}>();
</script>

<template>
  <form>
    <IJsonForm
      :schema="schema"
      property-key=""
      :data
      @_update="
        (to, schema, key, path) => emits('update', to, schema, key, path)
      "
    />
  </form>
</template>
