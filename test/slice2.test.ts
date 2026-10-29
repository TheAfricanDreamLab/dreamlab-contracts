import { describe, expect, it } from 'vitest';
import {
  ADMISSION_STAGES,
  admissionsContract,
  APPLICANT_STAGES,
  AssignMentorsSchema,
  compositeScores,
  CourseStaffSchema,
  CreateCycleSchema,
  InstructorProfileSchema,
  permissionsForRole,
  ReviewRequestSchema,
  SaveCircleSchema,
  StageAnswerSchemas,
  STAFF_STAGES,
  UpdateCycleSchema,
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

describe('review fixes', () => {
  const a = '0b5c8a52-3f1e-4c2a-9d7e-1a2b3c4d5e6f';
  const b = '1c6d9b63-4a2f-4d3b-8e8f-2b3c4d5e6f70';

  it('refuses empty cycle changes and cycles that close before they open', () => {
    expect(UpdateCycleSchema.safeParse({}).success).toBe(false);
    expect(UpdateCycleSchema.safeParse({ opensAt: '2027-01-10T00:00:00.000Z', closesAt: '2027-01-01T00:00:00.000Z' }).success).toBe(false);
    expect(UpdateCycleSchema.safeParse({ status: 'open' }).success).toBe(true);
  });

  it('lets applicants save and submit only their own six stages', () => {
    const params = admissionsContract.saveStage.pathParams;
    expect(params.safeParse({ applicationId: a, stage: 'video' }).success).toBe(true);
    expect(params.safeParse({ applicationId: a, stage: 'decision' }).success).toBe(false);
  });

  it('lists each person once in circles and mentor assignments', () => {
    expect(SaveCircleSchema.safeParse({ name: 'Circle A', memberUserIds: [a, a] }).success).toBe(false);
    expect(SaveCircleSchema.safeParse({ name: 'Circle A', memberUserIds: [a, b] }).success).toBe(true);
    expect(AssignMentorsSchema.safeParse({ mentorUserId: b, learnerUserIds: [a, a] }).success).toBe(false);
  });

  it('only accepts uploaded or allowed images as instructor photos', () => {
    const profile = { id: a, name: 'Dr Funmi', title: '', bio: '', userId: null, courses: [] };
    expect(InstructorProfileSchema.safeParse({ ...profile, photoUrl: 'https://evil.example/x.png' }).success).toBe(false);
    expect(InstructorProfileSchema.safeParse({ ...profile, photoUrl: null }).success).toBe(true);
  });
});
