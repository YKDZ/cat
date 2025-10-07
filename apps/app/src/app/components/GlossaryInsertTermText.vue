<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";
import Textarea from "@/app/components/Textarea.vue";
import LanguagePicker from "@/app/components/LanguagePicker.vue";

import { useToastStore } from "@/app/stores/toast.ts";
import { trpc } from "@cat/app-api/trpc/client";

const { t } = useI18n();

const props = defineProps<{
  glossaryId: string;
}>();

const { info, warn, trpcWarn } = useToastStore();

const termLanguageId = ref("");
const terms = ref("");
const translationLanguageId = ref("");
const translations = ref("");
const canReverse = ref(true);

const handleInsert = async () => {
  if (
    termLanguageId.value.length === 0 ||
    translationLanguageId.value.length === 0
  ) {
    warn(t("必须指定术语语言与翻译语言"));
    return;
  }
  if (
    terms.value.trim().length === 0 ||
    translations.value.trim().length === 0
  ) {
    warn(t("术语或翻译表不能为空"));
    return;
  }

  const termArr = terms.value.trim().split(/\r?\n/);
  const translationArr = translations.value.trim().split(/\r?\n/);

  if (termArr.length !== translationArr.length) {
    warn(t("术语和翻译表行数必须相同"));
    return;
  }

  const termsData = termArr.map((term, index) => {
    const translation = translationArr[index];
    if (!translation) throw new Error("term and translation must match");
    return {
      term,
      termLanguageId: termLanguageId.value,
      translation,
      translationLanguageId: translationLanguageId.value,
    };
  });

  await trpc.glossary.insertTerm
    .mutate({
      glossaryId: props.glossaryId,
      termsData: termsData,
    })
    .then(() => {
      info(t("成功插入所有术语"));
    })
    .catch(trpcWarn);
};
</script>

<template>
  <div class="flex flex-col gap-4">
    <article class="prose-highlight-content max-w-460px prose">
      <h3 class="text-highlight-content-darker">
        {{ t("以文本方式插入术语") }}
      </h3>
      <p>
        {{ t("选择术语语言与翻译语言并以换行分隔的方式插入一一对应的术语") }}
      </p>
      <p>{{ t("通过箭头方向决定插入的术语是否是双向的") }}</p>
    </article>
    <div class="flex gap-3 items-start">
      <div class="flex flex-col gap-2">
        <LanguagePicker v-model="termLanguageId" full-width />
        <Textarea v-model="terms" full-width />
      </div>
      <HButton
        class="self-center"
        :classes="{
          base: 'btn btn-md btn-transparent btn-square',
        }"
        :icon="canReverse ? `i-mdi:arrow-left-right` : `i-mdi:arrow-right`"
        @click="canReverse = !canReverse"
      />
      <div class="flex flex-col gap-2">
        <LanguagePicker v-model="translationLanguageId" full-width />
        <Textarea v-model="translations" full-width />
      </div>
    </div>
    <HButton
      :classes="{
        base: 'btn btn-md btn-base btn-w-full',
      }"
      @click="handleInsert"
      >{{ t("提交") }}</HButton
    >
  </div>
</template>
