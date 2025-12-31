<script setup lang="ts">
import { toShortFixed } from "@cat/shared/utils";
import { computed } from "vue";
import * as z from "zod/v4";
import { useDateFormat } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { orpc } from "@/server/orpc";
import type { TranslationWithStatus } from "../stores/editor/translation";
import { Badge } from "@/app/components/ui/badge";
import { computedAsyncClient } from "@/app/utils/vue";

const { t } = useI18n();

const props = defineProps<{
  translation: Pick<TranslationWithStatus, "createdAt" | "meta">;
}>();

const TranslationMetaSchema = z.object({
  advisorId: z.int().optional(),
  memorySimilarity: z.number().min(0).max(1).default(0).nullable(),
  memoryId: z.uuidv4().optional(),
});

type TranslationMeta = z.infer<typeof TranslationMetaSchema>;

const meta = computed<TranslationMeta | null>(() => {
  return TranslationMetaSchema.nullable().parse(props.translation.meta);
});

const memory = computedAsyncClient(async () => {
  if (!meta.value || !meta.value.memoryId) return null;
  return await orpc.memory.get({ memoryId: meta.value.memoryId });
}, null);

const advisor = computedAsyncClient(async () => {
  if (!meta.value || !meta.value.advisorId) return null;
  return await orpc.plugin.getTranslationAdvisor({
    advisorId: meta.value.advisorId,
  });
});
</script>

<template>
  <div v-if="meta" class="flex gap-0.5">
    <Badge variant="secondary">{{
      useDateFormat(translation.createdAt, "YYYY-MM-DD HH:mm:ss")
    }}</Badge>
    <Badge variant="secondary" v-if="memory">{{
      t("来自记忆库 {name}", { name: memory.name })
    }}</Badge>
    <Badge variant="secondary" v-if="advisor">{{
      t("来自建议器 {name}", { name: advisor.name })
    }}</Badge>
    <Badge variant="secondary" v-if="meta.memorySimilarity"
      >{{
        t("记忆匹配度：{similarity}%", {
          similarity: toShortFixed(meta.memorySimilarity * 100),
        })
      }}
    </Badge>
  </div>
</template>
