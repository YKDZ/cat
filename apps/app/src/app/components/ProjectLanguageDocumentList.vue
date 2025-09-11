<script setup lang="ts">
import type { Document } from "@cat/shared/schema/prisma/document";
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
