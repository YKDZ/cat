<script setup lang="ts">
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/app/components/ui/table";
import { inject, onMounted, ref, watch } from "vue";
import { onRequestTermPair, type PairData } from "./PairTable.telefunc";
import { useInjectionKey } from "@/app/utils/provide";
import type { Data } from "./+data.server";
import { logger } from "@cat/shared/utils";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import { navigate } from "vike/client/router";

const glossary = inject(useInjectionKey<Data>()("glossary"))!;

const terms = ref<PairData[]>([]);
const pageIndex = ref(0);
const pageSize = ref(10);
const sourceLanguageId = ref("zh-Hans");
const targetLanguageId = ref("en");

onMounted(() => {
  onRequestTermPair(
    glossary.id,
    sourceLanguageId.value,
    targetLanguageId.value,
    pageIndex.value,
    pageSize.value,
  )
    .then((data) => {
      terms.value = data;
    })
    .catch((err) => {
      logger.error("WEB", { msg: "Failed to fetch term pairs:" }, err);
    });
});

watch([sourceLanguageId, targetLanguageId, pageIndex], () => {
  onRequestTermPair(
    glossary.id,
    sourceLanguageId.value,
    targetLanguageId.value,
    pageIndex.value,
    pageSize.value,
  )
    .then((data) => {
      terms.value = data;
    })
    .catch((err) => {
      logger.error("WEB", { msg: "Failed to fetch term pairs:" }, err);
    });
});
</script>

<template>
  <LanguagePicker v-model="sourceLanguageId" />
  <LanguagePicker v-model="targetLanguageId" />
  <Table>
    <TableBody>
      <TableRow
        v-for="term in terms"
        :key="term.conceptId"
        @click="navigate(`/glossary/${glossary.id}/concept/${term.conceptId}`)"
      >
        <TableCell>{{ term.source.text }}</TableCell>
        <TableCell>{{ term.target.text }}</TableCell>
        <TableCell>{{ term.definition }}</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
