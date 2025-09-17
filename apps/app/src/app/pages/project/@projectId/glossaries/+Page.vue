<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/prisma/glossary";
import { inject, onMounted, ref, watch } from "vue";
import ProjectGlossaryLinkerBtn from "@/app/components/ProjectGlossaryLinkerBtn.vue";
import ProjectGlossaryList from "@/app/components/ProjectGlossaryList.vue";
import { trpc } from "@/server/trpc/client.ts";
import { projectKey } from "@/app/utils/provide.ts";

const project = inject(projectKey);

const glossaries = ref<Glossary[]>([]);

const updateGlossaries = async () => {
  if (!project) return;

  await trpc.glossary.listProjectOwned
    .query({
      projectId: project.id,
    })
    .then((glo) => (glossaries.value = glo));
};

watch(project ?? {}, updateGlossaries);

onMounted(updateGlossaries);
</script>

<template>
  <div class="my-3 flex items-center justify-between">
    <div></div>
    <div>
      <ProjectGlossaryLinkerBtn class="self-end" @link="updateGlossaries" />
    </div>
  </div>
  <ProjectGlossaryList v-model="glossaries" />
</template>
