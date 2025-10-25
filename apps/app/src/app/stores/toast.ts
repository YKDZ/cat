import type { TRPCError } from "@trpc/server";
import { defineStore } from "pinia";
import { ref } from "vue";
import type { ZodError } from "zod/v4";

const defaultDuration = 3;

export type ToastItem = {
  id: number;
  icon?: string;
  message: string;
  type: ToastType;
  startAt: Date;
  duration: number;
  endAt: Date;
};

export type ToastType = "INFO" | "ERROR" | "WARNING";

export const useToastStore = defineStore("toast", () => {
  const toasts = ref<ToastItem[]>([]);
  const index = ref<number>(0);

  const push = (
    message: string,
    icon?: string,
    duration: number = 5,
    type: ToastType = "INFO",
  ) => {
    // 合并相同提示
    for (const toast of toasts.value)
      if (toast.type === type && toast.message === message) {
        toast.duration += duration;
        toast.endAt = new Date(toast.startAt.getTime() + toast.duration * 1000);
        return;
      }

    const startAt = new Date();
    const toast = {
      id: (index.value += 1),
      icon,
      message,
      type,
      duration,
      startAt,
      endAt: new Date(startAt.getTime() + duration * 1000),
    };
    toasts.value.push(toast);
  };

  const info = (message: string, duration = defaultDuration) => {
    push(message, undefined, duration, "INFO");
  };

  const warn = (message: string, duration = defaultDuration) => {
    push(message, undefined, duration, "WARNING");
  };

  const zWarn = (e: ZodError, duration = defaultDuration) => {
    e.issues.forEach((issue) => {
      push(issue.message, undefined, duration, "WARNING");
    });
  };

  const trpcWarn = (e: TRPCError, duration = defaultDuration) => {
    if (!e.message) return;

    warn(e.message, duration);
  };

  const error = (message: string, duration = defaultDuration) => {
    push(message, undefined, duration, "ERROR");
  };

  setInterval(() => {
    toasts.value = toasts.value.filter((toast) => new Date() < toast.endAt);
  }, 200);

  return {
    toasts,
    info,
    warn,
    zWarn,
    trpcWarn,
    error,
  };
});
