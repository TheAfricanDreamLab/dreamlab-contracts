import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ErrorResponseSchema, TimestampSchema, UuidSchema } from './common';
import { MembershipStatusSchema, OrgKindSchema, OrgStatusSchema } from './directory';

const c = initContract();

const errors = { 400: ErrorResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema } as const;

/*
 * Platform administration (PLT-1), served by IAM: people and organisations across every tenant.
 * The catalog and learning services add their own admin routes (catalogContract, learningContract).
 */

/**
 * An account's standing (PLT-2). Suspended: kept out for a while (until a date, or until a platform
 * admin lets them back in). Banned: closed for breaking the rules; only a platform admin can lift it.
 * Either ends every session at once and stops sign-in.
 */
export const USER_STATUSES = ['active', 'suspended', 'banned'] as const;
export const UserStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof UserStatusSchema>;

/** The longest a suspension with an end date may run; longer means a ban or an open suspension. */
export const MAX_SUSPENSION_DAYS = 365;

/** The last change to someone's standing, for platform admins. */
export const StatusChangeSchema = z.object({
  status: UserStatusSchema,
  /** Why, for the audit trail (platform admins only). */
  reason: z.string(),
  /** What the person was told, if anything. */
  message: z.string().nullable(),
  /** A suspension's end; null for an open suspension, a ban or a reinstatement. */
  until: TimestampSchema.nullable(),
  by: z.object({ userId: UuidSchema, name: z.string() }).nullable(),
  at: TimestampSchema,
});
export type StatusChange = z.infer<typeof StatusChangeSchema>;

export const PlatformOverviewSchema = z.object({
  users: z.object({ total: z.number().int(), new7d: z.number().int(), suspended: z.number().int(), banned: z.number().int().default(0), withMfa: z.number().int() }),
  organizations: z.object({
    total: z.number().int(),
    pending: z.number().int(),
    byKind: z.record(OrgKindSchema, z.number().int()),
  }),
  /** Sign-ups per day for the last 14 days, oldest first. */
  signups: z.array(z.object({ date: z.string(), count: z.number().int() })),
});
export type PlatformOverview = z.infer<typeof PlatformOverviewSchema>;

export const PlatformUserSchema = z.object({
  id: UuidSchema,
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  status: UserStatusSchema,
  /** When a suspension ends by itself; null when it doesn't (or the person isn't suspended). */
  suspendedUntil: TimestampSchema.nullable().default(null),
  verified: z.boolean(),
  mfaEnabled: z.boolean(),
  platformAdmin: z.boolean(),
  membershipCount: z.number().int(),
  createdAt: TimestampSchema,
  lastSignInAt: TimestampSchema.nullable(),
});
export type PlatformUser = z.infer<typeof PlatformUserSchema>;

export const PlatformUserDetailSchema = PlatformUserSchema.extend({
  identities: z.array(z.object({ provider: z.string(), createdAt: TimestampSchema })),
  memberships: z.array(
    z.object({
      orgId: UuidSchema,
      orgName: z.string(),
      orgSlug: z.string(),
      orgStatus: OrgStatusSchema,
      status: MembershipStatusSchema,
      roles: z.array(z.string()),
    }),
  ),
  activeSessions: z.number().int(),
  /** The latest suspension, ban or reinstatement, if any. */
  statusChange: StatusChangeSchema.nullable().default(null),
});
export type PlatformUserDetail = z.infer<typeof PlatformUserDetailSchema>;

export const SetUserStatusSchema = z
  .object({
    status: UserStatusSchema,
    /** Why, for the audit trail; platform admins see it, the person doesn't. */
    reason: z.string().trim().min(3).max(500),
    /** Suspensions only: when it lifts by itself. Absent: until a platform admin lets them back in. */
    until: TimestampSchema.optional(),
    /** Told to the person by email and when they try to sign in (optional). */
    message: z.string().trim().max(500).optional(),
    /** Email the person about it (default yes). */
    notify: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.until === undefined) return;
    if (v.status !== 'suspended') ctx.addIssue({ code: 'custom', path: ['until'], message: 'Only a suspension can have an end date' });
    const at = Date.parse(v.until);
    if (!(at > Date.now())) ctx.addIssue({ code: 'custom', path: ['until'], message: 'The end must be in the future' });
    if (at > Date.now() + MAX_SUSPENSION_DAYS * 86_400_000) ctx.addIssue({ code: 'custom', path: ['until'], message: `At most ${MAX_SUSPENSION_DAYS} days; longer is a ban or an open suspension` });
  });
export type SetUserStatus = z.infer<typeof SetUserStatusSchema>;

/**
 * What sign-in says to someone who is kept out: error codes `account_suspended` and `account_banned`
 * carry these details (the older `account_disabled` remains for other cases).
 */
export const AccountBlockedSchema = z.object({
  status: z.enum(['suspended', 'banned']),
  until: TimestampSchema.nullable(),
  message: z.string().nullable(),
});
export type AccountBlocked = z.infer<typeof AccountBlockedSchema>;

export const platformContract = c.router(
  {
    overview: {
      method: 'GET',
      path: '/platform/overview',
      responses: { 200: PlatformOverviewSchema, ...errors },
      summary: 'People and organisations across the platform (platform admin)',
    },
    listUsers: {
      method: 'GET',
      path: '/platform/users',
      query: z.object({
        q: z.string().trim().max(120).optional(),
        status: UserStatusSchema.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
      responses: { 200: z.object({ items: z.array(PlatformUserSchema), nextCursor: z.string().nullable() }), ...errors },
      summary: 'Find people by name, email or phone, newest first (platform admin)',
    },
    getUser: {
      method: 'GET',
      path: '/platform/users/:userId',
      pathParams: z.object({ userId: UuidSchema }),
      responses: { 200: PlatformUserDetailSchema, ...errors },
      summary: 'A person: sign-in methods, memberships and sessions (platform admin)',
    },
    setUserStatus: {
      method: 'POST',
      path: '/platform/users/:userId/status',
      pathParams: z.object({ userId: UuidSchema }),
      body: SetUserStatusSchema,
      responses: { 200: PlatformUserDetailSchema, 409: ErrorResponseSchema, ...errors },
      summary: 'Suspend a person (for a while or until let back in), ban them, or reinstate them; suspending or banning ends every session at once (platform admin)',
    },
  },
  { strictStatusCodes: true },
);
