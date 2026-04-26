<script setup lang="ts">
import { Button } from "@cat/ui";
import { Skeleton } from "@cat/ui";
import { Minus, Plus } from "@lucide/vue";
import { useQuery } from "@pinia/colada";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import type { TranslationWithStatus } from "@/stores/editor/translation";

import TextTooltip from "@/components/tooltip/TextTooltip.vue";
import { orpc } from "@/rpc/orpc";
import { useToastStore } from "@/stores/toast.ts";

const props = defineProps<{
  translation: Pick<TranslationWithStatus, "id" | "vote">;
}>();

const { t } = useI18n();
const { info, rpcWarn } = useToastStore();

const preVoteAmount = ref(1);
const isProcessing = ref<boolean>(false);

const { state: selfVoteState, refetch: refetchSelfVote } = useQuery({
  key: ["selfVote", props.translation.id],
  query: () =>
    orpc.translation.getSelfVote({
      translationId: props.translation.id,
    }),
  enabled: !import.meta.env.SSR,
});

const { state: voteState, refetch: refetchVote } = useQuery({
  key: ["vote", props.translation.id],
  query: () =>
    orpc.translation.countVote({
      translationId: props.translation.id,
    }),
  enabled: !import.meta.env.SSR,
});

const handleUnvote = async () => {
  if (!selfVoteState.value || selfVoteState.value.data?.value === 0) return;
  if (isProcessing.value) return;

  isProcessing.value = true;
  await orpc.translation
    .vote({
      translationId: props.translation.id,
      value: 0,
    })
    .then(() => {
      info(t("成功取消投票"));
      refetchSelfVote();
      refetchVote();
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
      value,
    })
    .then((vote) => {
      info(
        t("成功投票 {value}", {
          value: `${vote.value > 0 ? "+" : ""}${vote.value}`,
        }),
      );
      refetchSelfVote();
      refetchVote();
    })
    .finally(() => {
      isProcessing.value = false;
    })
    .catch(rpcWarn);
};
</script>

<template>
  <div class="flex items-center gap-1">
    <TextTooltip
      :tooltip="
        selfVoteState?.data?.value === -preVoteAmount
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
        :variant="
          selfVoteState?.data?.value === -preVoteAmount ? 'secondary' : 'ghost'
        "
        :disabled="isProcessing"
        @click.stop="
          selfVoteState?.data?.value !== -preVoteAmount
            ? handleVote(-preVoteAmount)
            : handleUnvote()
        "
      >
        <Minus />
      </Button>
    </TextTooltip>
    <span class="inline-block size-6 text-center">
      <Skeleton v-if="voteState.data === null" class="size-6" />
      <TextTooltip v-else :tooltip="t('当前票数')">{{
        voteState.data
      }}</TextTooltip>
    </span>
    <TextTooltip
      :tooltip="
        selfVoteState?.data?.value === preVoteAmount
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
        :variant="
          selfVoteState?.data?.value === preVoteAmount ? 'secondary' : 'ghost'
        "
        :disabled="isProcessing"
        @click.stop="
          selfVoteState?.data?.value !== preVoteAmount
            ? handleVote(preVoteAmount)
            : handleUnvote()
        "
      >
        <Plus />
      </Button>
    </TextTooltip>
  </div>
</template>
