import { describe, expect, it } from 'vitest';
import {
  ADMISSION_STAGES,
  APPLICANT_STAGES,
  compositeScores,
  CourseStaffSchema,
  CreateCycleSchema,
  permissionsForRole,
  ReviewRequestSchema,
  SaveCircleSchema,
  StageAnswerSchemas,
  STAFF_STAGES,
} from '../src';

describe('admissions', () => {
  it('has ten stages: six for the applicant, then four for staff', () => {
    expect(ADMISSION_STAGES).toHaveLength(10);
    expect([...APPLICANT_STAGES, ...STAFF_STAGES]).toEqual([...ADMISSION_STAGES]);
  });

  it('maps 1–5 dimension scores to DBPI and DSI on 0–100, only when complete', () => {
    expect(compositeScores({ problem_insight: 5, evidence_of_action: 5, builder_mindset: 5, dream_clarity: 1, commitment: 1, communication: 1 })).toEqual({ dbpi: 100, dsi: 0 });
    expect(compositeScores({ problem_insight: 3, evidence_of_action: 3, builder_mindset: 3 })).toEqual({ dbpi: 50, dsi: null });
  });

  it('checks eligibility and the length of written answers', () => {
    expect(StageAnswerSchemas.eligibility.safeParse({ isAdult: true, country: 'Nigeria', educationLevel: 'diploma', canCommitFullTime: true, hasDeviceAndInternet: true }).success).toBe(true);
    expect(StageAnswerSchemas.eligibility.safeParse({ isAdult: false, country: 'Nigeria', educationLevel: 'diploma', canCommitFullTime: true, hasDeviceAndInternet: true }).success).toBe(false);
    expect(StageAnswerSchemas.application.safeParse({ city: 'Lagos', occupation: 'Builder', motivation: 'too short', howHeard: 'friend' }).success).toBe(false);
    expect(StageAnswerSchemas.video.safeParse({ url: 'javascript:alert(1)' }).success).toBe(false);
  });

  it('needs every dimension scored, a reason, and a cycle that closes after it opens', () => {
    expect(ReviewRequestSchema.safeParse({ scores: { dream_clarity: 4 }, recommendation: 'advance', comment: 'Strong evidence of action.' }).success).toBe(false);
    expect(CreateCycleSchema.safeParse({ name: 'Cohort 04', programSlug: 'the-african-dream-lab', opensAt: '2026-12-01T00:00:00Z', closesAt: '2026-11-01T00:00:00Z' }).success).toBe(false);
  });

  it('gives organisation admins every admissions permission, officers review only', () => {
    expect(permissionsForRole('org_admin')).toEqual(expect.arrayContaining(['admissions.manage', 'admissions.review', 'admissions.decide']));
    expect(permissionsForRole('admissions_officer')).toEqual(['org.read', 'admissions.review']);
  });
});

describe('community and staff', () => {
  it('circles have two to twelve members; staff lists each person once', () => {
    expect(SaveCircleSchema.safeParse({ name: 'Circle A', memberUserIds: ['0b5c8a52-3f1e-4c2a-9d7e-1a2b3c4d5e6f'] }).success).toBe(false);
    const id = '0b5c8a52-3f1e-4c2a-9d7e-1a2b3c4d5e6f';
    expect(CourseStaffSchema.safeParse({ staff: [{ profileId: id, role: 'lead' }, { profileId: id, role: 'assistant' }] }).success).toBe(false);
  });
});
