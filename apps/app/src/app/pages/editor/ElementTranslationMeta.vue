<script setup lang="ts">
import { toShortFixed } from "@cat/shared/utils";
import { computed } from "vue";
import * as z from "zod/v4";
import { useDateFormat } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { orpc } from "@/server/orpc";
import type { TranslationWithStatus } from "@/app/stores/editor/translation";
import { Badge } from "@/app/components/ui/badge";
import { useQuery } from "@pinia/colada";

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

const { state: memoryState } = useQuery({
  key: ["memory", meta.value?.memoryId ?? ""],
  query: () => {
    if (!meta.value || !meta.value.memoryId) return Promise.resolve(null);
    return orpc.memory.get({ memoryId: meta.value.memoryId });
  },
  enabled: !import.meta.env.SSR,
});

const { state: advisorState } = useQuery({
  key: ["advisor", meta.value?.advisorId ?? ""],
  query: () => {
    if (!meta.value || !meta.value.advisorId) return Promise.resolve(null);
    return orpc.plugin.getTranslationAdvisor({
      advisorId: meta.value.advisorId,
    });
  },
  enabled: !import.meta.env.SSR,
});
</script>

<template>
  <div v-if="meta" class="flex gap-0.5">
    <Badge variant="secondary">{{
      useDateFormat(translation.createdAt, "YYYY-MM-DD HH:mm:ss")
    }}</Badge>
    <Badge variant="secondary" v-if="memoryState.data">{{
      t("来自记忆库 {name}", { name: memoryState.data.name })
    }}</Badge>
    <Badge variant="secondary" v-if="advisorState.data">{{
      t("来自建议器 {name}", { name: advisorState.data.name })
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
