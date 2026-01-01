<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";
import ListItem from "./ListItem.vue";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";

defineProps<{
  projects: Pick<Project, "id" | "name">[];
}>();
</script>

<template>
  <Table>
    <TableBody>
      <ListItem v-for="project in projects" :key="project.id" :project />
    </TableBody>
  </Table>
</template>
