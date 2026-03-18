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
  Label,
  Slider,
  Switch,
} from "@cat/ui";
import { Settings } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

import { useProfileStore } from "@/app/stores/profile.ts";

const { t } = useI18n();


const { editorMemoryMinConfidence, editorMemoryAutoCreateMemory } =
  storeToRefs(useProfileStore());
</script>

<template>
  <Dialog>
    <DialogTrigger as-child>
      <Button size="icon-sm" variant="ghost"> <Settings /> </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t("记忆设置") }}</DialogTitle>
      </DialogHeader>
      <form class="space-y-3">
        <FormField name="editorMemoryMinConfidence">
          <FormItem>
            <FormLabel>{{ t("最低置信度") }}</FormLabel>
            <FormControl>
              <Slider
                v-model="editorMemoryMinConfidence"
                :max="1"
                :step="0.01"
                :min="0"
              />
            </FormControl>
            <FormDescription class="flex justify-between">
              <span>{{ t("多高的置信度视为相似？") }}</span>
              <span>{{ editorMemoryMinConfidence[0] }}</span>
            </FormDescription>
          </FormItem>
        </FormField>
        <FormField name="editorMemoryAutoCreateMemory">
          <FormItem>
            <FormControl>
              <div class="flex items-center space-x-2">
                <Label for="editorMemoryAutoCreateMemory">{{
                  t("自动创建记忆")
                }}</Label>
                <Switch
                  v-model="editorMemoryAutoCreateMemory"
                  id="editorMemoryAutoCreateMemory"
                />
              </div>
            </FormControl>
          </FormItem>
        </FormField>
      </form>
    </DialogContent>
  </Dialog>
</template>
