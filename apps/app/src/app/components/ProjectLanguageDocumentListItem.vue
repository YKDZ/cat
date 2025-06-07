<script setup lang="ts">
import type { Document } from "@cat/shared";
import { navigate } from "vike/client/router";
import { inject } from "vue";
import { languageKey, projectKey } from "../utils/provide";
import DocumentTranslationProgress from "./DocumentTranslationProgress.vue";
import TableCell from "./table/TableCell.vue";
import TableRow from "./table/TableRow.vue";

const props = defineProps<{
  document: Document;
}>();

const project = inject(projectKey);
const language = inject(languageKey);

const handleEdit = () => {
  if (!project || !project.value || !language || !language.value) return;

  navigate(
    `/editor/${props.document.id}/${project.value.SourceLanguage?.id}-${language.value.id}/auto`,
  );
};
</script>

<template>
  <TableRow
    class="cursor-pointer hover:bg-highlight-darker"
    @click="handleEdit"
  >
    <TableCell>{{ document.File?.originName }}</TableCell>
    <TableCell>
      <DocumentTranslationProgress
        v-if="language"
        :document-id="document.id"
        :language-id="language.id"
    /></TableCell>
  </TableRow>
</template>
