import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ErrorResponseSchema, TimestampSchema, UuidSchema } from './common';
import {
  CourseLevelSchema,
  CourseVisibilitySchema,
  CoverSchema,
  InstructorSchema,
  ItemTypeSchema,
} from './content';

const c = initContract();

const errors = { 400: ErrorResponseSchema, 401: ErrorResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema } as const;

export const CourseSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(80);

/** available: published, open for enrolment. coming_soon: outline only. */
export const CourseAvailabilitySchema = z.enum(['available', 'coming_soon']);

export const CourseSummarySchema = z.object({
  id: UuidSchema,
  slug: CourseSlugSchema,
  title: z.string(),
  subtitle: z.string(),
  provider: z.string(),
  level: CourseLevelSchema,
  language: z.string(),
  creditHours: z.number(),
  /** Of the published version; null while coming soon. */
  estimatedMinutes: z.number().int().nullable(),
  moduleCount: z.number().int(),
  skills: z.array(z.string()),
  practicalOutput: z.string().nullable(),
  cover: CoverSchema,
  availability: CourseAvailabilitySchema,
  featured: z.boolean(),
  /** Programmes this course belongs to. */
  programs: z.array(z.object({ slug: z.string(), title: z.string() })),
});
export type CourseSummary = z.infer<typeof CourseSummarySchema>;

export const OutlineItemSchema = z.object({
  id: UuidSchema,
  key: z.string(),
  type: ItemTypeSchema,
  title: z.string(),
  minutes: z.number().int(),
  required: z.boolean(),
});
export const OutlineModuleSchema = z.object({
  id: UuidSchema,
  key: z.string(),
  position: z.number().int(),
  title: z.string(),
  summary: z.string(),
  weekNo: z.number().int().nullable(),
  items: z.array(OutlineItemSchema),
});

export const CourseDetailSchema = CourseSummarySchema.extend({
  description: z.string(),
  outcomes: z.array(z.string()),
  audience: z.string(),
  prerequisites: z.string(),
  instructors: z.array(InstructorSchema),
  /** The published version learners enrol in; null while coming soon. */
  versionId: UuidSchema.nullable(),
  versionNo: z.number().int().nullable(),
  modules: z.array(OutlineModuleSchema),
});
export type CourseDetail = z.infer<typeof CourseDetailSchema>;

// ---------- Programmes (ERD §6) ----------

export const PROGRAM_TYPES = ['specialization', 'professional_certificate', 'learning_path', 'cohort_program', 'degree'] as const;
export const DELIVERY_MODES = ['self_paced', 'cohort', 'blended'] as const;
export const PROGRAM_FEATURES = [
  'admissions',
  'scholarships',
  'programme_score',
  'competency_score',
  'capstone',
  'portfolio',
  'graduation_checklist',
  'mentorship',
] as const;

export const ProgramSummarySchema = z.object({
  id: UuidSchema,
  slug: z.string(),
  title: z.string(),
  subtitle: z.string(),
  provider: z.string(),
  programType: z.enum(PROGRAM_TYPES),
  deliveryMode: z.enum(DELIVERY_MODES),
  creditTotal: z.number(),
  weeks: z.number().int().nullable(),
  courseCount: z.number().int(),
  cover: CoverSchema,
});
export type ProgramSummary = z.infer<typeof ProgramSummarySchema>;

export const ProgramDetailSchema = ProgramSummarySchema.extend({
  description: z.string(),
  features: z.array(z.enum(PROGRAM_FEATURES)),
  phases: z.array(
    z.object({
      id: UuidSchema,
      position: z.number().int(),
      name: z.string(),
      summary: z.string(),
      weekFrom: z.number().int().nullable(),
      weekTo: z.number().int().nullable(),
      weightPct: z.number(),
      creditHours: z.number(),
      /** Learners choose this many of the phase's courses (an elective group); null = all required. */
      chooseN: z.number().int().nullable(),
      courses: z.array(CourseSummarySchema.extend({ required: z.boolean() })),
    }),
  ),
  capstoneStages: z.array(z.object({ position: z.number().int(), name: z.string(), outputDocument: z.string(), creditHours: z.number(), summary: z.string() })),
  graduationRequirements: z.array(z.object({ position: z.number().int(), key: z.string(), label: z.string() })),
  calendar: z.array(z.object({ weekNo: z.number().int(), phase: z.string(), focus: z.string(), majorOutput: z.string() })),
});
export type ProgramDetail = z.infer<typeof ProgramDetailSchema>;

