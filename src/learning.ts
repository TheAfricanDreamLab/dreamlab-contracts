import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CourseDetailSchema, CourseSlugSchema, CourseSummarySchema } from './catalog';
import { ErrorResponseSchema, TimestampSchema, UuidSchema } from './common';
import { BlockIdSchema, BlockResponseSchema, BlockResultSchema, ItemContentSchema, ItemTypeSchema } from './content';
import { ReleasedGradeSchema } from './grading';

const c = initContract();

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
} as const;

/*
 * Enrolment, progress and assessment (ERD v0.1 §7). Every learner record carries a context
 * organisation: the one the learner was in when they enrolled, or none for personal learning.
 */

export const EnrollmentStatusSchema = z.enum(['active', 'completed']);
export const ItemStatusSchema = z.enum(['not_started', 'in_progress', 'completed']);

export const EnrollmentSchema = z.object({
  id: UuidSchema,
  courseId: UuidSchema,
  courseSlug: CourseSlugSchema,
  versionId: UuidSchema,
  /** Null when learning on their own. */
  contextOrgId: UuidSchema.nullable(),
  status: EnrollmentStatusSchema,
  progressPct: z.number().int().min(0).max(100),
  completedItems: z.number().int(),
  totalItems: z.number().int(),
  enrolledAt: TimestampSchema,
  lastActiveAt: TimestampSchema,
  completedAt: TimestampSchema.nullable(),
  /**
   * The course's final score (0–100) from its weighted quizzes and assignments; null until every
   * weighted item has a score (assignments count once faculty release their grade).
   */
  finalScore: z.number().min(0).max(100).nullable(),
});
export type Enrollment = z.infer<typeof EnrollmentSchema>;

const NextItemSchema = z.object({ id: UuidSchema, title: z.string(), type: ItemTypeSchema, moduleTitle: z.string() }).nullable();

export const EnrollmentSummarySchema = EnrollmentSchema.extend({
  course: CourseSummarySchema,
  /** Where "Continue" goes: the first item not yet completed. */
  nextItem: NextItemSchema,
});
export type EnrollmentSummary = z.infer<typeof EnrollmentSummarySchema>;

/** A course page from the learner's side: the syllabus with their status on each item. */
export const CourseProgressSchema = z.object({
  course: CourseDetailSchema,
  enrollment: EnrollmentSchema.nullable(),
  itemStatus: z.record(UuidSchema, ItemStatusSchema),
  nextItem: NextItemSchema,
  /** Learners enrolled in any version of this course. */
  learnerCount: z.number().int(),
});
export type CourseProgress = z.infer<typeof CourseProgressSchema>;

/** Saved per item: where the learner is, and their answers so far. */
export const ItemStateSchema = z.object({
  /** Lesson: furthest step reached (0-based). */
  stepIndex: z.number().int().min(0).default(0),
  results: z.record(BlockIdSchema, BlockResultSchema).default({}),
  /** The learner's last answer per block, so a lesson can be revisited as they left it. */
  responses: z.record(BlockIdSchema, BlockResponseSchema).default({}),
});
export type ItemState = z.infer<typeof ItemStateSchema>;

export const QuizAttemptSchema = z.object({
  attemptNo: z.number().int(),
  scorePct: z.number().int(),
  passed: z.boolean(),
  results: z.array(BlockResultSchema),
  submittedAt: TimestampSchema,
});
export type QuizAttempt = z.infer<typeof QuizAttemptSchema>;

export const AssignmentSubmissionSchema = z.object({
  id: UuidSchema,
  version: z.number().int(),
  text: z.string(),
  link: z.string().nullable(),
  /** Rubric criterion id → the learner says they met it. */
  selfAssessment: z.record(BlockIdSchema, z.boolean()),
  submittedAt: TimestampSchema,
  /** Faculty's grade, once released. */
  grade: ReleasedGradeSchema.nullable(),
});
export type AssignmentSubmission = z.infer<typeof AssignmentSubmissionSchema>;

export const DiscussionPostSchema = z.object({
  id: UuidSchema,
  author: z.object({ name: z.string(), initials: z.string(), isMe: z.boolean() }),
  body: z.string(),
  createdAt: TimestampSchema,
  replies: z.array(
    z.object({ id: UuidSchema, author: z.object({ name: z.string(), initials: z.string(), isMe: z.boolean() }), body: z.string(), createdAt: TimestampSchema }),
  ),
});
export type DiscussionPost = z.infer<typeof DiscussionPostSchema>;

export const DiscussionSchema = z.object({
  /** Peers' posts appear once the learner has posted their own (Coursera style). */
  hasPosted: z.boolean(),
  postCount: z.number().int(),
  posts: z.array(DiscussionPostSchema),
});
export type Discussion = z.infer<typeof DiscussionSchema>;

const NavItem = z.object({ id: UuidSchema, title: z.string(), type: ItemTypeSchema }).nullable();

/** One item in the course player. */
export const ItemViewSchema = z.object({
  enrollment: EnrollmentSchema,
  course: z.object({ slug: z.string(), title: z.string(), cover: CourseSummarySchema.shape.cover }),
  module: z.object({ id: UuidSchema, title: z.string(), position: z.number().int(), itemCount: z.number().int() }),
  item: z.object({ id: UuidSchema, key: z.string(), type: ItemTypeSchema, title: z.string(), minutes: z.number().int(), required: z.boolean(), position: z.number().int() }),
  content: ItemContentSchema,
  status: ItemStatusSchema,
  state: ItemStateSchema,
  quizAttempts: z.array(QuizAttemptSchema),
  submissions: z.array(AssignmentSubmissionSchema),
  discussion: DiscussionSchema.nullable(),
  previous: NavItem,
  next: NavItem,
});
export type ItemView = z.infer<typeof ItemViewSchema>;

