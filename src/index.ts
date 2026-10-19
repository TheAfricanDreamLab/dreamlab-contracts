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

export * from './common';
export * from './permissions';
export * from './auth';
export * from './directory';

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
  },
  { pathPrefix: '/v1', strictStatusCodes: true },
);

/** Everything the gateway serves: the versioned API plus unversioned endpoints. */
export const contract = c.router({
  v1: apiV1Contract,
  wellKnown: wellKnownContract,
  health: healthContract,
});

export const CONTRACTS_VERSION = '0.1.0';
