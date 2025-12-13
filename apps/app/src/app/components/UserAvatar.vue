<script setup lang="ts">
import type { User } from "@cat/shared/schema/drizzle/user";
import { trpc } from "@cat/app-api/trpc/client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/components/ui/avatar";
import { Skeleton } from "@/app/components/ui/skeleton";
import { computedAsyncClient } from "@/app/utils/vue";
import { watch } from "vue";

const props = withDefaults(
  defineProps<{
    user?: Pick<User, "id" | "name"> | null;
    userId?: string | null;
    withName?: boolean;
    size?: number;
  }>(),
  {
    size: 16,
    withName: false,
  },
);

const user = computedAsyncClient(async () => {
  if (import.meta.env.SSR) return null;

  if (!props.user && props.userId) {
    return await trpc.user.get.query({ userId: props.userId });
  } else if (props.user) {
    return props.user as User;
  }
  return null;
}, null);

const modelValue = defineModel<User | null>({ default: null });

const avatarUrl = computedAsyncClient(async () => {
  if (!user.value) return "";

  return (
    (await trpc.user.getAvatarPresignedUrl.query({ userId: user.value.id })) ??
    ""
  );
}, "");

watch(user, (newUser) => {
  modelValue.value = newUser ?? null;
});
</script>

<template>
  <KeepAlive :max="16">
    <div class="flex items-center gap-3" :class="$attrs.class">
      <Skeleton
        v-if="!user"
        class="rounded-full aspect-square"
        :style="{
          width: `${size}px`,
          height: `${size}px`,
        }"
      />
      <Skeleton v-if="!user && withName" class="h-8 w-24" />
      <Avatar
        v-if="user"
        :style="{
          width: `${size}px`,
          height: `${size}px`,
        }"
        class="transition-all ease-linear"
      >
        <AvatarImage :src="avatarUrl" />
        <AvatarFallback>
          <span class="font-bold">{{ user.name.charAt(0).toUpperCase() }}</span>
        </AvatarFallback>
      </Avatar>
      <span v-if="user && withName" class="-ml-1.5">{{ user.name }}</span>
    </div>
  </KeepAlive>
</template>
