<script setup lang="ts">
import type { Document } from "@cat/shared/schema/drizzle/document";
import type { Project } from "@cat/shared/schema/drizzle/project";

import { Button } from "@cat/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cat/ui";
import { Search } from "lucide-vue-next";
import { navigate } from "vike/client/router";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

import LanguagePicker from "@/app/components/LanguagePicker.vue";
import MultiGlossaryPicker from "@/app/components/MultiGlossaryPicker.vue";
import { orpc } from "@/app/rpc/orpc";
import { useToastStore } from "@/app/stores/toast.ts";

const props = defineProps<{
  project: Project;
  documents: Pick<Document, "id" | "isDirectory">[];
}>();


const { t } = useI18n();
const { info, rpcWarn } = useToastStore();


const open = ref(false);
const loading = ref(false);
const glossaryIds = ref<string[]>([]);
const sourceLanguageId = ref<string | undefined>(undefined);


const glossaryId = computed(() => glossaryIds.value[0]);
const documentIds = computed(() =>
  props.documents
    .filter((document) => !document.isDirectory)
    .map((document) => document.id),
);
const canSubmit = computed(
  () =>
    !!glossaryId.value &&
    !!sourceLanguageId.value &&
    documentIds.value.length > 0,
);


const handleStart = async () => {
  if (!canSubmit.value) return;
  loading.value = true;
  await orpc.glossary
    .startTermDiscovery({
      projectId: props.project.id,
      documentIds: documentIds.value,
      glossaryId: glossaryId.value!,
      sourceLanguageId: sourceLanguageId.value!,
    })
    .then(async ({ runId }) => {
      open.value = false;
      info(t("术语发现已启动"));
      await navigate(`/project/${props.project.id}/workflows/${runId}`);
    })
    .catch(rpcWarn)
    .finally(() => {
      loading.value = false;
    });
};
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <Button :class="$attrs.class"><Search /> {{ t("术语发现") }}</Button>
    </DialogTrigger>

    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t("开始术语发现") }}</DialogTitle>
        <DialogDescription>
          {{ t("从文档中自动提取候选术语并存入术语库") }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium">{{ t("目标术语库") }}</label>
          <MultiGlossaryPicker v-model="glossaryIds" />
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium">{{ t("源语言") }}</label>
          <LanguagePicker v-model="sourceLanguageId" />
        </div>
      </div>

      <DialogFooter>
        <Button :disabled="!canSubmit || loading" @click="handleStart">
          {{ loading ? t("启动中…") : t("开始术语发现") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
