<script setup lang="ts">
import { Button } from "@/app/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/app/components/ui/hover-card";
import { BadgeQuestionMark, CircleQuestionMark } from "lucide-vue-next";
</script>

<template>
  <HoverCard>
    <HoverCardTrigger as-child>
      <Button size="icon-sm" variant="ghost"><CircleQuestionMark /> </Button>
    </HoverCardTrigger>
    <HoverCardContent class="w-80">
      <div class="flex justify-between space-x-4">
        <BadgeQuestionMark :size="32" class="shrink-0" />
        <div class="flex-1 prose-sm">
          <slot />
        </div>
      </div>
    </HoverCardContent>
  </HoverCard>
</template>
