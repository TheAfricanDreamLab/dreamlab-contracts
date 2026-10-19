import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { SsoProtocolSchema } from './auth';
import { ErrorResponseSchema, TimestampSchema, UuidSchema } from './common';
import { PublicOrganizationSchema, RoleSchema } from './directory';
import { CUSTOM_ROLE_PERMISSIONS, isSystemRoleKey, PermissionSchema, RoleKeySchema, ScopeTypeSchema } from './permissions';

const c = initContract();

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
} as const;
const OrgParams = z.object({ orgId: UuidSchema });

// ---------- Email domains (IAM-14) ----------

/** none: nobody joins by domain. request: people ask, an admin approves. auto: people join at once. */
export const JoinPolicySchema = z.enum(['none', 'request', 'auto']);

export const DomainNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'A domain such as yourcompany.com');

export const OrgDomainSchema = z.object({
  id: UuidSchema,
  domain: z.string(),
  verified: z.boolean(),
  verifiedAt: TimestampSchema.nullable(),
  joinPolicy: JoinPolicySchema,
  /** Publish this TXT record in the domain's DNS, then ask us to verify. */
  verification: z.object({ recordType: z.literal('TXT'), recordName: z.string(), recordValue: z.string() }),
  createdAt: TimestampSchema,
});
export const AddDomainSchema = z.object({ domain: DomainNameSchema });
export const UpdateDomainSchema = z.object({ joinPolicy: JoinPolicySchema });

/** An organisation the signed-in user can join because of their verified email domain. */
export const JoinableOrganizationSchema = z.object({
  org: PublicOrganizationSchema,
  joinPolicy: JoinPolicySchema.exclude(['none']),
  domain: z.string(),
});

// ---------- Single sign-on connections (IAM-15, IAM-16) ----------

export const ServiceProviderSchema = z.object({
  /** Redirect URI to register with an OIDC identity provider. */
  oidcRedirectUri: z.string().url(),
  /** SAML Assertion Consumer Service URL (HTTP-POST binding). */
  samlAcsUrl: z.string().url(),
  /** SAML service provider entity id (audience). Null until a SAML connection exists. */
  samlEntityId: z.string().nullable(),
  samlMetadataUrl: z.string().url().nullable(),
});

export const SsoConnectionSchema = z.object({
  id: UuidSchema,
  protocol: SsoProtocolSchema,
  /** People can sign in with it. */
  enabled: z.boolean(),
  /** People with an email at a verified domain must use it (no passwords or codes). */
  enforced: z.boolean(),
  /** Last successful test sign-in by an admin. Enforcing needs one. */
  testedAt: TimestampSchema.nullable(),
  /** Role given to people who join through sign-on. */
  defaultRoleKey: RoleKeySchema,
  oidc: z.object({ issuer: z.string(), clientId: z.string(), hasClientSecret: z.boolean() }).nullable(),
  saml: z
    .object({ idpEntityId: z.string(), idpSsoUrl: z.string(), certificateFingerprint: z.string(), certificateExpiresAt: TimestampSchema.nullable() })
    .nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const SsoSettingsSchema = z.object({ connection: SsoConnectionSchema.nullable(), serviceProvider: ServiceProviderSchema });

const HttpsUrlSchema = z.string().trim().url().max(2048);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** OpenID Connect issuers are https. Plain http only for a local test identity provider. */
const OidcIssuerSchema = HttpsUrlSchema.refine((v) => {
  const u = new URL(v);
  return u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname));
}, 'The issuer must be an https URL');
const PemCertificateSchema = z
  .string()
  .trim()
  .min(100)
  .max(20_000)
  .refine((v) => /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(v) || /^[A-Za-z0-9+/=\s]+$/.test(v), 'A PEM or base64 X.509 certificate');

export const SaveSsoConnectionSchema = z.discriminatedUnion('protocol', [
  z.object({
    protocol: z.literal('oidc'),
    issuer: OidcIssuerSchema,
    clientId: z.string().trim().min(1).max(512),
    /** Required when creating; leave out to keep the stored secret. */
    clientSecret: z.string().min(1).max(2048).optional(),
    defaultRoleKey: RoleKeySchema.optional(),
  }),
  z.object({
    protocol: z.literal('saml'),
    idpEntityId: z.string().trim().min(1).max(1024),
    idpSsoUrl: HttpsUrlSchema,
    certificate: PemCertificateSchema,
    defaultRoleKey: RoleKeySchema.optional(),
  }),
]);

