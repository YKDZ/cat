<script setup lang="ts">
import type { Glossary } from "@cat/shared";
import Slash from "./Slash.vue";
import UserAvatar from "./UserAvatar.vue";

const props = defineProps<{
  glossary: Glossary;
}>();
</script>

<template>
  <div class="text-lg font-500 flex items-center">
    <UserAvatar
      v-if="glossary.Creator"
      :user="glossary.Creator"
      :size="30"
      with-name
      link
    />
    <Slash large />{{ glossary.name }}
  </div>
</template>
