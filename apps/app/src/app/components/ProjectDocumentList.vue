<script setup lang="ts">
import type { Document } from "@cat/shared";
import ProjectDocumentListItem from "./ProjectDocumentListItem.vue";
import Table from "./table/Table.vue";
import TableBody from "./table/TableBody.vue";

const props = defineProps<{
  documents: Document[];
}>();

const emits = defineEmits<{
  (e: "delete", id: string): void;
}>();
</script>

<template>
  <Table>
    <TableBody>
      <ProjectDocumentListItem
        v-for="document in documents"
        :key="document.id"
        :document
        @delete="emits('delete', document.id)"
      />
    </TableBody>
  </Table>
</template>
