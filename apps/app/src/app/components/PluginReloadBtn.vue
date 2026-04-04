<script setup lang="ts">
import type { ScopeType } from "@cat/shared/schema/enum";

import { Button } from "@cat/ui";
import { useI18n } from "vue-i18n";

import { orpc } from "@/app/rpc/orpc";

import { useToastStore } from "../stores/toast";

const { t } = useI18n();

const props = defineProps<{
  scopeType: ScopeType;
  scopeId: string;
}>();

const { info, rpcWarn } = useToastStore();

const handleReload = async () => {
  await orpc.plugin
    .reload({ scopeType: props.scopeType, scopeId: props.scopeId })
    .then(async () => {
      info(`成功重载所有插件`);
    })
    .catch(rpcWarn);
};
</script>

<template>
  <Button @click="handleReload"
    ><div class="icon-[mdi--reload] size-4" />
    {{ t("重载插件") }}</Button
  >
</template>
