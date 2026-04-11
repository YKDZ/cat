<script setup lang="ts">
import type { KanbanCardStatus } from "@cat/shared/schema/enum";

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
} from "@cat/ui";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import { useKanbanStore } from "@/app/stores/kanban";
import { useToastStore } from "@/app/stores/toast";

const props = defineProps<{
  /** @zh 看板 ID @en Board ID */
  boardId: number;
  /** @zh 卡片初始状态（默认 OPEN）@en Initial card status (default OPEN) */
  initialStatus?: KanbanCardStatus;
}>();

const emit = defineEmits<{
  created: [];
}>();

const { t } = useI18n();
const kanbanStore = useKanbanStore();
const toastStore = useToastStore();

const isOpen = ref(false);
const isSubmitting = ref(false);
const title = ref("");
const description = ref("");
const priority = ref(0);

const priorityOptions = [
  { label: t("普通"), value: 0 },
  { label: t("低"), value: 1 },
  { label: t("高"), value: 2 },
  { label: t("紧急"), value: 3 },
];

const reset = () => {
  title.value = "";
  description.value = "";
  priority.value = 0;
};

const onSubmit = async () => {
  if (!title.value.trim()) return;
  isSubmitting.value = true;
  try {
    await kanbanStore.createCard({
      boardId: props.boardId,
      title: title.value.trim(),
      description: description.value.trim(),
      priority: priority.value,
      status: props.initialStatus,
    });
    isOpen.value = false;
    reset();
    emit("created");
    toastStore.info(t("卡片已创建"));
  } catch {
    toastStore.rpcWarn(new Error(t("创建卡片失败")));
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogTrigger as-child>
      <slot>
        <Button variant="ghost" size="icon" class="size-6">
          <span class="text-base leading-none">+</span>
        </Button>
      </slot>
    </DialogTrigger>
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ t("新建卡片") }}</DialogTitle>
      </DialogHeader>

      <form class="mt-2 flex flex-col gap-3" @submit.prevent="onSubmit">
        <!-- Title -->
        <div class="flex flex-col gap-1.5">
          <Label for="card-title">{{ t("标题") }} *</Label>
          <Input
            id="card-title"
            v-model="title"
            :placeholder="t('输入卡片标题...')"
            required
            autofocus
          />
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-1.5">
          <Label for="card-desc">{{ t("描述（可选）") }}</Label>
          <Textarea
            id="card-desc"
            v-model="description"
            :placeholder="t('输入描述...')"
            class="resize-none"
            rows="3"
          />
        </div>

        <!-- Priority -->
        <div class="flex flex-col gap-1.5">
          <Label>{{ t("优先级") }}</Label>
          <div class="flex gap-2">
            <Button
              v-for="opt in priorityOptions"
              :key="opt.value"
              type="button"
              :variant="priority === opt.value ? 'default' : 'outline'"
              size="sm"
              class="flex-1 text-xs"
              @click="priority = opt.value"
            >
              {{ opt.label }}
            </Button>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            @click="isOpen = false"
          >
            {{ t("取消") }}
          </Button>
          <Button
            type="submit"
            size="sm"
            :disabled="!title.trim() || isSubmitting"
          >
            {{ isSubmitting ? t("创建中...") : t("创建") }}
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
