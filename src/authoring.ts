import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CourseSlugSchema } from './catalog';
import { ErrorResponseSchema, TimestampSchema, UuidSchema } from './common';
import { BlockIdSchema, CourseAuthoringSchema, CourseVisibilitySchema, VIDEO_PROVIDERS, videoProblem, videoStepProblems } from './content';
import { CourseMediaUploadRequestSchema, CourseMediaUploadSchema } from './media';

const c = initContract();

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
} as const;

/*
 * Course authoring in the browser (CAT-3). An author works on a draft: a whole course as an authored
 * document (the same shape a course file has, CourseAuthoringSchema), saved as often as they like
 * even while incomplete. When it is ready they submit it for review; a reviewer publishes it as the
 * course's next version or asks for changes. Learners already enrolled stay on their version.
 *
 * Who: authors hold course.content.edit in the owning organisation; reviewers hold course.publish
 * there. Courses for the public catalogue (visibility "public") are published by platform admins,
 * who also author the platform's own courses.
 */

export const DRAFT_STATUSES = ['draft', 'in_review', 'changes_requested', 'published'] as const;
export const DraftStatusSchema = z.enum(DRAFT_STATUSES);
export type DraftStatus = z.infer<typeof DraftStatusSchema>;

/** Something that stops a draft being published, at a path in the document (e.g. modules.0.items.2.title). */
export const DraftIssueSchema = z.object({ path: z.string(), message: z.string() });
export type DraftIssue = z.infer<typeof DraftIssueSchema>;

const Person = z.object({ userId: UuidSchema, name: z.string() }).nullable();

export const DraftSummarySchema = z.object({
  id: UuidSchema,
  /** Null until a new course is first published. */
  courseId: UuidSchema.nullable(),
  slug: CourseSlugSchema,
  title: z.string(),
  ownerOrgId: UuidSchema,
  ownerName: z.string(),
  visibility: CourseVisibilitySchema,
  status: DraftStatusSchema,
  /** The published version this draft started from (null for a new course). */
  baseVersionNo: z.number().int().nullable(),
  publishedVersionNo: z.number().int().nullable(),
  updatedAt: TimestampSchema,
  updatedBy: Person,
  submittedAt: TimestampSchema.nullable(),
});
export type DraftSummary = z.infer<typeof DraftSummarySchema>;

export const DraftSchema = DraftSummarySchema.extend({
  /** Increases on every save; send it back so two people can't overwrite each other unawares. */
  revision: z.number().int(),
  /** The course as authored so far. May be incomplete while status is draft. */
  doc: z.record(z.unknown()),
  /** Empty when the draft could be published as it stands. */
  issues: z.array(DraftIssueSchema),
  reviewNote: z.string().nullable(),
  reviewedBy: Person,
  reviewedAt: TimestampSchema.nullable(),
  /** What the caller may do with it now. */
  can: z.object({ edit: z.boolean(), submit: z.boolean(), withdraw: z.boolean(), review: z.boolean(), delete: z.boolean() }),
});
export type Draft = z.infer<typeof DraftSchema>;

export const AuthoringOverviewSchema = z.object({
  /** Courses the active organisation owns (for a course's own authors, just theirs), with any open draft. */
  courses: z.array(
    z.object({
      courseId: UuidSchema,
      slug: CourseSlugSchema,
      title: z.string(),
      visibility: CourseVisibilitySchema,
      versionNo: z.number().int().nullable(),
      openDraft: z.object({ id: UuidSchema, status: DraftStatusSchema }).nullable(),
      /** The caller may start or edit a draft of it (an organisation author, or this course's). */
      canEdit: z.boolean(),
    }),
  ),
  /** Open drafts of new courses (not yet published). */
  newDrafts: z.array(DraftSummarySchema),
  /** Drafts waiting for the caller's review: their organisation's, and for platform admins public courses from every organisation. */
  toReview: z.array(DraftSummarySchema),
  can: z.object({ author: z.boolean(), review: z.boolean() }),
});
export type AuthoringOverview = z.infer<typeof AuthoringOverviewSchema>;

