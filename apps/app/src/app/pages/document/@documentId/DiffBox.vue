<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import type { DocumentVersion } from "@cat/shared/schema/drizzle/document";
import { useDateFormat } from "@vueuse/core";
import { orpc } from "@/server/orpc";
import DiffBox from "@/app/components/diff/DiffBox.vue";
import Picker from "@/app/components/picker/Picker.vue";
import type { PickerOption } from "@/app/components/picker/index.ts";
import { logger } from "@cat/shared/utils";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  documentId: string;
}>();

const { t } = useI18n();

const versions = shallowRef<DocumentVersion[]>([]);
const oldVersionId = ref<number | null>(null);
const nowVersionId = ref<number | null>(null);
const oldContent = ref<string | null>(null);
const nowContent = ref<string | null>(null);

const fetchDocumentContent = async (documentVersionId: number) => {
  const fileUrl = await orpc.document.getDocumentFileUrl({
    documentId: props.documentId,
    documentVersionId,
  });

  if (!fileUrl) return null;

  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch document version content: ${response.status}`,
    );
  }

  return await response.text();
};

const loadVersions = async () => {
  versions.value = await orpc.document.getDocumentVersions({
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

const lastRequestedOldVersionId = ref<number | null>(null);
const lastRequestedNowVersionId = ref<number | null>(null);

watch(
  [oldVersionId, nowVersionId],
  async ([old, now]) => {
    const tasks: Promise<void>[] = [];

    if (old !== null) {
      const versionId = old;
      lastRequestedOldVersionId.value = versionId;
      oldContent.value = null;

      tasks.push(
        fetchDocumentContent(versionId)
          .then((content) => {
            if (lastRequestedOldVersionId.value === versionId) {
              oldContent.value = content;
            }
          })
          .catch((error) => {
            logger.error(
              "WEB",
              { msg: "Failed to load old document version content" },
              error,
            );
          }),
      );
    } else {
      oldContent.value = null;
      lastRequestedOldVersionId.value = null;
    }

    if (now !== null) {
      const versionId = now;
      lastRequestedNowVersionId.value = versionId;
      nowContent.value = null;

      tasks.push(
        fetchDocumentContent(versionId)
          .then((content) => {
            if (lastRequestedNowVersionId.value === versionId) {
              nowContent.value = content;
            }
          })
          .catch((error) => {
            logger.error(
              "WEB",
              { msg: "Failed to load current document version content" },
              error,
            );
          }),
      );
    } else {
      nowContent.value = null;
      lastRequestedNowVersionId.value = null;
    }

    if (tasks.length) {
      await Promise.all(tasks);
    }
  },
  { immediate: true },
);

onMounted(loadVersions);
</script>

<template>
  <div class="flex items-center justify-between">
    <Picker
      v-if="oldVersionId"
      v-model="oldVersionId"
      :placeholder="t('选择一个文档版本...')"
      :options="versionOptions"
    />
    <Picker
      v-if="nowVersionId"
      v-model="nowVersionId"
      :placeholder="t('选择一个文档版本...')"
      :options="versionOptions"
    />
  </div>
  <DiffBox
    v-if="oldContent !== null && nowContent !== null"
    :old="oldContent ?? ''"
    :now="nowContent ?? ''"
  />
</template>
