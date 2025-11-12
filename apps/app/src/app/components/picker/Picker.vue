<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { PickerOption } from "./index.ts";
import {
  Combobox,
  ComboboxAnchor,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from "@/app/components/ui/combobox";
import { Check, Search } from "lucide-vue-next";

const { t } = useI18n();

defineProps<{
  options: PickerOption[];
  placeholder?: string;
}>();
</script>

<template>
  <Combobox by="label">
    <ComboboxAnchor>
      <div class="relative w-full max-w-sm items-center">
        <ComboboxInput
          class="pl-9"
          :display-value="(val) => val?.content ?? ''"
          :placeholder
        />
        <span
          class="absolute start-0 inset-y-0 flex items-center justify-center px-3"
        >
          <Search class="size-4 text-muted-foreground" />
        </span>
      </div>
    </ComboboxAnchor>

    <ComboboxList>
      <ComboboxEmpty> {{ t("没有可用选项") }} </ComboboxEmpty>

      <ComboboxGroup>
        <ComboboxItem
          v-for="option in options"
          :key="option.content"
          :value="option.value"
        >
          {{ option.content }}

          <ComboboxItemIndicator>
            <Check />
          </ComboboxItemIndicator>
        </ComboboxItem>
      </ComboboxGroup>
    </ComboboxList>
  </Combobox>
</template>
