<script setup lang="ts">
import type { Glossary } from "@cat/shared/schema/drizzle/glossary";
import type { User } from "@cat/shared/schema/drizzle/user";
import Slash from "./Slash.vue";
import UserAvatar from "./UserAvatar.vue";

defineProps<{
  glossary: Glossary & {
    Creator: User;
  };
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
