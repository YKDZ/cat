<script setup lang="ts">
import MarkdownEditor from "@/app/components/editor/MarkdownEditor.vue";
import EditorElementComment from "@/app/components/EditorElementComment.vue";
import { useEditorTableStore } from "@/app/stores/editor/table";
import { computedAsyncClient } from "@/app/utils/vue";
import { trpc } from "@cat/app-api/trpc/client";
import { storeToRefs } from "pinia";
import {
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarContent,
} from "@/app/components/ui/sidebar";
import { ScrollArea } from "@/app/components/ui/scroll-area";
import { Input } from "@/app/components/ui/input";
import { ref } from "vue";
import { Button } from "@/app/components/ui/button";
import { useI18n } from "vue-i18n";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-vue-next";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";

const { t } = useI18n();

const { elementId } = storeToRefs(useEditorTableStore());

const rootComments = computedAsyncClient(async () => {
  if (!elementId.value) return [];
  return await trpc.element.getRootComments.query({
    elementId: elementId.value,
    pageIndex: 0,
    pageSize: 10,
  });
}, []);

const openEditor = defineModel<boolean>("openEditor", { default: false });

const content = ref("");

const comment = async () => {
  if (!elementId.value) return;

  const comment = await trpc.element.comment.mutate({
    elementId: elementId.value,
    content: content.value,
    languageId: "en",
  });

  if (comment.rootCommentId === comment.id) {
    rootComments.value = [comment, ...rootComments.value];
  }
};

const handleDelete = (commentId: number) => {
  rootComments.value = rootComments.value.filter(
    (comment) => comment.id !== commentId,
  );
};
</script>

<template>
  <SidebarContent>
    <ScrollArea class="w-full h-full">
      <SidebarGroup>
        <SidebarGroupContent class="flex flex-col gap-3">
          <EditorElementComment
            v-for="comment in rootComments"
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
      class="h-3 py-1 rounded-md transition-colors hover:bg-muted-foreground/10 text-sm flex items-center justify-center bg-muted text-muted-foreground"
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
