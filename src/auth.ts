import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  EmailSchema,
  ErrorResponseSchema,
  IdentifierSchema,
  NoBodySchema,
  OtpCodeSchema,
  PasswordSchema,
  PhoneSchema,
  TimestampSchema,
  UuidSchema,
} from './common';

const c = initContract();

export const ConsentSchema = z.object({
  termsVersion: z.string().min(1).max(32),
  privacyVersion: z.string().min(1).max(32),
  /** NDPA: explicit consent to AI-assisted evaluation of the learner's work. */
  aiProcessing: z.boolean().default(false),
  marketing: z.boolean().default(false),
});

export const RegisterRequestSchema = z
  .object({
    email: EmailSchema.optional(),
    phone: PhoneSchema.optional(),
    password: PasswordSchema,
    fullName: z.string().trim().min(2).max(120),
    locale: z.string().min(2).max(16).default('en'),
    consent: ConsentSchema,
  })
  .refine((v) => Boolean(v.email) !== Boolean(v.phone), {
    message: 'Provide exactly one of email or phone',
    path: ['email'],
  });
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const OtpChannelSchema = z.enum(['email', 'sms']);

export const VerificationSentSchema = z.object({
  channel: OtpChannelSchema,
  /** Masked destination, e.g. a***@mail.com or +234******678. */
  destination: z.string(),
  expiresInSeconds: z.number().int(),
});

export const RegisterResponseSchema = z.object({
  userId: UuidSchema,
  verification: VerificationSentSchema,
});

export const OtpPurposeSchema = z.enum(['verify', 'login', 'reset']);
export type OtpPurpose = z.infer<typeof OtpPurposeSchema>;

export const OtpRequestSchema = z.object({ identifier: IdentifierSchema, purpose: OtpPurposeSchema });
/** Always the same shape, whether or not the identifier exists, to prevent account enumeration. */
export const OtpAcceptedSchema = z.object({ accepted: z.literal(true), expiresInSeconds: z.number().int() });

export const VerifyRequestSchema = z.object({ identifier: IdentifierSchema, code: OtpCodeSchema });
export const LoginRequestSchema = z.object({ identifier: IdentifierSchema, password: z.string().min(1).max(128) });
export const OtpLoginRequestSchema = z.object({ identifier: IdentifierSchema, code: OtpCodeSchema });
export const RefreshRequestSchema = z.object({ refreshToken: z.string().min(20).max(512) });
export const PasswordResetRequestSchema = z.object({
  identifier: IdentifierSchema,
  code: OtpCodeSchema,
  newPassword: PasswordSchema,
});
export const PasswordChangeRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: PasswordSchema,
});
export const SwitchOrgRequestSchema = z.object({
  /** null switches to the personal (no organisation) context. */
  orgId: UuidSchema.nullable(),
});

export const TokenContextSchema = z.object({
  orgId: UuidSchema.nullable(),
  membershipId: UuidSchema.nullable(),
});