/** Start from an existing course (its current version), or a new course with a slug and title. */
export const CreateDraftSchema = z
  .object({
    courseSlug: CourseSlugSchema.optional(),
    slug: CourseAuthoringSchema.shape.slug.optional(),
    title: z.string().trim().min(3).max(160).optional(),
  })
  .strict()
  .refine((v) => (v.courseSlug ? !v.slug && !v.title : !!v.slug && !!v.title), 'Give either courseSlug, or a slug and title for a new course');

/** One save in a draft's history (CAT-5): the last 50 saves are kept and can be restored. */
export const DRAFT_HISTORY_KEPT = 50;
export const DraftSaveSchema = z.object({
  revision: z.number().int().min(1),
  savedAt: TimestampSchema,
  savedBy: Person,
  /** The course title at that save. */
  title: z.string(),
  /** Modules and items at that save, for telling saves apart. */
  modules: z.number().int(),
  items: z.number().int(),
});
export type DraftSave = z.infer<typeof DraftSaveSchema>;

/** Bring back an earlier save as the newest one. `revision` is the draft's current revision, as for a save. */
export const RestoreDraftSchema = z.object({ revision: z.number().int().min(0), restore: z.number().int().min(1) }).strict();

/** A save: the whole document and the revision it was based on. Up to 1 MB of JSON. */
export const SaveDraftSchema = z
  .object({
    revision: z.number().int().min(0),
    doc: z.record(z.unknown()),
    /**
     * Keep this save as its own entry in the history. Autosaves leave it out: an author's autosaves
     * within DRAFT_CHECKPOINT_MINUTES of each other are kept as one entry (the latest).
     */
    checkpoint: z.boolean().optional(),
  })
  .strict();
export const DRAFT_CHECKPOINT_MINUTES = 5;

export const ReviewNoteSchema = z.object({ note: z.string().trim().max(2000).nullable().default(null) }).strict();
/** Asking for changes always says what to change. */
export const RequestChangesSchema = z.object({ note: z.string().trim().min(1).max(2000) }).strict();

const DraftParams = z.object({ draftId: UuidSchema });

// ---------- Review comments and who is here (CAT-6) ----------

/**
 * Where a comment points: the course details, a module, an item, or one block in an item. Keys and
 * block ids, so a comment follows its block when things move. `label` is what to show
 * ("Module 2 › Lesson “Why” › Video").
 */
export const CommentAnchorSchema = z
  .object({
    moduleKey: BlockIdSchema.nullable().default(null),
    itemKey: BlockIdSchema.nullable().default(null),
    blockId: BlockIdSchema.nullable().default(null),
    label: z.string().trim().max(200).default(''),
  })
  .strict();
export type CommentAnchor = z.infer<typeof CommentAnchorSchema>;

export const DraftCommentSchema = z.object({
  id: UuidSchema,
  /** Replies point to the first comment of their thread. */
  parentId: UuidSchema.nullable(),
  anchor: CommentAnchorSchema,
  body: z.string(),
  author: Person,
  mine: z.boolean(),
  createdAt: TimestampSchema,
  editedAt: TimestampSchema.nullable(),
  resolvedAt: TimestampSchema.nullable(),
  resolvedBy: Person,
});
export type DraftComment = z.infer<typeof DraftCommentSchema>;

export const AddCommentSchema = z
  .object({
    anchor: CommentAnchorSchema,
    body: z.string().trim().min(1).max(2000),
    parentId: UuidSchema.optional(),
  })
  .strict();
