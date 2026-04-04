<script setup lang="ts">
import type { Language } from "@cat/shared/schema/drizzle/misc";
import type { Project } from "@cat/shared/schema/drizzle/project";

import { TableRow, TableCell } from "@cat/ui";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";

import TranslationProgress from "./TranslationProgress.vue";

const props = defineProps<{
  language: Language;
  project: Pick<Project, "id">;
}>();

const { t } = useI18n();
</script>

<template>
  <TableRow
    v-if="project"
    :key="language.id"
    class="cursor-pointer hover:bg-background"
    @click="navigate(`/project/${props.project.id}/${props.language.id}`)"
  >
    <TableCell class="w-full pl-6 text-lg font-medium">{{
      t(language.id)
    }}</TableCell>
    <TableCell>
      <TranslationProgress :language="language" :project="project" />
    </TableCell>
  </TableRow>
</template>
