import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { EmailSchema, ErrorResponseSchema, PhoneSchema, TimestampSchema, UuidSchema } from './common';
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
  /** Dream Circles the caller's mentees belong to, which the caller can open (COMM-2). */
  circles: z.array(z.object({ id: UuidSchema, name: z.string(), cohortName: z.string() })).default([]),
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

// ---------- A Dream Circle's own space (COMM-2) ----------
// A board of posts and replies with voice messages, pictures, videos, files and links, and a live
// call any member can start. Members, the members' mentors and the cohort's staff can read it; the
// mentors and staff can also pin and remove posts. Calls are never recorded.

export const CIRCLE_POST_MAX_CHARS = 4000;
export const CIRCLE_ATTACHMENTS_MAX = 6;
/** Upload limits per kind, in bytes. Pictures are shrunk in the browser before they are sent. */
export const CIRCLE_UPLOAD_LIMITS = { image: 8 * 1024 * 1024, audio: 10 * 1024 * 1024, video: 100 * 1024 * 1024, file: 20 * 1024 * 1024 } as const;
/** Voice messages: up to five minutes. */
export const CIRCLE_VOICE_MAX_SECONDS = 300;

export const CircleAttachmentKindSchema = z.enum(['image', 'audio', 'video', 'file']);
export type CircleAttachmentKind = z.infer<typeof CircleAttachmentKindSchema>;

export const CircleAttachmentSchema = z.object({
  id: UuidSchema,
  kind: CircleAttachmentKindSchema,
  fileName: z.string(),
  contentType: z.string(),
  size: z.number().int(),
  /** A short-lived signed link, ready for <img>, <audio> or <video> (no extra request per file). */
  url: z.string().url(),
  /** Voice messages and videos. */
  durationSec: z.number().nullable(),
  /** Pictures and videos, so the page reserves their space before they load. */
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type CircleAttachment = z.infer<typeof CircleAttachmentSchema>;

/** A link in a post, with the page's title and description read once when the post was made. */
export const LinkPreviewSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  siteName: z.string().nullable(),
});
export type LinkPreview = z.infer<typeof LinkPreviewSchema>;

export const CircleRoleSchema = z.enum(['member', 'mentor', 'staff']);
export type CircleRole = z.infer<typeof CircleRoleSchema>;

export const CirclePostSchema = z.object({
  id: UuidSchema,
  circleId: UuidSchema,
  /** Set on replies: the post they answer. Replies have no replies of their own. */
  parentId: UuidSchema.nullable(),
  author: Person.extend({ role: CircleRoleSchema }),
  body: z.string(),
  attachments: z.array(CircleAttachmentSchema),
  links: z.array(LinkPreviewSchema),
  pinned: z.boolean(),
  replyCount: z.number().int(),
  createdAt: TimestampSchema,
  can: z.object({ delete: z.boolean(), pin: z.boolean() }),
});
export type CirclePost = z.infer<typeof CirclePostSchema>;

export const CirclePostPageSchema = z.object({
  items: z.array(CirclePostSchema),
  /** Pass back as `before` for the next (older) page; null when there is none. */
  nextCursor: z.string().max(80).nullable(),
});
export type CirclePostPage = z.infer<typeof CirclePostPageSchema>;

export const CirclePostsQuerySchema = z.object({
  /** Replies to this post (oldest first) instead of the circle's posts (newest first, pinned on top). */
  parentId: UuidSchema.optional(),
  before: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * Contact details a person chooses to share with one circle (COMM-3). Nothing is shared until they
 * fill it in; whoever can open the circle (its members, their mentors and cohort staff) sees it.
 */
export const CircleContactSchema = z.object({
  email: EmailSchema.nullable().default(null),
  phone: PhoneSchema.nullable().default(null),
  /** The phone number is on WhatsApp. */
  whatsapp: z.boolean().default(false),
  linkedin: z
    .string()
    .trim()
    .url()
    .max(300)
    .refine((u) => /^https:\/\/([a-z]{2,3}\.|www\.)?linkedin\.com\//i.test(u), 'Use your LinkedIn profile link, e.g. https://www.linkedin.com/in/your-name')
    .nullable()
    .default(null),
});
export type CircleContact = z.infer<typeof CircleContactSchema>;

/** A circle meetup: online in the circle's call, or in person (COMM-3). Everyone is reminded an hour ahead. */
export const CIRCLE_MEETUP_REMINDER_MINUTES = 60;
export const CircleMeetupSchema = z.object({
  id: UuidSchema,
  circleId: UuidSchema,
  title: z.string(),
  startsAt: TimestampSchema,
  durationMin: z.number().int(),
  mode: SessionModeSchema,
  location: z.string().nullable(),
  details: z.string(),
  createdBy: Person,
  can: z.object({ cancel: z.boolean() }),
});
export type CircleMeetup = z.infer<typeof CircleMeetupSchema>;

export const CreateCircleMeetupSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    startsAt: TimestampSchema,
    durationMin: z.number().int().min(15).max(240).default(60),
    mode: SessionModeSchema.default('virtual'),
    location: z.string().trim().max(200).nullable().default(null),
    details: z.string().trim().max(1000).default(''),
  })
  .refine((m) => m.mode === 'virtual' || !!m.location, { message: 'Say where you will meet', path: ['location'] });
export type CreateCircleMeetup = z.infer<typeof CreateCircleMeetupSchema>;

export const CircleSpaceSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  cohortId: UuidSchema,
  cohortName: z.string(),
  /** Each person's shared contact details, or null when they share none. */
  members: z.array(Person.extend({ role: CircleRoleSchema, contact: CircleContactSchema.nullable().default(null) })),
  you: z.object({ role: CircleRoleSchema, contact: CircleContactSchema.nullable().default(null) }),
  /** Whether a call is on now, and how many people are in it. */
  call: z.object({ active: z.boolean(), participants: z.number().int() }),
  can: z.object({ post: z.boolean(), moderate: z.boolean() }),
  /** Upcoming meetups, soonest first, including one under way. */
  meetups: z.array(CircleMeetupSchema).default([]),
});
export type CircleSpace = z.infer<typeof CircleSpaceSchema>;

