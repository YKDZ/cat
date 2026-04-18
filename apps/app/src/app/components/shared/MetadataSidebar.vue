<script setup lang="ts">
import {
  Badge,
  Button,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@cat/ui";
import { Settings } from "@lucide/vue";

import UserAvatar from "@/app/components/UserAvatar.vue";

export type MetadataItem =
  | { kind: "user"; userId: string }
  | {
      kind: "badge";
      label: string;
      variant?: "default" | "secondary" | "outline" | "destructive";
    }
  | { kind: "link"; label: string; href: string };

export type MetadataSection = {
  title: string;
  items: MetadataItem[];
  onEdit?: () => void;
};

defineProps<{
  sections: MetadataSection[];
}>();
</script>

<template>
  <aside class="w-64 shrink-0 space-y-4">
    <div v-for="(section, idx) in sections" :key="idx">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-medium text-muted-foreground">
          {{ section.title }}
        </h3>
        <Tooltip v-if="section.onEdit">
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon-sm" @click="section.onEdit">
              <Settings class="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{{ section.title }}</TooltipContent>
        </Tooltip>
      </div>
      <div class="mt-1 space-y-1">
        <template v-for="(item, i) in section.items" :key="i">
          <div
            v-if="item.kind === 'user'"
            class="flex items-center gap-2 py-0.5"
          >
            <UserAvatar :user-id="item.userId" :size="20" with-name />
          </div>
          <Badge
            v-else-if="item.kind === 'badge'"
            :variant="item.variant ?? 'secondary'"
            class="mr-1"
          >
            {{ item.label }}
          </Badge>
          <a
            v-else-if="item.kind === 'link'"
            :href="item.href"
            class="block text-sm text-primary hover:underline"
          >
            {{ item.label }}
          </a>
        </template>
        <p
          v-if="section.items.length === 0"
          class="text-xs text-muted-foreground"
        >
          —
        </p>
      </div>
      <Separator v-if="idx < sections.length - 1" class="mt-3" />
    </div>
  </aside>
</template>
