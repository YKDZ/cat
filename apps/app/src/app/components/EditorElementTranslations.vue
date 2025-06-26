<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import EditorElementTranslation from "./EditorElementTranslation.vue";
import type { Translation, TranslationApprovment } from "@cat/shared";
import { useToastStore } from "../stores/toast";

const { trpcWarn } = useToastStore();
const { upsertTranslation, updateElementStatus } = useEditorStore();

const { translations } = storeToRefs(useEditorStore());

const handleChangeApprovment = (
  id: number,
  approvments: TranslationApprovment[],
) => {
  const originIndex = translations.value.findIndex(
    (translation) => translation.id === id,
  );

  if (originIndex === -1) return;

  const origin = translations.value.at(originIndex);

  if (!origin) return;

  const newTransaltion = {
    ...origin,
    Approvments: approvments,
  } satisfies Translation;

  upsertTranslation(newTransaltion);
  updateElementStatus(newTransaltion.translatableElementId).catch(trpcWarn);
};
</script>

<template>
  <div class="flex flex-col gap-2">
    <h3 class="text-sm font-bold">{{ $t("所有翻译") }}</h3>
    <div v-for="translation in translations" :key="translation.id">
      <EditorElementTranslation
        :translation="translation"
        @approve="
          (approvments) => handleChangeApprovment(translation.id, approvments)
        "
        @unapprove="
          (approvments) => handleChangeApprovment(translation.id, approvments)
        "
      />
    </div>
    <div
      v-if="translations.length === 0"
      class="px-3 py-2 flex gap-2 select-none"
    >
      {{ $t("还没有任何翻译") }}
    </div>
  </div>
</template>
