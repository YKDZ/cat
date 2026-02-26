<script setup lang="ts">
import Markdown from "@/app/components/Markdown.vue";
import { Separator } from "@cat/app-ui";
import { Textarea } from "@cat/app-ui";
import { Images } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cat/app-ui";

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
          class="min-h-32 rounded-xs border-0 p-2 focus-visible:border-0 focus-visible:ring-1"
        />
      </TabsContent>
      <TabsContent value="preview">
        <Markdown :content="contentToPreview" class="min-h-32 p-2" />
      </TabsContent>
    </Tabs>

    <div class="flex gap-1 p-1 text-xs">
      <span class="flex items-center gap-1 p-1">
        <div class="icon-[mdi--language-markdown-outline] size-4" />
        {{ t("支持 Markdown 语法") }}</span
      >
      <Separator orientation="vertical" />
      <span class="flex items-center gap-1 p-1"
        ><Images class="size-3" />{{ t("拖放或通过按钮上传图片") }}</span
      >
    </div>

    <div>
      <slot />
    </div>
  </div>
</template>
