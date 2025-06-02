<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import Button from "./Button.vue";
import { useToastStore } from "../stores/toast";

const { info, trpcWarn } = useToastStore();

const handleReload = async () => {
  await trpc.plugin.reload
    .mutate()
    .then(() => {
      info("成功重载所有插件");
    })
    .catch(trpcWarn);
};
</script>

<template>
  <Button icon="i-mdi:reload" @click="handleReload">重载插件</Button>
</template>
