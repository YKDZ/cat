<script setup lang="ts">
import { ref } from "vue";
import { orpc } from "@/server/orpc";
import { useToastStore } from "@/app/stores/toast.ts";
import { computedAsyncClient } from "@/app/utils/vue.ts";
import type { TranslationWithStatus } from "../stores/editor/translation";
import { Button } from "@/app/components/ui/button";
import { useI18n } from "vue-i18n";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";
import { Minus, Plus } from "lucide-vue-next";
import { Skeleton } from "@/app/components/ui/skeleton";

const props = defineProps<{
  translation: Pick<TranslationWithStatus, "id" | "vote">;
}>();

const { t } = useI18n();
const { info, rpcWarn } = useToastStore();

const preVoteAmount = ref(1);
const isProcessing = ref<boolean>(false);

const selfVote = computedAsyncClient(
  () =>
    orpc.translation.getSelfVote({
      translationId: props.translation.id,
    }),
  null,
);

const vote = computedAsyncClient(() => {
  // oxlint-disable-next-line no-unused-expressions
  selfVote.value;
  return orpc.translation.countVote({
    translationId: props.translation.id,
  });
}, null);

const handleUnvote = async () => {
  if (!selfVote.value || selfVote.value.value === 0) return;
  if (isProcessing.value) return;

  isProcessing.value = true;
  await orpc.translation
    .vote({
      translationId: props.translation.id,
    })
    .then((newVote) => {
      info(t("成功取消投票"));
      selfVote.value = newVote;
    })
    .finally(() => {
      isProcessing.value = false;
    })
    .catch(rpcWarn);
};

const handleVote = async (value: number) => {
  isProcessing.value = true;
  await orpc.translation
    .vote({
      translationId: props.translation.id,
    })
    .then((vote) => {
      info(
        t("成功投票 {value}", {
          value: `${vote.value > 0 ? "+" : ""}${vote.value}`,
        }),
      );
      selfVote.value = vote;
    })
    .finally(() => {
      isProcessing.value = false;
    })
    .catch(rpcWarn);
};
</script>

<template>
  <div class="flex gap-1 items-center">
    <TextTooltip
      :tooltip="
        selfVote?.value === -preVoteAmount
          ? t('放弃投 -{amount} 票', {
              amount: preVoteAmount,
            })
          : t('投 -{amount} 票', {
              amount: preVoteAmount,
            })
      "
    >
      <Button
        size="icon"
        :variant="selfVote?.value === -preVoteAmount ? 'secondary' : 'ghost'"
        :disabled="isProcessing"
        @click.stop="
          selfVote?.value !== -preVoteAmount
            ? handleVote(-preVoteAmount)
            : handleUnvote()
        "
      >
        <Minus />
      </Button>
    </TextTooltip>
    <span class="text-center size-6 inline-block">
      <Skeleton v-if="vote === null" class="size-6" />
      <TextTooltip v-else :tooltip="t('当前票数')">{{ vote }}</TextTooltip>
    </span>
    <TextTooltip
      :tooltip="
        selfVote?.value === preVoteAmount
          ? t('放弃投 +{amount} 票', {
              amount: preVoteAmount,
            })
          : t('投 +{amount} 票', {
              amount: preVoteAmount,
            })
      "
    >
      <Button
        size="icon"
        :variant="selfVote?.value === preVoteAmount ? 'secondary' : 'ghost'"
        :disabled="isProcessing"
        @click.stop="
          selfVote?.value !== preVoteAmount
            ? handleVote(preVoteAmount)
            : handleUnvote()
        "
      >
        <Plus />
      </Button>
    </TextTooltip>
  </div>
</template>
