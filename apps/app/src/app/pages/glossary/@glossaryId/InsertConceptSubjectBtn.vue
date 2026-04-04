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
import { Input } from "@cat/ui";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import { useToastStore } from "@/app/stores/toast";
import { clientLogger as logger } from "@/app/utils/logger";

import { onCreateConceptSubject } from "./ConceptTable.telefunc";

const { t } = useI18n();
const toastStore = useToastStore();

const props = defineProps<{
  glossaryId: string;
}>();

const isDialogOpen = ref(false);
const subject = ref("");
const defaultDefinition = ref("");
const isCreating = ref(false);

const createSubject = async () => {
  if (!subject.value.trim()) {
    toastStore.error(t("主题不能为空"));
    return;
  }

  isCreating.value = true;

  try {
    await onCreateConceptSubject(
      props.glossaryId,
      subject.value.trim(),
      defaultDefinition.value.trim() || undefined,
    );

    toastStore.info(t("主题已成功创建"));
    isDialogOpen.value = false;
    subject.value = "";
    defaultDefinition.value = "";
    // 触发刷新事件
    window.dispatchEvent(new CustomEvent("refresh-concepts"));
  } catch (error) {
    logger.withSituation("WEB").error(error, "创建主题失败");
    toastStore.error(t("创建主题失败，请重试"));
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
        {{ t("插入主题") }}
      </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t("插入术语主题") }}</DialogTitle>
      </DialogHeader>

      <article class="prose-foreground max-w-460px prose">
        <p>
          {{ t("主题是术语概念的类别标签，用于组织和管理相关的概念") }}
        </p>
        <p>{{ t("可以为主题设置默认定义，作为该主题下所有概念的回退解释") }}</p>
      </article>

      <div class="space-y-4 py-4">
        <div>
          <Label for="subject">{{ t("主题名称") }}</Label>
          <Input
            id="subject"
            v-model="subject"
            :placeholder="t('输入主题名称')"
            :disabled="isCreating"
          />
        </div>

        <div>
          <Label for="default-definition">{{ t("默认定义") }}</Label>
          <Textarea
            id="default-definition"
            v-model="defaultDefinition"
            :placeholder="t('输入默认定义（可选）')"
            rows="3"
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
          <Button @click="createSubject" :disabled="isCreating">
            <span v-if="isCreating">{{ t("创建中...") }}</span>
            <span v-else>{{ t("创建") }}</span>
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
