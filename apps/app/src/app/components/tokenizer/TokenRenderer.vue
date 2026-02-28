<script setup lang="ts">
import { computed, toRefs, watch } from "vue";
import type { Token } from "@cat/plugin-core";
import type { TermData } from "@cat/shared/schema/misc";
import TokenNode from "./TokenNode.vue";
import Empty from "./Empty.vue";
import { useQuery } from "@pinia/colada";
import { ws } from "@/server/ws";

const props = withDefaults(
  defineProps<{
    text: string;
    interactable?: boolean;
    showRaw?: boolean;
    terms?: TermData[];
  }>(),
  {
    interactable: false,
    showRaw: false,
    terms: undefined,
  },
);

const emit = defineEmits<{
  (e: "token-click", token: Token): void;
  (e: "update", tokens: Token[]): void;
}>();

const { text, terms } = toRefs(props);

// 创建稳定的查询键，包含术语数据的引用
const queryKey = computed(() => {
  const termsKey = terms.value
    ? terms.value.map((t) => `${t.term}:${t.translation}`).join(",")
    : "";
  return ["token", text.value, termsKey];
});

const { state, refetch } = useQuery<Token[]>({
  key: queryKey,
  placeholderData: (previousData) => {
    // 只有当 previousData 的文本与当前 text 相同时才使用 previousData
    // 否则返回基于当前 text 的占位数据，避免显示其他元素的缓存数据
    const currentText = text.value;
    // previousData 可能是缓存的分词结果，检查其文本是否与当前文本匹配
    // 如果 previousData 是占位数据，其 value 就是原始文本
    if (
      previousData &&
      previousData.length > 0 &&
      previousData[0]?.value === currentText
    ) {
      return previousData;
    }
    return [
      {
        value: currentText,
        start: 0,
        end: currentText.length,
        type: "text",
      },
    ];
  },
  query: async () =>
    ws.tokenizer.tokenize({
      text: text.value,
      terms: terms.value,
    }) as unknown as Token[],
  enabled: !import.meta.env.SSR,
});

watch(state, () => emit("update", state.value.data || []), { immediate: true });

watch([text, terms], async () => {
  await refetch();
});
</script>

<template>
  <div class="w-full font-sans text-base leading-relaxed wrap-break-word">
    <div v-if="text.length === 0">
      <Empty />
    </div>

    <div v-else>
      <TokenNode
        v-for="(token, index) in state.data"
        :key="`${token.start}-${index}`"
        :token
        :interactable
        @click="(t) => emit('token-click', t)"
      />
    </div>

    <div v-if="showRaw" class="border-t pt-2 text-xs text-gray-500">
      <pre
        class="mt-1 max-h-40 overflow-auto rounded bg-gray-900 p-2 text-green-400"
        >{{ state.data }}</pre
      >
    </div>
  </div>
</template>
