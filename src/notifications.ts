import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ErrorResponseSchema, TimestampSchema, UuidSchema } from './common';

const c = initContract();

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
} as const;

/*
 * Notifications (NOTIFY-1). Every notification appears in the app; email follows the person's
 * preference for its category. Services ask for notifications with an event; the notifications
 * service resolves recipients, stores one row per person and sends the email.
 */

export const NOTIFICATION_CATEGORIES = ['grades', 'submissions', 'sessions', 'cohorts', 'authoring', 'admissions', 'community', 'account'] as const;
export const NotificationCategorySchema = z.enum(NOTIFICATION_CATEGORIES);
export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  grades: 'Grades and feedback on my work',
  submissions: 'Work submitted for me to grade',
  sessions: 'Class sessions and meetings',
  cohorts: 'My cohorts',
  authoring: 'Course drafts and reviews',
  admissions: 'Applications and admissions',
  community: 'Mentorship and learning circles',
  account: 'My account',
};

export const NotificationSchema = z.object({
  id: UuidSchema,
  category: NotificationCategorySchema,
  title: z.string(),
  body: z.string(),
  /** An app path to open, e.g. /app/learn/<enrollment>; null when there is nothing to open. */
  link: z.string().nullable(),
  /** Organisation the notification is about, if any. */
  orgId: UuidSchema.nullable(),
  readAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
});
export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationListQuerySchema = z.object({
  unread: z.enum(['true', 'false']).optional(),
  /** The createdAt of the last notification on the previous page. */
  before: TimestampSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const NotificationPreferencesSchema = z.object({
  /** Category → send email. In-app notifications are always on. */
  email: z.record(NotificationCategorySchema, z.boolean()),
});
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

export const notificationsContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/notifications',
      query: NotificationListQuerySchema,
      responses: { 200: z.object({ items: z.array(NotificationSchema), unread: z.number().int(), hasMore: z.boolean() }), ...errors },
      summary: 'My notifications, newest first',
    },
    unreadCount: {
      method: 'GET',
      path: '/notifications/unread-count',
      responses: { 200: z.object({ unread: z.number().int() }), ...errors },
      summary: 'How many of my notifications are unread',
    },
    markRead: {
      method: 'POST',
      path: '/notifications/:id/read',
      pathParams: z.object({ id: UuidSchema }),
      body: c.noBody(),
      responses: { 204: c.noBody(), ...errors },
      summary: 'Mark one notification read',
    },
    markAllRead: {
      method: 'POST',
      path: '/notifications/read-all',
      body: c.noBody(),
      responses: { 204: c.noBody(), ...errors },
      summary: 'Mark every notification read',
    },
    preferences: {
      method: 'GET',
      path: '/notifications/preferences',
      responses: { 200: NotificationPreferencesSchema, ...errors },
      summary: 'Which categories I get by email',
    },
    updatePreferences: {
      method: 'PUT',
      path: '/notifications/preferences',
      body: NotificationPreferencesSchema,
      responses: { 200: NotificationPreferencesSchema, ...errors },
      summary: 'Choose which categories I get by email',
    },
  },
  { strictStatusCodes: true },
);
