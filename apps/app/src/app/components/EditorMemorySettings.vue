<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import { useProfileStore } from "@/app/stores/profile.ts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Slider } from "@/app/components/ui/slider";
import { Button } from "@/app/components/ui/button";
import { Settings } from "lucide-vue-next";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/app/components/ui/form";
import Switch from "@/app/components/ui/switch/Switch.vue";
import Label from "@/app/components/ui/label/Label.vue";

const { t } = useI18n();

const { editorMemoryMinSimilarity, editorMemoryAutoCreateMemory } =
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
        <FormField name="editorMemoryMinSimilarity">
          <FormItem>
            <FormLabel>{{ t("最低匹配度") }}</FormLabel>
            <FormControl>
              <Slider
                v-model="editorMemoryMinSimilarity"
                :max="1"
                :step="0.01"
                :min="0"
              />
            </FormControl>
            <FormDescription class="flex justify-between">
              <span>{{ t("多高的匹配度视为相似？") }}</span>
              <span>{{ editorMemoryMinSimilarity[0] }}</span>
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
