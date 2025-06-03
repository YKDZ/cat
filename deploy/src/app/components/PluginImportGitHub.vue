<script setup lang="ts">
import { ref } from "vue";
import Button from "./Button.vue";
import Input from "./Input.vue";
import InputLabel from "./InputLabel.vue";
import { trpc } from "@/server/trpc/client";
import { useToastStore } from "../stores/toast";

const { info, trpcWarn } = useToastStore();

const origin = ref({
  owner: "YKDZ",
  repo: "cat-plugin-test",
  ref: "main",
});

const handleImport = () => {
  trpc.plugin.importFromGitHub
    .mutate({ ...origin.value })
    .then(() => {
      info("开始在后台导入插件");
    })
    .catch(trpcWarn);
};
</script>

<template>
  <h3 class="text-lg font-bold">从 GitHub 导入插件</h3>
  <div class="flex flex-col gap-1">
    <InputLabel>仓库主人</InputLabel>
    <Input
      v-model="origin.owner"
      icon="i-mdi:account"
      full-width
      type="text"
    />
    <InputLabel>仓库名称</InputLabel>
    <Input v-model="origin.repo" icon="i-mdi:note" full-width type="text" />
    <InputLabel>仓库分支</InputLabel>
    <Input
      v-model="origin.ref"
      icon="i-mdi:source-branch"
      full-width
      type="text"
    />
  </div>
  <Button full-width icon="i-mdi:download" @click="handleImport">导入插件</Button>
</template>
