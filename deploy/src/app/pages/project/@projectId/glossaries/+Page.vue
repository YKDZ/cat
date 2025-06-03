<script setup lang="ts">
import ProjectGlossaryLinkerBtn from "@/app/components/ProjectGlossaryLinkerBtn.vue";
import ProjectGlossaryList from "@/app/components/ProjectGlossaryList.vue";
import { projectKey } from "@/app/utils/provide";
import { trpc } from "@/server/trpc/client";
import { Glossary } from "@cat/shared";
import { inject, onMounted, ref, watch } from "vue";

const project = inject(projectKey);

const glossaries = ref<Glossary[]>([]);

const updateGlossaries = async () => {
  if (!project || !project.value) return;

  await trpc.glossary.listProjectOwned
    .query({
      projectId: project.value.id,
    })
    .then((glos) => (glossaries.value = glos));
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
