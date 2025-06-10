<script setup lang="ts">
import JSONForm from "@/app/components/json-form/JSONForm.vue";
import { computed, ref } from "vue";
import { z } from "zod/v4";

const formSchema = z.object({
  data: z.object({
    email: z.email().meta({ title: "电子邮箱" }).default("3070799584@qq.com"),
  }),
});

const jsonSchema = computed(() => {
  return JSON.stringify(z.toJSONSchema(formSchema));
});

let data = ref({});
</script>

<template>
  <JSONForm :data :schema="jsonSchema" @update="(to) => (data = to!)" />
  <pre>{{ data }}</pre>
</template>
