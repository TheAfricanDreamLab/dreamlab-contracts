import { describe, expect, it } from 'vitest';
import {
  apiV1Contract,
  CreateLearningAssignmentSchema,
  DEFAULT_DREAM_SCORE_WEIGHTS,
  DREAM_SCORE_DIMENSIONS,
  DreamScoreWeightsSchema,
  PORTFOLIO_SECTIONS,
  ReviewResidencyStageSchema,
  SaveResidencyStageSchema,
  SubmittableActionPlanSchema,
} from '../src';

const id = '0b5c8a52-3f1e-4c2a-9d7e-1a2b3c4d5e6f';

describe('outcomes', () => {
  it('has ten Dream Score dimensions, weighted equally by default', () => {
    expect(DREAM_SCORE_DIMENSIONS).toHaveLength(10);
    expect(DreamScoreWeightsSchema.safeParse(DEFAULT_DREAM_SCORE_WEIGHTS).success).toBe(true);
  });

  it('refuses weights that do not total 100%, or leave a dimension out', () => {
    expect(DreamScoreWeightsSchema.safeParse({ ...DEFAULT_DREAM_SCORE_WEIGHTS, vision: 20 }).success).toBe(false);
    const nine = Object.fromEntries(Object.entries(DEFAULT_DREAM_SCORE_WEIGHTS).filter(([d]) => d !== 'vision'));
    expect(DreamScoreWeightsSchema.safeParse({ ...nine, execution: 20 }).success).toBe(false);
    expect(DreamScoreWeightsSchema.safeParse({ ...DEFAULT_DREAM_SCORE_WEIGHTS, vision: 20, digital: 0 }).success).toBe(true);
  });

  it('approves a residency stage only with a score; changes need only feedback', () => {
    expect(ReviewResidencyStageSchema.safeParse({ decision: 'approved', feedback: 'Strong evidence throughout.' }).success).toBe(false);
    expect(ReviewResidencyStageSchema.safeParse({ decision: 'approved', scorePct: 86, feedback: 'Strong evidence throughout.' }).success).toBe(true);
    expect(ReviewResidencyStageSchema.safeParse({ decision: 'changes_requested', feedback: 'Add the interview notes.' }).success).toBe(true);
  });

  it('keeps stage links to http(s)', () => {
    expect(SaveResidencyStageSchema.safeParse({ text: 'Draft', links: [{ label: 'Survey', url: 'javascript:alert(1)' }] }).success).toBe(false);
    expect(SaveResidencyStageSchema.safeParse({ text: 'Draft', links: [{ label: 'Survey', url: 'https://forms.example.com/x' }] }).success).toBe(true);
  });

  it('submits an action plan only with a vision, three milestones, resources and risks', () => {
    const plan = {
      vision: 'A solar drying service in three districts, run by a team of four, paying for itself by month nine.',
      milestones: [1, 4, 9].map((month) => ({ month, milestone: `Milestone ${month}`, measure: 'Measured by sales' })),
      resources: 'Two dryers, a motorbike and a bookkeeper.',
      risks: 'A poor harvest; a competitor copying the design.',
    };
    expect(SubmittableActionPlanSchema.safeParse(plan).success).toBe(true);
    expect(SubmittableActionPlanSchema.safeParse({ ...plan, milestones: plan.milestones.slice(0, 2) }).success).toBe(false);
  });

  it('has the eight fixed portfolio sections', () => {
    expect(PORTFOLIO_SECTIONS).toEqual(['my_dream', 'life_architecture', 'course_artifacts', 'competencies', 'dream_residency', 'final_demonstration', 'dream_score', 'action_plan']);
  });

  it('serves outcomes and assigned learning under /v1/learning', () => {
    const routes = [...Object.values(apiV1Contract.outcomes), ...Object.values(apiV1Contract.assignedLearning)];
    expect(routes.every((r) => r.path.startsWith('/v1/learning/'))).toBe(true);
  });
});

describe('assigned learning', () => {
  it('needs people or groups to assign to', () => {
    expect(CreateLearningAssignmentSchema.safeParse({ courseSlug: 'negotiation' }).success).toBe(false);
    expect(CreateLearningAssignmentSchema.safeParse({ courseSlug: 'negotiation', groupIds: [id], dueOn: '2027-01-31' }).success).toBe(true);
    expect(CreateLearningAssignmentSchema.safeParse({ courseSlug: 'negotiation', userIds: [id], dueOn: '31/01/2027' }).success).toBe(false);
  });
});
