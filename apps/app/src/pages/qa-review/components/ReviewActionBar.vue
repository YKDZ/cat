<script setup lang="ts">
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from "@cat/ui";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

type ActionCandidate = {
  findings?: Array<{ action: string }>;
};

/**
 * Props for the review action bar.
 */
const props = defineProps<{
  /**
   * Currently selected candidate.
   */
  candidate: ActionCandidate | null;

  /**
   * Current note body.
   */
  noteBody: string;

  /**
   * Error message shown when submission fails.
   */
  error?: string | null;

  /**
   * Whether writing is currently disabled.
   */
  writeDisabled?: boolean;

  /**
   * Reason shown when writing is disabled.
   */
  disabledReason?: string | null;
}>();

const emit = defineEmits<{
  "update:noteBody": [value: string];
  approve: [];
  reject: [];
  defer: [];
}>();

const blockerDialogOpen = ref(false);
const hasNote = computed(() => props.noteBody.trim().length > 0);
const hasBlocking = computed(() =>
  (props.candidate?.findings ?? []).some(
    (finding) => finding.action === "BLOCK_APPROVAL",
  ),
);

const approveLabel = computed(() =>
  hasNote.value ? t("批注并同意") : t("同意"),
);
const rejectLabel = computed(() =>
  hasNote.value ? t("批注并拒绝") : t("拒绝"),
);
const deferLabel = computed(() =>
  hasNote.value ? t("批注并跳过") : t("跳过"),
);
const disabledTitle = computed(() =>
  props.disabledReason ? t(props.disabledReason) : undefined,
);

const approve = () => {
  if (props.writeDisabled) return;
  if (hasBlocking.value) {
    blockerDialogOpen.value = true;
    return;
  }
  emit("approve");
};

const reject = () => {
  if (props.writeDisabled) return;
  emit("reject");
};

const defer = () => {
  if (props.writeDisabled) return;
  emit("defer");
};
</script>

<template>
  <div v-if="candidate" class="sticky bottom-0 z-10 border-t bg-background p-4">
    <Textarea
      :model-value="noteBody"
      :disabled="writeDisabled"
      :aria-disabled="writeDisabled"
      :title="disabledTitle"
      rows="3"
      :placeholder="t('写入审校批注')"
      @update:model-value="emit('update:noteBody', String($event))"
    />
    <p v-if="error" class="mt-2 text-sm text-destructive">{{ error }}</p>
    <div class="mt-3 flex flex-wrap justify-end gap-2">
      <Button
        variant="outline"
        :disabled="writeDisabled"
        :title="disabledTitle"
        @click="defer"
        >{{ deferLabel }}</Button
      >
      <Button
        variant="outline"
        :disabled="writeDisabled"
        :title="disabledTitle"
        @click="reject"
        >{{ rejectLabel }}</Button
      >
      <Button
        :disabled="writeDisabled"
        :title="disabledTitle"
        @click="approve"
        >{{ approveLabel }}</Button
      >
    </div>

    <Dialog v-model:open="blockerDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t("确认覆盖阻断风险") }}</DialogTitle>
        </DialogHeader>
        <p class="text-sm text-muted-foreground">
          {{
            t(
              "当前候选仍存在未关闭的阻断 finding。确认后会记录覆盖理由并批准该候选。",
            )
          }}
        </p>
        <DialogFooter>
          <Button variant="outline" @click="blockerDialogOpen = false">
            {{ t("取消") }}
          </Button>
          <Button
            @click="
              blockerDialogOpen = false;
              emit('approve');
            "
          >
            {{ t("确认同意") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
