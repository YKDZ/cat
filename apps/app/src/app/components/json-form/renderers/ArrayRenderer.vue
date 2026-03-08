<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { _JSONSchema, NonNullJSONType } from "@cat/shared/schema/json";
import { _JSONSchemaSchema } from "@cat/shared/schema/json";
import { schemaKey } from "../utils.ts";
import IJsonForm from "../IJsonForm.vue";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@cat/app-ui";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-vue-next";
import { getDefaultFromSchema } from "@cat/shared/utils";

const { t } = useI18n();

const props = defineProps<{
  propertyKey: string | number;
  data: NonNullJSONType;
}>();

const emits = defineEmits<{
  (e: "_update", to: NonNullJSONType): void;
}>();

const schema = inject(schemaKey)!;

const itemsSchema = computed<_JSONSchema>(() => {
  if (schema.items && typeof schema.items === "object") {
    return _JSONSchemaSchema.parse(schema.items);
  }
  return { type: "string" };
});

const items = computed<NonNullJSONType[]>(() => {
  if (Array.isArray(props.data)) return props.data as NonNullJSONType[];
  return [];
});

const collapsedItems = ref<Set<number>>(new Set());

const toggleCollapse = (index: number) => {
  if (collapsedItems.value.has(index)) {
    collapsedItems.value.delete(index);
  } else {
    collapsedItems.value.add(index);
  }
};

const emitUpdate = (newItems: NonNullJSONType[]) => {
  emits("_update", [...newItems]);
};

const addItem = () => {
  const defaultValue = getDefaultFromSchema(itemsSchema.value) ?? {};
  const newItems = [...items.value, defaultValue as NonNullJSONType];
  emitUpdate(newItems);
};

const removeItem = (index: number) => {
  const newItems = items.value.filter((_, i) => i !== index);
  collapsedItems.value.delete(index);
  emitUpdate(newItems);
};

const moveUp = (index: number) => {
  if (index <= 0) return;
  const newItems = [...items.value];
  const temp = newItems[index - 1]!;
  newItems[index - 1] = newItems[index]!;
  newItems[index] = temp;
  emitUpdate(newItems);
};

const moveDown = (index: number) => {
  if (index >= items.value.length - 1) return;
  const newItems = [...items.value];
  const temp = newItems[index + 1]!;
  newItems[index + 1] = newItems[index]!;
  newItems[index] = temp;
  emitUpdate(newItems);
};

const updateItem = (index: number, value: NonNullJSONType) => {
  const newItems = [...items.value];
  newItems[index] = value;
  emitUpdate(newItems);
};
</script>

<template>
  <FormField :name="schema.title ?? String(propertyKey)">
    <FormItem>
      <FormLabel v-if="schema.title || propertyKey">
        {{ schema.title ?? propertyKey }}
      </FormLabel>
      <FormDescription v-if="schema.description">
        {{ schema.description }}
      </FormDescription>
      <FormMessage />

      <div class="space-y-3">
        <Card v-for="(item, index) in items" :key="index">
          <CardHeader
            class="flex flex-row items-center justify-between px-4 py-2"
          >
            <button
              type="button"
              class="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              @click="toggleCollapse(index)"
            >
              <ChevronDown
                class="size-4 transition-transform"
                :class="{ '-rotate-90': collapsedItems.has(index) }"
              />
              <span>#{{ index + 1 }}</span>
            </button>
            <div class="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-7"
                :disabled="index === 0"
                @click="moveUp(index)"
              >
                <ChevronUp class="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-7"
                :disabled="index === items.length - 1"
                @click="moveDown(index)"
              >
                <ChevronDown class="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-7 text-destructive hover:text-destructive"
                @click="removeItem(index)"
              >
                <Trash2 class="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent
            v-show="!collapsedItems.has(index)"
            class="px-4 pt-0 pb-4"
          >
            <IJsonForm
              :schema="itemsSchema"
              :property-key="index"
              :data="item as NonNullJSONType"
              @_update="(to) => updateItem(index, to)"
            />
          </CardContent>
        </Card>

        <Button type="button" variant="outline" class="w-full" @click="addItem">
          <Plus class="mr-2 size-4" />
          {{ t("添加项") }}
        </Button>
      </div>
    </FormItem>
  </FormField>
</template>
