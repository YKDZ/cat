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
import type { AcceptableInputValue } from "reka-ui";

const { t } = useI18n();

const props = defineProps<{
  options: PickerOption[];
  placeholder?: string;
}>();

const contentFromValue = (value: AcceptableInputValue | undefined) => {
  return props.options.find((option) => option.value === value)?.content ?? "";
};
</script>

<template>
  <Combobox by="label" :required="true">
    <ComboboxAnchor>
      <div class="relative w-full max-w-sm items-center">
        <ComboboxInput :display-value="contentFromValue" />
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
