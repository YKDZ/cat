<script setup lang="ts">
import type { Glossary } from "@cat/shared";
import type { Project } from "@cat/shared";
import { TableRow, TableCell } from "@cat/ui";
import { Button } from "@cat/ui";
import { RefreshCw } from "@lucide/vue";
import { navigate } from "vike/client/router";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import TextTooltip from "#/components/tooltip/TextTooltip.vue";
import { orpc } from "#/rpc/orpc.ts";
import { useToastStore } from "#/stores/toast.ts";
import { watchClient } from "#/utils/vue.ts";

const { t } = useI18n();
const { info, rpcWarn } = useToastStore();

const termAmount = ref(-1);
const rebuildingRecall = ref(false);

const props = defineProps<{
  glossary: Glossary;
  project: Project;
}>();

const emits = defineEmits<{
  (e: "unlink"): void;
}>();

const updateTermAmount = async () => {
  await orpc.glossary
    .countTerm({
      glossaryId: props.glossary.id,
    })
    .then((amount) => (termAmount.value = amount));
};

const handleCheck = async () => {
  await navigate(`/glossary/${props.glossary.id}`);
};

const handleLinkClick = async (event: MouseEvent) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  await handleCheck();
};

const handleUnlink = async () => {
  await orpc.project
    .unlinkGlossary({
      projectId: props.project.id,
      glossaryIds: [props.glossary.id],
    })
    .then(() => {
      emits("unlink");
      info(`成功将术语库 ${props.glossary.name} 从项目中移除`);
    })
    .catch(rpcWarn);
};

const handleRebuildRecall = async () => {
  if (rebuildingRecall.value) return;
  rebuildingRecall.value = true;
  await orpc.glossary
    .rebuildRecall({
      glossaryId: props.glossary.id,
      projectId: props.project.id,
    })
    .then(async (result) => {
      if (result.status === "NO_WORK") {
        info(t("术语库没有可重建的召回数据"));
        return;
      }
      await navigate(
        `/project/${props.project.id}/tasks?taskId=${result.taskId}`,
      );
    })
    .catch(rpcWarn)
    .finally(() => {
      rebuildingRecall.value = false;
    });
};

watchClient(() => props.glossary, updateTermAmount);

onMounted(updateTermAmount);
</script>

<template>
  <TableRow class="cursor-pointer hover:bg-background" @click="handleCheck">
    <TableCell>
      <a :href="`/glossary/${glossary.id}`" @click.stop="handleLinkClick">
        {{ glossary.name }}
      </a>
    </TableCell>
    <TableCell>{{ glossary.description }}</TableCell>
    <TableCell>{{ termAmount }}</TableCell>
    <TableCell class="space-x-1">
      <TextTooltip :tooltip="t('重建术语召回')">
        <Button
          size="icon"
          :aria-label="t('重建术语召回')"
          :disabled="rebuildingRecall"
          :title="t('重建术语召回')"
          @click.stop="handleRebuildRecall"
        >
          <RefreshCw
            class="size-4"
            :class="{ 'animate-spin': rebuildingRecall }"
          />
        </Button>
      </TextTooltip>
      <Button
        size="icon"
        :disabled="rebuildingRecall"
        @click.stop="handleUnlink"
        ><div class="icon-[mdi--link-off] size-4"
      /></Button>
    </TableCell>
  </TableRow>
</template>
