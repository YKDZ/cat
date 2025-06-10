<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { onMounted, ref } from "vue";
import JSONForm from "./json-form/JSONForm.vue";

const props = defineProps<{
  providerId: string;
}>();

const schema = ref("{}");

const data = ref({});

const updateForm = async () => {
  await trpc.auth.queryAuthFormSchema
    .query({
      providerId: props.providerId,
    })
    .then((s) => (schema.value = s));
};

const handleAuth = async () => {
  await trpc.auth.preAuth.mutate({
    providerId: props.providerId,
  });
  await trpc.auth.auth.mutate({
    passToServer: data.value,
  });
};

onMounted(updateForm);
</script>

<template>
  <JSONForm :schema :data @update="(to) => (data = to)" />
</template>
