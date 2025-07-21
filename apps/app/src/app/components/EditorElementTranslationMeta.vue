<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import type { Memory, TranslationAdvisorData } from "@cat/shared";
import { toShortFixed, type JSONType } from "@cat/shared";
import { computed, onMounted, ref } from "vue";
import z from "zod";
import EditorElementTranslationMetaTag from "./EditorElementTranslationMetaTag.vue";

const props = defineProps<{
  meta: JSONType;
}>();

const TranslationMetaSchema = z.object({
  isAutoTranslation: z.boolean().default(false),
  isAdvisor: z.boolean().default(false),
  isMemory: z.boolean().default(false),
  advisorId: z.string().optional(),
  memorySimilarity: z.number().min(0).max(1).default(0),
  memoryId: z.ulid().optional(),
});

type TranslationMeta = z.infer<typeof TranslationMetaSchema>;

const meta = computed<TranslationMeta | null>(() => {
  return TranslationMetaSchema.nullable().parse(props.meta);
});

const memory = ref<Memory | null>(null);
const advisor = ref<TranslationAdvisorData | null>(null);

onMounted(() => {
  if (meta.value && meta.value.memoryId)
    trpc.memory.query.query({ id: meta.value.memoryId }).then((mem) => {
      if (!mem) return;
      memory.value = mem;
    });
  if (meta.value && meta.value.advisorId) {
    trpc.suggestion.queryAdvisor
      .query({ advisorId: meta.value.advisorId })
      .then((a) => (advisor.value = a));
  }
});
</script>

<template>
  <div v-if="meta" class="flex gap-0.5">
    <EditorElementTranslationMetaTag v-if="meta.isAutoTranslation">{{
      $t("自动翻译")
    }}</EditorElementTranslationMetaTag>
    <EditorElementTranslationMetaTag v-if="meta.isMemory">{{
      $t("来自记忆库 {name}", { name: memory?.name })
    }}</EditorElementTranslationMetaTag>
    <EditorElementTranslationMetaTag v-if="meta.isAdvisor">{{
      $t("来自建议器 {name}", { name: advisor?.name })
    }}</EditorElementTranslationMetaTag>
    <EditorElementTranslationMetaTag v-if="meta.isMemory"
      >{{
        $t("记忆匹配度：{similarity}%", {
          similarity: toShortFixed(meta.memorySimilarity * 100),
        })
      }}
    </EditorElementTranslationMetaTag>
  </div>
</template>
