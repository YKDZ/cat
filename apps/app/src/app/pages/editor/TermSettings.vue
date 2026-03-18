<script setup lang="ts">
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  Slider,
} from "@cat/ui";
import { Settings } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

import { useProfileStore } from "@/app/stores/profile.ts";

const { t } = useI18n();


const { editorTermMinConfidence } = storeToRefs(useProfileStore());
</script>

<template>
  <Dialog>
    <DialogTrigger as-child>
      <Button size="icon-sm" variant="ghost"> <Settings /> </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t("术语设置") }}</DialogTitle>
      </DialogHeader>
      <form class="space-y-3">
        <FormField name="editorTermMinConfidence">
          <FormItem>
            <FormLabel>{{ t("最小置信度") }}</FormLabel>
            <FormControl>
              <Slider
                v-model="editorTermMinConfidence"
                :max="1"
                :step="0.01"
                :min="0"
              />
            </FormControl>
            <FormDescription class="flex justify-between">
              <span>{{ t("多高的置信度视为匹配的术语？") }}</span>
              <span>{{ editorTermMinConfidence[0] }}</span>
            </FormDescription>
          </FormItem>
        </FormField>
      </form>
    </DialogContent>
  </Dialog>
</template>
