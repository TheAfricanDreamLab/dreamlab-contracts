import { isAppRoute, type AppRoute, type AppRouter } from '@ts-rest/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import pkg from '../package.json';
import {
  CONTRACTS_VERSION,
  IdentifierSchema,
  PERMISSIONS,
  RegisterRequestSchema,
  SYSTEM_ROLES,
  contract,
} from '../src';

function routes(router: AppRouter, prefix = ''): [string, AppRoute][] {
  return Object.entries(router).flatMap(([key, value]) =>
    isAppRoute(value) ? [[`${prefix}${key}`, value] as [string, AppRoute]] : routes(value, `${prefix}${key}.`),
  );
}

const all = routes(contract);

describe('contract', () => {
  it('has routes', () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it.each(all)('%s declares a success response with a schema and a summary', (_name, route) => {
    const success = Object.keys(route.responses).map(Number).filter((s) => s >= 200 && s < 300);
    expect(success).toHaveLength(1);
    expect(route.responses[success[0]!]).toBeDefined();
    expect(route.summary).toBeTruthy();
  });

  it.each(all.filter(([, r]) => r.method === 'POST' || r.method === 'PATCH'))('%s declares a body schema', (_n, route) => {
    expect('body' in route && route.body).toBeTruthy();
  });

  it.each(all.filter(([, r]) => r.path.includes('/:')))('%s declares path params', (_n, route) => {
    expect(route.pathParams).toBeInstanceOf(z.ZodType);
  });

  it('has unique method + path pairs', () => {
    const keys = all.map(([, r]) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('exports the package version', () => {
    expect(CONTRACTS_VERSION).toBe(pkg.version);
  });
});

describe('schemas', () => {
  it('accepts email or E.164 phone identifiers', () => {
    expect(IdentifierSchema.parse(' Ada@Example.COM ')).toBe('ada@example.com');
    expect(IdentifierSchema.parse('+2348012345678')).toBe('+2348012345678');
    expect(() => IdentifierSchema.parse('08012345678')).toThrow();
  });

  it('requires exactly one of email or phone at registration', () => {
    const base = { password: 'correct horse battery', fullName: 'Ada Obi', consent: { termsVersion: '1', privacyVersion: '1' } };
    expect(RegisterRequestSchema.safeParse({ ...base, email: 'a@b.co' }).success).toBe(true);
    expect(RegisterRequestSchema.safeParse(base).success).toBe(false);
    expect(RegisterRequestSchema.safeParse({ ...base, email: 'a@b.co', phone: '+2348012345678' }).success).toBe(false);
  });
});

describe('permissions', () => {
  it('only grants known permissions', () => {
    for (const role of SYSTEM_ROLES) {
      for (const p of role.permissions) expect(PERMISSIONS).toContain(p);
    }
  });

  it('keeps platform permissions to the platform admin', () => {
    for (const role of SYSTEM_ROLES.filter((r) => r.key !== 'platform_admin')) {
      expect(role.permissions.some((p) => p.startsWith('platform.'))).toBe(false);
    }
  });
});

describe('enterprise identity', () => {
  it('tells an MFA challenge from tokens', async () => {
    const { isMfaChallenge, SignInResponseSchema } = await import('../src');
    const challenge = SignInResponseSchema.parse({ mfaRequired: true, mfaToken: 'x'.repeat(30), expiresIn: 300, methods: ['totp'] });
    expect(isMfaChallenge(challenge)).toBe(true);
  });

  it('accepts authenticator and recovery codes only', async () => {
    const { MfaCodeSchema } = await import('../src');
    expect(MfaCodeSchema.safeParse('123456').success).toBe(true);
    expect(MfaCodeSchema.safeParse('ab3de-9xk2p').success).toBe(true);
    expect(MfaCodeSchema.safeParse('12345').success).toBe(false);
  });

  it('only returns to paths inside the app', async () => {
    const { ReturnPathSchema } = await import('../src');
    expect(ReturnPathSchema.safeParse('/app?x=1').success).toBe(true);
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', 'app']) expect(ReturnPathSchema.safeParse(bad).success).toBe(false);
  });

  it('normalises domains and rejects non-domains', async () => {
    const { DomainNameSchema } = await import('../src');
    expect(DomainNameSchema.parse(' Acme.COM ')).toBe('acme.com');
    for (const bad of ['localhost', 'acme', 'http://acme.com', 'a..com']) expect(DomainNameSchema.safeParse(bad).success).toBe(false);
  });

  it('keeps platform permissions out of custom roles and protects admin permissions', async () => {
    const { CUSTOM_ROLE_PERMISSIONS, MFA_PROTECTED_PERMISSIONS, isSystemRoleKey } = await import('../src');
    expect(CUSTOM_ROLE_PERMISSIONS.some((p) => p.startsWith('platform.'))).toBe(false);
    expect(MFA_PROTECTED_PERMISSIONS).toContain('org.security.manage');
    expect(MFA_PROTECTED_PERMISSIONS).not.toContain('org.read');
    expect(isSystemRoleKey('org_admin')).toBe(true);
    expect(isSystemRoleKey('regional_lead')).toBe(false);
  });

  it('gives org admins the new permissions', () => {
    const admin = SYSTEM_ROLES.find((r) => r.key === 'org_admin')!;
    expect(admin.permissions).toContain('org.security.manage');
    expect(admin.permissions).toContain('org.roles.manage');
  });

  it('only accepts https OIDC issuers, except a local test identity provider', async () => {
    const { SaveSsoConnectionSchema } = await import('../src');
    const oidc = (issuer: string) => SaveSsoConnectionSchema.safeParse({ protocol: 'oidc', issuer, clientId: 'c' }).success;
    expect(oidc('https://login.microsoftonline.com/t/v2.0')).toBe(true);
    expect(oidc('http://idp.example.com')).toBe(false);
    expect(oidc('http://127.0.0.1:4455')).toBe(true);
  });

  it('refuses platform permissions and built-in keys in custom roles', async () => {
    const { CreateCustomRoleSchema, UpdateCustomRoleSchema } = await import('../src');
    expect(CreateCustomRoleSchema.safeParse({ name: 'Lead', permissions: ['org.read'] }).success).toBe(true);
    expect(CreateCustomRoleSchema.safeParse({ name: 'Root', permissions: ['platform.orgs.manage'] }).success).toBe(false);
    expect(CreateCustomRoleSchema.safeParse({ key: 'org_admin', name: 'Admin', permissions: ['org.read'] }).success).toBe(false);
    expect(UpdateCustomRoleSchema.safeParse({ permissions: ['platform.orgs.read'] }).success).toBe(false);
  });
});