export const UpdateSsoConnectionSchema = z
  .object({ enabled: z.boolean(), enforced: z.boolean(), defaultRoleKey: RoleKeySchema })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

// ---------- SCIM provisioning (IAM-17) ----------

export const ScimSettingsSchema = z.object({
  /** SCIM 2.0 base URL for the identity provider. */
  baseUrl: z.string().url(),
  enabled: z.boolean(),
  /** First characters of the current token, to recognise it. */
  tokenHint: z.string().nullable(),
  lastSyncAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema.nullable(),
});
/** The bearer token is shown once; only its hash is stored. */
export const ScimTokenSchema = z.object({ baseUrl: z.string().url(), token: z.string() });

// ---------- Custom roles (IAM-18) ----------

/** Any permission except platform-wide ones. */
const CustomRolePermissionSchema = PermissionSchema.refine((p) => CUSTOM_ROLE_PERMISSIONS.includes(p), 'Custom roles cannot include platform permissions');
const CustomRoleKeySchema = RoleKeySchema.refine((k) => !isSystemRoleKey(k), 'That key belongs to a built-in role');

export const CreateCustomRoleSchema = z.object({
  /** Generated from the name when left out. Cannot be a built-in role's key. */
  key: CustomRoleKeySchema.optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).default(''),
  scopeTypes: z.array(ScopeTypeSchema).min(1).default(['org']),
  permissions: z.array(CustomRolePermissionSchema).min(1).max(40),
});
export const UpdateCustomRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(400),
    scopeTypes: z.array(ScopeTypeSchema).min(1),
    permissions: z.array(CustomRolePermissionSchema).min(1).max(40),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const OrgRoleListSchema = z.object({ items: z.array(RoleSchema.extend({ assignedCount: z.number().int() })) });

// ---------- Security policy (IAM-19) ----------

