<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";

import { TableCell, TableRow } from "@cat/ui";
import { navigate } from "vike/client/router";

import { formatDate } from "@/app/utils/format";

const props = defineProps<{
  glossary: Pick<
    Glossary,
    "id" | "name" | "description" | "createdAt" | "updatedAt"
  >;
}>();

const handleCheck = async () => {
  await navigate(`/glossary/${props.glossary.id}`);
};
</script>

<template>
  <TableRow class="cursor-pointer hover:bg-background" @click="handleCheck">
    <TableCell class="font-medium">{{ glossary.name }}</TableCell>
    <TableCell class="text-gray-600">{{
      glossary.description || "—"
    }}</TableCell>
    <TableCell class="text-gray-500">{{
      formatDate(glossary.createdAt)
    }}</TableCell>
    <TableCell class="text-gray-500">{{
      formatDate(glossary.updatedAt)
    }}</TableCell>
  </TableRow>
</template>
