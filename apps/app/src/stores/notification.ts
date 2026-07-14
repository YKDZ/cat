import type { NotificationPushPayload } from "@cat/message";
import { defineStore } from "pinia";
import { ref } from "vue";

import { orpc } from "#/rpc/orpc.ts";
import { setNotificationStreamSignal, waitForWsOpen, ws } from "#/rpc/ws.ts";
import { clientLogger as logger } from "#/utils/logger.ts";

export type NotificationItem = {
  id: number;
  category: string;
  title: string;
  body: string;
  status: "UNREAD" | "READ" | "ARCHIVED";
  data: unknown;
  createdAt: Date;
};

const isNotificationPushPayload = (
  value: unknown,
): value is NotificationPushPayload => {
  if (typeof value !== "object" || value === null) return false;
  const notificationId = Reflect.get(value, "notificationId");
  const recipientId = Reflect.get(value, "recipientId");
  const category = Reflect.get(value, "category");
  const title = Reflect.get(value, "title");
  const body = Reflect.get(value, "body");
  return (
    typeof notificationId === "number" &&
    typeof recipientId === "string" &&
    typeof category === "string" &&
    typeof title === "string" &&
    typeof body === "string"
  );
};

/**
 * Notification store — manages in-app notification state and real-time stream.
 */
export const useNotificationStore = defineStore("notification", () => {
  const unreadCount = ref(0);
  const recentNotifications = ref<NotificationItem[]>([]);
  const isStreaming = ref(false);
  let abortController: AbortController | null = null;
  let navigationStopInstalled = false;

  const stopStreaming = () => {
    abortController?.abort();
    abortController = null;
    isStreaming.value = false;
    if (navigationStopInstalled && typeof window !== "undefined") {
      window.removeEventListener("beforeunload", stopStreaming);
      navigationStopInstalled = false;
    }
  };

  /** Load recent notifications and unread count. */
  const loadInitial = async () => {
    const [count, items] = await Promise.all([
      orpc.notification.unreadCount(),
      orpc.notification.list({ pageIndex: 0, pageSize: 10 }),
    ]);
    unreadCount.value = count;
    recentNotifications.value = items as NotificationItem[];
  };

  /** Start the WebSocket notification stream. */
  const startStreaming = async () => {
    if (isStreaming.value) return;
    isStreaming.value = true;
    const controller = new AbortController();
    abortController = controller;
    setNotificationStreamSignal(controller.signal);
    if (!navigationStopInstalled && typeof window !== "undefined") {
      window.addEventListener("beforeunload", stopStreaming, { once: true });
      navigationStopInstalled = true;
    }

    try {
      await waitForWsOpen(controller.signal);
      const stream = await ws.notification.stream(undefined, {
        signal: controller.signal,
      });
      for await (const payload of stream) {
        if (controller.signal.aborted) break;
        if (!isNotificationPushPayload(payload)) continue;
        const item = payload;
        unreadCount.value += 1;
        recentNotifications.value.unshift({
          id: item.notificationId,
          category: item.category,
          title: item.title,
          body: item.body,
          status: "UNREAD",
          data: item.data,
          createdAt: new Date(),
        });
        // 保持最近 10 条
        if (recentNotifications.value.length > 10) {
          recentNotifications.value = recentNotifications.value.slice(0, 10);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        logger
          .child({ component: "web" })
          .error("Notification stream error", { error: err });
      }
    } finally {
      setNotificationStreamSignal(undefined);
      isStreaming.value = false;
    }
  };

  /** Mark a notification as read. */
  const markRead = async (notificationId: number) => {
    await orpc.notification.markRead({ notificationId });
    const item = recentNotifications.value.find((n) => n.id === notificationId);
    if (item && item.status === "UNREAD") {
      item.status = "READ";
      unreadCount.value = Math.max(0, unreadCount.value - 1);
    }
  };

  /** Mark all notifications as read. */
  const markAllRead = async () => {
    await orpc.notification.markAllRead();
    recentNotifications.value.forEach((n) => (n.status = "READ"));
    unreadCount.value = 0;
  };

  return {
    unreadCount,
    recentNotifications,
    isStreaming,
    loadInitial,
    startStreaming,
    stopStreaming,
    markRead,
    markAllRead,
  };
});
