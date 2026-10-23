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

/** Google ID token from Google Identity Services (web) or the Google Sign-In SDK (mobile). */
export const GoogleSignInRequestSchema = z.object({
  idToken: z.string().min(20).max(4096),
  /** Required the first time, when the sign-in creates the account. */
  consent: ConsentSchema.optional(),
  locale: z.string().min(2).max(16).optional(),
});

export const OtpChannelSchema = z.enum(['email', 'sms', 'whatsapp']);

export const VerificationSentSchema = z.object({
  channel: OtpChannelSchema,
  /** Masked destination, e.g. a***@mail.com or +234******678. */
  destination: z.string(),
  expiresInSeconds: z.number().int(),
});

export const RegisterResponseSchema = z.object({
  userId: UuidSchema,
  verification: VerificationSentSchema,
  /**
   * Proves the verify call comes from whoever registered. The password chosen at registration is
   * kept only when verify presents this token; a code alone (someone else's registration reaching
   * your inbox) verifies the address but sets no password.
   */
  registrationToken: z.string(),
});

export const OtpPurposeSchema = z.enum(['verify', 'login', 'reset']);
export type OtpPurpose = z.infer<typeof OtpPurposeSchema>;

export const OtpRequestSchema = z.object({
  identifier: IdentifierSchema,
  purpose: OtpPurposeSchema,
  /** For phone numbers: SMS (default) or WhatsApp. Ignored for email. */
  channel: z.enum(['sms', 'whatsapp']).optional(),
});
/** Always the same shape, whether or not the identifier exists, to prevent account enumeration. */
export const OtpAcceptedSchema = z.object({ accepted: z.literal(true), expiresInSeconds: z.number().int() });

export const VerifyRequestSchema = z.object({ identifier: IdentifierSchema, code: OtpCodeSchema, registrationToken: z.string().min(20).max(256).optional() });
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

/** The first factor passed; the account has an authenticator app, so a code is needed next. */
export const MfaChallengeSchema = z.object({
  mfaRequired: z.literal(true),
  /** Single-use, short-lived. Send it back with the code to POST /auth/mfa/verify. */
  mfaToken: z.string(),
  expiresIn: z.number().int(),
  methods: z.array(z.enum(['totp', 'recovery_code'])),
});
export type MfaChallenge = z.infer<typeof MfaChallengeSchema>;

/** Sign-in either completes, or asks for a second factor. */
export const SignInResponseSchema = z.union([TokenResponseSchema, MfaChallengeSchema]);
export type SignInResponse = z.infer<typeof SignInResponseSchema>;
export const isMfaChallenge = (r: SignInResponse): r is MfaChallenge => 'mfaRequired' in r && r.mfaRequired === true;

/** A six-digit authenticator code, or a recovery code (xxxxx-xxxxx). */
export const MfaCodeSchema = z.string().trim().regex(/^(\d{6}|[a-z0-9]{5}-[a-z0-9]{5})$/i, 'A six-digit code or a recovery code');
export const MfaVerifyRequestSchema = z.object({ mfaToken: z.string().min(20).max(256), code: MfaCodeSchema });
export const MfaStatusSchema = z.object({
  enabled: z.boolean(),
  enabledAt: TimestampSchema.nullable(),
  recoveryCodesRemaining: z.number().int(),
  /** Whether the current session passed a second factor. */
  sessionVerified: z.boolean(),
});
export const TotpSetupSchema = z.object({
  /** Base32 secret, for typing into an app by hand. */
  secret: z.string(),
  /** otpauth:// URI, for a QR code. */
  otpauthUrl: z.string(),
  expiresIn: z.number().int(),
});
export const TotpConfirmRequestSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'A six-digit code') });
export const RecoveryCodesSchema = z.object({ recoveryCodes: z.array(z.string()) });
export const MfaCodeRequestSchema = z.object({ code: MfaCodeSchema });

// ---------- Single sign-on (IAM-15, IAM-16) ----------

export const SsoProtocolSchema = z.enum(['oidc', 'saml']);

export const SsoDiscoverRequestSchema = z
  .object({ email: EmailSchema.optional(), slug: z.string().trim().toLowerCase().min(2).max(63).optional() })
  .refine((v) => Boolean(v.email) !== Boolean(v.slug), { message: 'Provide your work email or your organisation’s address', path: ['email'] });
export const SsoDiscoverySchema = z.object({
  orgId: UuidSchema,
  orgName: z.string(),
  orgSlug: z.string(),
  protocol: SsoProtocolSchema,
});

/** A path inside the web app to return to afterwards, e.g. /app or /invitations/accept. */
export const ReturnPathSchema = z.string().max(512).regex(/^\/(?!\/)[^\s\\]*$/, 'A path starting with /');

