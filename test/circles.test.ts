import { describe, expect, it } from 'vitest';
import {
  CircleContactSchema,
  CirclePostPageSchema,
  CircleSpaceSchema,
  CircleUploadRequestSchema,
  CreateCircleMeetupSchema,
  MentoringSchema,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
} from '../src';

const id = '0198f0f0-0000-7000-8000-000000000001';

describe('Dream Circle contact sharing', () => {
  it('shares nothing by default', () => {
    expect(CircleContactSchema.parse({})).toEqual({ email: null, phone: null, whatsapp: false, linkedin: null });
  });

  it('takes an email, an E.164 phone and a LinkedIn profile', () => {
    const c = CircleContactSchema.parse({ email: 'Ada@Example.com', phone: '+2348012345678', whatsapp: true, linkedin: 'https://ng.linkedin.com/in/ada' });
    expect(c.email).toBe('ada@example.com');
    expect(c.whatsapp).toBe(true);
  });

  it('refuses links that are not LinkedIn and phones not in E.164', () => {
    expect(CircleContactSchema.safeParse({ linkedin: 'https://evil.example/linkedin.com/in/ada' }).success).toBe(false);
    expect(CircleContactSchema.safeParse({ linkedin: 'http://www.linkedin.com/in/ada' }).success).toBe(false);
    expect(CircleContactSchema.safeParse({ phone: '08012345678' }).success).toBe(false);
  });
});

describe('Dream Circle meetups', () => {
  it('defaults to an hour online', () => {
    const m = CreateCircleMeetupSchema.parse({ title: 'Pitch practice', startsAt: '2026-11-10T16:00:00.000Z' });
    expect(m).toMatchObject({ durationMin: 60, mode: 'virtual', location: null, details: '' });
  });

  it('needs a place when meeting in person', () => {
    const r = CreateCircleMeetupSchema.safeParse({ title: 'Lunch', startsAt: '2026-11-10T12:00:00.000Z', mode: 'physical' });
    expect(r.success).toBe(false);
    expect(CreateCircleMeetupSchema.safeParse({ title: 'Lunch', startsAt: '2026-11-10T12:00:00.000Z', mode: 'physical', location: 'Yaba hub' }).success).toBe(true);
  });
});

describe('Dream Circle space', () => {
  it('reads a space from an older server without contacts or meetups', () => {
    const s = CircleSpaceSchema.parse({
      id,
      name: 'Sankofa',
      cohortId: id,
      cohortName: 'Cohort 1',
      members: [{ userId: id, name: 'Ada Obi', role: 'member' }],
      you: { role: 'member' },
      call: { active: false, participants: 0 },
      can: { post: true, moderate: false },
    });
    expect(s.members[0]!.contact).toBeNull();
    expect(s.you.contact).toBeNull();
    expect(s.meetups).toEqual([]);
  });

  it('bounds cursors and uploads', () => {
    expect(CirclePostPageSchema.safeParse({ items: [], nextCursor: 'x'.repeat(81) }).success).toBe(false);
    expect(CircleUploadRequestSchema.safeParse({ fileName: 'a.mp4', contentType: 'video/mp4', size: 101 * 1024 * 1024 }).success).toBe(false);
  });

  it('lists no mentee circles when a server leaves them out', () => {
    expect(MentoringSchema.parse({ learners: [], meetings: [] }).circles).toEqual([]);
  });
});

describe('circle notifications', () => {
  it('can be switched off on their own', () => {
    expect(NOTIFICATION_CATEGORIES).toContain('circles');
    expect(NOTIFICATION_CATEGORY_LABELS.circles).toMatch(/Dream Circles/);
  });
});