export const CreateCirclePostSchema = z
  .object({
    body: z.string().trim().max(CIRCLE_POST_MAX_CHARS).default(''),
    /** From the upload tickets, once each file is uploaded. */
    attachmentIds: z.array(UuidSchema).max(CIRCLE_ATTACHMENTS_MAX).refine(distinct, 'List each file once').default([]),
    parentId: UuidSchema.optional(),
  })
  .refine((p) => p.body.length > 0 || p.attachmentIds.length > 0, 'Write something or add a file');
export type CreateCirclePost = z.infer<typeof CreateCirclePostSchema>;

export const CircleUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(3).max(120),
  size: z.number().int().positive().max(CIRCLE_UPLOAD_LIMITS.video, 'At most 100 MB'),
  durationSec: z.number().positive().max(60 * 60).optional(),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
});
export const CircleUploadTicketSchema = UploadTicketSchema.extend({ attachmentId: UuidSchema, kind: CircleAttachmentKindSchema });
export type CircleUploadTicket = z.infer<typeof CircleUploadTicketSchema>;

const CircleParams = z.object({ circleId: UuidSchema });
const CirclePostParams = z.object({ postId: UuidSchema });

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
    circleSpace: {
      method: 'GET',
      path: '/learning/circles/:circleId/space',
      pathParams: CircleParams,
      responses: { 200: CircleSpaceSchema, ...errors },
      summary: 'A circle’s space: members, whether a call is on, and what you may do (members, their mentors, cohort staff)',
    },
    circlePosts: {
      method: 'GET',
      path: '/learning/circles/:circleId/posts',
      pathParams: CircleParams,
      query: CirclePostsQuerySchema,
      responses: { 200: CirclePostPageSchema, ...errors },
      summary: 'A page of the circle’s posts (newest first, pinned on top), or of one post’s replies',
    },
    createCirclePost: {
      method: 'POST',
      path: '/learning/circles/:circleId/posts',
      pathParams: CircleParams,
      body: CreateCirclePostSchema,
      responses: { 201: CirclePostSchema, ...errors },
      summary: 'Post to the circle, or reply to a post, with text, uploaded files and links',
    },
    deleteCirclePost: {
      method: 'DELETE',
      path: '/learning/circle-posts/:postId',
      pathParams: CirclePostParams,
      responses: { 204: c.noBody(), ...errors },
      summary: 'Remove a post or reply (its author, or the circle’s mentors and cohort staff)',
    },
    pinCirclePost: {
      method: 'PUT',
      path: '/learning/circle-posts/:postId/pin',
      pathParams: CirclePostParams,
      body: z.object({ pinned: z.boolean() }),
      responses: { 200: CirclePostSchema, ...errors },
      summary: 'Pin a post to the top of the circle, or unpin it (mentors and cohort staff)',
    },
    circleUpload: {
      method: 'POST',
      path: '/learning/circles/:circleId/uploads',
      pathParams: CircleParams,
      body: CircleUploadRequestSchema,
      responses: { 201: CircleUploadTicketSchema, ...errors },
      summary: 'A link to upload a voice message, picture, video or file straight to storage, for a post',
    },
    saveCircleContact: {
      method: 'PUT',
      path: '/learning/circles/:circleId/contact',
      pathParams: CircleParams,
      body: CircleContactSchema,
      responses: { 200: CircleContactSchema, ...errors },
      summary: 'Choose the contact details I share with this circle; empty shares nothing (members and mentors)',
    },
    createCircleMeetup: {
      method: 'POST',
      path: '/learning/circles/:circleId/meetups',
      pathParams: CircleParams,
      body: CreateCircleMeetupSchema,
      responses: { 201: CircleMeetupSchema, ...errors },
      summary: 'Schedule a circle meetup; everyone is told and reminded an hour ahead',
    },
    cancelCircleMeetup: {
      method: 'DELETE',
      path: '/learning/circle-meetups/:meetupId',
      pathParams: z.object({ meetupId: UuidSchema }),
      responses: { 204: c.noBody(), ...errors },
      summary: 'Cancel a meetup (whoever scheduled it, or the circle’s mentors and cohort staff)',
    },
    joinCircleCall: {
      method: 'POST',
      path: '/learning/circles/:circleId/call',
      pathParams: CircleParams,
      body: c.noBody(),
      responses: { 200: JoinTicketSchema, ...errors },
      summary: 'Start or join the circle’s call (camera and microphone for everyone; never recorded)',
    },
  },
  { strictStatusCodes: true },
);
