<script setup lang="ts">
import { useDocumentStore } from "@/app/stores/document";
import { useProjectStore } from "@/app/stores/project";
import { trpc } from "@/server/trpc/client";
import { Project } from "@cat/shared";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { onMounted, reactive, ref, watch } from "vue";

const ctx = usePageContext();

const project = ref<Project | null>(null);
const languageId = ref<string>(ctx.routeParams.languageId);
const { fetchTranslatedElementAmount } = useDocumentStore();

type AmountPair = {
  translated: number;
  approved: number;
};
const amountMap = reactive(new Map<string, AmountPair>());

watch(
  () => ctx.routeParams.projectId,
  () => {
    project.value =
      useProjectStore().projects.find(
        (project) => project.id === ctx.routeParams.projectId,
      ) ?? null;
  },
  { immediate: true },
);

watch(
  () => ctx.routeParams.languageId,
  () => {
    languageId.value = ctx.routeParams.languageId;
  },
  { immediate: true },
);

const exportFile = (documentId: string) => {
  trpc.document.exportFinal.query({
    id: documentId,
    languageId: languageId.value,
  });
};

onMounted(() => {
  for (const document of project.value?.Documents ?? []) {
    fetchTranslatedElementAmount(document.id, languageId.value).then(
      (translated) => {
        amountMap.set(document.id, { translated, approved: 0 });
      },
    );
  }
});
</script>

<template>
  <ul v-if="project">
    <li v-for="document in project.Documents" :key="document.id">
      <button
        class="hover:bg-highlight-darker"
        @click="
          navigate(
            `/editor/${document.id}/${project.SourceLanguage?.id}-${languageId}/auto`,
          )
        "
      >
        {{ document.File?.originName }}
      </button>
      <button @click="exportFile(document.id)">下载译文</button>
      <span>{{ amountMap.get(document.id)?.translated }}</span>
    </li>
  </ul>
</template>
