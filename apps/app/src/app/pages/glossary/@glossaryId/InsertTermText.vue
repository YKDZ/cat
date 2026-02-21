<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Textarea } from "@/app/components/ui/textarea";
import LanguagePicker from "@/app/components/LanguagePicker.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { orpc } from "@/server/orpc";
import { Button } from "@/app/components/ui/button";

const { t } = useI18n();

const props = defineProps<{
  glossaryId: string;
}>();

const { info, warn, rpcWarn } = useToastStore();

const termLanguageId = ref("");
const termsText = ref("");
const translationLanguageId = ref("");
const translationsText = ref("");

const terms = computed(() => {
  const arr = termsText.value
    .trim()
    .split(/\r?\n/)
    .filter((line: string) => line.length > 0);
  return arr;
});

const translations = computed(() => {
  const arr = translationsText.value
    .trim()
    .split(/\r?\n/)
    .filter((line: string) => line.length > 0);
  return arr;
});

const handleInsert = async () => {
  if (
    termLanguageId.value.length === 0 ||
    translationLanguageId.value.length === 0
  ) {
    warn(t("必须指定术语语言与翻译语言"));
    return;
  }
  if (
    termsText.value.trim().length === 0 ||
    translationsText.value.trim().length === 0
  ) {
    warn(t("术语或翻译表不能为空"));
    return;
  }

  if (terms.value.length !== translations.value.length) {
    warn(t("术语和翻译表行数必须相同"));
    return;
  }

  const termsData = terms.value.map((term, index) => {
    const translation = translations.value[index];
    if (!translation) throw new Error("term and translation must match");
    return {
      term,
      termLanguageId: termLanguageId.value,
      translation,
      translationLanguageId: translationLanguageId.value,
    };
  });

  await orpc.glossary
    .insertTerm({
      glossaryId: props.glossaryId,
      termsData: termsData,
    })
    .then(() => {
      info(t("成功插入所有术语"));
    })
    .catch(rpcWarn);
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
      <p>{{ t("术语都是双向的") }}</p>
    </article>
    <div class="flex gap-3 items-start">
      <div class="flex flex-col gap-2">
        <span>{{ t("{amount} 条术语", { amount: terms.length }) }}</span>
        <LanguagePicker v-model="termLanguageId" full-width />
        <Textarea v-model="termsText" full-width />
      </div>
      <Button class="self-center" size="icon"
        ><div class="icon-[mdi--arrow-left-right] size-4"
      /></Button>
      <div class="flex flex-col gap-2">
        <span>{{ t("{amount} 条翻译", { amount: translations.length }) }}</span>
        <LanguagePicker v-model="translationLanguageId" full-width />
        <Textarea v-model="translationsText" full-width />
      </div>
    </div>
    <Button @click="handleInsert">{{ t("提交") }}</Button>
  </div>
</template>
