<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { Textarea } from "@/app/components/ui/textarea";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { trpc } from "@cat/app-api/trpc/client";
import { Button } from "@/app/components/ui/button";

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
    <article class="prose-foreground max-w-460px prose">
      <p>
        {{
          t(
            "选择术语语言与翻译语言，并以换行符分隔的方式键入左右一一对应的术语和翻译",
          )
        }}
      </p>
      <p>{{ t("通过箭头方向决定插入的术语是否是双向的") }}</p>
    </article>
    <div class="flex gap-3 items-start">
      <div class="flex flex-col gap-2">
        <LanguagePicker v-model="termLanguageId" full-width />
        <Textarea v-model="terms" full-width />
      </div>
      <Button class="self-center" size="icon" @click="canReverse = !canReverse"
        ><div
          :class="
            canReverse
              ? `icon-[mdi--arrow-left-right]`
              : `icon-[mdi--arrow-right]`
          "
          class="size-4"
      /></Button>
      <div class="flex flex-col gap-2">
        <LanguagePicker v-model="translationLanguageId" full-width />
        <Textarea v-model="translations" full-width />
      </div>
    </div>
    <Button @click="handleInsert">{{ t("提交") }}</Button>
  </div>
</template>
