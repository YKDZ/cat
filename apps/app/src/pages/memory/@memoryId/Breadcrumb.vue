<script setup lang="ts">
import type { Memory } from "@cat/shared";

import Slash from "@/components/Slash.vue";
import UserAvatar from "@/components/UserAvatar.vue";

defineProps<{
  memory: Pick<Memory, "name" | "creatorId">;
}>();
</script>

<template>
  <div class="font-500 flex items-center text-lg">
    <UserAvatar :user-id="memory.creatorId" :size="30" with-name link />
    <Slash large />{{ memory.name }}
  </div>
</template>
