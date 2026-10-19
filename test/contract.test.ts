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
