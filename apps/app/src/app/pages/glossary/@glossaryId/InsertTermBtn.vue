<script setup lang="ts">
import { Button } from "@cat/ui";
import {
  Dialog,
  DialogContent,
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
}>();
</script>

<template>
  <Dialog>
    <DialogTrigger>
      <Button
        ><div class="icon-[mdi--plus] size-4" />
        {{ t("插入术语") }}</Button
      >
    </DialogTrigger>
    <DialogContent class="max-h-[90dvh] overflow-y-auto">
      <DialogHeader
        ><DialogTitle>{{ t("插入术语") }}</DialogTitle></DialogHeader
      >
      <Tabs>
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="string"> {{ t("文本") }} </TabsTrigger>
          <TabsTrigger value="json"> {{ t("JSON") }} </TabsTrigger>
        </TabsList>
        <TabsContent value="string">
          <InsertTermText :glossary-id />
        </TabsContent>
        <TabsContent value="json"> 占位 </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
