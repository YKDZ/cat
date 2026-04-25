<script setup lang="ts">
import type { Language } from "@cat/shared";
import type { Project } from "@cat/shared";

import { Table, TableBody } from "@cat/ui";

import LanguageTableRow from "./LanguageTableRow.vue";

defineProps<{
  project: Pick<Project, "id">;
  languages: Language[];
}>();
</script>

<template>
  <Table>
    <TableBody>
      <LanguageTableRow
        v-for="language in languages"
        :key="language.id"
        :language="language"
        :project
      />
    </TableBody>
  </Table>
</template>
