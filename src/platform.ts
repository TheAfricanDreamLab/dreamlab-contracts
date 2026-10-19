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

export const UserStatusSchema = z.enum(['active', 'suspended']);

export const PlatformOverviewSchema = z.object({
  users: z.object({ total: z.number().int(), new7d: z.number().int(), suspended: z.number().int(), withMfa: z.number().int() }),
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
});
export type PlatformUserDetail = z.infer<typeof PlatformUserDetailSchema>;

export const SetUserStatusSchema = z.object({
  status: UserStatusSchema,
  /** Shown in the audit trail. */
  reason: z.string().trim().min(3).max(500),
});

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
      summary: 'Suspend a person (ends every session at once) or reactivate them (platform admin)',
    },
  },
  { strictStatusCodes: true },
);
