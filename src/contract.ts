import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { authContract, wellKnownContract } from './auth';
import {
  invitationsContract,
  meContract,
  membersContract,
  organizationsContract,
  rolesContract,
  structureContract,
} from './directory';
import { authoringContract } from './authoring';
import { catalogContract } from './catalog';
import { cohortsContract } from './cohorts';
import { enterpriseContract } from './enterprise';
import { gradingContract } from './grading';
import { learningContract } from './learning';
import { notificationsContract } from './notifications';
import { admissionsContract } from './admissions';
import { assignedLearningContract } from './assigned';
import { outcomesContract } from './outcomes';
import { communityContract } from './community';
import { instructorsContract } from './instructors';
import { platformContract } from './platform';

const c = initContract();

export const HealthSchema = z.object({
  status: z.enum(['ok', 'error', 'shutting_down']),
  info: z.record(z.unknown()).optional(),
  error: z.record(z.unknown()).optional(),
  details: z.record(z.unknown()).optional(),
});

export const healthContract = c.router({
  health: {
    method: 'GET',
    path: '/health',
    responses: { 200: HealthSchema, 503: HealthSchema },
    summary: 'Liveness and dependency health',
  },
});

/** Each module's routes as the gateway serves them, under /v1. */
const V1 = { pathPrefix: '/v1', strictStatusCodes: true } as const;

// One constant per module, so declaration files name each router instead of expanding the whole API
// in one type (which outgrows what the compiler will serialise).
export const authV1 = c.router(authContract, V1);
export const meV1 = c.router(meContract, V1);
export const organizationsV1 = c.router(organizationsContract, V1);
export const membersV1 = c.router(membersContract, V1);
export const invitationsV1 = c.router(invitationsContract, V1);
export const rolesV1 = c.router(rolesContract, V1);
export const structureV1 = c.router(structureContract, V1);
export const enterpriseV1 = c.router(enterpriseContract, V1);
export const platformV1 = c.router(platformContract, V1);
export const catalogV1 = c.router(catalogContract, V1);
export const learningV1 = c.router(learningContract, V1);
export const cohortsV1 = c.router(cohortsContract, V1);
export const gradingV1 = c.router(gradingContract, V1);
export const authoringV1 = c.router(authoringContract, V1);
export const notificationsV1 = c.router(notificationsContract, V1);
export const admissionsV1 = c.router(admissionsContract, V1);
export const communityV1 = c.router(communityContract, V1);
export const instructorsV1 = c.router(instructorsContract, V1);
export const outcomesV1 = c.router(outcomesContract, V1);
export const assignedLearningV1 = c.router(assignedLearningContract, V1);

/** Versioned public API, served by the gateway under /v1. */
export const apiV1Contract: {
  auth: typeof authV1;
  me: typeof meV1;
  organizations: typeof organizationsV1;
  members: typeof membersV1;
  invitations: typeof invitationsV1;
  roles: typeof rolesV1;
  structure: typeof structureV1;
  enterprise: typeof enterpriseV1;
  platform: typeof platformV1;
  catalog: typeof catalogV1;
  learning: typeof learningV1;
  cohorts: typeof cohortsV1;
  grading: typeof gradingV1;
  authoring: typeof authoringV1;
  notifications: typeof notificationsV1;
  admissions: typeof admissionsV1;
  community: typeof communityV1;
  instructors: typeof instructorsV1;
  outcomes: typeof outcomesV1;
  assignedLearning: typeof assignedLearningV1;
} = {
  auth: authV1,
  me: meV1,
  organizations: organizationsV1,
  members: membersV1,
  invitations: invitationsV1,
  roles: rolesV1,
  structure: structureV1,
  enterprise: enterpriseV1,
  platform: platformV1,
  catalog: catalogV1,
  learning: learningV1,
  cohorts: cohortsV1,
  grading: gradingV1,
  authoring: authoringV1,
  notifications: notificationsV1,
  admissions: admissionsV1,
  community: communityV1,
  instructors: instructorsV1,
  outcomes: outcomesV1,
  assignedLearning: assignedLearningV1,
};

/** Everything the gateway serves: the versioned API plus unversioned endpoints. */
// Annotated so declaration files reference the routers above instead of expanding them a second time.
export const contract: {
  v1: typeof apiV1Contract;
  wellKnown: typeof wellKnownContract;
  health: typeof healthContract;
} = c.router({
  v1: apiV1Contract,
  wellKnown: wellKnownContract,
  health: healthContract,
});