export const EnrollRequestSchema = z.object({ courseSlug: CourseSlugSchema });
export const SaveProgressRequestSchema = z.object({
  stepIndex: z.number().int().min(0),
  /** Mark the item done. Lessons need every interactive block answered first. */
  complete: z.boolean().default(false),
});
export const CheckRequestSchema = z.object({ blockId: BlockIdSchema, response: BlockResponseSchema });
export const QuizSubmitRequestSchema = z.object({ answers: z.record(BlockIdSchema, BlockResponseSchema) });
export const AssignmentSubmitRequestSchema = z.object({
  text: z.string().trim().min(1).max(30_000),
  /** Only web links: graders open it, so javascript: or data: URLs are refused. */
  link: z.string().trim().url().max(500).regex(/^https?:\/\//i, 'A link starting with https://').nullable().default(null),
  selfAssessment: z.record(BlockIdSchema, z.boolean()).default({}),
});
export const DiscussionPostRequestSchema = z.object({
  body: z.string().trim().min(1).max(6000),
  /** Reply to a post. */
  parentId: UuidSchema.nullable().default(null),
});

export const ProgressUpdateSchema = z.object({
  status: ItemStatusSchema,
  enrollment: EnrollmentSchema,
  /** Just finished the whole course. */
  courseCompleted: z.boolean(),
});

export const JournalEntrySchema = z.object({
  id: UuidSchema,
  course: z.object({ slug: z.string(), title: z.string() }),
  itemId: UuidSchema,
  itemTitle: z.string(),
  prompt: z.string(),
  text: z.string(),
  createdAt: TimestampSchema,
});

export const LearningStatsSchema = z.object({
  enrollments: z.number().int(),
  activeLearners7d: z.number().int(),
  completions: z.number().int(),
  submissions7d: z.number().int(),
  courses: z.array(z.object({ slug: z.string(), title: z.string(), enrolled: z.number().int(), completed: z.number().int(), avgProgressPct: z.number().int() })),
});
export type LearningStats = z.infer<typeof LearningStatsSchema>;

const ItemParams = z.object({ enrollmentId: UuidSchema, itemId: UuidSchema });

export const learningContract = c.router(
  {
    enroll: {
      method: 'POST',
      path: '/learning/enrollments',
      body: EnrollRequestSchema,
      responses: { 201: EnrollmentSchema, ...errors },
      summary: 'Enrol in a course (free and open courses). Enrolling again returns the existing enrolment.',
    },
    myEnrollments: {
      method: 'GET',
      path: '/learning/enrollments',
      responses: { 200: z.object({ items: z.array(EnrollmentSummarySchema) }), 401: ErrorResponseSchema },
      summary: 'My courses, most recently active first, each with where to continue',
    },
    courseProgress: {
      method: 'GET',
      path: '/learning/courses/:slug',
      pathParams: z.object({ slug: CourseSlugSchema }),
      responses: { 200: CourseProgressSchema, ...errors },
      summary: 'A course with my enrolment and my status on every item',
    },
    getItem: {
      method: 'GET',
      path: '/learning/enrollments/:enrollmentId/items/:itemId',
      pathParams: ItemParams,
      responses: { 200: ItemViewSchema, ...errors },
      summary: 'An item in the course player, with my saved state',
    },
    saveProgress: {
      method: 'PUT',
      path: '/learning/enrollments/:enrollmentId/items/:itemId/progress',
      pathParams: ItemParams,
      body: SaveProgressRequestSchema,
      responses: { 200: ProgressUpdateSchema, ...errors },
      summary: 'Save my place in an item, or mark it complete',
    },
    check: {
      method: 'POST',
      path: '/learning/enrollments/:enrollmentId/items/:itemId/checks',
      pathParams: ItemParams,
      body: CheckRequestSchema,
      responses: { 200: BlockResultSchema, ...errors },
      summary: 'Answer an interactive block in a lesson; returns feedback, and the solution once earned',
    },
    submitQuiz: {
      method: 'POST',
      path: '/learning/enrollments/:enrollmentId/items/:itemId/quiz-attempts',
      pathParams: ItemParams,
      body: QuizSubmitRequestSchema,
      responses: { 201: QuizAttemptSchema, ...errors },
      summary: 'Submit a quiz attempt; graded at once',
    },
    submitAssignment: {
      method: 'POST',
      path: '/learning/enrollments/:enrollmentId/items/:itemId/submissions',
      pathParams: ItemParams,
      body: AssignmentSubmitRequestSchema,
      responses: { 201: AssignmentSubmissionSchema, ...errors },
      summary: 'Submit an assignment. Every submission is a new version; earlier ones are kept.',
    },
    postDiscussion: {
      method: 'POST',
      path: '/learning/enrollments/:enrollmentId/items/:itemId/discussion',
      pathParams: ItemParams,
      body: DiscussionPostRequestSchema,
      responses: { 201: DiscussionSchema, ...errors },
      summary: 'Post to a discussion, or reply to a post; returns the discussion',
    },
    journal: {
      method: 'GET',
      path: '/learning/journal',
      responses: { 200: z.object({ items: z.array(JournalEntrySchema) }), 401: ErrorResponseSchema },
      summary: 'Everything I have written in reflections, newest first',
    },
    adminStats: {
      method: 'GET',
      path: '/learning/admin/stats',
      responses: { 200: LearningStatsSchema, ...errors },
      summary: 'Enrolments, completions and activity across the platform (platform admin)',
    },
  },
  { strictStatusCodes: true },
);
