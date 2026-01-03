<script setup lang="ts">
import * as z from "zod";
import type { JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";
import { ref } from "vue";
import JSONForm from "@/app/components/json-form/JsonForm.vue";

const data = ref<unknown>({});

const schema = z.toJSONSchema(
  z.object({
    name: z.string(),
    age: z.number(),
    isStudent: z.boolean(),
    address: z.object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
    }),
  }),
);

const handleUpdate = (
  v: NonNullJSONType,
  schema: JSONSchema,
  key: string | number,
  path: (string | number)[],
) => {
  data.value = v;
};
</script>

<template>
  <JSONForm :data="data as NonNullJSONType" :schema @update="handleUpdate" />
</template>
