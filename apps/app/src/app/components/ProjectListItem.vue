<script setup lang="ts">
import type { Project } from "@cat/shared/schema/prisma/project";
import { navigate } from "vike/client/router";
import TableCell from "@/app/components/table/TableCell.vue";
import TableRow from "@/app/components/table/TableRow.vue";

const props = defineProps<{
  project: Project;
}>();

const handleCheck = async () => {
  await navigate(`/project/${props.project.id}`);
};
</script>

<template>
  <TableRow
    class="cursor-pointer hover:bg-highlight-darker"
    @click="handleCheck"
  >
    <TableCell>{{ project.name }}</TableCell>
    <TableCell
      ><div class="flex flex-col">
        <span class="text-sm"
          ><span class="font-bold">{{ project.Documents?.length }}</span>
          个文档</span
        >
        <span class="text-sm"
          ><span class="font-bold">{{ project.TargetLanguages?.length }}</span>
          个语言</span
        >
      </div></TableCell
    >
  </TableRow>
</template>
