<script setup lang="ts">
import type {
  Translation,
  TranslationVote,
} from "@cat/shared/schema/drizzle/translation";
import { onMounted, ref } from "vue";
import { trpc } from "@cat/app-api/trpc/client";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { watchClient } from "@/app/utils/vue.ts";

const props = defineProps<{
  translation: Translation;
}>();

const { info, trpcWarn } = useToastStore();

const selfVote = ref<TranslationVote | null>(null);
const vote = ref<number | null>(null);
const isProcessing = ref<boolean>(false);

const handleVote = (value: number) => {
  if (value === selfVote.value?.value) value = 0;
  if (vote.value === null) return;
  if (isProcessing.value) return;

  trpc.translation.vote
    .mutate({
      translationId: props.translation.id,
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

watchClient(
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
  <div class="flex gap-1 items-center">
    <HButton
      icon="i-mdi:minus"
      :classes="{
        base: 'btn btn-md btn-transparent btn-square',
      }"
      :focused="selfVote?.value === -1"
      @click.stop="handleVote(-1)"
    />
    <span class="text-center text-center min-h-24px min-w-24px inline-block">
      <span v-if="vote !== null">{{ vote }}</span>
      <span v-else class="i-mdi:help inline-block" />
    </span>
    <HButton
      icon="i-mdi:plus"
      :classes="{
        base: 'btn btn-md btn-transparent btn-square',
      }"
      :focused="selfVote?.value === 1"
      @click.stop="handleVote(1)"
    />
  </div>
</template>
