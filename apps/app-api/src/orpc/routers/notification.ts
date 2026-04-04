import {
  countUnread,
  executeCommand,
  executeQuery,
  getNotification,
  listNotifications,
  listPreferences,
  markAllNotificationsRead,
  markNotificationRead,
  upsertMessagePreference,
} from "@cat/domain";
import {
  MessageCategorySchema,
  MessageChannelSchema,
  NotificationStatusSchema,
} from "@cat/shared/schema/enum";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";

export const list = authed
  .input(
    z.object({
      pageIndex: z.int().nonnegative(),
      pageSize: z.int().positive().max(100),
      statusFilter: NotificationStatusSchema.optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
      user,
    } = context;
    return executeQuery({ db }, listNotifications, {
      userId: user.id,
      ...input,
    });
  });

export const getById = authed
  .input(z.object({ notificationId: z.int() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
      user,
    } = context;
    return executeQuery({ db }, getNotification, {
      notificationId: input.notificationId,
      userId: user.id,
    });
  });

export const unreadCount = authed.handler(async ({ context }) => {
  const {
    drizzleDB: { client: db },
    user,
  } = context;
  return executeQuery({ db }, countUnread, { userId: user.id });
});

export const markRead = authed
  .input(z.object({ notificationId: z.int() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
      user,
    } = context;
    await executeCommand({ db }, markNotificationRead, {
      notificationId: input.notificationId,
      userId: user.id,
    });
  });

export const markAllRead = authed.handler(async ({ context }) => {
  const {
    drizzleDB: { client: db },
    user,
  } = context;
  await executeCommand({ db }, markAllNotificationsRead, { userId: user.id });
});

export const stream = authed.handler(async function* ({ context }) {
  const { user } = context;
  const gateway = globalThis.messageGateway;

  if (!gateway) {
    throw new Error("MessageGateway not initialized");
  }

  const queue = gateway.connections.connect(user.id);
  try {
    for await (const notification of queue.consume()) {
      yield notification;
    }
  } finally {
    gateway.connections.disconnect(user.id, queue);
  }
});

export const getPreferences = authed.handler(async ({ context }) => {
  const {
    drizzleDB: { client: db },
    user,
  } = context;
  return executeQuery({ db }, listPreferences, { userId: user.id });
});

export const updatePreference = authed
  .input(
    z.object({
      category: MessageCategorySchema,
      channel: MessageChannelSchema,
      enabled: z.boolean(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
      user,
    } = context;
    await executeCommand({ db }, upsertMessagePreference, {
      userId: user.id,
      category: input.category,
      channel: input.channel,
      enabled: input.enabled,
    });
  });
