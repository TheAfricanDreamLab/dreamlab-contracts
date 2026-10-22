import { describe, expect, it } from 'vitest';
import { CreateCohortSchema, DREAM_LAB_RHYTHM, MarkAttendanceSchema, permissionsForRole, RhythmSlotSchema } from '../src';

describe('cohorts', () => {
  it('describes the Dream Lab weekly rhythm: Tue/Thu virtual evenings, Saturday studio', () => {
    expect(DREAM_LAB_RHYTHM.map((s) => RhythmSlotSchema.parse(s))).toEqual(DREAM_LAB_RHYTHM);
    expect(DREAM_LAB_RHYTHM.map((s) => [s.weekday, s.time, s.mode])).toEqual([
      [2, '21:00', 'virtual'],
      [4, '21:00', 'virtual'],
      [6, '08:30', 'physical'],
    ]);
  });

  it('creates a cohort with sensible defaults', () => {
    const c = CreateCohortSchema.parse({ programSlug: 'the-african-dream-lab', name: 'Cohort 04', startsOn: '2026-11-02' });
    expect(c).toMatchObject({ timeZone: 'Africa/Lagos', enrollmentPolicy: 'invite', capacity: null, rhythm: DREAM_LAB_RHYTHM });
    expect(CreateCohortSchema.safeParse({ programSlug: 'x-y-z', name: 'C', startsOn: '2 Nov' }).success).toBe(false);
  });

  it('rejects impossible times and attendance', () => {
    expect(RhythmSlotSchema.safeParse({ weekday: 8, time: '21:00', durationMin: 90, mode: 'virtual', title: 'X class' }).success).toBe(false);
    expect(RhythmSlotSchema.safeParse({ weekday: 2, time: '25:00', durationMin: 90, mode: 'virtual', title: 'X class' }).success).toBe(false);
    expect(MarkAttendanceSchema.safeParse({ entries: [] }).success).toBe(false);
    const id = '01a1629e-68f9-749b-94ab-b8696f06c163';
    expect(MarkAttendanceSchema.safeParse({ entries: [{ userId: id, status: 'present' }, { userId: id, status: 'absent' }] }).success).toBe(false);
    expect(MarkAttendanceSchema.safeParse({ entries: [{ userId: id, status: 'present' }] }).success).toBe(true);
    expect(CreateCohortSchema.safeParse({ programSlug: 'the-african-dream-lab', name: 'Cohort 05', startsOn: '2026-02-30' }).success).toBe(false);
    expect(CreateCohortSchema.safeParse({ programSlug: 'the-african-dream-lab', name: 'Cohort 05', startsOn: '2026-13-01' }).success).toBe(false);
    expect(CreateCohortSchema.safeParse({ programSlug: 'the-african-dream-lab', name: 'Cohort 05', startsOn: '2028-02-29' }).success).toBe(true);
  });

  it('lets organisation admins manage cohorts', () => {
    expect(permissionsForRole('org_admin')).toContain('cohort.manage');
    expect(permissionsForRole('learner')).not.toContain('cohort.manage');
  });
});
