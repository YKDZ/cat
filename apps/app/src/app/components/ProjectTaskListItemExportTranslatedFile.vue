<script setup lang="ts">
import type { Task } from "@cat/shared";
import TableRow from "./table/TableRow.vue";
import TableCell from "./table/TableCell.vue";
import Button from "./Button.vue";
import { z } from "zod/v4";
import { trpc } from "@/server/trpc/client";
import { computed, ref } from "vue";
import { useToastStore } from "../stores/toast";
import { useLanguageStore } from "../stores/language";
import { useDateFormat } from "@vueuse/core";

const props = defineProps<{
  task: Task;
}>();

const { trpcWarn } = useToastStore();

const downloadAEl = ref<HTMLAnchorElement>();

const metaSchema = z.object({
  projectId: z.cuid2(),
  documentId: z.cuid2(),
  languageId: z.string(),
});

const meta = computed(() => {
  return metaSchema.parse(props.task.meta);
});

const language = computed(() => {
  return (
    useLanguageStore().languages.find(
      (language) => language.id === meta.value.languageId,
    ) ?? null
  );
});

const handleDownload = async () => {
  await trpc.document.downloadTranslatedFile
    .query({
      taskId: props.task.id,
    })
    .then(({ url, fileName }) => {
      if (!downloadAEl.value) return;

      downloadAEl.value.href = url;
      downloadAEl.value.download = fileName;
      downloadAEl.value.click();
    })
    .catch(trpcWarn);
};
</script>

<template>
  <TableRow>
    <TableCell class="text-ellipsis">{{ task.id }}</TableCell>
    <TableCell class="text-ellipsis">{{ task.type }}</TableCell>
    <TableCell class="text-ellipsis">{{ meta.documentId }}</TableCell>
    <TableCell>{{
      useDateFormat(task.createdAt, "YYYY-MM-DD HH:mm:ss")
    }}</TableCell>
    <TableCell v-if="language">{{ language?.name }}</TableCell>
    <TableCell>
      <Button no-text icon="i-mdi:download" @click.stop="handleDownload" />
      <a ref="downloadAEl" target="_blank" class="hidden" /> </TableCell
  ></TableRow>
</template>