export const TokenResponseSchema = z.object({
  tokenType: z.literal('Bearer'),
  accessToken: z.string(),
  expiresIn: z.number().int(),
  refreshToken: z.string(),
  refreshExpiresIn: z.number().int(),
  sessionId: UuidSchema,
  context: TokenContextSchema,
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const SessionSchema = z.object({
  id: UuidSchema,
  createdAt: TimestampSchema,
  lastUsedAt: TimestampSchema,
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  current: z.boolean(),
});
export const SessionListSchema = z.object({ items: z.array(SessionSchema) });

export const JwksSchema = z.object({ keys: z.array(z.record(z.unknown())) });

const authErrors = { 400: ErrorResponseSchema, 401: ErrorResponseSchema, 429: ErrorResponseSchema } as const;

export const authContract = c.router({
  register: {
    method: 'POST',
    path: '/auth/register',
    body: RegisterRequestSchema,
    responses: { 201: RegisterResponseSchema, 409: ErrorResponseSchema, ...authErrors },
    summary: 'Create an account with an email or phone number. No organisation is needed.',
  },
  requestOtp: {
    method: 'POST',
    path: '/auth/otp',
    body: OtpRequestSchema,
    responses: { 202: OtpAcceptedSchema, ...authErrors },
    summary: 'Send a one-time code for verification, login or password reset',
  },
  verify: {
    method: 'POST',
    path: '/auth/verify',
    body: VerifyRequestSchema,
    responses: { 200: TokenResponseSchema, ...authErrors },
    summary: 'Verify an email or phone with a one-time code, and sign in',
  },
  login: {
    method: 'POST',
    path: '/auth/login',
    body: LoginRequestSchema,
    responses: { 200: TokenResponseSchema, 403: ErrorResponseSchema, ...authErrors },
    summary: 'Sign in with password',
  },
  loginWithOtp: {
    method: 'POST',
    path: '/auth/login/otp',
    body: OtpLoginRequestSchema,
    responses: { 200: TokenResponseSchema, ...authErrors },
    summary: 'Sign in with a one-time code',
  },
  refresh: {
    method: 'POST',
    path: '/auth/refresh',
    body: RefreshRequestSchema,
    responses: { 200: TokenResponseSchema, ...authErrors },
    summary: 'Rotate the refresh token and get a new access token',
  },
  logout: {
    method: 'POST',
    path: '/auth/logout',
    body: NoBodySchema,
    responses: { 204: c.noBody(), ...authErrors },
    summary: 'End the current session',
  },
  logoutAll: {
    method: 'POST',
    path: '/auth/logout-all',
    body: NoBodySchema,
    responses: { 204: c.noBody(), ...authErrors },
    summary: 'End every session of the current user',
  },
  resetPassword: {
    method: 'POST',
    path: '/auth/password/reset',
    body: PasswordResetRequestSchema,
    responses: { 204: c.noBody(), ...authErrors },
    summary: 'Reset a forgotten password with a one-time code. Ends all sessions.',
  },
  changePassword: {
    method: 'POST',
    path: '/auth/password/change',
    body: PasswordChangeRequestSchema,
    responses: { 204: c.noBody(), ...authErrors },
    summary: 'Change password. Ends all other sessions.',
  },
  switchOrg: {
    method: 'POST',
    path: '/auth/switch-org',
    body: SwitchOrgRequestSchema,
    responses: { 200: TokenResponseSchema, 403: ErrorResponseSchema, ...authErrors },
    summary: 'Reissue tokens for another organisation, or for the personal context',
  },
  listSessions: {
    method: 'GET',
    path: '/auth/sessions',
    responses: { 200: SessionListSchema, 401: ErrorResponseSchema },
    summary: 'List the current user’s active sessions',
  },
  revokeSession: {
    method: 'DELETE',
    path: '/auth/sessions/:sessionId',
    pathParams: z.object({ sessionId: UuidSchema }),
    body: c.noBody(),
    responses: { 204: c.noBody(), 401: ErrorResponseSchema, 404: ErrorResponseSchema },
    summary: 'End one of the current user’s sessions',
  },
});

export const wellKnownContract = c.router({
  jwks: {
    method: 'GET',
    path: '/.well-known/jwks.json',
    responses: { 200: JwksSchema },
    summary: 'Public keys for verifying access tokens',
  },
});

export const AccessTokenClaimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  sub: UuidSchema,
  sid: UuidSchema,
  /** Active organisation, or null for the personal context. */
  org: UuidSchema.nullable(),
  /** Membership in the active organisation. */
  mid: UuidSchema.nullable(),
  /** Org-scoped role keys in the active organisation. Narrower scopes are checked server-side. */
  roles: z.array(z.string()),
  /** True when the user is a platform admin. */
  pla: z.boolean(),
  /** Authorization version; changes when the user's roles change. */
  azv: z.number().int(),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string(),
});
export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;
