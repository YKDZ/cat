<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useToastStore } from "../stores/toast";
import { orpc } from "@/server/orpc";
import { Button } from "@/app/components/ui/button";
import type { ScopeType } from "@cat/shared/schema/drizzle/enum";

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
