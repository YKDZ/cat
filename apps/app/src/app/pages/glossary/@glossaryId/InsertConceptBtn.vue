<script setup lang="ts">
import { Button } from "@cat/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cat/ui";
import { Label } from "@cat/ui";
import { Textarea } from "@cat/ui";
import { useQuery } from "@pinia/colada";
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";

import type { PickerOption } from "@/app/components/picker";

import Picker from "@/app/components/picker/Picker.vue";
import { useToastStore } from "@/app/stores/toast";
import { clientLogger as logger } from "@/app/utils/logger";

import {
  onCreateConcept,
  onRequestConceptSubjects,
} from "./ConceptTable.telefunc";

const { t } = useI18n();
const toastStore = useToastStore();

const props = defineProps<{
  glossaryId: string;
}>();

const isDialogOpen = ref(false);
const definition = ref("");
const selectedSubjectId = ref<number | undefined>(undefined);
const isCreating = ref(false);

// 获取可用的主题列表
const { data: subjects } = useQuery({
  key: ["glossary-concept-subjects", props.glossaryId],
  query: async () => {
    return await onRequestConceptSubjects(props.glossaryId);
  },
  enabled: !import.meta.env.SSR &&  isDialogOpen,
});

const subjectOptions = computed<PickerOption<number>[]>(() => {
  if (!subjects.value) return [];
  return subjects.value.map((subject) => ({
    value: subject.id,
    content: subject.subject,
  }));
});

const createConcept = async () => {
  if (!definition.value.trim()) {
    toastStore.error(t("概念定义不能为空"));
    return;
  }

  isCreating.value = true;

  try {
    await onCreateConcept(
      props.glossaryId,
      definition.value.trim(),
      selectedSubjectId.value !== undefined
        ? [selectedSubjectId.value]
        : undefined,
    );

    toastStore.info(t("概念已成功创建"));
    isDialogOpen.value = false;
    definition.value = "";
    selectedSubjectId.value = undefined;
    // 触发刷新事件
    window.dispatchEvent(new CustomEvent("refresh-concepts"));
  } catch (error) {
    logger.withSituation("WEB").error(error, "创建概念失败");
    toastStore.error(t("创建概念失败，请重试"));
  } finally {
    isCreating.value = false;
  }
};
</script>

<template>
  <Dialog v-model:open="isDialogOpen">
    <DialogTrigger as-child>
      <Button>
        <div class="icon-[mdi--plus] size-4" />
        {{ t("插入概念") }}
      </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t("插入术语概念") }}</DialogTitle>
      </DialogHeader>

      <article class="prose-foreground max-w-460px prose">
        <p>
          {{ t("概念是术语的抽象集合，可以关联到主题并定义统一的概念解释") }}
        </p>
        <p>{{ t("概念可以包含多个术语条目") }}</p>
      </article>

      <div class="space-y-4 py-4">
        <div>
          <Label for="subject">{{ t("所属主题") }}</Label>
          <Picker
            v-model="selectedSubjectId"
            :options="subjectOptions"
            :placeholder="t('选择一个主题（可选）')"
            :portal="true"
            :disabled="isCreating"
          />
        </div>

        <div>
          <Label for="definition">{{ t("概念定义") }}</Label>
          <Textarea
            id="definition"
            v-model="definition"
            :placeholder="t('输入概念定义')"
            rows="4"
            :disabled="isCreating"
          />
        </div>

        <div class="flex justify-end gap-2">
          <Button
            variant="outline"
            @click="isDialogOpen = false"
            :disabled="isCreating"
          >
            {{ t("取消") }}
          </Button>
          <Button @click="createConcept" :disabled="isCreating">
            <span v-if="isCreating">{{ t("创建中...") }}</span>
            <span v-else>{{ t("创建") }}</span>
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
