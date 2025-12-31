import { defineStore } from "pinia";
import type { Component } from "vue";
import { toast } from "vue-sonner";
import { z, type ZodError } from "zod/v4";

const defaultDuration = 3000;

export type ToastItem = {
  icon?: string;
  message: string;
};

export const useToastStore = defineStore("toast", () => {
  const info = (
    message: string,
    icon?: Component,
    duration = defaultDuration,
  ) => {
    toast(message, {
      duration,
      icon,
    });
  };

  const warn = (
    message: string,
    icon?: Component,
    duration = defaultDuration,
  ) => {
    toast(message, {
      duration,
      icon,
    });
  };

  const zWarn = (e: ZodError, icon: Component, duration = defaultDuration) => {
    e.issues.forEach((issue) => {
      toast(issue.message, {
        duration,
      });
    });
  };

  const rpcWarn = (
    e: unknown,
    icon?: Component,
    duration = defaultDuration,
  ) => {
    const { message } = z.object({ message: z.string().optional() }).parse(e);

    if (!message) return;

    warn(message, icon, duration);
  };

  const error = (
    message: string,
    icon?: Component,
    duration = defaultDuration,
  ) => {
    toast(message, {
      duration,
      icon,
    });
  };

  return {
    info,
    warn,
    zWarn,
    rpcWarn,
    error,
  };
});
