<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import type { DocumentVersion } from "@cat/shared/schema/drizzle/document";
import { useDateFormat } from "@vueuse/core";
import { trpc } from "@cat/app-api/trpc/client";
import DiffBox from "./diff/DiffBox.vue";
import Picker from "./picker/Picker.vue";
import type { PickerOption } from "./picker/index.ts";

const props = defineProps<{
  documentId: string;
}>();

const versions = shallowRef<DocumentVersion[]>([]);
const oldVersionId = ref(-1);
const nowVersionId = ref(-1);
const oldContent = ref<string | null>(null);
const nowContent = ref<string | null>(null);

const loadContent = async (documentVersionId: number) => {
  return await trpc.document.getDocumentContent.query({
    documentId: props.documentId,
    documentVersionId,
  });
};

const loadVersions = async () => {
  versions.value = await trpc.document.getDocumentVersions.query({
    documentId: props.documentId,
  });
  const latest = versions.value[0];
  if (!latest) return;
  nowVersionId.value = latest.id;
  oldVersionId.value = latest.id;
};

const versionOptions = computed(() => {
  return versions.value.map(
    ({ createdAt, id }) =>
      ({
        content: useDateFormat(createdAt, "YYYY-MM-DD HH:mm:ss").value,
        value: id,
      }) satisfies PickerOption,
  );
});

watch(
  [oldVersionId, nowVersionId],
  async ([old, now]) => {
    if (old) oldContent.value = await loadContent(old);
    if (now) nowContent.value = await loadContent(now);
  },
  { immediate: true },
);

onMounted(loadVersions);
</script>

<template>
  <div class="flex items-center justify-between">
    <Picker v-model="oldVersionId" :options="versionOptions" />
    <Picker v-model="nowVersionId" :options="versionOptions" />
  </div>
  <DiffBox
    v-if="oldContent && nowContent"
    :old="oldContent"
    :now="nowContent"
  />
</template>
