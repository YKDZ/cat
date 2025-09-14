<script setup lang="ts">
import { inject } from "vue";
import ProjectLanguageListItem from "./ProjectLanguageListItem.vue";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import { projectKey } from "@/app/utils/provide.ts";

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
