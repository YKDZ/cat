<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/prisma/memory";
import type { Translation } from "@cat/shared/schema/prisma/translation";
import type { TranslationAdvisorData } from "@cat/shared/schema/misc";
import { toShortFixed } from "@cat/shared/utils";
import { computed, onMounted, ref } from "vue";
import * as z from "zod/v4";
import { useDateFormat } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import EditorElementTranslationMetaTag from "./EditorElementTranslationMetaTag.vue";
import { trpc } from "@cat/app-api/trpc/client";

const { t } = useI18n();

const props = defineProps<{
  translation: Translation;
}>();

const meta = computed<TranslationMeta | null>(() => {
  return TranslationMetaSchema.nullable().parse(props.translation.meta);
});

const TranslationMetaSchema = z.object({
  isAutoTranslation: z.boolean().default(false),
  isAdvisor: z.boolean().default(false),
  isMemory: z.boolean().default(false),
  advisorId: z.int().optional(),
  memorySimilarity: z.number().min(0).max(1).default(0),
  memoryId: z.ulid().optional(),
});

type TranslationMeta = z.infer<typeof TranslationMetaSchema>;

const memory = ref<Memory | null>(null);
const advisor = ref<TranslationAdvisorData | null>(null);

onMounted(() => {
  if (meta.value && meta.value.memoryId)
    trpc.memory.query.query({ id: meta.value.memoryId }).then((mem) => {
      if (!mem) return;
      memory.value = mem;
    });
  if (meta.value && meta.value.advisorId)
    trpc.plugin.getTranslationAdvisor
      .query({
        advisorId: meta.value.advisorId,
      })
      .then((a) => {
        if (!a) return;
        advisor.value = a;
      });
});
</script>

<template>
  <div v-if="meta" class="flex gap-0.5">
    <EditorElementTranslationMetaTag>{{
      useDateFormat(translation.createdAt, "YYYY-MM-DD HH:mm:ss")
    }}</EditorElementTranslationMetaTag>
    <EditorElementTranslationMetaTag v-if="meta.isAutoTranslation">{{
      t("自动翻译")
    }}</EditorElementTranslationMetaTag>
    <EditorElementTranslationMetaTag v-if="meta.isMemory && memory">{{
      t("来自记忆库 {name}", { name: memory.name })
    }}</EditorElementTranslationMetaTag>
    <EditorElementTranslationMetaTag v-if="meta.isAdvisor && advisor">{{
      t("来自建议器 {name}", { name: advisor.name })
    }}</EditorElementTranslationMetaTag>
    <EditorElementTranslationMetaTag v-if="meta.isMemory"
      >{{
        t("记忆匹配度：{similarity}%", {
          similarity: toShortFixed(meta.memorySimilarity * 100),
        })
      }}
    </EditorElementTranslationMetaTag>
  </div>
</template>
