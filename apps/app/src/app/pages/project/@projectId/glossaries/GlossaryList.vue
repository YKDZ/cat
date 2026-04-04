<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";
import type { Project } from "@cat/shared/schema/drizzle/project";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@cat/ui";
import { useI18n } from "vue-i18n";

import GlossaryListItem from "./GlossaryListItem.vue";

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
