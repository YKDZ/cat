import { trpc } from "@/server/trpc/client";
import type { Memory } from "@cat/shared";
import { defineStore } from "pinia";
import { reactive, ref } from "vue";

export const useMemoryStore = defineStore("memory", () => {
  const memories = ref<Memory[]>([]);
  const memoryItemAmounts = reactive(new Map<string, number>());

  const upsertMemories = (...memoriesToAdd: Memory[]) => {
    for (const memory of memoriesToAdd) {
      if (!memory) continue;

      const currentIndex = memories.value.findIndex(
        (p: Memory) => p.id === memory.id,
      );
      if (currentIndex === -1) {
        memories.value.push(memory);
      } else {
        memories.value.splice(currentIndex, 1, memory);
      }
    }
  };

  const fetchMemory = (id: string) => {
    trpc.memory.query.query({ id }).then((memory) => {
      if (memory === null) return;
      upsertMemories(memory);
    });
  };

  const updateMemoryItemAmount = async (id: string) => {
    await trpc.memory.countMemoryItem
      .query({
        id,
      })
      .then((amount) => {
        memoryItemAmounts.set(id, amount);
      });
  };

  return {
    memories,
    memoryItemAmounts,
    fetchMemory,
    updateMemoryItemAmount,
    upsertMemories,
  };
});
