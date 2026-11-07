import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CourseSlugSchema } from './catalog';
import { CohortSchema, DateSchema, TimeSchema } from './cohorts';
import { ErrorResponseSchema, TimestampSchema, UuidSchema } from './common';
import { ItemTypeSchema } from './content';

const c = initContract();

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
} as const;

/*
 * Staying on track (LRN-9): what helps people finish what they start.
 *
 * - A goal and study plan in the learner's own words ("why I'm here"), set when they start and shown back
 *   to them, in reminders too.
 * - Pace: how far along they are against where the cohort's calendar expects them to be, and a short
 *   catch-up list (the next essential items) instead of a wall of overdue work.
 * - Reminders by email (notification category `progress`) after a few quiet days, at most one a week.
 * - For cohort staff: who is at risk, a personal check-in, and the completion funnel.
 * - Dream Circle members can choose to share their week's progress with their circle.
 */

// ---------- Goal and study plan ----------

export const STUDY_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export const StudyDaySchema = z.enum(STUDY_DAYS);
export type StudyDay = z.infer<typeof StudyDaySchema>;

/** A goal belongs to a programme enrolment (cohort learners) or a course enrolment (learning on their own). */
export const GoalScopeSchema = z.enum(['program', 'course']);
export type GoalScope = z.infer<typeof GoalScopeSchema>;

export const SaveLearningGoalSchema = z.object({
  /** Why this matters to them, in their own words: shown back when they slip and in reminders. */
  why: z.string().trim().min(20, 'A sentence or two, in your own words').max(600),
  /** What finishing will let them do, if they want to say. */
  success: z.string().trim().max(300).optional(),
  /** The days they plan to study. */
  studyDays: z.array(StudyDaySchema).min(1, 'Pick at least one day').max(7).refine((d) => new Set(d).size === d.length, 'Pick each day once'),
  /** When on those days, in the learner's own time zone; optional. */
  studyTime: TimeSchema.optional(),
  /** How much time a week they plan to give it. */
  minutesPerWeek: z.number().int().min(30).max(1200),
});
export type SaveLearningGoal = z.infer<typeof SaveLearningGoalSchema>;

