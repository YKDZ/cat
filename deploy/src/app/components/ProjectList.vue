<script setup lang="ts">
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import { Project } from "@cat/shared";
import ProjectListItem from "./ProjectListItem.vue";

const projects = defineModel<Project[]>();
</script>

<template>
  <Table>
    <TableBody>
      <ProjectListItem v-for="project in projects" :key="project.id" :project />
    </TableBody>
  </Table>
</template>
