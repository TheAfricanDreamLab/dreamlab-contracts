import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ErrorResponseSchema, UuidSchema } from './common';
import { MediaImageUrlSchema } from './content';
import { COURSE_IMAGE_TYPES, CourseMediaUploadSchema, MAX_COURSE_IMAGE_BYTES } from './media';

const c = initContract();

const errors = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
} as const;

/*
 * Instructors and course staff (INSTR-1). An organisation keeps profiles of the people who teach
 * (optionally linked to their account), and puts them on its courses as lead, instructor or
 * assistant. A course with staff shows them on its page instead of the instructors in its file.
 */

export const STAFF_ROLES = ['lead', 'instructor', 'assistant'] as const;
export const StaffRoleSchema = z.enum(STAFF_ROLES);
export const STAFF_ROLE_LABELS: Record<(typeof STAFF_ROLES)[number], string> = { lead: 'Lead instructor', instructor: 'Instructor', assistant: 'Teaching assistant' };

export const InstructorProfileSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  title: z.string(),
  bio: z.string(),
  photoUrl: z.string().nullable(),
  /** The person's account, when they teach on the platform. */
  userId: UuidSchema.nullable(),
  /** Courses this profile is on. */
  courses: z.array(z.object({ slug: z.string(), title: z.string(), role: StaffRoleSchema })),
});
export type InstructorProfile = z.infer<typeof InstructorProfileSchema>;

export const SaveInstructorSchema = z.object({
  name: z.string().trim().min(2).max(120),
  title: z.string().trim().max(160).default(''),
  bio: z.string().trim().max(1200).default(''),
  photoUrl: MediaImageUrlSchema.nullable().default(null),
  userId: UuidSchema.nullable().default(null),
});

export const CourseStaffSchema = z.object({
  staff: z
    .array(z.object({ profileId: UuidSchema, role: StaffRoleSchema }))
    .max(12)
    .refine((s) => new Set(s.map((x) => x.profileId)).size === s.length, 'List each person once'),
});

export const InstructorPhotoUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(160),
  contentType: z.enum(COURSE_IMAGE_TYPES),
  size: z.number().int().min(1).max(MAX_COURSE_IMAGE_BYTES, 'At most 5 MB'),
});

const ProfileParams = z.object({ profileId: UuidSchema });

export const instructorsContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/catalog/instructors',
      responses: { 200: z.object({ items: z.array(InstructorProfileSchema) }), ...errors },
      summary: 'The organisation’s instructor profiles (course.content.edit)',
    },
    create: {
      method: 'POST',
      path: '/catalog/instructors',
      body: SaveInstructorSchema,
      responses: { 201: InstructorProfileSchema, ...errors },
      summary: 'Add an instructor profile (course.content.edit)',
    },
    update: {
      method: 'PUT',
      path: '/catalog/instructors/:profileId',
      pathParams: ProfileParams,
      body: SaveInstructorSchema,
      responses: { 200: InstructorProfileSchema, ...errors },
      summary: 'Change an instructor profile (course.content.edit)',
    },
    remove: {
      method: 'DELETE',
      path: '/catalog/instructors/:profileId',
      pathParams: ProfileParams,
      responses: { 204: c.noBody(), ...errors },
      summary: 'Remove a profile and take it off every course (course.content.edit)',
    },
    uploadPhoto: {
      method: 'POST',
      path: '/catalog/instructors/photo',
      body: InstructorPhotoUploadSchema,
      responses: { 201: CourseMediaUploadSchema, ...errors },
      summary: 'An upload link for an instructor photo; use the returned url as photoUrl (course.content.edit)',
    },
    setStaff: {
      method: 'PUT',
      path: '/catalog/courses/:slug/staff',
      pathParams: z.object({ slug: z.string().min(3).max(80) }),
      body: CourseStaffSchema,
      responses: { 200: CourseStaffSchema, ...errors },
      summary: 'Set who teaches a course, in order (course.content.edit for the course)',
    },
  },
  { strictStatusCodes: true },
);
