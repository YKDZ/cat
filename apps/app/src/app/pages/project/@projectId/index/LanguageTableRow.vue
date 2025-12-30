<script setup lang="ts">
import type { Language } from "@cat/shared/schema/drizzle/misc";
import { navigate } from "vike/client/router";
import type { Project } from "@cat/shared/schema/drizzle/project";
import TranslationProgress from "./TranslationProgress.vue";
import { TableRow, TableCell } from "@/app/components/ui/table";
import { useI18n } from "vue-i18n";

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
    <TableCell class="pl-6 w-full font-medium text-lg">{{
      t(language.id)
    }}</TableCell>
    <TableCell>
      <TranslationProgress :language="language" :project="project" />
    </TableCell>
  </TableRow>
</template>
