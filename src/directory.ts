import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  EmailSchema,
  ErrorResponseSchema,
  PageQuerySchema,
  PhoneSchema,
  SlugSchema,
  TimestampSchema,
  UuidSchema,
  pageOf,
} from './common';
import { PermissionSchema, RoleKeySchema, ScopeTypeSchema } from './permissions';

const c = initContract();

// ---------- Organisations ----------

export const ORG_KINDS = ['institution', 'enterprise', 'partner', 'sponsor', 'platform'] as const;
export const OrgKindSchema = z.enum(ORG_KINDS);
export type OrgKind = z.infer<typeof OrgKindSchema>;

/** pending: signed up, waiting for platform approval (set-up allowed, not live). */
export const OrgStatusSchema = z.enum(['pending', 'active', 'suspended']);

/** Slugs that are hostnames or routes of the platform itself, never organisation subdomains. */
export const RESERVED_SLUGS = [
  'www', 'api', 'app', 'admin', 'platform', 'static', 'cdn', 'mail', 'email', 'docs', 'status', 'help', 'support',
  'auth', 'login', 'signup', 'staging', 'dev', 'test', 'assets', 'media', 'blog', 'traefik', 'rabbitmq', 'grafana',
] as const;

export const OrganizationSchema = z.object({
  id: UuidSchema,
  slug: SlugSchema,
  name: z.string(),
  kinds: z.array(OrgKindSchema),
  parentOrgId: UuidSchema.nullable(),
  status: OrgStatusSchema,
  branding: z.record(z.unknown()),
  terminology: z.record(z.string()),
  dataRegion: z.string(),
  createdAt: TimestampSchema,
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const PublicOrganizationSchema = OrganizationSchema.pick({ id: true, slug: true, name: true, kinds: true, branding: true, terminology: true });
export const MemberOrganizationSchema = PublicOrganizationSchema.extend({ status: OrgStatusSchema });

export const CreateOrganizationSchema = z.object({
  /** Subdomain (<slug>.theafricandreamlab.com). Omit it to have one generated from the name. */
  slug: SlugSchema.refine((s) => !(RESERVED_SLUGS as readonly string[]).includes(s), 'That name is reserved').optional(),
  name: z.string().trim().min(2).max(160),
  kinds: z.array(OrgKindSchema.exclude(['platform'])).min(1),
  parentOrgId: UuidSchema.optional(),
  branding: z.record(z.unknown()).default({}),
  terminology: z.record(z.string()).default({}),
  dataRegion: z.string().min(2).max(16).default('ng'),
  /** Optional first admin: an existing user is made org_admin, otherwise an invitation is sent. */
  firstAdmin: z.object({ email: EmailSchema.optional(), phone: PhoneSchema.optional() }).optional(),
});

/** Self-service sign-up. The caller becomes the organisation's first admin. */
export const SignUpOrganizationSchema = z.object({
  /** Subdomain (<slug>.theafricandreamlab.com). Omit it to have one generated from the name. */
  slug: SlugSchema.refine((s) => !(RESERVED_SLUGS as readonly string[]).includes(s), 'That name is reserved').optional(),
  name: z.string().trim().min(2).max(160),
  /** enterprise goes live at once; institution, partner and sponsor wait for approval. */
  kind: OrgKindSchema.exclude(['platform']),
  dataRegion: z.string().min(2).max(16).default('ng'),
  profile: z
    .object({
      industry: z.string().max(80).optional(),
      sizeBand: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']).optional(),
    })
    .default({}),
});

export const UpdateOrganizationSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    branding: z.record(z.unknown()),
    terminology: z.record(z.string()),
    status: OrgStatusSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const OrgParams = z.object({ orgId: UuidSchema });

// ---------- Members, roles, invitations ----------

/** requested: asked to join through a verified email domain; an admin approves. */
export const MembershipStatusSchema = z.enum(['invited', 'requested', 'active', 'suspended', 'left']);
export const MembershipSourceSchema = z.enum(['invite', 'self', 'domain', 'scim', 'import', 'bootstrap']);

export const RoleAssignmentSchema = z.object({
  id: UuidSchema,
  membershipId: UuidSchema,
  roleKey: RoleKeySchema,
  scopeType: ScopeTypeSchema,
  scopeId: UuidSchema.nullable(),
  startsAt: TimestampSchema.nullable(),
  endsAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
});

export const MemberUserSchema = z.object({
  id: UuidSchema,
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});

export const MembershipSchema = z.object({
  id: UuidSchema,
  orgId: UuidSchema,
  userId: UuidSchema,
  orgUnitId: UuidSchema.nullable(),
  status: MembershipStatusSchema,
  source: MembershipSourceSchema,
  externalId: z.string().nullable(),
  jobTitle: z.string().nullable(),
  user: MemberUserSchema,
  roles: z.array(RoleAssignmentSchema),
  joinedAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
});
export type Membership = z.infer<typeof MembershipSchema>;

export const MemberListQuerySchema = PageQuerySchema.extend({
  status: MembershipStatusSchema.optional(),
  orgUnitId: UuidSchema.optional(),
  q: z.string().max(120).optional(),
});

export const UpdateMembershipSchema = z
  .object({
    orgUnitId: UuidSchema.nullable(),
    jobTitle: z.string().max(160).nullable(),
    status: z.enum(['active', 'suspended']),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const InvitationStatusSchema = z.enum(['pending', 'accepted', 'revoked', 'expired']);

export const InvitationSchema = z.object({
  id: UuidSchema,
  orgId: UuidSchema,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  roleKeys: z.array(RoleKeySchema),
  orgUnitId: UuidSchema.nullable(),
  jobTitle: z.string().nullable(),
  status: InvitationStatusSchema,
  expiresAt: TimestampSchema,
  createdAt: TimestampSchema,
});

export const CreateInvitationSchema = z
  .object({
    email: EmailSchema.optional(),
    phone: PhoneSchema.optional(),
    roleKeys: z.array(RoleKeySchema).min(1).max(10).default(['learner']),
    orgUnitId: UuidSchema.optional(),
    jobTitle: z.string().max(160).optional(),
  })
  .refine((v) => Boolean(v.email) !== Boolean(v.phone), {
    message: 'Provide exactly one of email or phone',
    path: ['email'],
  });

export const AcceptInvitationSchema = z.object({ token: z.string().min(20).max(256) });

/** What an invitee sees before signing in. Public: the token itself is the secret. */
export const InvitationPreviewSchema = z.object({
  organization: z.object({ name: z.string(), slug: SlugSchema, kinds: z.array(OrgKindSchema), status: z.lazy(() => OrgStatusSchema) }),
  roles: z.array(z.object({ key: RoleKeySchema, name: z.string(), permissions: z.array(PermissionSchema) })),
  invitedBy: z.string().nullable(),
  channel: z.enum(['email', 'sms']),
  /** Masked: a***@mail.com or +234******678. */
  destination: z.string(),
  status: InvitationStatusSchema,
  expiresAt: TimestampSchema,
});

export const RoleSchema = z.object({
  key: RoleKeySchema,
  name: z.string(),
  description: z.string(),
  scopeTypes: z.array(ScopeTypeSchema),
  permissions: z.array(PermissionSchema),
  system: z.boolean(),
});

export const AssignRoleSchema = z.object({
  roleKey: RoleKeySchema,
  scopeType: ScopeTypeSchema.default('org'),
  scopeId: UuidSchema.optional(),
  endsAt: TimestampSchema.optional(),
});

// ---------- Org structure ----------

export const OrgUnitSchema = z.object({
  id: UuidSchema,
  orgId: UuidSchema,
  parentUnitId: UuidSchema.nullable(),
  name: z.string(),
  /** Materialised path of unit ids, root first. */
  path: z.array(UuidSchema),
  createdAt: TimestampSchema,
});
export const CreateOrgUnitSchema = z.object({ name: z.string().trim().min(1).max(160), parentUnitId: UuidSchema.optional() });
export const UpdateOrgUnitSchema = z
  .object({ name: z.string().trim().min(1).max(160), parentUnitId: UuidSchema.nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const GroupSchema = z.object({
  id: UuidSchema,
  orgId: UuidSchema,
  name: z.string(),
  kind: z.enum(['static', 'dynamic']),
  memberCount: z.number().int(),
  createdAt: TimestampSchema,
});
export const CreateGroupSchema = z.object({ name: z.string().trim().min(1).max(160) });
export const UpdateGroupSchema = z.object({ name: z.string().trim().min(1).max(160) });
export const AddGroupMembersSchema = z.object({ membershipIds: z.array(UuidSchema).min(1).max(500) });

// ---------- Me ----------

export const MeSchema = z.object({
  user: z.object({
    id: UuidSchema,
    fullName: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    emailVerified: z.boolean(),
    phoneVerified: z.boolean(),
    locale: z.string(),
    createdAt: TimestampSchema,
  }),
  context: z.object({ orgId: UuidSchema.nullable(), membershipId: UuidSchema.nullable() }),
  platformAdmin: z.boolean(),
  /** Org-level permissions in the active context. */
  permissions: z.array(PermissionSchema),
  memberships: z.array(
    z.object({
      membershipId: UuidSchema,
      status: MembershipStatusSchema,
      org: MemberOrganizationSchema,
      roles: z.array(RoleAssignmentSchema),
    }),
  ),
});

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
} as const;

export const meContract = c.router({
  me: {
    method: 'GET',
    path: '/me',
    responses: { 200: MeSchema, 401: ErrorResponseSchema },
    summary: 'The signed-in user, their active context and all their memberships',
  },
});

export const organizationsContract = c.router({
  create: {
    method: 'POST',
    path: '/orgs',
    body: CreateOrganizationSchema,
    responses: { 201: OrganizationSchema, 409: ErrorResponseSchema, ...errors },
    summary: 'Create an organisation (platform admin)',
  },
  signUp: {
    method: 'POST',
    path: '/orgs/signup',
    body: SignUpOrganizationSchema,
    responses: { 201: OrganizationSchema, 409: ErrorResponseSchema, 429: ErrorResponseSchema, ...errors },
    summary: 'Sign up an organisation as the signed-in user, who becomes its admin. Enterprises are live at once; others await approval.',
  },
  list: {
    method: 'GET',
    path: '/orgs',
    query: PageQuerySchema.extend({ q: z.string().max(120).optional(), kind: OrgKindSchema.optional(), status: OrgStatusSchema.optional() }),
    responses: { 200: pageOf(OrganizationSchema), ...errors },
    summary: 'List organisations (platform admin)',
  },
  resolve: {
    method: 'GET',
    path: '/orgs/resolve/:slug',
    pathParams: z.object({ slug: SlugSchema }),
    responses: { 200: PublicOrganizationSchema, 404: ErrorResponseSchema },
    summary: 'Public branding for a tenant subdomain. No authentication.',
  },
  get: {
    method: 'GET',
    path: '/orgs/:orgId',
    pathParams: OrgParams,
    responses: { 200: OrganizationSchema, ...errors },
    summary: 'Get an organisation',
  },
  update: {
    method: 'PATCH',
    path: '/orgs/:orgId',
    pathParams: OrgParams,
    body: UpdateOrganizationSchema,
    responses: { 200: OrganizationSchema, ...errors },
    summary: 'Update an organisation’s settings',
  },
});

const MemberParams = OrgParams.extend({ membershipId: UuidSchema });

export const membersContract = c.router({
  list: {
    method: 'GET',
    path: '/orgs/:orgId/members',
    pathParams: OrgParams,
    query: MemberListQuerySchema,
    responses: { 200: pageOf(MembershipSchema), ...errors },
    summary: 'List members',
  },
  get: {
    method: 'GET',
    path: '/orgs/:orgId/members/:membershipId',
    pathParams: MemberParams,
    responses: { 200: MembershipSchema, ...errors },
    summary: 'Get a member',
  },
  update: {
    method: 'PATCH',
    path: '/orgs/:orgId/members/:membershipId',
    pathParams: MemberParams,
    body: UpdateMembershipSchema,
    responses: { 200: MembershipSchema, ...errors },
    summary: 'Move a member to a unit, change their title, or suspend / reactivate them',
  },
  remove: {
    method: 'DELETE',
    path: '/orgs/:orgId/members/:membershipId',
    pathParams: MemberParams,
    body: c.noBody(),
    responses: { 204: c.noBody(), ...errors },
    summary: 'Remove a member. Their learning records stay with them.',
  },
  assignRole: {
    method: 'POST',
    path: '/orgs/:orgId/members/:membershipId/roles',
    pathParams: MemberParams,
    body: AssignRoleSchema,
    responses: { 201: RoleAssignmentSchema, 409: ErrorResponseSchema, ...errors },
    summary: 'Assign a role at a scope',
  },
  revokeRole: {
    method: 'DELETE',
    path: '/orgs/:orgId/role-assignments/:assignmentId',
    pathParams: OrgParams.extend({ assignmentId: UuidSchema }),
    body: c.noBody(),
    responses: { 204: c.noBody(), ...errors },
    summary: 'Revoke a role assignment',
  },
});

export const invitationsContract = c.router({
  create: {
    method: 'POST',
    path: '/orgs/:orgId/invitations',
    pathParams: OrgParams,
    body: CreateInvitationSchema,
    responses: { 201: InvitationSchema, 409: ErrorResponseSchema, ...errors },
    summary: 'Invite someone by email or phone',
  },
  list: {
    method: 'GET',
    path: '/orgs/:orgId/invitations',
    pathParams: OrgParams,
    query: PageQuerySchema.extend({ status: InvitationStatusSchema.optional() }),
    responses: { 200: pageOf(InvitationSchema), ...errors },
    summary: 'List invitations',
  },
  revoke: {
    method: 'DELETE',
    path: '/orgs/:orgId/invitations/:invitationId',
    pathParams: OrgParams.extend({ invitationId: UuidSchema }),
    body: c.noBody(),
    responses: { 204: c.noBody(), ...errors },
    summary: 'Revoke a pending invitation',
  },
  preview: {
    // POST so the secret token travels in the body, never in URLs, history, logs or referrers.
    method: 'POST',
    path: '/invitations/preview',
    body: AcceptInvitationSchema,
    responses: { 200: InvitationPreviewSchema, 404: ErrorResponseSchema },
    summary: 'Show an invitation before accepting it. No authentication: the token (sent in the body) is the secret.',
  },
  accept: {
    method: 'POST',
    path: '/invitations/accept',
    body: AcceptInvitationSchema,
    responses: { 200: MembershipSchema, 409: ErrorResponseSchema, ...errors },
    summary: 'Accept an invitation as the signed-in user',
  },
});

export const rolesContract = c.router({
  list: {
    method: 'GET',
    path: '/roles',
    responses: { 200: z.object({ items: z.array(RoleSchema) }), 401: ErrorResponseSchema },
    summary: 'Roles and the permissions they grant',
  },
});

const UnitParams = OrgParams.extend({ unitId: UuidSchema });
const GroupParams = OrgParams.extend({ groupId: UuidSchema });

export const structureContract = c.router({
  listUnits: {
    method: 'GET',
    path: '/orgs/:orgId/units',
    pathParams: OrgParams,
    responses: { 200: z.object({ items: z.array(OrgUnitSchema) }), ...errors },
    summary: 'All org units, ordered as a tree',
  },
  createUnit: {
    method: 'POST',
    path: '/orgs/:orgId/units',
    pathParams: OrgParams,
    body: CreateOrgUnitSchema,
    responses: { 201: OrgUnitSchema, ...errors },
    summary: 'Create an org unit',
  },
  updateUnit: {
    method: 'PATCH',
    path: '/orgs/:orgId/units/:unitId',
    pathParams: UnitParams,
    body: UpdateOrgUnitSchema,
    responses: { 200: OrgUnitSchema, 409: ErrorResponseSchema, ...errors },
    summary: 'Rename or move an org unit (moves its subtree)',
  },
  deleteUnit: {
    method: 'DELETE',
    path: '/orgs/:orgId/units/:unitId',
    pathParams: UnitParams,
    body: c.noBody(),
    responses: { 204: c.noBody(), 409: ErrorResponseSchema, ...errors },
    summary: 'Delete an empty org unit',
  },
  listGroups: {
    method: 'GET',
    path: '/orgs/:orgId/groups',
    pathParams: OrgParams,
    responses: { 200: z.object({ items: z.array(GroupSchema) }), ...errors },
    summary: 'List groups',
  },
  createGroup: {
    method: 'POST',
    path: '/orgs/:orgId/groups',
    pathParams: OrgParams,
    body: CreateGroupSchema,
    responses: { 201: GroupSchema, ...errors },
    summary: 'Create a static group',
  },
  updateGroup: {
    method: 'PATCH',
    path: '/orgs/:orgId/groups/:groupId',
    pathParams: GroupParams,
    body: UpdateGroupSchema,
    responses: { 200: GroupSchema, ...errors },
    summary: 'Rename a group',
  },
  deleteGroup: {
    method: 'DELETE',
    path: '/orgs/:orgId/groups/:groupId',
    pathParams: GroupParams,
    body: c.noBody(),
    responses: { 204: c.noBody(), ...errors },
    summary: 'Delete a group',
  },
  listGroupMembers: {
    method: 'GET',
    path: '/orgs/:orgId/groups/:groupId/members',
    pathParams: GroupParams,
    query: PageQuerySchema,
    responses: { 200: pageOf(MembershipSchema), ...errors },
    summary: 'List a group’s members',
  },
  addGroupMembers: {
    method: 'POST',
    path: '/orgs/:orgId/groups/:groupId/members',
    pathParams: GroupParams,
    body: AddGroupMembersSchema,
    responses: { 204: c.noBody(), ...errors },
    summary: 'Add members to a group',
  },
  removeGroupMember: {
    method: 'DELETE',
    path: '/orgs/:orgId/groups/:groupId/members/:membershipId',
    pathParams: GroupParams.extend({ membershipId: UuidSchema }),
    body: c.noBody(),
    responses: { 204: c.noBody(), ...errors },
    summary: 'Remove a member from a group',
  },
});
