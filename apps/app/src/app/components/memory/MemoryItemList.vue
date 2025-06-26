<script setup lang="ts">
import { inject, onMounted, ref } from "vue";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import type { MemoryItem } from "@cat/shared";
import { memoryKey } from "@/app/utils/provide";
import { trpc } from "@/server/trpc/client";
import type { TermListFilterOptions } from ".";
import MemoryItemListFilter from "./MemoryItemListFilter.vue";
import MemoryItemListItem from "./MemoryItemListItem.vue";

const items = ref<MemoryItem[]>([]);

const memory = inject(memoryKey);

const updateTerms = async (options: TermListFilterOptions) => {
  if (!memory || !memory.value) return;

  await trpc.memory.queryItems
    .query({
      memoryId: memory.value.id,
      ...options,
    })
    .then((is) => (items.value = is));
};

const handleDeleteTerm = (id: number) => {
  items.value = items.value.filter((item) => item.id !== id);
};

onMounted(() =>
  updateTerms({ sourceLanguageId: null, translationLanguageId: null }),
);
</script>

<template>
  <div class="flex justify-between">
    <MemoryItemListFilter @filter="updateTerms" />
  </div>
  <Table>
    <TableBody>
      <MemoryItemListItem
        v-for="item in items"
        :key="item.id"
        :item
        @delete="handleDeleteTerm(item.id)"
      />
    </TableBody>
  </Table>
</template>
