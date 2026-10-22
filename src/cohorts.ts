import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CourseSummarySchema } from './catalog';
import { ErrorResponseSchema, TimestampSchema, UuidSchema } from './common';

const c = initContract();

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
} as const;

/*
 * Cohorts and the programme calendar (LRN-2, ERD v0.1 §6–7). A cohort is one dated intake of a
 * programme, hosted by an organisation. Its calendar is copied from the programme's template and
 * dated from the start; its class sessions follow a weekly rhythm; attendance is recorded per session.
 */

/** A real calendar date: 2026-02-30 has the right shape but is rejected. */
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'A date like 2026-11-03')
  .refine((v) => {
    const t = Date.parse(`${v}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().startsWith(v);
  }, 'Not a date on the calendar');
export const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'A time like 21:00');

export const COHORT_STATUSES = ['draft', 'open', 'running', 'closed'] as const;
export const CohortStatusSchema = z.enum(COHORT_STATUSES);
/** open: anyone signed in may join. invite: members of the host organisation only. */
export const EnrollmentPolicySchema = z.enum(['open', 'invite']);
export const SessionModeSchema = z.enum(['virtual', 'physical']);
export const AttendanceStatusSchema = z.enum(['present', 'late', 'absent', 'excused']);

/** One recurring class in the weekly rhythm, e.g. Tuesday 21:00 virtual for 90 minutes. */
export const RhythmSlotSchema = z.object({
  /** 1 = Monday … 7 = Sunday. */
  weekday: z.number().int().min(1).max(7),
  time: TimeSchema,
  durationMin: z.number().int().min(15).max(480),
  mode: SessionModeSchema,
  title: z.string().trim().min(2).max(120),
  /** A join link (virtual) or a place (physical). */
  location: z.string().trim().max(500).nullable().default(null),
});
export type RhythmSlot = z.infer<typeof RhythmSlotSchema>;

/** The African Dream Lab's weekly rhythm (Plan v1.1): Tue/Thu virtual 21:00–22:30, Saturday physical 08:30–10:30. */
export const DREAM_LAB_RHYTHM: RhythmSlot[] = [
  { weekday: 2, time: '21:00', durationMin: 90, mode: 'virtual', title: 'Tuesday class', location: null },
  { weekday: 4, time: '21:00', durationMin: 90, mode: 'virtual', title: 'Thursday class', location: null },
  { weekday: 6, time: '08:30', durationMin: 120, mode: 'physical', title: 'Saturday studio', location: null },
];

export const CohortSchema = z.object({
  id: UuidSchema,
  programSlug: z.string(),
  programTitle: z.string(),
  hostOrgId: UuidSchema,
  hostOrgName: z.string(),
  name: z.string(),
  startsOn: DateSchema,
  endsOn: DateSchema,
  /** IANA time zone the sessions are scheduled in, e.g. Africa/Lagos. */
  timeZone: z.string(),
  capacity: z.number().int().nullable(),
  enrollmentPolicy: EnrollmentPolicySchema,
  status: CohortStatusSchema,
  learnerCount: z.number().int(),
  /** The week this cohort is in today (1-based), or null before it starts / after it ends. */
  currentWeek: z.number().int().nullable(),
  createdAt: TimestampSchema,
});
export type Cohort = z.infer<typeof CohortSchema>;

export const CalendarWeekSchema = z.object({
  weekNo: z.number().int(),
  startsOn: DateSchema,
  endsOn: DateSchema,
  phase: z.string(),
  focus: z.string(),
  majorOutput: z.string(),
});
export type CalendarWeek = z.infer<typeof CalendarWeekSchema>;

export const ClassSessionSchema = z.object({
  id: UuidSchema,
  weekNo: z.number().int(),
  title: z.string(),
  startsAt: TimestampSchema,
  durationMin: z.number().int(),
  mode: SessionModeSchema,
  location: z.string().nullable(),
  cancelled: z.boolean(),
});
export type ClassSession = z.infer<typeof ClassSessionSchema>;

export const CohortDetailSchema = CohortSchema.extend({
  calendar: z.array(CalendarWeekSchema),
  sessions: z.array(ClassSessionSchema),
  rhythm: z.array(RhythmSlotSchema),
});
export type CohortDetail = z.infer<typeof CohortDetailSchema>;

export const CreateCohortSchema = z
  .object({
    programSlug: z.string().min(3).max(80),
    name: z.string().trim().min(2).max(120),
    /** The first day of week 1 (the calendar runs for as many weeks as the programme has). */
    startsOn: DateSchema,
    timeZone: z.string().min(3).max(64).default('Africa/Lagos'),
    capacity: z.number().int().min(1).max(10_000).nullable().default(null),
    enrollmentPolicy: EnrollmentPolicySchema.default('invite'),
    rhythm: z.array(RhythmSlotSchema).min(1).max(14).default(DREAM_LAB_RHYTHM),
  })
  .strict();

export const UpdateCohortSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    capacity: z.number().int().min(1).max(10_000).nullable().optional(),
    enrollmentPolicy: EnrollmentPolicySchema.optional(),
    status: CohortStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Change at least one thing');

export const UpdateSessionSchema = z
  .object({
    location: z.string().trim().max(500).nullable().optional(),
    cancelled: z.boolean().optional(),
    startsAt: TimestampSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Change at least one thing');

export const ProgramEnrollmentStatusSchema = z.enum(['active', 'paused', 'completed', 'withdrawn', 'graduated']);

export const ElectiveChoiceSchema = z.object({
  phase: z.string(),
  chooseN: z.number().int(),
  /** Choose by the end of this week; null = no deadline. */
  selectByWeek: z.number().int().nullable(),
  deadline: DateSchema.nullable(),
  options: z.array(CourseSummarySchema),
  chosen: z.array(z.string()),
  /** The deadline has passed, or the cohort has closed. */
  locked: z.boolean(),
});

/** "My programme": everything a learner in a cohort needs this week. */
export const MyProgramSchema = z.object({
  enrollment: z.object({ id: UuidSchema, status: ProgramEnrollmentStatusSchema, enrolledAt: TimestampSchema }),
  cohort: CohortSchema,
  thisWeek: CalendarWeekSchema.nullable(),
  calendar: z.array(CalendarWeekSchema),
  upcomingSessions: z.array(ClassSessionSchema),
  /** The programme's required courses, with this learner's progress. */
  courses: z.array(
    z.object({
      course: CourseSummarySchema,
      phase: z.string(),
      required: z.boolean(),
      enrollmentId: UuidSchema.nullable(),
      progressPct: z.number().int(),
    }),
  ),
  electives: z.array(ElectiveChoiceSchema),
  attendance: z.object({ attended: z.number().int(), held: z.number().int() }),
});
export type MyProgram = z.infer<typeof MyProgramSchema>;

export const ChooseElectiveSchema = z.object({ courseSlugs: z.array(z.string().min(3).max(80)).min(1).max(5) });

export const RosterEntrySchema = z.object({
  userId: UuidSchema,
  name: z.string(),
  status: ProgramEnrollmentStatusSchema,
  enrolledAt: TimestampSchema,
  attendancePct: z.number().int().nullable(),
  progressPct: z.number().int(),
});

export const AttendanceEntrySchema = z.object({
  userId: UuidSchema,
  name: z.string(),
  status: AttendanceStatusSchema.nullable(),
  minutes: z.number().int().nullable(),
});
export const MarkAttendanceSchema = z.object({
  entries: z
    .array(z.object({ userId: UuidSchema, status: AttendanceStatusSchema, minutes: z.number().int().min(0).max(600).nullable().default(null) }))
    .min(1)
    .max(1000)
    .refine((entries) => new Set(entries.map((e) => e.userId)).size === entries.length, 'Mark each learner once'),
});

const CohortParams = z.object({ cohortId: UuidSchema });
const SessionParams = z.object({ cohortId: UuidSchema, sessionId: UuidSchema });

export const cohortsContract = c.router(
  {
    listForProgram: {
      method: 'GET',
      path: '/learning/programs/:slug/cohorts',
      pathParams: z.object({ slug: z.string().max(80) }),
      responses: { 200: z.object({ items: z.array(CohortSchema) }), ...errors },
      summary: 'Intakes of a programme that are open to join (and any the signed-in person can see as staff)',
    },
    join: {
      method: 'POST',
      path: '/learning/cohorts/:cohortId/join',
      pathParams: CohortParams,
      body: z.object({}).strict(),
      responses: { 201: MyProgramSchema, ...errors },
      summary: 'Join a cohort: enrols in the programme and its required courses. Joining twice returns the same enrolment.',
    },
    myPrograms: {
      method: 'GET',
      path: '/learning/me/programs',
      responses: { 200: z.object({ items: z.array(MyProgramSchema) }), 401: ErrorResponseSchema },
      summary: 'My programmes: this week, upcoming classes, courses, electives and attendance',
    },
    chooseElective: {
      method: 'POST',
      path: '/learning/me/programs/:enrollmentId/electives',
      pathParams: z.object({ enrollmentId: UuidSchema }),
      body: ChooseElectiveSchema,
      responses: { 200: MyProgramSchema, ...errors },
      summary: 'Choose an elective (before its deadline); enrols in the chosen course',
    },
    adminList: {
      method: 'GET',
      path: '/learning/cohorts',
      responses: { 200: z.object({ items: z.array(CohortSchema) }), ...errors },
      summary: 'Cohorts hosted by the active organisation (cohort.manage); platform admins see every cohort',
    },
    create: {
      method: 'POST',
      path: '/learning/cohorts',
      body: CreateCohortSchema,
      responses: { 201: CohortDetailSchema, ...errors },
      summary: 'Schedule a cohort of a programme, hosted by the active organisation: dates its calendar and creates its class sessions',
    },
    get: {
      method: 'GET',
      path: '/learning/cohorts/:cohortId',
      pathParams: CohortParams,
      responses: { 200: CohortDetailSchema, ...errors },
      summary: 'A cohort: calendar, sessions and weekly rhythm (staff)',
    },
    update: {
      method: 'PATCH',
      path: '/learning/cohorts/:cohortId',
      pathParams: CohortParams,
      body: UpdateCohortSchema,
      responses: { 200: CohortDetailSchema, ...errors },
      summary: 'Rename, open, run or close a cohort, or change who may join',
    },
    roster: {
      method: 'GET',
      path: '/learning/cohorts/:cohortId/roster',
      pathParams: CohortParams,
      responses: { 200: z.object({ items: z.array(RosterEntrySchema) }), ...errors },
      summary: 'Learners in a cohort with attendance and progress (staff)',
    },
    updateSession: {
      method: 'PATCH',
      path: '/learning/cohorts/:cohortId/sessions/:sessionId',
      pathParams: SessionParams,
      body: UpdateSessionSchema,
      responses: { 200: ClassSessionSchema, ...errors },
      summary: 'Set a class session’s link or place, move it, or cancel it',
    },
    attendance: {
      method: 'GET',
      path: '/learning/cohorts/:cohortId/sessions/:sessionId/attendance',
      pathParams: SessionParams,
      responses: { 200: z.object({ session: ClassSessionSchema, items: z.array(AttendanceEntrySchema) }), ...errors },
      summary: 'Attendance for one class session (course_run.teach or cohort.manage)',
    },
    markAttendance: {
      method: 'PUT',
      path: '/learning/cohorts/:cohortId/sessions/:sessionId/attendance',
      pathParams: SessionParams,
      body: MarkAttendanceSchema,
      responses: { 200: z.object({ session: ClassSessionSchema, items: z.array(AttendanceEntrySchema) }), ...errors },
      summary: 'Record attendance for a class session (a correction replaces the earlier mark, keeping who changed it)',
    },
  },
  { strictStatusCodes: true },
);
