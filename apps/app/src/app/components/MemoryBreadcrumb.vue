<script setup lang="ts">
import type { Memory } from "@cat/shared";
import Slash from "./Slash.vue";
import UserAvatar from "./UserAvatar.vue";

const props = defineProps<{
  memory: Memory;
}>();
</script>

<template>
  <div class="text-lg font-500 flex items-center">
    <UserAvatar
      v-if="memory.Creator"
      :user="memory.Creator"
      :size="30"
      with-name
      link
    />
    <Slash large />{{ memory.name }}
  </div>
</template>
