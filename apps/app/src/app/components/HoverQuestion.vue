<script setup lang="ts">
import { Button } from "@cat/ui";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@cat/ui";
import { BadgeQuestionMark, CircleQuestionMark } from "@lucide/vue";
</script>

<template>
  <HoverCard>
    <HoverCardTrigger as-child>
      <Button size="icon-sm" variant="ghost"><CircleQuestionMark /> </Button>
    </HoverCardTrigger>
    <HoverCardContent class="w-80">
      <div class="flex justify-between space-x-4">
        <BadgeQuestionMark :size="32" class="shrink-0" />
        <div class="prose-sm flex-1">
          <slot />
        </div>
      </div>
    </HoverCardContent>
  </HoverCard>
</template>
