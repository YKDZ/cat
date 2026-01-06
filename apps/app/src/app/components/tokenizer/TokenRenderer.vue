<script setup lang="ts">
import { toRefs, watch } from "vue";
import type { Token } from "@cat/plugin-core";
import TokenNode from "./TokenNode.vue";
import Empty from "./Empty.vue";
import { useQuery } from "@pinia/colada";
import { ws } from "@/server/ws";

const props = withDefaults(
  defineProps<{
    text: string;
    interactable?: boolean;
    showRaw?: boolean;
  }>(),
  {
    interactable: false,
    showRaw: false,
  },
);

const emit = defineEmits<{
  (e: "token-click", token: Token): void;
  (e: "update", tokens: Token[]): void;
}>();

const { text } = toRefs(props);

const { state, refetch } = useQuery<Token[]>({
  key: ["token", text.value],
  placeholderData: [
    {
      value: text.value,
      start: 0,
      end: text.value.length,
      type: "text",
    },
  ],
  query: async () =>
    ws.tokenizer.tokenize({ text: text.value }) as unknown as Token[],
  enabled: !import.meta.env.SSR,
});

watch(state, () => emit("update", state.value.data || []), { immediate: true });

watch(text, async () => {
  await refetch();
});
</script>

<template>
  <div class="w-full text-base leading-relaxed wrap-break-word font-sans">
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

    <div v-if="showRaw" class="text-xs text-gray-500 border-t pt-2">
      <pre
        class="bg-gray-900 text-green-400 p-2 rounded overflow-auto max-h-40 mt-1"
        >{{ state.data }}</pre
      >
    </div>
  </div>
</template>
