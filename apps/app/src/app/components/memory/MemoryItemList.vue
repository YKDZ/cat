<script setup lang="ts">
import { inject, onMounted, ref } from "vue";
import type { MemoryItem } from "@cat/shared/schema/prisma/memory";
import MemoryItemListFilter from "./MemoryItemListFilter.vue";
import MemoryItemListItem from "./MemoryItemListItem.vue";
import type { TermListFilterOptions } from "./index.ts";
import Table from "@/app/components/table/Table.vue";
import TableBody from "@/app/components/table/TableBody.vue";
import { memoryKey } from "@/app/utils/provide.ts";
import { trpc } from "@cat/app-api/trpc/client";

const items = ref<MemoryItem[]>([]);

const memory = inject(memoryKey);

const updateTerms = async (options: TermListFilterOptions) => {
  if (!memory) return;

  await trpc.memory.queryItems
    .query({
      memoryId: memory.id,
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
