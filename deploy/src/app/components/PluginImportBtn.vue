<script setup lang="ts">
import { ref } from "vue";
import Button from "./Button.vue";
import Modal from "./Modal.vue";
import Input from "./Input.vue";
import InputLabel from "./InputLabel.vue";
import { trpc } from "@/server/trpc/client";
import { useToastStore } from "../stores/toast";
import PluginImportLocal from "./PluginImportLocal.vue";

const { info, trpcWarn } = useToastStore();

const isOpen = ref(false);

const origin = ref({
  owner: "YKDZ",
  repo: "cat-plugin-test",
  ref: "main",
});

const handleClick = () => {
  isOpen.value = true;
};

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
  <Button icon="i-mdi:download" @click="handleClick">导入插件</Button>
  <Modal v-model:is-open="isOpen">
    <div class="p-8 rounded-md bg-highlight flex flex-col gap-2">
      <PluginImportLocal />
    </div>
  </Modal>
</template>
