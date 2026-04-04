<script setup lang="ts">
import type { CommentTargetType } from "@cat/shared/schema/enum";

import {
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarContent,
} from "@cat/ui";
import { ScrollArea } from "@cat/ui";
import { Input } from "@cat/ui";
import { Button } from "@cat/ui";
import { ArrowRight, ChevronDown, ChevronUp } from "@lucide/vue";
import { useQuery } from "@pinia/colada";
import { storeToRefs } from "pinia";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import MarkdownEditor from "@/app/components/editor/MarkdownEditor.vue";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";
import { orpc } from "@/app/rpc/orpc";
import { useEditorTableStore } from "@/app/stores/editor/table";

import Comment from "./Comment.vue";

const props = defineProps<{
  targetType: CommentTargetType;
  targetId: number;
}>();

const { t } = useI18n();

const { elementId } = storeToRefs(useEditorTableStore());

const { state, refetch } = useQuery({
  key: ["rootComments", elementId.value, 10, 0],
  placeholderData: [],
  query: () =>
    orpc.comment.getRootComments({
      targetType: props.targetType,
      targetId: props.targetId,
      pageIndex: 0,
      pageSize: 10,
    }),
  enabled: !import.meta.env.SSR,
});

const openEditor = defineModel<boolean>("openEditor", { default: false });

const content = ref("");

const comment = async () => {
  if (!elementId.value) return;

  await orpc.comment.comment({
    targetType: props.targetType,
    targetId: props.targetId,
    content: content.value,
    languageId: "en",
  });

  refetch();
};

const handleDelete = (commentId: number) => {
  refetch();
};
</script>

<template>
  <SidebarContent>
    <ScrollArea class="h-full w-full">
      <SidebarGroup>
        <SidebarGroupContent class="flex flex-col gap-3">
          <Comment
            v-for="comment in state.data"
            :key="comment.id"
            :comment
            @delete="handleDelete"
          />
        </SidebarGroupContent>
      </SidebarGroup>
    </ScrollArea>
  </SidebarContent>
  <SidebarFooter>
    <button
      @click="openEditor = !openEditor"
      class="flex h-3 items-center justify-center rounded-md bg-muted py-1 text-sm text-muted-foreground transition-colors hover:bg-muted-foreground/10"
    >
      <ChevronUp class="size-4" v-if="!openEditor" />
      <ChevronDown class="size-4" v-else />
    </button>
    <div v-if="!openEditor" class="flex gap-1">
      <Input v-model="content" :placeholder="t('在此输入评论内容')" />
      <TextTooltip :tooltip="t('发送评论')">
        <Button @click="comment" size="icon-sm"><ArrowRight /></Button>
      </TextTooltip>
    </div>
    <MarkdownEditor v-else v-model="content">
      <Button @click="comment" class="w-full" size="sm">{{ t("评论") }}</Button>
    </MarkdownEditor>
  </SidebarFooter>
</template>
