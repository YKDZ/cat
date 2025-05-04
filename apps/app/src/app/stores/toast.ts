import { TRPCClientError } from "@trpc/client";
import { defineStore } from "pinia";
import { ref } from "vue";
import { ZodError } from "zod";

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

export type ToastType = "INFO" | "ERROR" | "WARNNING";

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
      id: index.value++,
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
    push(message, undefined, duration, "WARNNING");
  };

  const zWarn = (e: ZodError, duration = defaultDuration) => {
    e.issues.forEach((issue) =>
      push(issue.message, undefined, duration, "WARNNING"),
    );
  };

  const trpcWarn = (e: TRPCClientError<never>, duration = defaultDuration) => {
    warn(e.message + e.cause, duration);
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
