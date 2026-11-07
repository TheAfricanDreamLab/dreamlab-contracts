import { describe, expect, it } from 'vitest';
import { PlatformUserSchema, SetUserStatusSchema } from '../src';

const day = 86_400_000;
const at = (ms: number) => new Date(Date.now() + ms).toISOString();

describe('account standing (PLT-2)', () => {
  it('suspends for a while, or until let back in, and bans', () => {
    expect(SetUserStatusSchema.parse({ status: 'suspended', reason: 'Spam reports', until: at(7 * day) })).toMatchObject({ status: 'suspended', notify: true });
    expect(SetUserStatusSchema.safeParse({ status: 'suspended', reason: 'Spam reports' }).success).toBe(true);
    expect(SetUserStatusSchema.safeParse({ status: 'banned', reason: 'Fraud confirmed', message: 'You broke the community rules.' }).success).toBe(true);
    expect(SetUserStatusSchema.safeParse({ status: 'active', reason: 'Appeal accepted', notify: false }).success).toBe(true);
  });

  it('refuses end dates that are past, too far, or not on a suspension', () => {
    expect(SetUserStatusSchema.safeParse({ status: 'suspended', reason: 'Spam', until: at(-day) }).success).toBe(false);
    expect(SetUserStatusSchema.safeParse({ status: 'suspended', reason: 'Spam', until: at(400 * day) }).success).toBe(false);
    expect(SetUserStatusSchema.safeParse({ status: 'banned', reason: 'Fraud', until: at(day) }).success).toBe(false);
  });

  it('reads older user records without a suspension end', () => {
    const user = PlatformUserSchema.parse({ id: '0193f0c2-6c3e-7c1a-9c43-1d2e3f4a5b6c', fullName: 'A', email: null, phone: '+2348000000000', status: 'banned', verified: true, mfaEnabled: false, platformAdmin: false, membershipCount: 0, createdAt: new Date().toISOString(), lastSignInAt: null });
    expect(user.suspendedUntil).toBeNull();
  });
});
