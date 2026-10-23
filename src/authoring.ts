import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CourseSlugSchema } from './catalog';
import { ErrorResponseSchema, TimestampSchema, UuidSchema } from './common';
import { CourseAuthoringSchema, CourseVisibilitySchema } from './content';

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
  /** Courses the active organisation owns, with any open draft. */
  courses: z.array(
    z.object({
      courseId: UuidSchema,
      slug: CourseSlugSchema,
      title: z.string(),
      visibility: CourseVisibilitySchema,
      versionNo: z.number().int().nullable(),
      openDraft: z.object({ id: UuidSchema, status: DraftStatusSchema }).nullable(),
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

/** A save: the whole document and the revision it was based on. Up to 1 MB of JSON. */
export const SaveDraftSchema = z
  .object({
    revision: z.number().int().min(0),
    doc: z.record(z.unknown()),
  })
  .strict();

export const ReviewNoteSchema = z.object({ note: z.string().trim().max(2000).nullable().default(null) }).strict();
/** Asking for changes always says what to change. */
export const RequestChangesSchema = z.object({ note: z.string().trim().min(1).max(2000) }).strict();

const DraftParams = z.object({ draftId: UuidSchema });

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
    return parsed.data.modules?.length ? [] : [{ path: 'modules', message: 'Add at least one module with an item before publishing' }];
  }
  return parsed.error.issues.slice(0, 200).map((i) => ({ path: i.path.join('.'), message: i.message }));
}