export const SsoStartRequestSchema = z.object({
  orgId: UuidSchema,
  /** test: an admin checks the connection; no session is created. Needs org.security.manage. */
  mode: z.enum(['signin', 'test']).default('signin'),
  /** Needed when the sign-in creates the account. */
  consent: ConsentSchema.optional(),
  returnTo: ReturnPathSchema.optional(),
});
export const SsoStartSchema = z.object({
  /** Send the browser here. */
  redirectUrl: z.string().url(),
  /** Keep this in an httpOnly cookie and compare it when the browser comes back. */
  state: z.string(),
  expiresIn: z.number().int(),
});
export const OidcCallbackRequestSchema = z.object({ state: z.string().min(20).max(256), code: z.string().min(1).max(4096) });
export const SamlAcsRequestSchema = z.object({ samlResponse: z.string().min(20).max(512_000), relayState: z.string().min(20).max(256) });
export const SamlAcceptedSchema = z.object({ state: z.string() });
export const SsoFinishRequestSchema = z.object({ state: z.string().min(20).max(256) });
export const SsoResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('session'), tokens: TokenResponseSchema, returnTo: z.string().nullable() }),
  z.object({ kind: z.literal('test'), orgId: UuidSchema, email: z.string(), name: z.string().nullable() }),
]);
export type SsoResult = z.infer<typeof SsoResultSchema>;

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
    responses: { 200: SignInResponseSchema, ...authErrors },
    summary: 'Verify an email or phone with a one-time code, and sign in',
  },
  login: {
    method: 'POST',
    path: '/auth/login',
    body: LoginRequestSchema,
    responses: { 200: SignInResponseSchema, 403: ErrorResponseSchema, ...authErrors },
    summary: 'Sign in with password. Accounts with an authenticator app get an MFA challenge instead of tokens.',
  },
  google: {
    method: 'POST',
    path: '/auth/google',
    body: GoogleSignInRequestSchema,
    responses: { 200: SignInResponseSchema, 403: ErrorResponseSchema, 503: ErrorResponseSchema, ...authErrors },
    summary: 'Sign in or sign up with Google. A new account needs consent and no organisation.',
  },
  loginWithOtp: {
    method: 'POST',
    path: '/auth/login/otp',
    body: OtpLoginRequestSchema,
    responses: { 200: SignInResponseSchema, 403: ErrorResponseSchema, ...authErrors },
    summary: 'Sign in with a one-time code. Accounts with an authenticator app get an MFA challenge instead of tokens.',
  },
  verifyMfa: {
    method: 'POST',
    path: '/auth/mfa/verify',
    body: MfaVerifyRequestSchema,
    responses: { 200: TokenResponseSchema, ...authErrors },
    summary: 'Complete sign-in with an authenticator or recovery code',
  },
  mfaStatus: {
    method: 'GET',
    path: '/auth/mfa',
    responses: { 200: MfaStatusSchema, 401: ErrorResponseSchema },
    summary: 'Whether the current user has an authenticator app, and whether this session passed it',
  },
  setupTotp: {
    method: 'POST',
    path: '/auth/mfa/totp/setup',
    body: NoBodySchema,
    responses: { 200: TotpSetupSchema, 409: ErrorResponseSchema, ...authErrors },
    summary: 'Start adding an authenticator app: returns a secret to scan',
  },
  confirmTotp: {
    method: 'POST',
    path: '/auth/mfa/totp/confirm',
    body: TotpConfirmRequestSchema,
    responses: { 200: RecoveryCodesSchema, ...authErrors },
    summary: 'Finish adding an authenticator app with its first code. Returns recovery codes once.',
  },
  stepUpMfa: {
    method: 'POST',
    path: '/auth/mfa/step-up',
    body: MfaCodeRequestSchema,
    responses: { 200: TokenResponseSchema, ...authErrors },
    summary: 'Confirm a code in an existing session, for actions that need a second factor',
  },
  regenerateRecoveryCodes: {
    method: 'POST',
    path: '/auth/mfa/recovery-codes',
    body: MfaCodeRequestSchema,
    responses: { 200: RecoveryCodesSchema, ...authErrors },
    summary: 'Replace the recovery codes (needs a current code)',
  },
  disableMfa: {
    method: 'POST',
    path: '/auth/mfa/disable',
    body: MfaCodeRequestSchema,
    responses: { 204: c.noBody(), 403: ErrorResponseSchema, ...authErrors },
    summary: 'Remove the authenticator app (needs a current code)',
  },
  discoverSso: {
    method: 'POST',
    path: '/auth/sso/discover',
    body: SsoDiscoverRequestSchema,
    responses: { 200: SsoDiscoverySchema, 404: ErrorResponseSchema, ...authErrors },
    summary: 'Find the single sign-on for a work email or an organisation address',
  },
  startSso: {
    method: 'POST',
    path: '/auth/sso/start',
    body: SsoStartRequestSchema,
    responses: { 200: SsoStartSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema, ...authErrors },
    summary: 'Begin single sign-on with an organisation’s identity provider',
  },
  oidcCallback: {
    method: 'POST',
    path: '/auth/sso/oidc/callback',
    body: OidcCallbackRequestSchema,
    responses: { 200: SsoResultSchema, 403: ErrorResponseSchema, ...authErrors },
    summary: 'Complete OIDC sign-on with the authorization code the browser brought back',
  },
  samlAcs: {
    method: 'POST',
    path: '/auth/sso/saml/acs',
    body: SamlAcsRequestSchema,
    responses: { 200: SamlAcceptedSchema, 403: ErrorResponseSchema, ...authErrors },
    summary: 'Validate a SAML response. Finish with POST /auth/sso/finish from the same browser.',
  },
  finishSso: {
    method: 'POST',
    path: '/auth/sso/finish',
    body: SsoFinishRequestSchema,
    responses: { 200: SsoResultSchema, 403: ErrorResponseSchema, ...authErrors },
    summary: 'Exchange a validated SAML sign-on for a session',
  },
  samlMetadata: {
    method: 'GET',
    path: '/auth/sso/saml/:connectionId/metadata',
    pathParams: z.object({ connectionId: UuidSchema }),
    responses: { 200: z.string(), 404: ErrorResponseSchema },
    summary: 'SAML service provider metadata (XML) for an organisation’s connection',
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
  /** How the session authenticated: pwd, otp, google, sso, and mfa when a second factor passed. */
  amr: z.array(z.string()).default([]),
  /** The active context requires a second factor for admin permissions (MFA_PROTECTED_PERMISSIONS). */
  mfr: z.boolean().default(false),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string(),
});
export type AccessTokenClaims = z.infer<typeof AccessTokenClaimsSchema>;
