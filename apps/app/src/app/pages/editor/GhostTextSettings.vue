<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import { useProfileStore } from "@/app/stores/profile.ts";
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
} from "@cat/app-ui";
import { Sparkles } from "lucide-vue-next";

const { t } = useI18n();

const { ghostTextEnabled, ghostTextDebounceMs } =
  storeToRefs(useProfileStore());

const debounceSliderModel = computed({
  get: () => [ghostTextDebounceMs.value],
  set: (val: number[]) => {
    ghostTextDebounceMs.value = val[0] ?? 800;
  },
});
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
        <FormField name="ghostTextDebounceMs">
          <FormItem>
            <FormLabel>{{ t("响应延迟") }}</FormLabel>
            <FormControl>
              <Slider
                v-model="debounceSliderModel"
                :max="2000"
                :step="100"
                :min="300"
                :disabled="!ghostTextEnabled"
              />
            </FormControl>
            <FormDescription class="flex justify-between">
              <span>{{ t("停止输入多久后触发建议？") }}</span>
              <span>{{ ghostTextDebounceMs }}ms</span>
            </FormDescription>
          </FormItem>
        </FormField>
      </form>
    </DialogContent>
  </Dialog>
</template>
