<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import Button from "./Button.vue";
import { useToastStore } from "../stores/toast";
import { navigate } from "vike/client/router";

const props = defineProps<{
  id: string;
}>();

const { info, trpcWarn } = useToastStore();

const handleDelete = async () => {
  await trpc.plugin.delete
    .mutate({ id: props.id })
    .then(() => {
      info(`成功删除插件 ${props.id}`);
      navigate(`/plugins`);
    })
    .catch(trpcWarn);
};
</script>

<template>
  <Button icon="i-mdi:trash-can" @click="handleDelete">删除插件</Button>
</template>