export const LearningGoalSchema = z.object({
  id: UuidSchema,
  scope: GoalScopeSchema,
  enrollmentId: UuidSchema,
  why: z.string(),
  success: z.string().nullable(),
  studyDays: z.array(StudyDaySchema),
  studyTime: TimeSchema.nullable(),
  minutesPerWeek: z.number().int(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type LearningGoal = z.infer<typeof LearningGoalSchema>;

// ---------- Pace, catch-up and the way to the certificate ----------

/**
 * on_track: at or near where they should be. behind: more than 15 points behind the expected progress,
 * or quiet for 7 to 13 days. far_behind: more than 35 points behind, or quiet for 14 days or more.
 * Without a cohort calendar (learning on their own) only quiet days count.
 */
export const PACES = ['not_started', 'on_track', 'behind', 'far_behind', 'completed'] as const;
export const PaceSchema = z.enum(PACES);
export type Pace = z.infer<typeof PaceSchema>;

/** One item to do next: required items first, in course order. */
export const CatchUpItemSchema = z.object({
  enrollmentId: UuidSchema,
  courseSlug: CourseSlugSchema,
  courseTitle: z.string(),
  itemId: UuidSchema,
  title: z.string(),
  type: ItemTypeSchema,
  moduleTitle: z.string(),
  minutes: z.number().int().nullable(),
});
export type CatchUpItem = z.infer<typeof CatchUpItemSchema>;

/** First-week steps that make people stay: a goal, a first lesson, hello to their circle. */
export const OnboardingSchema = z.object({
  goalSet: z.boolean(),
  firstItemDone: z.boolean(),
  /** Null when they have no Dream Circle. */
  introducedInCircle: z.boolean().nullable(),
  /** All the steps that apply are done. */
  done: z.boolean(),
});
export type Onboarding = z.infer<typeof OnboardingSchema>;

export const OnTrackSchema = z.object({
  pace: PaceSchema,
  progressPct: z.number().int().min(0).max(100),
  /** Where the calendar expects them to be; null without one. */
  expectedPct: z.number().int().min(0).max(100).nullable(),
  /** Whole days since their last activity. */
  daysQuiet: z.number().int().min(0),
  /** At most three: the shortest way back on track. Empty when on track or completed. */
  catchUp: z.array(CatchUpItemSchema).max(3),
  onboarding: OnboardingSchema,
  goal: LearningGoalSchema.nullable(),
});
export type OnTrack = z.infer<typeof OnTrackSchema>;

/** One step on the way to a programme's certificate. */
export const CertificateStepSchema = z.object({
  key: z.string(),
  label: z.string(),
  done: z.boolean(),
  /** Where to do it, an app path; null when there is nothing to open. */
  href: z.string().nullable(),
});
export type CertificateStep = z.infer<typeof CertificateStepSchema>;

export const ProgramOnTrackSchema = OnTrackSchema.extend({
  /** True when this week is a catch-up week: no new lessons, time to get level. */
  catchUpWeek: z.boolean(),
  /** The programme's graduation steps: required courses, practical outputs, capstone stages. */
  certificate: z.object({ steps: z.array(CertificateStepSchema), done: z.number().int(), total: z.number().int() }),
});
export type ProgramOnTrack = z.infer<typeof ProgramOnTrackSchema>;

// ---------- Cohort staff: who is at risk, check-ins, the funnel ----------

/** ok: on track. watch: behind, or quiet 5 to 9 days. at_risk: far behind, or quiet 10 to 20 days. inactive: quiet 21 days or more. */
export const RISK_LEVELS = ['ok', 'watch', 'at_risk', 'inactive'] as const;
export const RiskLevelSchema = z.enum(RISK_LEVELS);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const EngagementRowSchema = z.object({
  userId: UuidSchema,
  name: z.string(),
  programEnrollmentId: UuidSchema,
  enrolledAt: TimestampSchema,
  progressPct: z.number().int().min(0).max(100),
  expectedPct: z.number().int().min(0).max(100).nullable(),
  pace: PaceSchema,
  risk: RiskLevelSchema,
  daysQuiet: z.number().int().min(0),
  lastActiveAt: TimestampSchema.nullable(),
  attendancePct: z.number().int().nullable(),
  goalSet: z.boolean(),
  lastReminderAt: TimestampSchema.nullable(),
  lastCheckInAt: TimestampSchema.nullable(),
});
export type EngagementRow = z.infer<typeof EngagementRowSchema>;

export const CohortEngagementSchema = z.object({
  cohort: CohortSchema,
  summary: z.object({ learners: z.number().int(), ok: z.number().int(), watch: z.number().int(), atRisk: z.number().int(), inactive: z.number().int() }),
  /** Most at risk first, then quietest first. */
  items: z.array(EngagementRowSchema),
});
export type CohortEngagement = z.infer<typeof CohortEngagementSchema>;

export const SendCheckInSchema = z.object({
  userIds: z.array(UuidSchema).min(1).max(200).refine((ids) => new Set(ids).size === ids.length, 'List each person once'),
  /** Sent as written, with the sender's name; plain text. */
  message: z.string().trim().min(10).max(1000),
});
export type SendCheckIn = z.infer<typeof SendCheckInSchema>;

export const FUNNEL_STAGES = ['enrolled', 'started', 'first_week', 'quarter', 'half', 'three_quarters', 'completed'] as const;
export const FunnelStageKeySchema = z.enum(FUNNEL_STAGES);
export const FUNNEL_STAGE_LABELS: Record<z.infer<typeof FunnelStageKeySchema>, string> = {
  enrolled: 'Enrolled',
  started: 'Started a lesson',
  first_week: 'Active in their first week',
  quarter: 'A quarter done',
  half: 'Half done',
  three_quarters: 'Three quarters done',
  completed: 'Completed',
};

export const CompletionFunnelSchema = z.object({
  scope: z.object({ kind: z.enum(['cohort', 'course']), id: UuidSchema, title: z.string() }),
  stages: z.array(z.object({ key: FunnelStageKeySchema, label: z.string(), count: z.number().int() })),
  /** Not completed and quiet for 21 days or more. */
  dropped: z.number().int(),
  /** For those who dropped: the median day (after enrolling) of their last activity. */
  medianDropDay: z.number().nullable(),
  reminders: z.object({
    sent: z.number().int(),
    /** Learners active again within 7 days of a reminder. */
    returnedWithin7Days: z.number().int(),
  }),
  checkIns: z.object({ sent: z.number().int(), returnedWithin7Days: z.number().int() }),
  /** Learners active each week, oldest first (at most 26 weeks). */
  weekly: z.array(z.object({ weekStart: DateSchema, active: z.number().int() })),
});
export type CompletionFunnel = z.infer<typeof CompletionFunnelSchema>;

// ---------- Dream Circle progress (opt-in) ----------

export const CircleProgressSchema = z.object({
  /** Monday of this week, in the cohort's time zone (YYYY-MM-DD). */
  weekStart: DateSchema,
  /** Whether the person asking shares their own progress with this circle. */
  sharing: z.boolean(),
  /** Members who share, the person asking included when they share. */
  members: z.array(
    z.object({
      userId: UuidSchema,
      name: z.string(),
      activeDaysThisWeek: z.number().int().min(0).max(7),
      itemsCompletedThisWeek: z.number().int().min(0),
      progressPct: z.number().int().min(0).max(100),
      lastActiveAt: TimestampSchema.nullable(),
    }),
  ),
  /** How many members don't share: a count only, so nobody is singled out by a blank row. */
  notSharing: z.number().int(),
});
export type CircleProgress = z.infer<typeof CircleProgressSchema>;

// ---------- Routes ----------

const GoalParams = z.object({ scope: GoalScopeSchema, enrollmentId: UuidSchema });
const CohortParams = z.object({ cohortId: UuidSchema });

export const engagementContract = c.router(
  {
    getGoal: {
      method: 'GET',
      path: '/learning/me/goals/:scope/:enrollmentId',
      pathParams: GoalParams,
      responses: { 200: z.object({ goal: LearningGoalSchema.nullable() }), ...errors },
      summary: 'My goal and study plan for a programme or course enrolment (null until set)',
    },
    saveGoal: {
      method: 'PUT',
      path: '/learning/me/goals/:scope/:enrollmentId',
      pathParams: GoalParams,
      body: SaveLearningGoalSchema,
      responses: { 200: LearningGoalSchema, ...errors },
      summary: 'Set or change my goal and study plan',
    },
    courseOnTrack: {
      method: 'GET',
      path: '/learning/enrollments/:enrollmentId/on-track',
      pathParams: z.object({ enrollmentId: UuidSchema }),
      responses: { 200: OnTrackSchema, ...errors },
      summary: 'My pace, catch-up list and first steps on a course',
    },
    programOnTrack: {
      method: 'GET',
      path: '/learning/me/programs/:enrollmentId/on-track',
      pathParams: z.object({ enrollmentId: UuidSchema }),
      responses: { 200: ProgramOnTrackSchema, ...errors },
      summary: 'My pace, catch-up list, first steps and way to the certificate in a programme',
    },
    cohortEngagement: {
      method: 'GET',
      path: '/learning/cohorts/:cohortId/engagement',
      pathParams: CohortParams,
      query: z.object({ risk: RiskLevelSchema.optional() }),
      responses: { 200: CohortEngagementSchema, ...errors },
      summary: 'Who is on track and who is at risk in a cohort (cohort.manage or course_run.teach)',
    },
    sendCheckIn: {
      method: 'POST',
      path: '/learning/cohorts/:cohortId/check-ins',
      pathParams: CohortParams,
      body: SendCheckInSchema,
      responses: { 200: z.object({ sent: z.number().int() }), ...errors },
      summary: 'Send a personal check-in to learners in a cohort, by email and in the app (cohort.manage or course_run.teach)',
    },
    cohortFunnel: {
      method: 'GET',
      path: '/learning/cohorts/:cohortId/funnel',
      pathParams: CohortParams,
      responses: { 200: CompletionFunnelSchema, ...errors },
      summary: 'A cohort’s completion funnel, drop-off and how reminders and check-ins work (cohort.manage)',
    },
    courseFunnel: {
      method: 'GET',
      path: '/learning/admin/courses/:slug/funnel',
      pathParams: z.object({ slug: CourseSlugSchema }),
      responses: { 200: CompletionFunnelSchema, ...errors },
      summary: 'A course’s completion funnel across every learner (platform admin)',
    },
    circleProgress: {
      method: 'GET',
      path: '/learning/circles/:circleId/progress',
      pathParams: z.object({ circleId: UuidSchema }),
      responses: { 200: CircleProgressSchema, ...errors },
      summary: 'This week’s progress of the circle members who share it (members, their mentors and cohort staff)',
    },
    setCircleSharing: {
      method: 'PUT',
      path: '/learning/circles/:circleId/progress/sharing',
      pathParams: z.object({ circleId: UuidSchema }),
      body: z.object({ share: z.boolean() }),
      responses: { 200: CircleProgressSchema, ...errors },
      summary: 'Share (or stop sharing) my weekly progress with my circle',
    },
  },
  { strictStatusCodes: true },
);
