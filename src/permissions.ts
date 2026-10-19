import { z } from 'zod';

/**
 * The permission catalog. Every service checks these keys; roles are bundles of them.
 * Adding a key is a minor release; renaming or removing one is a major release.
 */
export const PERMISSIONS = [
  'platform.orgs.create',
  'platform.orgs.read',
  'platform.orgs.manage',
  'org.read',
  'org.settings.update',
  'org.members.read',
  'org.members.invite',
  'org.members.update',
  'org.members.remove',
  'org.roles.assign',
  'org.roles.revoke',
  'org.units.manage',
  'org.groups.manage',
  /** Email domains, single sign-on, SCIM provisioning and security policy (IAM-14..17, IAM-19). */
  'org.security.manage',
  /** Create, change and delete the organisation's own custom roles (IAM-18). */
  'org.roles.manage',
  'org.reports.read',
  'learning.assign',
  'course.content.edit',
  'course.publish',
  'course.analytics.read',
  'course_run.teach',
  'submission.grade',
  'mentorship.conduct',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const PermissionSchema = z.enum(PERMISSIONS);

export const SCOPE_TYPES = ['org', 'org_unit', 'group', 'program', 'cohort', 'course', 'course_run'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];
export const ScopeTypeSchema = z.enum(SCOPE_TYPES);

export interface SystemRole {
  key: string;
  name: string;
  description: string;
  /** Scopes at which this role may be assigned. */
  scopeTypes: readonly ScopeType[];
  permissions: readonly Permission[];
}

const ORG_ADMIN_PERMISSIONS = PERMISSIONS.filter((p) => p.startsWith('org.') || p === 'learning.assign');

export const SYSTEM_ROLES = [
  {
    key: 'platform_admin',
    name: 'Platform admin',
    description: 'Operates the platform: creates and manages organisations. Assigned in the platform org only.',
    scopeTypes: ['org'],
    permissions: [...PERMISSIONS],
  },
  {
    key: 'org_admin',
    name: 'Organisation admin',
    description: 'Manages an organisation: settings, members, roles, units and groups.',
    scopeTypes: ['org'],
    permissions: ORG_ADMIN_PERMISSIONS,
  },
  {
    key: 'unit_admin',
    name: 'Unit admin',
    description: 'Manages members and assigned learning inside one org unit and its sub-units.',
    scopeTypes: ['org_unit'],
    permissions: ['org.read', 'org.members.read', 'org.members.invite', 'org.members.update', 'org.reports.read', 'learning.assign'],
  },
  {
    key: 'analyst',
    name: 'Analyst',
    description: 'Reads members and reports.',
    scopeTypes: ['org', 'org_unit'],
    permissions: ['org.read', 'org.members.read', 'org.reports.read'],
  },
  {
    key: 'learner',
    name: 'Learner',
    description: 'Learns through the organisation (employee, sponsored learner).',
    scopeTypes: ['org'],
    permissions: ['org.read'],
  },
  {
    key: 'applicant',
    name: 'Applicant',
    description: 'Applying to a cohort program.',
    scopeTypes: ['org', 'cohort'],
    permissions: ['org.read'],
  },
  {
    key: 'student',
    name: 'Student',
    description: 'Enrolled in a cohort program.',
    scopeTypes: ['org', 'cohort', 'program'],
    permissions: ['org.read'],
  },
  {
    key: 'alumni',
    name: 'Alumni',
    description: 'Graduate of a program at this organisation.',
    scopeTypes: ['org', 'program'],
    permissions: ['org.read'],
  },
  {
    key: 'instructor',
    name: 'Instructor',
    description: 'Teaches and grades (faculty in Plan v1.1).',
    scopeTypes: ['org', 'program', 'cohort', 'course', 'course_run'],
    permissions: ['org.read', 'course_run.teach', 'submission.grade', 'course.analytics.read'],
  },
  {
    key: 'author',
    name: 'Course author',
    description: 'Builds and edits course content.',
    scopeTypes: ['org', 'course'],
    permissions: ['org.read', 'course.content.edit', 'course.analytics.read'],
  },
  {
    key: 'grader',
    name: 'Grader / teaching assistant',
    description: 'Grades submissions for a run or cohort.',
    scopeTypes: ['course_run', 'cohort'],
    permissions: ['org.read', 'submission.grade'],
  },
  {
    key: 'mentor',
    name: 'Mentor / coach',
    description: 'Works with assigned learners.',
    scopeTypes: ['org', 'program', 'cohort'],
    permissions: ['org.read', 'mentorship.conduct'],
  },
  {
    key: 'sponsor_viewer',
    name: 'Sponsor viewer',
    description: 'Reads reports on sponsored learners.',
    scopeTypes: ['org'],
    permissions: ['org.read', 'org.reports.read'],
  },
] as const satisfies readonly SystemRole[];

export type SystemRoleKey = (typeof SYSTEM_ROLES)[number]['key'];
export const SYSTEM_ROLE_KEYS = SYSTEM_ROLES.map((r) => r.key) as [SystemRoleKey, ...SystemRoleKey[]];
export const RoleKeySchema = z.string().min(2).max(64).regex(/^[a-z][a-z0-9_]*$/);

export const isSystemRoleKey = (key: string): boolean => (SYSTEM_ROLE_KEYS as readonly string[]).includes(key);

/**
 * Permissions that change who can do what, or the organisation itself. Where an organisation
 * requires multi-factor authentication for admins, these need a session that passed MFA.
 */
export const MFA_PROTECTED_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (p) => p.startsWith('platform.') || (p.startsWith('org.') && !['org.read', 'org.members.read', 'org.reports.read'].includes(p)),
);

/** Permissions an organisation may put in its own custom roles: never platform-wide ones. */
export const CUSTOM_ROLE_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter((p) => !p.startsWith('platform.'));

/** Permissions a role grants, or an empty list for an unknown role. */
export function permissionsForRole(roleKey: string): readonly Permission[] {
  return SYSTEM_ROLES.find((r) => r.key === roleKey)?.permissions ?? [];
}