/** A programme as a seed defines it; courses are referenced by slug. */
export const ProgramAuthoringSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string(),
  subtitle: z.string(),
  description: z.string(),
  provider: z.string(),
  programType: z.enum(PROGRAM_TYPES),
  deliveryMode: z.enum(DELIVERY_MODES),
  features: z.array(z.enum(PROGRAM_FEATURES)),
  cover: CoverSchema,
  phases: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      summary: z.string(),
      weekFrom: z.number().int().nullable(),
      weekTo: z.number().int().nullable(),
      weightPct: z.number(),
      chooseN: z.number().int().nullable().default(null),
      courses: z.array(z.object({ slug: CourseSlugSchema, creditHours: z.number(), required: z.boolean().default(true) })),
    }),
  ),
  capstoneStages: z.array(z.object({ name: z.string(), outputDocument: z.string(), creditHours: z.number(), summary: z.string() })),
  graduationRequirements: z.array(z.object({ key: z.string(), label: z.string() })),
  calendar: z.array(z.object({ weekNo: z.number().int(), phase: z.string(), focus: z.string(), majorOutput: z.string() })),
});
export type ProgramAuthoring = z.infer<typeof ProgramAuthoringSchema>;

// ---------- Platform administration (PLT-1) ----------

export const AdminCourseSchema = z.object({
  id: UuidSchema,
  slug: z.string(),
  title: z.string(),
  provider: z.string(),
  ownerOrgId: UuidSchema.nullable(),
  visibility: CourseVisibilitySchema,
  availability: CourseAvailabilitySchema,
  /** Hidden courses stay reachable for enrolled learners but leave the catalog. */
  listed: z.boolean(),
  featured: z.boolean(),
  versionNo: z.number().int().nullable(),
  publishedAt: TimestampSchema.nullable(),
  updatedAt: TimestampSchema,
});
export const UpdateAdminCourseSchema = z
  .object({ listed: z.boolean().optional(), featured: z.boolean().optional() })
  .refine((v) => v.listed !== undefined || v.featured !== undefined, 'Change listed or featured');

const CatalogQuery = z.object({
  q: z.string().trim().max(80).optional(),
  program: z.string().max(80).optional(),
  level: CourseLevelSchema.optional(),
});

export const catalogContract = c.router(
  {
    listCourses: {
      method: 'GET',
      path: '/catalog/courses',
      query: CatalogQuery,
      responses: { 200: z.object({ items: z.array(CourseSummarySchema) }), 400: ErrorResponseSchema },
      summary: 'Browse the course catalog: public courses, plus the active organisation’s private ones',
    },
    getCourse: {
      method: 'GET',
      path: '/catalog/courses/:slug',
      pathParams: z.object({ slug: CourseSlugSchema }),
      responses: { 200: CourseDetailSchema, ...errors },
      summary: 'A course page: description, outcomes and the full syllabus (no lesson content)',
    },
    listPrograms: {
      method: 'GET',
      path: '/catalog/programs',
      responses: { 200: z.object({ items: z.array(ProgramSummarySchema) }) },
      summary: 'Programmes: ordered sets of courses',
    },
    getProgram: {
      method: 'GET',
      path: '/catalog/programs/:slug',
      pathParams: z.object({ slug: z.string().max(80) }),
      responses: { 200: ProgramDetailSchema, ...errors },
      summary: 'A programme: phases and courses, capstone stages, graduation requirements and calendar',
    },
    adminListCourses: {
      method: 'GET',
      path: '/catalog/admin/courses',
      responses: { 200: z.object({ items: z.array(AdminCourseSchema) }), ...errors },
      summary: 'Every course on the platform, listed or not (platform admin)',
    },
    adminUpdateCourse: {
      method: 'PATCH',
      path: '/catalog/admin/courses/:courseId',
      pathParams: z.object({ courseId: UuidSchema }),
      body: UpdateAdminCourseSchema,
      responses: { 200: AdminCourseSchema, ...errors },
      summary: 'List, hide or feature a course in the catalog (platform admin)',
    },
  },
  { strictStatusCodes: true },
);
