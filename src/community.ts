import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ErrorResponseSchema, TimestampSchema, UuidSchema } from './common';
import { SessionModeSchema } from './cohorts';
import { FileLinkSchema, UploadTicketSchema } from './media';

const c = initContract();

/** No id listed twice. */
const distinct = (ids: string[]) => new Set(ids).size === ids.length;

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
  503: ErrorResponseSchema,
} as const;

/*
 * Live classes and community (LIVE-1, COMM-1; Plan v1.1 §10). Meeting rooms belong to a class
 * session or a mentor meeting and are created by the server; the API hands each participant a
 * short-lived join token for their role (faculty host, learners speak with audio and turn video on
 * when asked). Attendance comes from the meeting provider's events; faculty can correct it.
 * Recordings are uploaded by faculty. Mentors work with the learners assigned to them; Dream Circles
 * are small peer groups within a cohort.
 */

// ---------- Live ----------

export const LiveRoleSchema = z.enum(['host', 'participant']);

/** Join a live room: connect to `url` with `token` before `expiresAt`. */
export const JoinTicketSchema = z.object({
  url: z.string(),
  token: z.string(),
  roomName: z.string(),
  role: LiveRoleSchema,
  title: z.string(),
  expiresAt: TimestampSchema,
});
export type JoinTicket = z.infer<typeof JoinTicketSchema>;

export const RecordingSchema = z.object({
  id: UuidSchema,
  title: z.string(),
  contentType: z.string(),
  size: z.number().int(),
  createdAt: TimestampSchema,
});
export type Recording = z.infer<typeof RecordingSchema>;

export const RECORDING_TYPES = ['video/mp4', 'video/webm', 'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4'] as const;
export const MAX_RECORDING_BYTES = 2 * 1024 * 1024 * 1024;
export const RecordingUploadRequestSchema = z.object({
  title: z.string().trim().min(2).max(160),
  fileName: z.string().trim().min(1).max(160),
  contentType: z.enum(RECORDING_TYPES),
  size: z.number().int().min(1).max(MAX_RECORDING_BYTES, 'At most 2 GB'),
});
export const RecordingUploadSchema = UploadTicketSchema.extend({ recordingId: UuidSchema });
export type RecordingUpload = z.infer<typeof RecordingUploadSchema>;

/** A class session as a member of the cohort sees it: can it be joined now, and its recordings. */
export const SessionLiveSchema = z.object({
  sessionId: UuidSchema,
  /** Virtual sessions open 15 minutes before they start and close when they should have ended plus an hour. */
  joinable: z.boolean(),
  opensAt: TimestampSchema,
  closesAt: TimestampSchema,
  recordings: z.array(RecordingSchema),
});
export type SessionLive = z.infer<typeof SessionLiveSchema>;

// ---------- Mentorship ----------

const Person = z.object({ userId: UuidSchema, name: z.string() });

export const MentorAssignmentSchema = z.object({
  id: UuidSchema,
  cohortId: UuidSchema,
  mentor: Person,
  learner: Person,
  since: TimestampSchema,
});
export type MentorAssignment = z.infer<typeof MentorAssignmentSchema>;

export const MentorMeetingStatusSchema = z.enum(['scheduled', 'held', 'cancelled']);
export const MentorMeetingSchema = z.object({
  id: UuidSchema,
  assignmentId: UuidSchema,
  mentor: Person,
  learner: Person,
  scheduledAt: TimestampSchema,
  durationMin: z.number().int(),
  mode: SessionModeSchema,
  location: z.string().nullable(),
  status: MentorMeetingStatusSchema,
  /** The mentor's log of the meeting; learners see it once the meeting is held. */
  notes: z.string(),
  joinable: z.boolean(),
});
export type MentorMeeting = z.infer<typeof MentorMeetingSchema>;

export const AssignMentorsSchema = z.object({
  mentorUserId: UuidSchema,
  learnerUserIds: z.array(UuidSchema).min(1).max(50).refine(distinct, 'List each person once'),
});
export const ScheduleMeetingSchema = z.object({
  assignmentId: UuidSchema,
  scheduledAt: TimestampSchema,
  durationMin: z.number().int().min(15).max(240).default(45),
  mode: SessionModeSchema.default('virtual'),
  location: z.string().trim().max(200).nullable().default(null),
});
export const UpdateMeetingSchema = z
  .object({
    scheduledAt: TimestampSchema.optional(),
    status: MentorMeetingStatusSchema.optional(),
    notes: z.string().trim().max(8000).optional(),
  })
  .strict();

export const MentoringSchema = z.object({
  /** Learners assigned to the caller as mentor, across cohorts. */
  learners: z.array(MentorAssignmentSchema.extend({ cohortName: z.string(), lastMeetingAt: TimestampSchema.nullable(), nextMeetingAt: TimestampSchema.nullable() })),
  meetings: z.array(MentorMeetingSchema),
});

// ---------- Dream Circles ----------

export const DreamCircleSchema = z.object({
  id: UuidSchema,
  cohortId: UuidSchema,
  name: z.string(),
  members: z.array(Person),
});
export type DreamCircle = z.infer<typeof DreamCircleSchema>;
export const SaveCircleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  memberUserIds: z.array(UuidSchema).min(2, 'A circle has at least two members').max(12).refine(distinct, 'List each person once'),
});

