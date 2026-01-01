<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import Slash from "@/app/components/Slash.vue";
import UserAvatar from "@/app/components/UserAvatar.vue";

defineProps<{
  memory: Pick<Memory, "name" | "creatorId">;
}>();
</script>

<template>
  <div class="text-lg font-500 flex items-center">
    <UserAvatar :user-id="memory.creatorId" :size="30" with-name link />
    <Slash large />{{ memory.name }}
  </div>
</template>
