import { z } from 'zod';
import { Role } from '../generated/prisma/client.js';

// Response shapes for the OpenAPI spec, so the office client is typed. The
// auth tests parse real responses with them, so they can't drift.
export const tokensResponse = z.object({
  accessToken: z.string(),
  refreshToken: z
    .string()
    .optional()
    .describe('Left out with X-Client: office, which gets it as a cookie'),
});

export const operatorsResponse = z.array(
  z.object({ id: z.uuid(), name: z.string() }),
);

export const userResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.enum(Role),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const pinsResponse = z.array(
  z.object({
    id: z.uuid(),
    name: z.string(),
    role: z.enum(Role),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    hasPin: z.boolean(),
    /** Locked out of at least one tablet until then. */
    lockedUntil: z.iso.datetime().nullable(),
  }),
);
