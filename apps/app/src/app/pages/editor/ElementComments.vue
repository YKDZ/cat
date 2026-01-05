<script setup lang="ts">
import MarkdownEditor from "@/app/components/editor/MarkdownEditor.vue";
import ElementComment from "./ElementComment.vue";
import { useEditorTableStore } from "@/app/stores/editor/table";
import { orpc } from "@/server/orpc";
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
import { useQuery } from "@pinia/colada";

const { t } = useI18n();

const { elementId } = storeToRefs(useEditorTableStore());

const { state, refetch } = useQuery({
  key: ["rootComments", elementId.value, 10, 0],
  placeholderData: [],
  query: () =>
    orpc.element.getRootComments({
      elementId: elementId.value!,
      pageIndex: 0,
      pageSize: 10,
    }),
  enabled: !import.meta.env.SSR,
});

const openEditor = defineModel<boolean>("openEditor", { default: false });

const content = ref("");

const comment = async () => {
  if (!elementId.value) return;

  await orpc.element.comment({
    elementId: elementId.value,
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
    <ScrollArea class="w-full h-full">
      <SidebarGroup>
        <SidebarGroupContent class="flex flex-col gap-3">
          <ElementComment
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
