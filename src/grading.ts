import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ErrorResponseSchema, TimestampSchema, UuidSchema } from './common';
import { BlockIdSchema, RubricCriterionSchema } from './content';

const c = initContract();

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
} as const;

/*
 * Faculty grading (LRN-3, ERD v0.1 §7 grades). Faculty score each rubric criterion of an assignment
 * submission, write feedback, and release the grade. Grades are append-only: a regrade adds a row
 * that supersedes the last. Learners see released grades only. Released grades complete the course's
 * final score, and course scores roll up, by credit hours, into the Programme Score.
 */

/** 0 not yet shown · 1 beginning · 2 approaching · 3 meets the standard · 4 exceeds it. */
export const RUBRIC_LEVELS = [0, 1, 2, 3, 4] as const;
export const RUBRIC_MAX_LEVEL = 4;
export const RubricLevelSchema = z.number().int().min(0).max(RUBRIC_MAX_LEVEL);
export const RUBRIC_LEVEL_LABELS: Record<number, string> = {
  0: 'Not yet shown',
  1: 'Beginning',
  2: 'Approaching',
  3: 'Meets the standard',
  4: 'Exceeds the standard',
};

/** The grade's percentage: the criterion levels as a share of the most they could be. */
export function rubricScorePct(levels: number[]): number {
  if (levels.length === 0) return 0;
  return Math.round((levels.reduce((n, l) => n + l, 0) / (levels.length * RUBRIC_MAX_LEVEL)) * 100);
}

/** What a learner sees once faculty release a grade. */
export const ReleasedGradeSchema = z.object({
  scorePct: z.number().int().min(0).max(100),
  rubricScores: z.record(BlockIdSchema, RubricLevelSchema),
  feedback: z.string().nullable(),
  releasedAt: TimestampSchema,
});
export type ReleasedGrade = z.infer<typeof ReleasedGradeSchema>;

export const GradingStatusSchema = z.enum(['awaiting', 'draft', 'released']);
export type GradingStatus = z.infer<typeof GradingStatusSchema>;

const Learner = z.object({ userId: UuidSchema, name: z.string() });
const CourseRef = z.object({ slug: z.string(), title: z.string() });

export const GradingQueueItemSchema = z.object({
  submissionId: UuidSchema,
  version: z.number().int(),
  submittedAt: TimestampSchema,
  /** awaiting: no grade yet; draft: saved, not released; released: the learner can see it. */
  status: GradingStatusSchema,
  scorePct: z.number().int().nullable(),
  learner: Learner,
  course: CourseRef,
  item: z.object({ id: UuidSchema, title: z.string() }),
  /** The cohort the learner takes the course with, if any. */
  cohortName: z.string().nullable(),
});
export type GradingQueueItem = z.infer<typeof GradingQueueItemSchema>;

export const GradeSchema = z.object({
  id: UuidSchema,
  scorePct: z.number().int(),
  rubricScores: z.record(BlockIdSchema, RubricLevelSchema),
  feedback: z.string().nullable(),
  graderName: z.string().nullable(),
  releasedAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
});
export type Grade = z.infer<typeof GradeSchema>;

/** One submission as a grader sees it: the work, the brief and rubric, earlier versions and the grade so far. */
export const SubmissionForGradingSchema = z.object({
  submissionId: UuidSchema,
  version: z.number().int(),
  submittedAt: TimestampSchema,
  status: GradingStatusSchema,
  text: z.string(),
  link: z.string().nullable(),
  /** Rubric criterion id → the learner says they met it. */
  selfAssessment: z.record(BlockIdSchema, z.boolean()),
  learner: Learner,
  course: CourseRef,
  cohortName: z.string().nullable(),
  item: z.object({
    id: UuidSchema,
    title: z.string(),
    practicalOutput: z.string().nullable(),
    brief: z.string(),
    steps: z.array(z.string()),
    rubric: z.array(RubricCriterionSchema),
    /** Share of the course's final score. */
    gradeWeight: z.number(),
  }),
  versions: z.array(z.object({ submissionId: UuidSchema, version: z.number().int(), submittedAt: TimestampSchema, status: GradingStatusSchema, scorePct: z.number().int().nullable() })),
  /** The latest grade on this submission (a draft or released), and the ones it superseded. */
  grade: GradeSchema.nullable(),
  history: z.array(GradeSchema),
});
export type SubmissionForGrading = z.infer<typeof SubmissionForGradingSchema>;

export const GradeRequestSchema = z
  .object({
    /** Every rubric criterion, scored. */
    rubricScores: z.record(BlockIdSchema, RubricLevelSchema),
    feedback: z.string().trim().max(4000).nullable().default(null),
    /** true: the learner sees it now and it counts; false: save as a draft. */
    release: z.boolean(),
  })
  .strict();

export const GradingQueueQuerySchema = z.object({
  status: z.enum(['awaiting', 'draft', 'released', 'all']).default('awaiting'),
});

const SubmissionParams = z.object({ submissionId: UuidSchema });

export const gradingContract = c.router(
  {
    queue: {
      method: 'GET',
      path: '/learning/grading/queue',
      query: GradingQueueQuerySchema,
      responses: { 200: z.object({ items: z.array(GradingQueueItemSchema) }), ...errors },
      summary: 'Assignment submissions to grade in the active organisation (submission.grade), newest version per learner and assignment',
    },
    submission: {
      method: 'GET',
      path: '/learning/grading/submissions/:submissionId',
      pathParams: SubmissionParams,
      responses: { 200: SubmissionForGradingSchema, ...errors },
      summary: 'A submission with its brief, rubric, earlier versions and grades',
    },
    grade: {
      method: 'PUT',
      path: '/learning/grading/submissions/:submissionId/grade',
      pathParams: SubmissionParams,
      body: GradeRequestSchema,
      responses: { 200: SubmissionForGradingSchema, ...errors },
      summary: 'Score the rubric and write feedback; release it to the learner or save a draft. A regrade supersedes the last grade.',
    },
  },
  { strictStatusCodes: true },
);
