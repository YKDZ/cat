<script setup lang="ts">
import type { User } from "@cat/shared/schema/drizzle/user";
import { orpc } from "@/server/orpc";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/app/components/ui/avatar";
import { Skeleton } from "@/app/components/ui/skeleton";
import { computed } from "vue";
import { useQuery } from "@pinia/colada";

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

const userId = computed(() => {
  if (props.userId) return props.userId;
  else return props.user!.id;
});

const { state: userState } = useQuery({
  key: ["user", userId.value],
  query: () => {
    if (!props.user && props.userId) {
      return orpc.user.get({ userId: props.userId });
    } else if (props.user) {
      return Promise.resolve(props.user);
    }
    throw new Error("Must provide at least one of user or userId");
  },
  enabled: !import.meta.env.SSR,
});

const { state: avatarUrlState } = useQuery({
  key: ["avatarUrl", userId.value],
  placeholderData: "",
  query: () => orpc.user.getAvatarPresignedUrl({ userId: userId.value }),
  enabled: !import.meta.env.SSR,
});
</script>

<template>
  <KeepAlive :max="16">
    <div class="flex items-center gap-3" :class="$attrs.class">
      <Skeleton
        v-if="!userState.data"
        class="rounded-full aspect-square"
        :style="{
          width: `${size}px`,
          height: `${size}px`,
        }"
      />
      <Skeleton v-if="!userState.data && withName" class="h-8 w-24" />
      <Avatar
        v-if="userState.data"
        :style="{
          width: `${size}px`,
          height: `${size}px`,
        }"
        class="transition-all ease-linear"
      >
        <AvatarImage :src="avatarUrlState.data ?? ''" />
        <AvatarFallback>
          <span class="font-bold">{{
            userState.data.name.charAt(0).toUpperCase()
          }}</span>
        </AvatarFallback>
      </Avatar>
      <span v-if="user && withName" class="-ml-1.5">{{ user.name }}</span>
    </div>
  </KeepAlive>
</template>
