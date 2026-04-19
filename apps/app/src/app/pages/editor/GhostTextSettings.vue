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
  Label,
  Switch,
} from "@cat/ui";
import { Sparkles } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";

import { useProfileStore } from "@/app/stores/profile.ts";

const { t } = useI18n();

const { ghostTextEnabled, ghostTextFallbackStrategy } =
  storeToRefs(useProfileStore());
</script>

<template>
  <Dialog>
    <DialogTrigger as-child>
      <Button size="icon-sm" variant="ghost">
        <Sparkles />
      </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t("幽灵文本设置") }}</DialogTitle>
      </DialogHeader>
      <form class="space-y-3">
        <FormField name="ghostTextEnabled">
          <FormItem>
            <FormControl>
              <div class="flex items-center space-x-2">
                <Label for="ghostTextEnabled">{{
                  t("启用自动幽灵文本建议")
                }}</Label>
                <Switch id="ghostTextEnabled" v-model="ghostTextEnabled" />
              </div>
            </FormControl>
          </FormItem>
        </FormField>
        <FormField name="ghostTextFallbackStrategy">
          <FormItem>
            <Label for="ghostTextFallbackStrategy">{{ t("回退策略") }}</Label>
            <FormControl>
              <select
                id="ghostTextFallbackStrategy"
                v-model="ghostTextFallbackStrategy"
                :disabled="!ghostTextEnabled"
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm ring-offset-background focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="none">{{ t("无回退") }}</option>
                <option value="first-memory">
                  {{ t("第一条翻译记忆") }}
                </option>
                <option value="first-suggestion">
                  {{ t("第一条翻译建议") }}
                </option>
                <option value="best-confidence">
                  {{ t("最高置信度") }}
                </option>
              </select>
            </FormControl>
            <FormDescription>
              {{ t("当没有预翻译结果时的回退行为。") }}
            </FormDescription>
          </FormItem>
        </FormField>
      </form>
    </DialogContent>
  </Dialog>
</template>
