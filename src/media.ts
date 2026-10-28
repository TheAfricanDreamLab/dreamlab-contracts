import { z } from 'zod';
import { TimestampSchema, UuidSchema } from './common';

/*
 * Uploads (MEDIA-1). The API hands out a short-lived upload URL; the browser PUTs the file straight
 * to storage. Course media is public and served from the site's own /media path; learners' files are
 * private and opened through a short-lived link the API issues after checking access.
 */

/** Where uploaded course media lives, relative to /media. */
export const MEDIA_PATH_PATTERN = /^courses\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
export const MediaPathSchema = z.string().regex(MEDIA_PATH_PATTERN, 'An uploaded file');

export const COURSE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const COURSE_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;
/** What learners may attach to an assignment. */
export const SUBMISSION_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4',
  'audio/mpeg',
] as const;

export const MAX_COURSE_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_COURSE_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_SUBMISSION_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_SUBMISSION_FILES = 5;

const FileName = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((n) => !/[\\/\u0000-\u001f]/.test(n), 'A file name without slashes');

export const CourseMediaUploadRequestSchema = z
  .object({
    kind: z.enum(['image', 'video']),
    fileName: FileName,
    contentType: z.enum([...COURSE_IMAGE_TYPES, ...COURSE_VIDEO_TYPES]),
    size: z.number().int().min(1),
  })
  .superRefine((r, ctx) => {
    const image = (COURSE_IMAGE_TYPES as readonly string[]).includes(r.contentType);
    if ((r.kind === 'image') !== image) ctx.addIssue({ code: 'custom', path: ['contentType'], message: r.kind === 'image' ? 'A JPEG, PNG or WebP image' : 'An MP4 or WebM video' });
    const max = r.kind === 'image' ? MAX_COURSE_IMAGE_BYTES : MAX_COURSE_VIDEO_BYTES;
    if (r.size > max) ctx.addIssue({ code: 'custom', path: ['size'], message: `At most ${Math.round(max / 1024 / 1024)} MB` });
  });

export const SubmissionFileUploadRequestSchema = z.object({
  fileName: FileName,
  contentType: z.enum(SUBMISSION_FILE_TYPES),
  size: z.number().int().min(1).max(MAX_SUBMISSION_FILE_BYTES, 'At most 50 MB'),
});

/** PUT the file to `uploadUrl` with these headers before it expires. */
export const UploadTicketSchema = z.object({
  uploadUrl: z.string().url(),
  headers: z.record(z.string()),
  expiresAt: TimestampSchema,
});

export const CourseMediaUploadSchema = UploadTicketSchema.extend({
  /** Store this in the course: `videoId` for a file video, or the image URL `/media/<path>`. */
  path: MediaPathSchema,
  url: z.string(),
});
export type CourseMediaUpload = z.infer<typeof CourseMediaUploadSchema>;

export const SubmissionFileUploadSchema = UploadTicketSchema.extend({ fileId: UuidSchema });
export type SubmissionFileUpload = z.infer<typeof SubmissionFileUploadSchema>;

export const SubmissionFileSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  size: z.number().int(),
  contentType: z.string(),
});
export type SubmissionFile = z.infer<typeof SubmissionFileSchema>;

/** A short-lived link to open a private file. */
export const FileLinkSchema = z.object({ url: z.string().url(), expiresAt: TimestampSchema });
