<script setup lang="ts">
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import { inject } from "vue";
import { projectKey } from "../utils/provide";
import ProjectLanguageListItem from "./ProjectLanguageListItem.vue";

const project = inject(projectKey);
</script>

<template>
  <Table>
    <TableBody v-if="project">
      <ProjectLanguageListItem
        v-for="language in project.TargetLanguages"
        :key="language.id"
        :language="language"
      />
    </TableBody>
  </Table>
</template>
