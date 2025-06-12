<script setup lang="ts">
import JSONForm from "@/app/components/json-form/JSONForm.vue";
import { computed, onMounted, ref } from "vue";
import { z } from "zod/v4";
import { JSONSchema } from "zod/v4/core";

const schema = z.object({
  test: z.string(),
});

const jsonSchema = z.toJSONSchema(schema);

onMounted(() => {
  console.log(jsonSchema);
});
</script>

<template>1</template>
