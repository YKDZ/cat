<script setup lang="ts">
import Button from "@/app/components/Button.vue";
import ProjectLanguageDocumentAutoApproveBtn from "@/app/components/ProjectLanguageDocumentAutoApproveBtn.vue";
import ProjectLanguageDocumentList from "@/app/components/ProjectLanguageDocumentList.vue";
import ProjectTranslationProgress from "@/app/components/ProjectTranslationProgress.vue";
import { useLanguageStore } from "@/app/stores/language";
import { languageKey, projectKey } from "@/app/utils/provide";
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { computed, inject, onMounted, provide, ref, watch } from "vue";

const ctx = usePageContext();

const project = inject(projectKey);
const languageId = ref<string>(ctx.routeParams.languageId);
const { update } = useLanguageStore();
const { languages } = storeToRefs(useLanguageStore());

const language = computed(() => {
  return (
    languages.value.find((language) => language.id === languageId.value) ?? null
  );
});

provide(languageKey, language);

const handleBack = () => {
  if (!project || !project.value) return;
  navigate(`/project/${project.value.id}`);
};

watch(
  () => ctx.routeParams.languageId,
  () => {
    languageId.value = ctx.routeParams.languageId;
  },
  { immediate: true },
);

onMounted(update);
</script>

<template>
  <div class="flex flex-col w-full">
    <div class="py-4 flex gap-4 w-full items-center justify-between">
      <div class="flex gap-4 items-center">
        <Button icon="i-mdi:arrow-left" no-text @click="handleBack" />
        <h3 v-if="language" class="text-xl font-bold">{{ language.name }}</h3>
      </div>
      <ProjectTranslationProgress
        v-if="project"
        :language-id="languageId"
        :project-id="project.id"
      />
    </div>
    <ProjectLanguageDocumentList
      v-if="project && project.Documents"
      :documents="project.Documents"
    />
  </div>
</template>
