<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor";
import { useToastStore } from "../stores/toast";
import UserAvatar from "./UserAvatar.vue";
import { Translation, TranslationVote } from "@cat/shared";
import Button from "./Button.vue";
import { onMounted, ref, watch } from "vue";
import { trpc } from "@/server/trpc/client";
import Render from "./formater/Render.vue";

const { info, trpcWarn } = useToastStore();
const { translationValue, document } = storeToRefs(useEditorStore());

const selfVote = ref<TranslationVote | null>(null);
const vote = ref<number | null>(null);
const isProcessing = ref<boolean>(false);

const props = defineProps<{
  translation: Translation;
}>();

const copy = (translation: Translation) => {
  translationValue.value = props.translation.value;
  info(`成功复制 ${translation.Translator?.name} 的翻译`);
};

const handleVote = (value: number) => {
  if (value === selfVote.value?.value) value = 0;
  if (vote.value === null) return;
  if (isProcessing.value) return;

  trpc.translation.vote
    .mutate({
      id: props.translation.id,
      value,
    })
    .then((newVote) => {
      if (selfVote.value === null) {
        info(`成功投票 ${newVote.value > 0 ? "+" : ""}${newVote.value}`);
      } else {
        info(
          `成功修改投票数从 ${selfVote.value.value > 0 ? "+" : ""}${selfVote.value.value} 到 ${newVote.value > 0 ? "+" : ""}${newVote.value}`,
        );
      }
      selfVote.value = newVote;
    })
    .catch(trpcWarn)
    .finally(() => {
      isProcessing.value = false;
    });
};

onMounted(() => {
  trpc.translation.querySelfVote
    .query({
      id: props.translation.id,
    })
    .then((self) => {
      selfVote.value = self;
    });
});

watch(
  selfVote,
  () => {
    trpc.translation.countVote
      .query({
        id: props.translation.id,
      })
      .then((amount) => {
        vote.value = amount;
      });
  },
  { immediate: true },
);
</script>

<template>
  <div
    class="px-3 py-2 flex gap-2 w-full cursor-pointer items-center hover:bg-highlight-darker"
    @click="copy(translation)"
  >
    <UserAvatar
      v-if="translation.Translator"
      :user="translation.Translator"
      size="36px"
    />
    <Render v-if="document" :type="document.Type" :text="translation.value" />
    <div class="ml-auto flex gap-1 items-center">
      <Button
        icon="i-mdi:minus"
        no-text
        transparent
        :focused="selfVote?.value === -1"
        @click.stop="handleVote(-1)"
      />
      <span class="text-center text-center min-h-24px min-w-24px inline-block">
        <span v-if="vote !== null">{{ vote }}</span>
        <span v-else class="i-mdi:help inline-block" />
      </span>
      <Button
        icon="i-mdi:plus"
        no-text
        transparent
        :focused="selfVote?.value === 1"
        @click.stop="handleVote(1)"
      />
    </div>
  </div>
</template>
