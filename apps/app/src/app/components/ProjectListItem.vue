<script setup lang="ts">
import TableCell from "@/app/components/table/TableCell.vue";
import TableRow from "@/app/components/table/TableRow.vue";
import type { Project } from "@cat/shared";
import { navigate } from "vike/client/router";

const props = defineProps<{
  project: Project;
}>();

const handleCheck = () => {
  navigate(`/project/${props.project.id}`);
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
