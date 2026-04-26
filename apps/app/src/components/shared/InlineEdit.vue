<script setup lang="ts">
import { Button } from "@cat/ui";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import MarkdownEditor from "@/components/editor/MarkdownEditor.vue";
import Markdown from "@/components/Markdown.vue";

const props = defineProps<{
  content: string;
  /** 是否显示编辑按钮（权限控制） */
  canEdit: boolean;
  /** 外部控制的编辑状态 — 为 true 时自动进入编辑模式 */
  editing?: boolean;
}>();

const emit = defineEmits<{
  save: [newContent: string];
  cancel: [];
}>();

const { t } = useI18n();

const isEditing = ref(props.editing ?? false);
const editContent = ref(props.content);

watch(
  () => props.content,
  (val) => {
    if (!isEditing.value) {
      editContent.value = val;
    }
  },
);

watch(
  () => props.editing,
  (val) => {
    if (val && !isEditing.value) {
      editContent.value = props.content;
      isEditing.value = true;
    } else if (val === false && isEditing.value) {
      isEditing.value = false;
    }
  },
);

const startEdit = () => {
  editContent.value = props.content;
  isEditing.value = true;
};

const handleSave = () => {
  emit("save", editContent.value);
  isEditing.value = false;
};

const handleCancel = () => {
  editContent.value = props.content;
  isEditing.value = false;
  emit("cancel");
};
</script>

<template>
  <div>
    <template v-if="isEditing">
      <MarkdownEditor v-model="editContent" />
      <div class="mt-2 flex gap-2">
        <Button size="sm" @click="handleSave">
          {{ t("保存") }}
        </Button>
        <Button size="sm" variant="outline" @click="handleCancel">
          {{ t("取消") }}
        </Button>
      </div>
    </template>
    <template v-else>
      <div class="group relative">
        <Markdown v-if="content" :content="content" />
        <p v-else class="text-sm text-muted-foreground italic">
          {{ t("暂无内容。") }}
        </p>
        <Button
          v-if="canEdit"
          variant="ghost"
          size="icon-sm"
          class="absolute top-0 right-0 opacity-0 group-hover:opacity-100"
          @click="startEdit"
        >
          <div class="icon-[mdi--pencil] size-4" />
        </Button>
      </div>
    </template>
  </div>
</template>
