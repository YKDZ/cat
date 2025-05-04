<script setup lang="ts">
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import TableHead from "@/app/components/table/TableHead.vue";
import TableHeader from "@/app/components/table/TableHeader.vue";
import TableRow from "@/app/components/table/TableRow.vue";
import { useProjectStore } from "@/app/stores/project";
import { storeToRefs } from "pinia";
import { navigate } from "vike/client/router";

const { projects } = storeToRefs(useProjectStore());
</script>

<template>
  <Table>
    <TableHeader>
      <TableHead>我参与的项目</TableHead>
    </TableHeader>
    <TableBody>
      <TableRow
        v-for="project in projects"
        :key="project.id"
        class="cursor-pointer hover:bg-highlight-darker"
        @click="navigate(`/project/${project.id}`)"
      >
        <TableCell>{{ project.name }}</TableCell>
        <TableCell
          ><div class="flex flex-col">
            <span class="text-sm"
              ><span class="font-bold">{{ project.Documents?.length }}</span>
              个文档</span
            >
            <span class="text-sm"
              ><span class="font-bold">{{
                project.TargetLanguages?.length
              }}</span>
              个语言</span
            >
          </div></TableCell
        >
      </TableRow>
    </TableBody>
  </Table>
</template>
