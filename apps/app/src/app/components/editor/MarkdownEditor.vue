<script setup lang="ts">
import Markdown from "@/app/components/Markdown.vue";
import { Separator } from "@/app/components/ui/separator";
import { Textarea } from "@/app/components/ui/textarea";
import { Images } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";

const { t } = useI18n();

const content = defineModel<string>({ default: "" });

const contentToPreview = computed(() => {
  return content.value.length === 0 ? t("没有可预览的内容") : content.value;
});
</script>

<template>
  <div class="bg-muted">
    <Tabs default-value="edit">
      <TabsList>
        <TabsTrigger value="edit">
          {{ t("编辑") }}
        </TabsTrigger>
        <TabsTrigger value="preview">
          {{ t("预览") }}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="edit">
        <Textarea
          v-model="content"
          :placeholder="t('在此输入文本')"
          class="min-h-32 p-2 rounded-xs focus-visible:ring-1 focus-visible:border-0 border-0"
        />
      </TabsContent>
      <TabsContent value="preview">
        <Markdown :content="contentToPreview" class="p-2 min-h-32" />
      </TabsContent>
    </Tabs>

    <div class="flex gap-1 text-xs p-1">
      <span class="p-1 flex gap-1 items-center">
        <div class="icon-[mdi--language-markdown-outline] size-4" />
        {{ t("支持 Markdown 语法") }}</span
      >
      <Separator orientation="vertical" />
      <span class="p-1 flex gap-1 items-center"
        ><Images class="size-3" />{{ t("拖放或通过按钮上传图片") }}</span
      >
    </div>

    <div>
      <slot />
    </div>
  </div>
</template>
