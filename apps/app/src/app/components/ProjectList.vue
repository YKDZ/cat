<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";
import ProjectListItem from "./ProjectListItem.vue";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";

defineProps<{
  projects: Project[];
}>();
</script>

<template>
  <Table>
    <TableBody>
      <ProjectListItem v-for="project in projects" :key="project.id" :project />
    </TableBody>
  </Table>
</template>
