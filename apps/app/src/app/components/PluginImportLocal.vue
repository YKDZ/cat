<script setup lang="ts">
import { ref } from "vue";
import Button from "./Button.vue";
import Input from "./Input.vue";
import InputLabel from "./InputLabel.vue";
import { trpc } from "@/server/trpc/client";
import { useToastStore } from "../stores/toast";
import { useI18n } from "vue-i18n";

const { info, trpcWarn } = useToastStore();
const { t } = useI18n();

const origin = ref({
  id: "json-file-handler",
});

const handleImport = () => {
  trpc.plugin.importFromLocal
    .mutate({ ...origin.value })
    .then(() => {
      info(t("开始在后台导入插件"));
    })
    .catch(trpcWarn);
};
</script>

<template>
  <h3 class="text-lg font-bold">{{ $t("从本地 plugins 文件夹导入插件") }}</h3>
  <div class="flex flex-col gap-1">
    <InputLabel>{{ $t("插件目录名称") }}</InputLabel>
    <Input v-model="origin.id" icon="i-mdi:folder" full-width type="text" />
  </div>
  <Button full-width icon="i-mdi:download" @click="handleImport">{{
    $t("导入插件")
  }}</Button>
</template>