/** A learner's people: their mentors, upcoming mentor meetings, and their circle. */
export const MyCommunitySchema = z.object({
  mentors: z.array(Person.extend({ cohortName: z.string() })),
  meetings: z.array(MentorMeetingSchema),
  circles: z.array(DreamCircleSchema.extend({ cohortName: z.string() })),
  /** Recordings of my cohorts' classes, newest first. */
  recordings: z.array(RecordingSchema.extend({ sessionTitle: z.string(), weekNo: z.number().int(), cohortName: z.string() })),
});
export type MyCommunity = z.infer<typeof MyCommunitySchema>;

const CohortParams = z.object({ cohortId: UuidSchema });
const SessionParams = z.object({ cohortId: UuidSchema, sessionId: UuidSchema });

export const communityContract = c.router(
  {
    sessionLive: {
      method: 'GET',
      path: '/learning/cohorts/:cohortId/sessions/:sessionId/live',
      pathParams: SessionParams,
      responses: { 200: SessionLiveSchema, ...errors },
      summary: 'Whether a class session can be joined now, and its recordings (cohort learners and staff)',
    },
    joinSession: {
      method: 'POST',
      path: '/learning/cohorts/:cohortId/sessions/:sessionId/join',
      pathParams: SessionParams,
      body: c.noBody(),
      responses: { 200: JoinTicketSchema, ...errors },
      summary: 'A short-lived token to join the class live (faculty host; learners take part)',
    },
    uploadRecording: {
      method: 'POST',
      path: '/learning/cohorts/:cohortId/sessions/:sessionId/recordings',
      pathParams: SessionParams,
      body: RecordingUploadRequestSchema,
      responses: { 201: RecordingUploadSchema, ...errors },
      summary: 'An upload link for the session’s recording (course_run.teach or cohort.manage)',
    },
    recordingLink: {
      method: 'GET',
      path: '/learning/recordings/:recordingId',
      pathParams: z.object({ recordingId: UuidSchema }),
      responses: { 200: FileLinkSchema, ...errors },
      summary: 'A short-lived link to watch or listen to a recording (cohort learners and staff)',
    },
    mentors: {
      method: 'GET',
      path: '/learning/cohorts/:cohortId/mentors',
      pathParams: CohortParams,
      responses: { 200: z.object({ items: z.array(MentorAssignmentSchema), candidates: z.array(Person) }), ...errors },
      summary: 'Mentor assignments in a cohort, and the people who can mentor (cohort.manage)',
    },
    assignMentors: {
      method: 'POST',
      path: '/learning/cohorts/:cohortId/mentors',
      pathParams: CohortParams,
      body: AssignMentorsSchema,
      responses: { 201: z.object({ items: z.array(MentorAssignmentSchema) }), ...errors },
      summary: 'Assign a mentor to learners of the cohort (cohort.manage)',
    },
    endAssignment: {
      method: 'DELETE',
      path: '/learning/mentor-assignments/:assignmentId',
      pathParams: z.object({ assignmentId: UuidSchema }),
      responses: { 204: c.noBody(), ...errors },
      summary: 'End a mentor assignment; its meeting log is kept (cohort.manage)',
    },
    mentoring: {
      method: 'GET',
      path: '/learning/mentoring',
      responses: { 200: MentoringSchema, ...errors },
      summary: 'My mentees and our meetings (mentors)',
    },
    scheduleMeeting: {
      method: 'POST',
      path: '/learning/mentoring/meetings',
      body: ScheduleMeetingSchema,
      responses: { 201: MentorMeetingSchema, ...errors },
      summary: 'Schedule a meeting with one of my mentees (mentor)',
    },
    updateMeeting: {
      method: 'PATCH',
      path: '/learning/mentoring/meetings/:meetingId',
      pathParams: z.object({ meetingId: UuidSchema }),
      body: UpdateMeetingSchema,
      responses: { 200: MentorMeetingSchema, ...errors },
      summary: 'Reschedule, cancel, or log a meeting as held with notes (mentor)',
    },
    joinMeeting: {
      method: 'POST',
      path: '/learning/mentoring/meetings/:meetingId/join',
      pathParams: z.object({ meetingId: UuidSchema }),
      body: c.noBody(),
      responses: { 200: JoinTicketSchema, ...errors },
      summary: 'A short-lived token to join a virtual mentor meeting (its mentor and learner)',
    },
    circles: {
      method: 'GET',
      path: '/learning/cohorts/:cohortId/circles',
      pathParams: CohortParams,
      responses: { 200: z.object({ items: z.array(DreamCircleSchema) }), ...errors },
      summary: 'The cohort’s Dream Circles (cohort.manage)',
    },
    createCircle: {
      method: 'POST',
      path: '/learning/cohorts/:cohortId/circles',
      pathParams: CohortParams,
      body: SaveCircleSchema,
      responses: { 201: DreamCircleSchema, ...errors },
      summary: 'Create a Dream Circle of cohort learners (cohort.manage)',
    },
    updateCircle: {
      method: 'PUT',
      path: '/learning/circles/:circleId',
      pathParams: z.object({ circleId: UuidSchema }),
      body: SaveCircleSchema,
      responses: { 200: DreamCircleSchema, ...errors },
      summary: 'Rename a circle or change its members (cohort.manage)',
    },
    deleteCircle: {
      method: 'DELETE',
      path: '/learning/circles/:circleId',
      pathParams: z.object({ circleId: UuidSchema }),
      responses: { 204: c.noBody(), ...errors },
      summary: 'Dissolve a circle (cohort.manage)',
    },
    myCommunity: {
      method: 'GET',
      path: '/learning/me/community',
      responses: { 200: MyCommunitySchema, ...errors },
      summary: 'My mentors, mentor meetings, Dream Circles and class recordings',
    },
  },
  { strictStatusCodes: true },
);
