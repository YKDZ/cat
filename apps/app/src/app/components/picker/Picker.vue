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
  ComboboxTrigger,
} from "@/app/components/ui/combobox";
import { Check, ChevronDown, Search, X } from "lucide-vue-next";
import {
  ComboboxCancel,
  ComboboxVirtualizer,
  type AcceptableInputValue,
} from "reka-ui";
import { Button } from "@/app/components/ui/button";
import ComboboxViewport from "@/app/components/ui/combobox/ComboboxViewport.vue";
import { ref } from "vue";
import TextTooltip from "@/app/components/tooltip/TextTooltip.vue";

const { t } = useI18n();

defineProps<{
  options: PickerOption[];
  placeholder: string;
}>();

const modelValue = defineModel<AcceptableInputValue>();
const search = defineModel<string>("search", { default: "" });

const selectedOption = ref<PickerOption>();

const onSelect = (value: PickerOption | undefined) => {
  selectedOption.value =
    selectedOption.value?.value === value?.value ? undefined : value;
  modelValue.value = selectedOption.value ?? undefined;
};
</script>

<template>
  <Combobox :modelValue="selectedOption" by="label" ignore-filter>
    <ComboboxAnchor as-child>
      <div class="flex gap-1 w-fit min-w-48">
        <ComboboxTrigger as-child>
          <Button variant="outline" class="w-full">
            {{ selectedOption?.content ?? placeholder }}
            <ChevronDown class="ml-auto h-4 w-4 shrink-0 opacity-50 self-end" />
          </Button>
        </ComboboxTrigger>
        <ComboboxCancel as-child>
          <TextTooltip :tooltip="t('清除选项')">
            <Button
              v-if="selectedOption"
              @click="onSelect(selectedOption)"
              variant="ghost"
              size="icon"
            >
              <X />
            </Button>
          </TextTooltip>
        </ComboboxCancel>
      </div>
    </ComboboxAnchor>

    <ComboboxList>
      <div class="relative w-full max-w-sm items-center">
        <ComboboxInput
          class="focus-visible:ring-0 rounded-none h-10"
          v-model="search"
          :placeholder
        />
        <span
          class="absolute start-0 inset-y-0 flex items-center justify-center px-3"
        >
          <Search class="size-4 text-muted-foreground" />
        </span>
      </div>

      <ComboboxEmpty> {{ t("没有可用选项") }} </ComboboxEmpty>

      <ComboboxViewport>
        <ComboboxGroup
          ><ComboboxVirtualizer
            v-slot="{ option }"
            :options
            :text-content="(x) => x.content"
            :estimate-size="24"
          >
            <ComboboxItem
              class="w-full"
              @select="(e) => onSelect(e.detail.value as PickerOption)"
              :value="option"
            >
              {{ option.content }}

              <ComboboxItemIndicator
                v-if="selectedOption?.value === option.value"
              >
                <Check />
              </ComboboxItemIndicator>
            </ComboboxItem>
          </ComboboxVirtualizer> </ComboboxGroup
      ></ComboboxViewport>
    </ComboboxList>
  </Combobox>
</template>
