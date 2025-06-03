<script setup lang="ts">
import { Memory } from "@cat/shared";
import TableRow from "@/app/components/table/TableRow.vue";
import TableCell from "@/app/components/table/TableCell.vue";
import { computed, onMounted, watch } from "vue";
import { navigate } from "vike/client/router";
import { useToastStore } from "../stores/toast";
import { useMemoryStore } from "../stores/memory";
import { storeToRefs } from "pinia";

const { info, trpcWarn } = useToastStore();

const { updateMemoryItemAmount } = useMemoryStore();
const { memoryItemAmounts } = storeToRefs(useMemoryStore());

const memoryItemAmount = computed(() => {
  return memoryItemAmounts.value.get(props.memory.id) ?? 0;
});

const props = defineProps<{
  memory: Memory;
}>();

const handleCheck = () => {
  navigate(`/memory/${props.memory.id}`);
};

watch(
  () => props.memory.id,
  (to) => updateMemoryItemAmount(to),
);

onMounted(() => {
  updateMemoryItemAmount(props.memory.id);
});
</script>

<template>
  <TableRow
    class="cursor-pointer hover:bg-highlight-darker"
    @click="handleCheck"
  >
    <TableCell>{{ memory.name }}</TableCell>
    <TableCell>{{ memory.description }}</TableCell>
    <TableCell>{{ memoryItemAmount }}</TableCell>
  </TableRow>
</template>
