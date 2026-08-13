<script setup lang="ts">
import { Button } from "@cat/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cat/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@cat/ui";
import { useI18n } from "vue-i18n";

import InsertTermText from "./InsertTermText.vue";

const { t } = useI18n();

defineProps<{
  glossaryId: string;
  glossaryProjectIds: string[];
}>();
</script>

<template>
  <Dialog>
    <DialogTrigger as-child>
      <Button
        ><div class="icon-[mdi--plus] size-4" />
        {{ t("插入术语") }}</Button
      >
    </DialogTrigger>
    <DialogContent class="max-h-[90dvh] overflow-y-auto">
      <DialogHeader
        ><DialogTitle>{{ t("插入术语") }}</DialogTitle>
        <DialogDescription class="sr-only">
          {{
            t(
              "选择术语语言与翻译语言，并以换行符分隔的方式键入左右一一对应的术语和翻译",
            )
          }}
        </DialogDescription></DialogHeader
      >
      <Tabs>
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="string"> {{ t("文本") }} </TabsTrigger>
          <TabsTrigger value="json"> {{ t("JSON") }} </TabsTrigger>
        </TabsList>
        <TabsContent value="string">
          <InsertTermText :glossary-id :glossary-project-ids />
        </TabsContent>
        <TabsContent value="json"> 占位 </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
