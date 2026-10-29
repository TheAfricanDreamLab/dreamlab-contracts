import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { CourseSlugSchema, CourseSummarySchema } from './catalog';
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
 * Assigned learning (ASSIGN-1): an organisation assigns courses to its people or groups, with an
 * optional due date. Assignees are enrolled at once (in the organisation's context) and told; the
 * organisation sees who has started, finished or is overdue. People leaving a group later keep the
 * assignment they were given.
 */

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date (YYYY-MM-DD)');

export const ASSIGNEE_STATUSES = ['not_started', 'in_progress', 'completed', 'overdue'] as const;
export const AssigneeStatusSchema = z.enum(ASSIGNEE_STATUSES);
export type AssigneeStatus = z.infer<typeof AssigneeStatusSchema>;

export const LearningAssignmentSchema = z.object({
  id: UuidSchema,
  course: CourseSummarySchema,
  dueOn: DateOnly.nullable(),
  note: z.string(),
  assignedBy: z.string(),
  createdAt: TimestampSchema,
  counts: z.record(AssigneeStatusSchema, z.number().int()),
});
export type LearningAssignment = z.infer<typeof LearningAssignmentSchema>;

export const LearningAssignmentDetailSchema = LearningAssignmentSchema.extend({
  assignees: z.array(z.object({ userId: UuidSchema, name: z.string(), status: AssigneeStatusSchema, progressPct: z.number().int(), completedAt: TimestampSchema.nullable() })),
});

export const CreateLearningAssignmentSchema = z
  .object({
    courseSlug: CourseSlugSchema,
    userIds: z.array(UuidSchema).max(500).default([]),
    groupIds: z.array(UuidSchema).max(50).default([]),
    dueOn: DateOnly.nullable().default(null),
    note: z.string().trim().max(500).default(''),
  })
  .refine((a) => a.userIds.length + a.groupIds.length > 0, 'Choose people or groups to assign it to');

/** What a person was assigned, across their organisations. */
export const MyAssignmentSchema = z.object({
  id: UuidSchema,
  course: CourseSummarySchema,
  orgName: z.string(),
  dueOn: DateOnly.nullable(),
  note: z.string(),
  status: AssigneeStatusSchema,
  progressPct: z.number().int(),
  enrollmentId: UuidSchema.nullable(),
});
export type MyAssignment = z.infer<typeof MyAssignmentSchema>;

const AssignmentParams = z.object({ assignmentId: UuidSchema });

export const assignedLearningContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/learning/org/assignments',
      responses: { 200: z.object({ items: z.array(LearningAssignmentSchema) }), ...errors },
      summary: 'Courses the organisation has assigned, with progress counts (learning.assign)',
    },
    create: {
      method: 'POST',
      path: '/learning/org/assignments',
      body: CreateLearningAssignmentSchema,
      responses: { 201: LearningAssignmentDetailSchema, ...errors },
      summary: 'Assign a course to people and groups; they are enrolled and told (learning.assign)',
    },
    get: {
      method: 'GET',
      path: '/learning/org/assignments/:assignmentId',
      pathParams: AssignmentParams,
      responses: { 200: LearningAssignmentDetailSchema, ...errors },
      summary: 'An assignment with each person’s progress (learning.assign)',
    },
    update: {
      method: 'PATCH',
      path: '/learning/org/assignments/:assignmentId',
      pathParams: AssignmentParams,
      body: z.object({ dueOn: DateOnly.nullable().optional(), note: z.string().trim().max(500).optional() }).strict(),
      responses: { 200: LearningAssignmentDetailSchema, ...errors },
      summary: 'Change an assignment’s due date or note (learning.assign)',
    },
    remove: {
      method: 'DELETE',
      path: '/learning/org/assignments/:assignmentId',
      pathParams: AssignmentParams,
      body: c.noBody(),
      responses: { 204: c.noBody(), ...errors },
      summary: 'Withdraw an assignment; enrolments and progress stay (learning.assign)',
    },
    mine: {
      method: 'GET',
      path: '/learning/me/assigned',
      responses: { 200: z.object({ items: z.array(MyAssignmentSchema) }), ...errors },
      summary: 'Courses assigned to me, with due dates and progress',
    },
  },
  { strictStatusCodes: true },
);