export const UpdateCommentSchema = z
  .object({
    body: z.string().trim().min(1).max(2000).optional(),
    resolved: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.body !== undefined || v.resolved !== undefined, 'Change the text or resolve the thread');

/** Someone with the draft open, and where they are. Seen within the last PRESENCE_SECONDS. */
export const PRESENCE_SECONDS = 45;
export const PresenceSchema = z.object({
  userId: UuidSchema,
  name: z.string(),
  /** What they have open, e.g. "Module 1 › Lesson “Why”"; null on the course details. */
  where: z.object({ moduleKey: z.string().nullable(), itemKey: z.string().nullable(), label: z.string() }).nullable(),
  /** They changed something in the last PRESENCE_SECONDS (rather than only looking). */
  editing: z.boolean(),
  seenAt: TimestampSchema,
});
export type Presence = z.infer<typeof PresenceSchema>;
export const HeartbeatSchema = z
  .object({
    where: z.object({ moduleKey: z.string().max(48).nullable(), itemKey: z.string().max(48).nullable(), label: z.string().max(200) }).nullable(),
    editing: z.boolean().default(false),
  })
  .strict();
const CommentParams = DraftParams.extend({ commentId: UuidSchema });

export const authoringContract = c.router(
  {
    overview: {
      method: 'GET',
      path: '/catalog/authoring',
      responses: { 200: AuthoringOverviewSchema, ...errors },
      summary: 'Courses and drafts the caller can author or review in the active organisation',
    },
    create: {
      method: 'POST',
      path: '/catalog/authoring/drafts',
      body: CreateDraftSchema,
      responses: { 201: DraftSchema, ...errors },
      summary: 'Start a draft: of an existing course (from its current version) or of a new course. One open draft per course.',
    },
    get: {
      method: 'GET',
      path: '/catalog/authoring/drafts/:draftId',
      pathParams: DraftParams,
      responses: { 200: DraftSchema, ...errors },
      summary: 'A draft with its document, what stops it being published, and what the caller may do',
    },
    save: {
      method: 'PUT',
      path: '/catalog/authoring/drafts/:draftId',
      pathParams: DraftParams,
      body: SaveDraftSchema,
      responses: { 200: DraftSchema, ...errors },
      summary: 'Save the document (incomplete is fine). 409 when someone saved since the given revision.',
    },
    submit: {
      method: 'POST',
      path: '/catalog/authoring/drafts/:draftId/submit',
      pathParams: DraftParams,
      body: z.object({}).strict(),
      responses: { 200: DraftSchema, ...errors },
      summary: 'Send for review (only when it has no issues)',
    },
    withdraw: {
      method: 'POST',
      path: '/catalog/authoring/drafts/:draftId/withdraw',
      pathParams: DraftParams,
      body: z.object({}).strict(),
      responses: { 200: DraftSchema, ...errors },
      summary: 'Take a draft back from review to keep editing',
    },
    requestChanges: {
      method: 'POST',
      path: '/catalog/authoring/drafts/:draftId/request-changes',
      pathParams: DraftParams,
      body: RequestChangesSchema,
      responses: { 200: DraftSchema, ...errors },
      summary: 'Return a draft to its authors with a note (reviewer)',
    },
    publish: {
      method: 'POST',
      path: '/catalog/authoring/drafts/:draftId/publish',
      pathParams: DraftParams,
      body: ReviewNoteSchema,
      responses: { 200: DraftSchema, ...errors },
      summary: 'Publish a reviewed draft as the course’s next version (reviewer)',
    },
    uploadMedia: {
      method: 'POST',
      path: '/catalog/authoring/drafts/:draftId/media',
      pathParams: DraftParams,
      body: CourseMediaUploadRequestSchema,
      responses: { 201: CourseMediaUploadSchema, ...errors },
      summary: 'Get an upload URL for a cover image or video in a draft (PUT the file there, then use its path)',
    },
    history: {
      method: 'GET',
      path: '/catalog/authoring/drafts/:draftId/history',
      pathParams: DraftParams,
      responses: { 200: z.object({ items: z.array(DraftSaveSchema) }), ...errors },
      summary: 'The draft’s recent saves, newest first (whoever can open the draft)',
    },
    historyDoc: {
      method: 'GET',
      path: '/catalog/authoring/drafts/:draftId/history/:revision',
      pathParams: DraftParams.extend({ revision: z.coerce.number().int().min(1) }),
      responses: { 200: z.object({ revision: z.number().int(), doc: z.record(z.unknown()) }), ...errors },
      summary: 'The document as it was at one save',
    },
    restore: {
      method: 'POST',
      path: '/catalog/authoring/drafts/:draftId/restore',
      pathParams: DraftParams,
      body: RestoreDraftSchema,
      responses: { 200: DraftSchema, ...errors },
      summary: 'Make an earlier save the newest one (authors; the current version stays in the history)',
    },
    comments: {
      method: 'GET',
      path: '/catalog/authoring/drafts/:draftId/comments',
      pathParams: DraftParams,
      responses: { 200: z.object({ items: z.array(DraftCommentSchema) }), ...errors },
      summary: 'Review comments on a draft, oldest first (whoever can open the draft)',
    },
    addComment: {
      method: 'POST',
      path: '/catalog/authoring/drafts/:draftId/comments',
      pathParams: DraftParams,
      body: AddCommentSchema,
      responses: { 201: DraftCommentSchema, ...errors },
      summary: 'Comment on the draft, a module, an item or a block, or reply to a comment',
    },
    updateComment: {
      method: 'PATCH',
      path: '/catalog/authoring/drafts/:draftId/comments/:commentId',
      pathParams: CommentParams,
      body: UpdateCommentSchema,
      responses: { 200: DraftCommentSchema, ...errors },
      summary: 'Edit your comment, or resolve or reopen a thread (anyone who can open the draft)',
    },
    removeComment: {
      method: 'DELETE',
      path: '/catalog/authoring/drafts/:draftId/comments/:commentId',
      pathParams: CommentParams,
      responses: { 204: c.noBody(), ...errors },
      summary: 'Delete your comment (and, for the first comment, its replies)',
    },
    presence: {
      method: 'POST',
      path: '/catalog/authoring/drafts/:draftId/presence',
      pathParams: DraftParams,
      body: HeartbeatSchema,
      responses: { 200: z.object({ people: z.array(PresenceSchema) }), ...errors },
      summary: 'I have the draft open (send every 20 seconds); returns everyone else who has',
    },
    remove: {
      method: 'DELETE',
      path: '/catalog/authoring/drafts/:draftId',
      pathParams: DraftParams,
      responses: { 204: c.noBody(), ...errors },
      summary: 'Discard a draft that is not in review',
    },
  },
  { strictStatusCodes: true },
);

/** Every issue that stops a document being published, with readable paths. */
export function draftIssues(doc: unknown): DraftIssue[] {
  const parsed = CourseAuthoringSchema.safeParse(doc);
  if (parsed.success) {
    const issues: DraftIssue[] = [];
    if (!parsed.data.modules?.length) issues.push({ path: 'modules', message: 'Add at least one module with an item before publishing' });
    const visit = (value: unknown, path: (string | number)[]): void => {
      if (!value || typeof value !== 'object') return;
      const v = value as Record<string, unknown>;
      if ((VIDEO_PROVIDERS as readonly unknown[]).includes(v.provider) && typeof v.videoId === 'string') {
        const problem = videoProblem({ provider: v.provider as (typeof VIDEO_PROVIDERS)[number], videoId: v.videoId });
        if (problem) issues.push({ path: [...path, 'videoId'].join('.'), message: problem });
      }
      // A lesson step: questions asked during its videos, and their chapters.
      if (Array.isArray(v.blocks) && path.at(-2) === 'steps') {
        for (const p of videoStepProblems(v.blocks as { id: string; type: string }[])) issues.push({ path: [...path, 'blocks', p.path].join('.'), message: p.message });
      }
      for (const [k, child] of Object.entries(v)) visit(child, [...path, k]);
    };
    visit(parsed.data, []);
    return issues;
  }
  return parsed.error.issues.slice(0, 200).map((i) => ({ path: i.path.join('.'), message: i.message }));
}
