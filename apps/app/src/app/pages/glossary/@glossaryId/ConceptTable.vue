<script setup lang="ts">
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/app/components/ui/table";
import { inject, onMounted, ref } from "vue";
import { onRequestConcept, type ConceptData } from "./ConceptTable.telefunc";
import { useInjectionKey } from "@/app/utils/provide";
import type { Data } from "./+data.server";
import { logger } from "@cat/shared/utils";
import { navigate } from "vike/client/router";

const glossary = inject(useInjectionKey<Data>()("glossary"))!;

const concepts = ref<ConceptData[]>([]);
const pageIndex = ref(0);
const pageSize = ref(10);

onMounted(() => {
  onRequestConcept(glossary.id, pageIndex.value, pageSize.value)
    .then((data) => {
      concepts.value = data;
    })
    .catch((err) => {
      logger.error("WEB", { msg: "Failed to fetch concepts:" }, err);
    });
});
</script>

<template>
  <Table>
    <TableBody>
      <TableRow
        v-for="concept in concepts"
        :key="concept.id"
        @click="navigate(`/glossary/${glossary.id}/concept/${concept.id}`)"
      >
        <TableCell>{{ concept.subject }}</TableCell>
        <TableCell>{{ concept.definition }}</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
