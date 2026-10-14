import { z } from 'zod';

// A blank line copied from .env.example counts as unset.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );

export const envSchema = z.object({
  // Anything but an explicit `development` runs with production settings.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(4466),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  JWT_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  OWNER_NAME: optional(z.string().trim().min(1)),
  OWNER_LOGIN: optional(z.string().trim().min(1)),
  OWNER_PASSWORD: optional(z.string().min(8).max(128)),
  // For the demo users that `pnpm db:seed:demo` creates.
  DEMO_PASSWORD: optional(z.string().min(8).max(128)),
});

export type Env = z.infer<typeof envSchema>;
