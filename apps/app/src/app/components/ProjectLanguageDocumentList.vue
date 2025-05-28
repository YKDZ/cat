<script setup lang="ts">
import { Document } from "@cat/shared";
import Table from "./table/Table.vue";
import TableBody from "./table/TableBody.vue";
import ProjectLanguageDocumentListItem from "./ProjectLanguageDocumentListItem.vue";

const props = defineProps<{
  documents: Document[];
}>();
</script>

<template>
  <Table>
    <TableBody>
      <ProjectLanguageDocumentListItem
        v-for="document in documents"
        :key="document.id"
        :document
      />
    </TableBody>
  </Table>
</template>
