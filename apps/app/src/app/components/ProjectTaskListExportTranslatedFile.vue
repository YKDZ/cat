<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import type { Task } from "@cat/shared";
import { computed, onMounted, ref } from "vue";
import TaskTable from "./TaskTable.vue";
import { useLanguageStore } from "../stores/language";
import z from "zod";
import { useToastStore } from "../stores/toast";
import type { Cell } from "@tanstack/vue-table";
import HButton from "./headless/HButton.vue";

const props = defineProps<{
  projectId: string;
}>();

const tasks = ref<Task[]>([]);

const updateTasks = async () => {
  await trpc.task.query
    .query({
      type: "export_translated_file",
      meta: [
        {
          path: ["projectId"],
          value: props.projectId,
        },
      ],
    })
    .then((ts) => (tasks.value = ts));
};

const { trpcWarn } = useToastStore();

const downloadAEl = ref<HTMLAnchorElement>();

const MetaSchema = z.object({
  projectId: z.ulid(),
  documentId: z.ulid(),
  languageId: z.string(),
});

type Meta = z.infer<typeof MetaSchema>;

const meta = (cell: Cell<Task, Meta>) => {
  return cell.getValue();
};

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

onMounted(() => {
  updateTasks();
});
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
