<script setup lang="ts">
import type { Memory } from "@cat/shared/schema/drizzle/memory";
import type { User } from "@cat/shared/schema/drizzle/user";
import Slash from "./Slash.vue";
import UserAvatar from "./UserAvatar.vue";

defineProps<{
  memory: Memory & {
    Creator: User;
  };
}>();
</script>

<template>
  <div class="text-lg font-500 flex items-center">
    <UserAvatar :user="memory.Creator" :size="30" with-name link />
    <Slash large />{{ memory.name }}
  </div>
</template>
