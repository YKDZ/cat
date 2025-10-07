<script setup lang="ts">
import type { Task } from "@cat/shared/schema/drizzle/misc";
import { ref } from "vue";
import * as z from "zod/v4";
import type { Cell } from "@tanstack/vue-table";
import { trpc } from "@cat/app-api/trpc/client";
import TaskTable from "./TaskTable.vue";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "@/app/stores/toast.ts";

defineProps<{
  tasks: Task[];
}>();

const { trpcWarn } = useToastStore();

const downloadAEl = ref<HTMLAnchorElement>();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MetaSchema = z.object({
  projectId: z.uuidv7(),
  documentId: z.uuidv7(),
  languageId: z.string(),
});

type Meta = z.infer<typeof MetaSchema>;

const task = (cell: Cell<Task, Meta>) => {
  return cell.row.original;
};

const handleDownload = async (cell: Cell<Task, Meta>) => {
  if (task(cell).status !== "completed") return;

  await trpc.document.downloadTranslatedFile
    .query({
      taskId: task(cell).id,
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
  <TaskTable v-slot="{ cell }" :data="tasks">
    <HButton
      :disabled="task(cell).status !== 'completed'"
      :classes="{
        base: 'btn btn-md btn-base btn-square',
      }"
      icon="i-mdi:download"
      @click.stop="handleDownload(cell)"
    />
    <a ref="downloadAEl" target="_blank" class="hidden" />
  </TaskTable>
</template>