export const SecurityPolicySchema = z.object({
  /** Admin actions need a session that passed an authenticator app (or the organisation's sign-on). */
  requireAdminMfa: z.boolean(),
});
export const UpdateSecurityPolicySchema = SecurityPolicySchema.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const enterpriseContract = c.router({
  listDomains: {
    method: 'GET',
    path: '/orgs/:orgId/domains',
    pathParams: OrgParams,
    responses: { 200: z.object({ items: z.array(OrgDomainSchema) }), ...errors },
    summary: 'The organisation’s email domains',
  },
  addDomain: {
    method: 'POST',
    path: '/orgs/:orgId/domains',
    pathParams: OrgParams,
    body: AddDomainSchema,
    responses: { 201: OrgDomainSchema, 409: ErrorResponseSchema, ...errors },
    summary: 'Claim an email domain. It counts once verified through DNS.',
  },
  verifyDomain: {
    method: 'POST',
    path: '/orgs/:orgId/domains/:domainId/verify',
    pathParams: OrgParams.extend({ domainId: UuidSchema }),
    body: c.noBody(),
    responses: { 200: OrgDomainSchema, 409: ErrorResponseSchema, 422: ErrorResponseSchema, ...errors },
    summary: 'Check the domain’s DNS TXT record',
  },
  updateDomain: {
    method: 'PATCH',
    path: '/orgs/:orgId/domains/:domainId',
    pathParams: OrgParams.extend({ domainId: UuidSchema }),
    body: UpdateDomainSchema,
    responses: { 200: OrgDomainSchema, ...errors },
    summary: 'Choose whether people with this email domain can join',
  },
  removeDomain: {
    method: 'DELETE',
    path: '/orgs/:orgId/domains/:domainId',
    pathParams: OrgParams.extend({ domainId: UuidSchema }),
    body: c.noBody(),
    responses: { 204: c.noBody(), ...errors },
    summary: 'Remove an email domain',
  },
  joinableOrgs: {
    method: 'GET',
    path: '/me/joinable-orgs',
    responses: { 200: z.object({ items: z.array(JoinableOrganizationSchema) }), 401: ErrorResponseSchema },
    summary: 'Organisations the user can join through their verified email domain',
  },
  joinOrg: {
    method: 'POST',
    path: '/orgs/:orgId/join',
    pathParams: OrgParams,
    body: c.noBody(),
    responses: { 200: z.object({ status: z.enum(['active', 'requested']), membershipId: UuidSchema }), 409: ErrorResponseSchema, ...errors },
    summary: 'Join (or ask to join) an organisation through a verified email domain',
  },
  getSso: {
    method: 'GET',
    path: '/orgs/:orgId/sso',
    pathParams: OrgParams,
    responses: { 200: SsoSettingsSchema, ...errors },
    summary: 'The organisation’s single sign-on connection and the details to give the identity provider',
  },
  saveSso: {
    method: 'PUT',
    path: '/orgs/:orgId/sso',
    pathParams: OrgParams,
    body: SaveSsoConnectionSchema,
    responses: { 200: SsoConnectionSchema, 409: ErrorResponseSchema, 422: ErrorResponseSchema, ...errors },
    summary: 'Create or replace the single sign-on connection (OIDC or SAML). Changing it needs a new test.',
  },
  updateSso: {
    method: 'PATCH',
    path: '/orgs/:orgId/sso',
    pathParams: OrgParams,
    body: UpdateSsoConnectionSchema,
    responses: { 200: SsoConnectionSchema, 409: ErrorResponseSchema, ...errors },
    summary: 'Turn sign-on on or off, enforce it, or change the default role',
  },
  deleteSso: {
    method: 'DELETE',
    path: '/orgs/:orgId/sso',
    pathParams: OrgParams,
    body: c.noBody(),
    responses: { 204: c.noBody(), ...errors },
    summary: 'Remove the single sign-on connection',
  },
  getScim: {
    method: 'GET',
    path: '/orgs/:orgId/scim',
    pathParams: OrgParams,
    responses: { 200: ScimSettingsSchema, ...errors },
    summary: 'SCIM provisioning settings',
  },
  createScimToken: {
    method: 'POST',
    path: '/orgs/:orgId/scim/token',
    pathParams: OrgParams,
    body: c.noBody(),
    responses: { 201: ScimTokenSchema, 409: ErrorResponseSchema, ...errors },
    summary: 'Turn on SCIM provisioning, or replace its token. The token is shown once.',
  },
  disableScim: {
    method: 'DELETE',
    path: '/orgs/:orgId/scim',
    pathParams: OrgParams,
    body: c.noBody(),
    responses: { 204: c.noBody(), ...errors },
    summary: 'Turn off SCIM provisioning',
  },
  listOrgRoles: {
    method: 'GET',
    path: '/orgs/:orgId/roles',
    pathParams: OrgParams,
    responses: { 200: OrgRoleListSchema, ...errors },
    summary: 'Built-in roles plus the organisation’s custom roles',
  },
  createRole: {
    method: 'POST',
    path: '/orgs/:orgId/roles',
    pathParams: OrgParams,
    body: CreateCustomRoleSchema,
    responses: { 201: RoleSchema, 409: ErrorResponseSchema, ...errors },
    summary: 'Create a custom role',
  },
  updateRole: {
    method: 'PATCH',
    path: '/orgs/:orgId/roles/:roleKey',
    pathParams: OrgParams.extend({ roleKey: RoleKeySchema }),
    body: UpdateCustomRoleSchema,
    responses: { 200: RoleSchema, ...errors },
    summary: 'Change a custom role. People holding it get the new permissions at once.',
  },
  deleteRole: {
    method: 'DELETE',
    path: '/orgs/:orgId/roles/:roleKey',
    pathParams: OrgParams.extend({ roleKey: RoleKeySchema }),
    body: c.noBody(),
    responses: { 204: c.noBody(), 409: ErrorResponseSchema, ...errors },
    summary: 'Delete a custom role nobody holds',
  },
  getSecurity: {
    method: 'GET',
    path: '/orgs/:orgId/security',
    pathParams: OrgParams,
    responses: { 200: SecurityPolicySchema, ...errors },
    summary: 'The organisation’s security policy',
  },
  updateSecurity: {
    method: 'PATCH',
    path: '/orgs/:orgId/security',
    pathParams: OrgParams,
    body: UpdateSecurityPolicySchema,
    responses: { 200: SecurityPolicySchema, 409: ErrorResponseSchema, ...errors },
    summary: 'Change the security policy. Requiring MFA needs your own session to have passed MFA.',
  },
});

export type JoinableOrganization = z.infer<typeof JoinableOrganizationSchema>;
export type OrgDomain = z.infer<typeof OrgDomainSchema>;
export type SsoConnection = z.infer<typeof SsoConnectionSchema>;
