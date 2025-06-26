<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useToastStore } from "../stores/toast";
import Button from "./Button.vue";
import Modal from "./Modal.vue";
import PluginImportLocal from "./PluginImportLocal.vue";
import Tabs from "./tab/Tabs.vue";
import type { TabItem } from "./tab";
import PluginImportGitHub from "./PluginImportGitHub.vue";

const { info, trpcWarn } = useToastStore();
const { t } = useI18n();

const isOpen = ref(false);

const origin = ref({
  owner: "YKDZ",
  repo: "cat-plugin-test",
  ref: "main",
});

const handleClick = () => {
  isOpen.value = true;
};

const tabs = ref<TabItem[]>([
  {
    id: "local",
    label: "本地",
  },
  {
    id: "github",
    label: "GitHub",
  },
]);
</script>

<template>
  <Button icon="i-mdi:download" @click="handleClick">{{
    $t("导入插件")
  }}</Button>
  <Modal v-model:is-open="isOpen">
    <div class="p-8 rounded-md bg-highlight flex flex-col gap-2">
      <Tabs :tabs class="min-h-128 min-w-128">
        <template #local>
          <PluginImportLocal />
        </template>
        <template #github>
          <PluginImportGitHub />
        </template>
      </Tabs>
    </div>
  </Modal>
</template>
