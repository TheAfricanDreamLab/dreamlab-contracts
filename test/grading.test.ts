import { describe, expect, it } from 'vitest';
import { apiV1Contract, GradeRequestSchema, GradingQueueQuerySchema, permissionsForRole, RUBRIC_LEVEL_LABELS, RUBRIC_LEVELS, rubricScorePct } from '../src';

describe('grading', () => {
  it('scores a rubric as a share of the top level on every criterion', () => {
    expect(rubricScorePct([4, 4, 4])).toBe(100);
    expect(rubricScorePct([3, 3, 3, 3])).toBe(75);
    expect(rubricScorePct([0, 2])).toBe(25);
    expect(rubricScorePct([])).toBe(0);
    expect(RUBRIC_LEVELS.map((l) => RUBRIC_LEVEL_LABELS[l])).toEqual(['Not yet shown', 'Beginning', 'Approaching', 'Meets the standard', 'Exceeds the standard']);
  });

  it('takes levels 0–4 and feedback, and nothing the grader should not set', () => {
    expect(GradeRequestSchema.parse({ rubricScores: { clarity: 3 }, release: true })).toEqual({ rubricScores: { clarity: 3 }, feedback: null, release: true });
    expect(GradeRequestSchema.safeParse({ rubricScores: { clarity: 5 }, release: true }).success).toBe(false);
    expect(GradeRequestSchema.safeParse({ rubricScores: { clarity: 2.5 }, release: true }).success).toBe(false);
    expect(GradeRequestSchema.safeParse({ rubricScores: { clarity: 3 }, release: true, scorePct: 100 }).success).toBe(false);
    expect(GradingQueueQuerySchema.parse({})).toEqual({ status: 'awaiting' });
  });

  it('lets instructors and graders grade, not learners or admins by default', () => {
    expect(permissionsForRole('instructor')).toContain('submission.grade');
    expect(permissionsForRole('grader')).toContain('submission.grade');
    expect(permissionsForRole('learner')).not.toContain('submission.grade');
    expect(permissionsForRole('org_admin')).not.toContain('submission.grade');
  });

  it('serves grading under /v1/learning', () => {
    expect(Object.values(apiV1Contract.grading).map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /v1/learning/grading/queue',
      'GET /v1/learning/grading/submissions/:submissionId',
      'PUT /v1/learning/grading/submissions/:submissionId/grade',
    ]);
  });
});

describe('assignment links', () => {
  it('takes web links only, since graders open them', async () => {
    const { AssignmentSubmitRequestSchema } = await import('../src');
    const base = { text: 'my work' };
    expect(AssignmentSubmitRequestSchema.safeParse({ ...base, link: 'https://docs.example.org/canvas' }).success).toBe(true);
    expect(AssignmentSubmitRequestSchema.safeParse({ ...base, link: 'javascript:alert(1)' }).success).toBe(false);
    expect(AssignmentSubmitRequestSchema.safeParse({ ...base, link: 'data:text/html,hi' }).success).toBe(false);
  });
});

describe('score bounds', () => {
  it('refuses empty rubrics and impossible scores', async () => {
    const { GradeRequestSchema, EnrollmentSchema } = await import('../src');
    expect(GradeRequestSchema.safeParse({ rubricScores: {}, release: true }).success).toBe(false);
    expect(EnrollmentSchema.shape.finalScore.safeParse(120).success).toBe(false);
    expect(EnrollmentSchema.shape.finalScore.safeParse(84.5).success).toBe(true);
  });
});
