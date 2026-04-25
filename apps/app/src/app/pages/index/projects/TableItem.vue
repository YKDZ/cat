<script setup lang="ts">
import type { Project } from "@cat/shared";

import { TableCell, TableRow } from "@cat/ui";
import { navigate } from "vike/client/router";

import { formatDate } from "@/app/utils/format";

const props = defineProps<{
  project: Pick<
    Project,
    "id" | "name" | "description" | "createdAt" | "updatedAt"
  >;
}>();

const handleCheck = async () => {
  await navigate(`/project/${props.project.id}`);
};
</script>

<template>
  <TableRow class="cursor-pointer hover:bg-background" @click="handleCheck">
    <TableCell class="font-medium">{{ project.name }}</TableCell>
    <TableCell class="text-gray-600">{{
      project.description || "—"
    }}</TableCell>
    <TableCell class="text-gray-500">{{
      formatDate(project.createdAt)
    }}</TableCell>
    <TableCell class="text-gray-500">{{
      formatDate(project.updatedAt)
    }}</TableCell>
  </TableRow>
</template>
