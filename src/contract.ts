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
import { catalogContract } from './catalog';
import { cohortsContract } from './cohorts';
import { enterpriseContract } from './enterprise';
import { gradingContract } from './grading';
import { learningContract } from './learning';
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

/** Versioned public API, served by the gateway under /v1. */
export const apiV1Contract = c.router(
  {
    auth: authContract,
    me: meContract,
    organizations: organizationsContract,
    members: membersContract,
    invitations: invitationsContract,
    roles: rolesContract,
    structure: structureContract,
    enterprise: enterpriseContract,
    platform: platformContract,
    catalog: catalogContract,
    learning: learningContract,
    cohorts: cohortsContract,
    grading: gradingContract,
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);

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

