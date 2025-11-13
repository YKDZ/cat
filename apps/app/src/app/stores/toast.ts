import type { TRPCError } from "@trpc/server";
import { defineStore } from "pinia";
import type { Component } from "vue";
import { toast } from "vue-sonner";
import type { ZodError } from "zod/v4";

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

  const trpcWarn = (
    e: TRPCError,
    icon?: Component,
    duration = defaultDuration,
  ) => {
    if (!e.message) return;

    warn(e.message, icon, duration);
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
    trpcWarn,
    error,
  };
});
