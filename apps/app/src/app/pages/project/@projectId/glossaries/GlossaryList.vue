<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@cat/app-ui";
import GlossaryListItem from "./GlossaryListItem.vue";
import type { Project } from "@cat/shared/schema/drizzle/project";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

defineProps<{
  glossaries: Glossary[];
  project: Project;
}>();
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{{ t("名称") }}</TableHead>
        <TableHead>{{ t("描述") }}</TableHead>
        <TableHead>{{ t("术语数量") }}</TableHead>
        <TableHead>{{ t("操作") }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <GlossaryListItem
        v-for="glossary in glossaries"
        :key="glossary.id"
        :glossary
        :project
      />
    </TableBody>
  </Table>
</template>
