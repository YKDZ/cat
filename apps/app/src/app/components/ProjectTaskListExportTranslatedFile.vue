<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import type { Task } from "@cat/shared";
import { onMounted, ref } from "vue";
import ProjectTaskListItemExportTranslatedFile from "./ProjectTaskListItemExportTranslatedFile.vue";
import Table from "./table/Table.vue";
import TableBody from "./table/TableBody.vue";

const props = defineProps<{
  projectId: string;
}>();

const tasks = ref<Task[]>([]);

const updateTasks = async () => {
  await trpc.task.listProjectExportTranslatedFileTask
    .query({
      projectId: props.projectId,
    })
    .then((ts) => (tasks.value = ts));
};

onMounted(() => {
  updateTasks();
});
</script>

<template>
  <Table>
    <TableBody>
      <ProjectTaskListItemExportTranslatedFile
        v-for="task in tasks"
        :key="task.id"
        :task
      />
    </TableBody>
  </Table>
</template>
