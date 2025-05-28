<script setup lang="ts">
import { Glossary } from "@cat/shared";
import TableRow from "@/app/components/table/TableRow.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import { computed, onMounted, watch } from "vue";
import { navigate } from "vike/client/router";
import { useToastStore } from "../stores/toast";
import { storeToRefs } from "pinia";
import { useGlossaryStore } from "../stores/glossary";

const { info, trpcWarn } = useToastStore();

const { termAmounts } = storeToRefs(useGlossaryStore());
const { updateTermAmount } = useGlossaryStore();

const termAmount = computed(() => {
  return termAmounts.value.get(props.glossary.id) ?? 0;
});

const props = defineProps<{
  glossary: Glossary;
}>();

const handleCheck = () => {
  navigate(`/glossary/${props.glossary.id}`);
};

watch(
  () => props.glossary.id,
  (to) => updateTermAmount(to),
);

onMounted(() => {
  updateTermAmount(props.glossary.id);
});
</script>

<template>
  <TableRow
    class="cursor-pointer hover:bg-highlight-darker"
    @click="handleCheck"
  >
    <TableCell>{{ glossary.name }}</TableCell>
    <TableCell>{{ glossary.description }}</TableCell>
    <TableCell>{{ termAmount }}</TableCell>
  </TableRow>
</template>
