<script setup lang="ts">
import type { Project } from "@cat/shared/schema/prisma/project";
import Slash from "./Slash.vue";
import UserAvatar from "./UserAvatar.vue";

const props = defineProps<{
  project: Project;
}>();
</script>

<template>
  <div class="text-lg font-500 flex items-center">
    <UserAvatar
      v-if="project.Creator"
      :user="project.Creator"
      :size="30"
      with-name
      link
    />
    <Slash large />{{ project.name }}
  </div>
</template>
