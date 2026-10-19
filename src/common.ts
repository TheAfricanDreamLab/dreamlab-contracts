import { z } from 'zod';

export const UuidSchema = z.string().uuid();

export const EmailSchema = z.string().trim().toLowerCase().email().max(320);

/** E.164, e.g. +2348012345678. */
export const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone numbers must be in E.164 format, e.g. +2348012345678');

/** An email address or an E.164 phone number. */
export const IdentifierSchema = z.union([EmailSchema, PhoneSchema]);

export const PasswordSchema = z.string().min(10).max(128);

export const OtpCodeSchema = z.string().regex(/^\d{6}$/, 'A six-digit code');

export const SlugSchema = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, digits and single hyphens');

export const TimestampSchema = z.string().datetime({ offset: true });

export const ErrorResponseSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const pageOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

export const NoBodySchema = z.object({}).strict();

export const commonResponses = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  403: ErrorResponseSchema,
  429: ErrorResponseSchema,
} as const;
