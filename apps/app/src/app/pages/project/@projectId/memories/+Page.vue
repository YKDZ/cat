<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/prisma/memory";
import { onMounted, ref, watch } from "vue";
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import ProjectMemoryList from "@/app/components/ProjectMemoryList.vue";
import ProjectMemoryLinkerBtn from "@/app/components/ProjectMemoryLinkerBtn.vue";
import { trpc } from "@/server/trpc/client.ts";

const { project } = useData<Data>();
const memories = ref<Memory[]>([]);

const updateMemories = async () => {
  if (!project) return;

  await trpc.memory.listProjectOwned
    .query({
      projectId: project.id,
    })
    .then((mems) => (memories.value = mems));
};

watch(project ?? {}, updateMemories);

onMounted(updateMemories);
</script>

<template>
  <div class="my-3 flex items-center justify-between">
    <div></div>
    <div>
      <ProjectMemoryLinkerBtn class="self-end" @link="updateMemories" />
    </div>
  </div>
  <ProjectMemoryList v-model="memories" />
</template>
